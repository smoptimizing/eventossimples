import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { siteUrl } from "@/lib/site";
import { onlyDigits } from "@/lib/format";
import { splitEnabled } from "@/lib/fees";
import type { Order, Organizer, Provider } from "@/lib/types";

/*
  A cobrança é criada no gateway do Cliente; o dinheiro cai integralmente na conta dele.
  A taxa da plataforma (fee_amount do pedido) é cobrada depois, salvo com split ligado (PAYMENT_SPLIT=1):
  - Asaas: split para ASAAS_PLATFORM_WALLET_ID.
  - Mercado Pago: Cliente conecta por OAuth ao app da plataforma; preferência com marketplace_fee.
  - PagBank: pedido Pix com splits (Cliente + PAGBANK_PLATFORM_ACCOUNT_ID). Exige split liberado nas contas.
  Sem split, o Mercado Pago usa o Access Token do Cliente e o PagBank usa o Checkout (Pix, cartão e boleto).
*/

interface Credentials {
  token: string;
  sandbox: boolean;
}

export type RemoteStatus = "paid" | "pending" | "cancelled";

async function call(url: string, init: RequestInit & { headers: Record<string, string> }) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Gateway respondeu ${res.status}: ${detail.slice(0, 400)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return body as any;
}

const receiptUrl = (o: Order) => siteUrl(`/inscricao/${o.code}?k=${o.access_key}`);
const cents = (v: number) => Math.round(Number(v) * 100);

// ---------------------------------------------------------------- Asaas
const asaasBase = (c: Credentials) => (c.sandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3");
const asaasHeaders = (c: Credentials) => ({ access_token: c.token, "Content-Type": "application/json", "User-Agent": "eventos-simples" });

async function asaasCheckout(c: Credentials, o: Order, title: string) {
  const cpf = onlyDigits(o.buyer_cpf);
  if (cpf.length !== 11 && cpf.length !== 14) throw new Error("Informe o CPF do responsável para pagar.");
  const found = await call(`${asaasBase(c)}/customers?cpfCnpj=${cpf}`, { headers: asaasHeaders(c) });
  let customerId: string | undefined = found?.data?.[0]?.id;
  if (!customerId) {
    const created = await call(`${asaasBase(c)}/customers`, {
      method: "POST",
      headers: asaasHeaders(c),
      body: JSON.stringify({
        name: o.buyer_name,
        cpfCnpj: cpf,
        email: o.buyer_email,
        mobilePhone: onlyDigits(o.buyer_phone) || undefined,
        notificationDisabled: true,
      }),
    });
    customerId = created.id;
  }
  const wallet = process.env.ASAAS_PLATFORM_WALLET_ID;
  const split = splitEnabled() && Number(o.fee_amount) > 0;
  if (split && !wallet) throw new Error("ASAAS_PLATFORM_WALLET_ID não configurado.");
  const due = new Date(Math.max(new Date(o.expires_at).getTime(), Date.now() + 86400000)).toISOString().slice(0, 10);
  const payment = await call(`${asaasBase(c)}/payments`, {
    method: "POST",
    headers: asaasHeaders(c),
    body: JSON.stringify({
      customer: customerId,
      billingType: "UNDEFINED",
      value: Number(Number(o.total).toFixed(2)),
      dueDate: due,
      description: `${title} — inscrição ${o.code}`,
      externalReference: o.id,
      split: split ? [{ walletId: wallet, fixedValue: Number(o.fee_amount) }] : undefined,
    }),
  });
  return { paymentId: payment.id as string, checkoutUrl: payment.invoiceUrl as string, pixCode: null };
}

async function asaasStatus(c: Credentials, paymentId: string): Promise<RemoteStatus> {
  const p = await call(`${asaasBase(c)}/payments/${encodeURIComponent(paymentId)}`, { headers: asaasHeaders(c) });
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status)) return "paid";
  if (p.deleted || ["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED"].includes(p.status)) return "cancelled";
  return "pending";
}

/**
 * Cadastra na conta Asaas do Cliente o webhook de cobranças apontando para este site (se ainda não existir).
 * Retorna false quando o site não tem endereço público (localhost) — aí o Cliente cria à mão.
 */
export async function ensureAsaasWebhook(token: string, sandbox: boolean, email: string) {
  const url = siteUrl("/api/webhooks/asaas");
  if (!url.startsWith("https://") || /localhost|127\.0\.0\.1/.test(url)) return false;
  const c = { token, sandbox };
  const list = await call(`${asaasBase(c)}/webhooks?limit=100`, { headers: asaasHeaders(c) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = (list?.data ?? []).find((w: any) => w.url === url);
  const body = {
    name: "Inscrições",
    url,
    email,
    enabled: true,
    interrupted: false,
    sendType: "SEQUENTIALLY",
    events: ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED"],
  };
  if (!found) await call(`${asaasBase(c)}/webhooks`, { method: "POST", headers: asaasHeaders(c), body: JSON.stringify(body) });
  else if (!found.enabled || found.interrupted) {
    // Reativa a fila se o Asaas a pausou (ex.: site fora do ar durante os testes).
    await call(`${asaasBase(c)}/webhooks/${found.id}`, { method: "PUT", headers: asaasHeaders(c), body: JSON.stringify(body) });
  }
  return true;
}

// ---------------------------------------------------------------- Mercado Pago (marketplace / OAuth)
const mpHeaders = (c: Credentials) => ({ Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" });

async function mpCheckout(c: Credentials, o: Order, title: string) {
  const back = receiptUrl(o);
  const pref = await call("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { ...mpHeaders(c), "X-Idempotency-Key": o.id },
    body: JSON.stringify({
      items: [{ title: `${title} — inscrição ${o.code}`.slice(0, 250), quantity: 1, unit_price: Number(Number(o.total).toFixed(2)), currency_id: "BRL" }],
      payer: { name: o.buyer_name, email: o.buyer_email },
      external_reference: o.id,
      marketplace_fee: splitEnabled() && Number(o.fee_amount) > 0 ? Number(o.fee_amount) : undefined,
      notification_url: siteUrl(`/api/webhooks/mercadopago?order=${o.id}`),
      back_urls: { success: back, pending: back, failure: back },
      auto_return: "approved",
      expires: true,
      expiration_date_to: o.expires_at,
      statement_descriptor: "INSCRICAO",
    }),
  });
  return { paymentId: pref.id as string, checkoutUrl: (c.sandbox ? pref.sandbox_init_point : pref.init_point) as string, pixCode: null };
}

async function mpStatus(c: Credentials, orderId: string): Promise<RemoteStatus> {
  const r = await call(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`,
    { headers: mpHeaders(c) },
  );
  const mine = ((r?.results ?? []) as { status: string; external_reference: string }[]).filter((p) => p.external_reference === orderId);
  if (mine.some((p) => p.status === "approved")) return "paid";
  return "pending";
}

export function mercadoPagoAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID ?? "",
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: siteUrl("/api/mercadopago/callback"),
  });
  return `https://auth.mercadopago.com.br/authorization?${params}`;
}

async function mpToken(body: Record<string, string>) {
  return call("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.MP_CLIENT_ID, client_secret: process.env.MP_CLIENT_SECRET, ...body }),
  }) as Promise<{ access_token: string; refresh_token: string; expires_in: number; user_id: number; live_mode?: boolean }>;
}

/** Troca o código do OAuth pelos tokens do vendedor e grava no Cliente. */
export async function connectMercadoPago(organizerId: string, code: string) {
  const t = await mpToken({ grant_type: "authorization_code", code, redirect_uri: siteUrl("/api/mercadopago/callback") });
  await saveSecret(organizerId, t.access_token, t.refresh_token, new Date(Date.now() + t.expires_in * 1000).toISOString());
  await setProvider(organizerId, "mercadopago", String(t.user_id), t.live_mode === false);
}

// ---------------------------------------------------------------- PagBank (Checkout; com split, pedido Pix com splits)
const pbBase = (c: Credentials) => (c.sandbox ? "https://sandbox.api.pagseguro.com" : "https://api.pagseguro.com");
const pbHeaders = (c: Credentials) => ({ Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", accept: "application/json" });

/** Página de pagamento do PagBank (Pix, cartão e boleto), sem divisão. */
async function pbHostedCheckout(c: Credentials, o: Order, title: string) {
  const notify = siteUrl(`/api/webhooks/pagbank?order=${o.id}`);
  const checkout = await call(`${pbBase(c)}/checkouts`, {
    method: "POST",
    headers: { ...pbHeaders(c), "x-idempotency-key": o.id },
    body: JSON.stringify({
      reference_id: o.id,
      expiration_date: o.expires_at,
      customer_modifiable: true,
      items: [{ reference_id: o.code, name: `${title} — inscrição ${o.code}`.slice(0, 64), quantity: 1, unit_amount: cents(o.total) }],
      payment_methods: [{ type: "PIX" }, { type: "CREDIT_CARD" }, { type: "DEBIT_CARD" }, { type: "BOLETO" }],
      redirect_url: receiptUrl(o),
      notification_urls: [notify],
      payment_notification_urls: [notify],
    }),
  });
  const link = ((checkout.links ?? []) as { rel: string; href: string }[]).find((l) => l.rel === "PAY");
  if (!link) throw new Error("PagBank não retornou o link de pagamento.");
  return { paymentId: checkout.id as string, checkoutUrl: link.href, pixCode: null };
}

async function pbCheckout(c: Credentials, o: Order, title: string, sellerAccount: string | null) {
  if (!splitEnabled()) return pbHostedCheckout(c, o, title);
  const total = cents(o.total);
  const fee = cents(o.fee_amount);
  const platform = process.env.PAGBANK_PLATFORM_ACCOUNT_ID;
  if (fee > 0 && (!platform || !sellerAccount)) throw new Error("Split do PagBank não configurado (contas da plataforma e do Cliente).");
  const cpf = onlyDigits(o.buyer_cpf);
  const order = await call(`${pbBase(c)}/orders`, {
    method: "POST",
    headers: { ...pbHeaders(c), "x-idempotency-key": o.id },
    body: JSON.stringify({
      reference_id: o.id,
      customer: { name: o.buyer_name, email: o.buyer_email, tax_id: cpf || undefined },
      items: [{ reference_id: o.code, name: `${title} — inscrição ${o.code}`.slice(0, 64), quantity: 1, unit_amount: total }],
      qr_codes: [{
        amount: { value: total },
        expiration_date: o.expires_at,
        splits: fee > 0
          ? { method: "FIXED", receivers: [
              { account: { id: sellerAccount }, amount: { value: total - fee } },
              { account: { id: platform }, amount: { value: fee } },
            ] }
          : undefined,
      }],
      notification_urls: [siteUrl(`/api/webhooks/pagbank?order=${o.id}`)],
    }),
  });
  const qr = order.qr_codes?.[0];
  if (!qr?.text) throw new Error("PagBank não retornou o código Pix.");
  return { paymentId: order.id as string, checkoutUrl: null, pixCode: qr.text as string };
}

async function pbOrderPaid(c: Credentials, pagbankOrderId: string, orderId: string) {
  const o = await call(`${pbBase(c)}/orders/${encodeURIComponent(pagbankOrderId)}`, { headers: pbHeaders(c) });
  if (o.reference_id !== orderId) return false;
  return ((o.charges ?? []) as { status: string }[]).some((ch) => ch.status === "PAID");
}

/** Aceita o id de um Checkout (CHEC_...) ou de um pedido Pix (ORDE_...). */
async function pbStatus(c: Credentials, paymentId: string, orderId: string): Promise<RemoteStatus> {
  if (!paymentId.startsWith("CHEC_")) return (await pbOrderPaid(c, paymentId, orderId)) ? "paid" : "pending";
  const ck = await call(`${pbBase(c)}/checkouts/${encodeURIComponent(paymentId)}`, { headers: pbHeaders(c) });
  for (const o of (ck.orders ?? []) as { id: string }[]) {
    if (await pbOrderPaid(c, o.id, orderId)) return "paid";
  }
  return "pending";
}

// ---------------------------------------------------------------- Credenciais do Cliente

export async function saveSecret(organizerId: string, token: string, refresh?: string | null, expiresAt?: string | null) {
  const admin = createAdminClient();
  const { error } = await admin.from("organizer_secrets").upsert({
    organizer_id: organizerId,
    token_encrypted: encrypt(token),
    refresh_encrypted: refresh ? encrypt(refresh) : null,
    expires_at: expiresAt ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function setProvider(organizerId: string, provider: Provider, account: string | null, sandbox: boolean) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizers")
    .update({ provider, provider_account: account, provider_sandbox: sandbox, provider_connected_at: new Date().toISOString() })
    .eq("id", organizerId);
  if (error) throw new Error(error.message);
}

async function loadCredentials(org: Organizer): Promise<Credentials> {
  const admin = createAdminClient();
  const { data: secret } = await admin.from("organizer_secrets").select("*").eq("organizer_id", org.id).single();
  if (!secret || !org.provider) throw new Error("O organizador ainda não configurou o recebimento.");
  let token = decrypt(secret.token_encrypted);
  // Mercado Pago: renova o token do vendedor quando faltar menos de 7 dias.
  if (org.provider === "mercadopago" && secret.refresh_encrypted && secret.expires_at
      && new Date(secret.expires_at).getTime() - Date.now() < 7 * 86400000) {
    const t = await mpToken({ grant_type: "refresh_token", refresh_token: decrypt(secret.refresh_encrypted) });
    await saveSecret(org.id, t.access_token, t.refresh_token, new Date(Date.now() + t.expires_in * 1000).toISOString());
    token = t.access_token;
  }
  return { token, sandbox: org.provider_sandbox };
}

/** Testa a chave informada pelo Cliente antes de salvar. Retorna o identificador da conta, quando houver. */
export async function testCredentials(provider: Provider, token: string, sandbox: boolean) {
  const c = { token, sandbox };
  if (provider === "mercadopago") {
    const me = await call("https://api.mercadopago.com/users/me", { headers: mpHeaders(c) });
    return me?.id ? String(me.id) : null;
  }
  if (provider === "asaas") {
    await call(`${asaasBase(c)}/finance/balance`, { headers: asaasHeaders(c) });
    const w = await call(`${asaasBase(c)}/wallets`, { headers: asaasHeaders(c) }).catch(() => null);
    const walletId = w?.data?.[0]?.id as string | undefined;
    if (walletId && walletId === process.env.ASAAS_PLATFORM_WALLET_ID) {
      throw new Error("Esta é a conta da plataforma; use a conta Asaas do organizador.");
    }
    return walletId ?? null;
  }
  const res = await fetch(`${pbBase(c)}/orders/ORDE_00000000-0000-0000-0000-000000000000`, { headers: pbHeaders(c), cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error("Token do PagBank recusado.");
  return null;
}

// ---------------------------------------------------------------- API pública do módulo

async function loadOrder(orderId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("orders").select("*, events(title, organizers(*))").eq("id", orderId).single();
  if (!data) throw new Error("Inscrição não encontrada.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = data.events as any;
  return { admin, order: data as Order, title: ev.title as string, org: ev.organizers as Organizer };
}

/** Cria a cobrança no gateway do Cliente (com o split da plataforma) e grava no pedido. */
export async function createGatewayCheckout(orderId: string) {
  const { admin, order, title, org } = await loadOrder(orderId);
  if (order.status !== "pending") return order;
  if (order.checkout_url || order.pix_code) return order;
  const creds = await loadCredentials(org);
  const result =
    org.provider === "asaas" ? await asaasCheckout(creds, order, title)
    : org.provider === "mercadopago" ? await mpCheckout(creds, order, title)
    : await pbCheckout(creds, order, title, org.provider_account);
  const { data } = await admin
    .from("orders")
    .update({ provider: org.provider, provider_payment_id: result.paymentId, checkout_url: result.checkoutUrl, pix_code: result.pixCode })
    .eq("id", orderId)
    .select("*")
    .single();
  return data as Order;
}

/**
 * Consulta o gateway e, se o pagamento foi aprovado, marca a inscrição como confirmada.
 * Nunca confia no corpo do webhook: sempre confirma direto na API do gateway.
 * Retorna true quando a inscrição acabou de ser confirmada.
 */
export async function syncGatewayOrder(orderId: string) {
  const { admin, order, org } = await loadOrder(orderId);
  if (order.status === "paid" || order.status === "cancelled" || !order.provider_payment_id) return false;
  const creds = await loadCredentials(org);
  const status =
    org.provider === "asaas" ? await asaasStatus(creds, order.provider_payment_id)
    : org.provider === "mercadopago" ? await mpStatus(creds, order.id)
    : await pbStatus(creds, order.provider_payment_id, order.id);
  if (status !== "paid") return false;
  // Pago depois de expirar também confirma: o dinheiro já entrou.
  const { data } = await admin.from("orders").update({ status: "paid" }).eq("id", order.id).neq("status", "paid").select("id");
  return Boolean(data?.length);
}
