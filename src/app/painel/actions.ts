"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizer, requireOwnEvent, requireUser } from "@/lib/auth";
import { dateTime, isValidCpfCnpj, isValidPhone, localInputToIso, onlyDigits, slugify } from "@/lib/format";
import { ensureAsaasWebhook, saveSecret, setProvider, testCredentials } from "@/lib/payments";
import { syncAndNotify } from "@/lib/confirm";
import { notifyAdminReview } from "@/lib/email";
import { splitEnabled } from "@/lib/fees";
import type { ActionState, Provider } from "@/lib/types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim() || null;
const int = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? "").trim();
  return v === "" ? null : Math.trunc(Number(v));
};
const money = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? "").trim().replace(/\./g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};
/** Opções separadas por ponto e vírgula (a vírgula pode fazer parte da opção). */
const list = (form: FormData, key: string) =>
  String(form.get(key) ?? "").split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
/** Data/hora preenchida fora do formato AAAA-MM-DDTHH:MM (ex.: ano com 6 dígitos). */
const badDateTime = (form: FormData, keys: string[]) =>
  keys.some((k) => {
    const v = String(form.get(k) ?? "").trim();
    return v !== "" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
  });
const BAD_DATE = "Confira as datas: o ano deve ter 4 dígitos.";

// ============================================================ Cliente

export async function saveOrganizer(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser("/painel/conta");
  const row = {
    name: text(form, "name") ?? "",
    document: onlyDigits(text(form, "document")) || null,
    phone: onlyDigits(text(form, "phone")) || null,
    email: text(form, "email"),
  };
  if (row.name.length < 2) return { error: "Informe o nome da organização." };
  if (row.document && !isValidCpfCnpj(row.document)) return { error: "CPF ou CNPJ inválido." };
  if (row.phone && !isValidPhone(row.phone)) return { error: "Informe o WhatsApp com DDD." };
  const { data: existing } = await supabase.from("organizers").select("id").eq("owner_id", user.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("organizers").update(row).eq("id", existing.id)
    : await supabase.from("organizers").insert({ ...row, owner_id: user.id });
  if (error) return { error: error.message };
  revalidatePath("/painel", "layout");
  if (!existing) redirect("/painel");
  return { success: "Dados salvos." };
}

export async function savePaymentToken(_: ActionState, form: FormData): Promise<ActionState> {
  const { organizer } = await requireOrganizer();
  const provider = String(form.get("provider"));
  // Com split, o Mercado Pago só entra por OAuth (botão Conectar).
  const allowed = splitEnabled() ? ["asaas", "pagbank"] : ["asaas", "pagbank", "mercadopago"];
  if (!allowed.includes(provider)) return { error: "Gateway inválido." };
  const token = String(form.get("token") ?? "").trim();
  const sandbox =
    form.get("sandbox") === "on" || (provider === "mercadopago" && token.startsWith("TEST-")) || (provider === "asaas" && token.includes("_hmlg_"));
  let account = text(form, "account");
  if (token.length < 20) return { error: "Cole a chave completa." };
  if (provider === "pagbank" && splitEnabled() && !account?.startsWith("ACCO_")) {
    return { error: "Informe o ID da conta PagBank (começa com ACCO_)." };
  }
  try {
    const id = await testCredentials(provider as Provider, token, sandbox);
    if (provider !== "pagbank") account = id;
    await saveSecret(organizer.id, token);
    await setProvider(organizer.id, provider as Provider, account, sandbox);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível validar a chave." };
  }
  revalidatePath("/painel/conta");
  if (provider === "asaas") {
    try {
      if (await ensureAsaasWebhook(token, sandbox, organizer.email ?? "")) return { success: "Recebimento configurado e webhook criado no Asaas." };
    } catch (e) {
      console.error("Webhook Asaas", e);
    }
    return { success: "Recebimento configurado. Crie o webhook de cobranças no Asaas (veja as instruções abaixo)." };
  }
  return { success: "Recebimento configurado." };
}

export async function changePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { success: "Senha alterada." };
}

// ============================================================ Eventos

const TITLE_TAKEN = "Já existe um evento com este nome na plataforma. Use um nome diferente (ex.: inclua o ano ou a cidade).";

export async function createEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, organizer } = await requireOrganizer();
  const title = text(form, "title");
  if (!title || title.length < 2) return { error: "Informe o nome do evento." };
  const base = slugify(title) || "evento";
  let id: string | null = null;
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    const slug = attempt === 0 ? base : `${base.slice(0, 54)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.from("events").insert({ organizer_id: organizer.id, title, slug }).select("id").single();
    if (data) id = data.id;
    else if (error?.message.includes("events_title_unique")) return { error: TITLE_TAKEN };
    else if (error && !error.message.includes("events_slug_key")) return { error: error.message };
  }
  if (!id) return { error: "Não foi possível gerar o endereço do evento." };
  redirect(`/painel/eventos/${id}/editar`);
}

export async function saveEvent(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, organizer } = await requireOwnEvent(eventId);
  if (badDateTime(form, ["starts_at", "ends_at", "reg_opens_at", "reg_closes_at"])) return { error: BAD_DATE };
  const slug = slugify(String(form.get("slug") ?? ""));
  const row: Record<string, unknown> = {
    title: text(form, "title"),
    slug,
    theme: text(form, "theme"),
    speaker: text(form, "speaker"),
    description: text(form, "description"),
    location: text(form, "location"),
    starts_at: localInputToIso(form.get("starts_at")),
    ends_at: localInputToIso(form.get("ends_at")),
    reg_opens_at: localInputToIso(form.get("reg_opens_at")),
    reg_closes_at: localInputToIso(form.get("reg_closes_at")),
    min_age: int(form, "min_age"),
    max_age: int(form, "max_age"),
    capacity: int(form, "capacity"),
    order_expiry_hours: int(form, "order_expiry_hours") ?? 48,
  };
  if (!row.title) return { error: "Informe o nome do evento." };
  if (slug.length < 2) return { error: "Endereço inválido." };

  // Período de inscrições coerente e lotes dentro dele.
  const period = row as Period & { ends_at: string | null };
  if (period.reg_opens_at && period.reg_closes_at && period.reg_closes_at <= period.reg_opens_at) {
    return { error: "O fechamento das inscrições deve ser depois da abertura." };
  }
  const eventEnd = period.ends_at ?? period.starts_at;
  if (period.reg_closes_at && eventEnd && period.reg_closes_at > eventEnd) {
    return { error: "As inscrições não podem fechar depois do fim do evento." };
  }
  const { data: lots } = await supabase.from("lots").select("name, starts_at, ends_at").eq("event_id", eventId);
  for (const lot of lots ?? []) {
    const err = lotPeriodError(lot, period);
    if (err) return { error: `${err} Ajuste o lote ou o período de inscrições.` };
  }

  const art = form.get("art");
  if (art instanceof File && art.size > 0) {
    if (art.size > 4 * 1024 * 1024) return { error: "A arte deve ter no máximo 4 MB." };
    if (!["image/jpeg", "image/png", "image/webp"].includes(art.type)) return { error: "Envie a arte em JPG, PNG ou WebP." };
    const ext = art.type === "image/png" ? "png" : art.type === "image/webp" ? "webp" : "jpg";
    const path = `${organizer.id}/${eventId}-${Date.now()}.${ext}`;
    const { error: up } = await supabase.storage.from("event-art").upload(path, art, { contentType: art.type, upsert: true });
    if (up) return { error: `Erro ao enviar a arte: ${up.message}` };
    row.art_url = supabase.storage.from("event-art").getPublicUrl(path).data.publicUrl;
  }
  if (form.get("remove_art") === "on") row.art_url = null;

  const { error } = await supabase.from("events").update(row).eq("id", eventId);
  if (error) {
    if (error.message.includes("events_slug_key")) return { error: "Este endereço já está em uso. Escolha outro." };
    if (error.message.includes("events_title_unique")) return { error: TITLE_TAKEN };
    if (error.message.includes("events_published_has_date")) return { error: "Evento publicado precisa ter a data de início." };
    if (error.message.includes("check")) return { error: "Confira datas e idades (fim depois do início, idade máxima ≥ mínima)." };
    return { error: error.message };
  }
  revalidatePath(`/painel/eventos/${eventId}`, "layout");
  refresh();
  return { success: "Evento salvo." };
}

/** O que impede o evento de ir ao ar (mesmas exigências para enviar à aprovação e para publicar). */
async function readinessError(ctx: Awaited<ReturnType<typeof requireOwnEvent>>) {
  const { supabase, organizer, event } = ctx;
  if (!organizer.active) return "inativo";
  if (!event.starts_at) return "data";
  const [{ data: items }, { data: lots }] = await Promise.all([
    supabase.from("items").select("price").eq("event_id", event.id),
    supabase.from("lots").select("lot_prices(price)").eq("event_id", event.id),
  ]);
  const charges =
    (items ?? []).some((i) => Number(i.price) > 0) ||
    (lots ?? []).some((l) => (l.lot_prices as { price: number }[]).some((p) => Number(p.price) > 0));
  if (charges && !organizer.provider) return "gateway";
  return null;
}

export async function submitForReview(eventId: string) {
  const ctx = await requireOwnEvent(eventId);
  const problem = await readinessError(ctx);
  if (problem) redirect(`/painel/eventos/${eventId}?erro=${problem}`);
  await ctx.supabase.from("events").update({ review_status: "pending" }).eq("id", eventId);
  await notifyAdminReview(ctx.event.title, ctx.organizer.name);
  revalidatePath(`/painel/eventos/${eventId}`, "layout");
  refresh();
}

export async function setEventStatus(eventId: string, status: "draft" | "published" | "closed") {
  const ctx = await requireOwnEvent(eventId);
  if (status === "published") {
    if (ctx.event.review_status !== "approved") redirect(`/painel/eventos/${eventId}?erro=aprovacao`);
    const problem = await readinessError(ctx);
    if (problem) redirect(`/painel/eventos/${eventId}?erro=${problem}`);
  }
  await ctx.supabase.from("events").update({ status }).eq("id", eventId);
  revalidatePath(`/painel/eventos/${eventId}`, "layout");
  refresh();
}

export async function deleteEvent(eventId: string) {
  const { supabase } = await requireOwnEvent(eventId);
  const { data } = await supabase.from("events").delete().eq("id", eventId).select("id");
  if (!data?.length) redirect(`/painel/eventos/${eventId}?erro=excluir`);
  redirect("/painel");
}

// ============================================================ Itens

export async function saveItem(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireOwnEvent(eventId);
  const id = text(form, "id");
  const row: Record<string, unknown> = {
    name: text(form, "name"),
    description: text(form, "description"),
    price: money(form, "price") ?? 0,
  };
  if (!row.name) return { error: "Informe o nome do item." };
  if (Number.isNaN(row.price) || Number(row.price) < 0) return { error: "Preço inválido." };
  if (form.get("is_registration") !== "1") {
    Object.assign(row, {
      options: list(form, "options"),
      max_per_person: int(form, "max_per_person"),
      stock: int(form, "stock"),
      requires_item_id: text(form, "requires_item_id"),
      active: form.get("active") === "on",
    });
  }
  const { count } = id ? { count: 0 } : await supabase.from("items").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const { error } = id
    ? await supabase.from("items").update(row).eq("id", id).eq("event_id", eventId)
    : await supabase.from("items").insert({ ...row, event_id: eventId, position: (count ?? 0) + 1 });
  if (error) return { error: error.message };
  revalidatePath(`/painel/eventos/${eventId}/itens`);
  refresh();
  return { success: id ? "Item salvo." : `"${row.name}" foi adicionado à lista acima.` };
}

export async function deleteItem(eventId: string, itemId: string) {
  const { supabase } = await requireOwnEvent(eventId);
  const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("item_id", itemId);
  if (count) {
    // Já vendido: só desativa, para manter o histórico.
    await supabase.from("items").update({ active: false }).eq("id", itemId);
  } else {
    await supabase.from("items").delete().eq("id", itemId).eq("event_id", eventId);
  }
  revalidatePath(`/painel/eventos/${eventId}/itens`);
  refresh();
}

// ============================================================ Lotes

type Period = { reg_opens_at: string | null; reg_closes_at: string | null; starts_at: string | null };

/**
 * O lote precisa caber no período de inscrições: da abertura até o fechamento
 * (sem data de fechamento, até o início do evento).
 */
function lotPeriodError(lot: { name: string | null; starts_at: string | null; ends_at: string | null }, ev: Period) {
  const opens = ev.reg_opens_at ? new Date(ev.reg_opens_at) : null;
  const closes = ev.reg_closes_at ?? ev.starts_at;
  const limit = closes ? new Date(closes) : null;
  const limitLabel = ev.reg_closes_at ? "do fim das inscrições" : "do início do evento";
  const s = lot.starts_at ? new Date(lot.starts_at) : null;
  const e = lot.ends_at ? new Date(lot.ends_at) : null;
  const name = `O lote "${lot.name}"`;
  if (limit && e && e > limit) return `${name} termina em ${dateTime(lot.ends_at)}, depois ${limitLabel} (${dateTime(closes)}).`;
  if (limit && s && s >= limit) return `${name} começa em ${dateTime(lot.starts_at)}, depois ${limitLabel} (${dateTime(closes)}).`;
  if (opens && s && s < opens) return `${name} começa em ${dateTime(lot.starts_at)}, antes da abertura das inscrições (${dateTime(ev.reg_opens_at)}).`;
  if (opens && e && e <= opens) return `${name} termina em ${dateTime(lot.ends_at)}, antes da abertura das inscrições (${dateTime(ev.reg_opens_at)}).`;
  return null;
}

export async function saveLot(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, event } = await requireOwnEvent(eventId);
  if (badDateTime(form, ["starts_at", "ends_at"])) return { error: BAD_DATE };
  const id = text(form, "id");
  const row = {
    name: text(form, "name"),
    starts_at: localInputToIso(form.get("starts_at")),
    ends_at: localInputToIso(form.get("ends_at")),
    quantity: int(form, "quantity"),
    position: int(form, "position") ?? 1,
  };
  if (!row.name) return { error: "Informe o nome do lote." };
  if (row.starts_at && row.ends_at && row.ends_at <= row.starts_at) return { error: "O fim do lote deve ser depois do início." };
  const periodError = lotPeriodError(row, event);
  if (periodError) return { error: periodError };

  // Confere os preços antes de gravar qualquer coisa.
  const prices = [...form.entries()]
    .filter(([k]) => k.startsWith("price_"))
    .map(([k, v]) => ({ item_id: k.slice(6), value: String(v).trim() }))
    .filter((p) => p.value !== "")
    .map((p) => ({ item_id: p.item_id, price: Number(p.value.replace(/[R$\s.]/g, "").replace(",", ".")) }));
  if (prices.some((p) => Number.isNaN(p.price) || p.price < 0)) return { error: "Preço inválido. Use apenas números, ex.: 150,00." };

  const { data, error } = id
    ? await supabase.from("lots").update(row).eq("id", id).eq("event_id", eventId).select("id").single()
    : await supabase.from("lots").insert({ ...row, event_id: eventId }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Não foi possível salvar o lote." };

  await supabase.from("lot_prices").delete().eq("lot_id", data.id);
  const { error: pe } = prices.length
    ? await supabase.from("lot_prices").insert(prices.map((p) => ({ ...p, lot_id: data.id })))
    : { error: null };
  revalidatePath(`/painel/eventos/${eventId}/lotes`);
  refresh();
  if (pe) return { error: `O lote foi salvo, mas os preços não: ${pe.message}` };
  return { success: id ? "Lote salvo." : `"${row.name}" foi adicionado à lista acima.` };
}

export async function deleteLot(eventId: string, lotId: string) {
  const { supabase } = await requireOwnEvent(eventId);
  await supabase.from("lots").delete().eq("id", lotId).eq("event_id", eventId);
  revalidatePath(`/painel/eventos/${eventId}/lotes`);
  refresh();
}

// ============================================================ Formulário

export async function saveQuestion(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireOwnEvent(eventId);
  const id = text(form, "id");
  const type = String(form.get("type") ?? "text");
  const row = {
    label: text(form, "label"),
    help: text(form, "help"),
    type,
    options: type === "select" ? list(form, "options") : [],
    required: form.get("required") === "on",
    position: int(form, "position") ?? 1,
  };
  if (!row.label) return { error: "Escreva a pergunta." };
  if (type === "select" && row.options.length < 2) return { error: "Informe pelo menos duas opções, separadas por ponto e vírgula (;)." };
  const { error } = id
    ? await supabase.from("questions").update(row).eq("id", id).eq("event_id", eventId)
    : await supabase.from("questions").insert({ ...row, event_id: eventId });
  if (error) return { error: error.message };
  revalidatePath(`/painel/eventos/${eventId}/formulario`);
  refresh();
  return { success: id ? "Pergunta salva." : "Pergunta adicionada à lista acima." };
}

export async function deleteQuestion(eventId: string, questionId: string) {
  const { supabase } = await requireOwnEvent(eventId);
  await supabase.from("questions").delete().eq("id", questionId).eq("event_id", eventId);
  revalidatePath(`/painel/eventos/${eventId}/formulario`);
  refresh();
}

// ============================================================ Inscrições

export async function setOrderStatus(eventId: string, orderId: string, status: "paid" | "cancelled") {
  const { supabase } = await requireOwnEvent(eventId);
  // Confirmar um pedido expirado/cancelado é recusado pelo banco se já não houver vaga ou estoque.
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId).eq("event_id", eventId);
  revalidatePath(`/painel/eventos/${eventId}`, "layout");
  if (error) redirect(`/painel/eventos/${eventId}/inscricoes?erro=${encodeURIComponent(error.message)}`);
  refresh();
}

export async function checkOrder(eventId: string, orderId: string) {
  const { supabase } = await requireOwnEvent(eventId);
  const { data } = await supabase.from("orders").select("id").eq("id", orderId).eq("event_id", eventId).maybeSingle();
  if (data) {
    try {
      await syncAndNotify(orderId);
    } catch (e) {
      console.error("Verificar pagamento", e);
    }
  }
  revalidatePath(`/painel/eventos/${eventId}`, "layout");
  refresh();
}
