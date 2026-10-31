import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ui";
import { MaskedInput } from "@/components/masked-input";
import { dateTime } from "@/lib/format";
import { splitEnabled } from "@/lib/fees";
import { siteUrl } from "@/lib/site";
import { PROVIDER_LABEL, type Organizer } from "@/lib/types";
import { saveOrganizer, savePaymentToken } from "../actions";

export const metadata = { title: "Conta e recebimento" };

export default async function ContaPage({ searchParams }: PageProps<"/painel/conta">) {
  const { ok, erro } = await searchParams;
  const { supabase, user } = await requireUser("/painel/conta");
  const { data } = await supabase.from("organizers").select("*").eq("owner_id", user.id).maybeSingle();
  const org = data as Organizer | null;
  const meta = user.user_metadata as { org_name?: string; phone?: string };
  const split = splitEnabled();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {org && <Link href="/painel" className="text-sm text-zinc-500 hover:underline">← Painel</Link>}
      <h1 className="text-2xl font-bold">{org ? "Conta e recebimento" : "Complete o cadastro da organização"}</h1>

      <section className="card">
        <h2 className="mb-4 font-semibold">Organização</h2>
        <ActionForm action={saveOrganizer} className="grid gap-4 sm:grid-cols-2" submitLabel={org ? "Salvar" : "Continuar"}>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Nome</label>
            <input className="input" id="name" name="name" required defaultValue={org?.name ?? meta.org_name ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="document">CNPJ ou CPF</label>
            <MaskedInput mask="cpfCnpj" id="document" name="document" defaultValue={org?.document ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="phone">WhatsApp</label>
            <MaskedInput mask="phone" id="phone" name="phone" defaultValue={org?.phone ?? meta.phone ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="email">E-mail de contato</label>
            <input className="input" id="email" name="email" type="email" defaultValue={org?.email ?? user.email ?? ""} />
          </div>
        </ActionForm>
      </section>

      {org && (
        <section className="card space-y-5">
          <div>
            <h2 className="font-semibold">Recebimento dos pagamentos</h2>
            <p className="text-sm text-zinc-600">
              O dinheiro das inscrições cai direto e integralmente na sua conta do gateway escolhido.{" "}
              {split ? (
                <>A taxa da plataforma (<b>{Number(org.fee_percent).toLocaleString("pt-BR")}%</b>) é separada automaticamente pelo gateway.</>
              ) : (
                <>A taxa da plataforma (<b>{Number(org.fee_percent).toLocaleString("pt-BR")}%</b>) é cobrada depois.</>
              )}{" "}
              <Link href="/painel/taxas" className="link">Entenda as taxas</Link>
            </p>
          </div>
          {ok === "mp" && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Mercado Pago conectado.</p>}
          {erro === "mp" && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível conectar o Mercado Pago. Tente novamente.</p>}
          {org.provider ? (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
              Gateway atual: <b>{PROVIDER_LABEL[org.provider]}</b>
              {org.provider_sandbox && " (teste/sandbox)"}
              {org.provider_connected_at && ` · configurado em ${dateTime(org.provider_connected_at)}`}. Configurar outro substitui o atual.
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Nenhum gateway configurado. Escolha um abaixo.</p>
          )}

          <details className="rounded-xl border border-zinc-200 p-4" open={org.provider === "asaas"}>
            <summary className="cursor-pointer font-medium">Asaas</summary>
            <ActionForm action={savePaymentToken} className="mt-4 space-y-3" submitLabel="Validar e salvar">
              <input type="hidden" name="provider" value="asaas" />
              <div>
                <label className="label">Chave de API</label>
                <input className="input font-mono" name="token" required autoComplete="off" placeholder="$aact_..." />
                <p className="hint">
                  No Asaas: Integrações → Chave de API. O webhook de cobranças é criado automaticamente; se não for, crie em Integrações → Webhooks
                  apontando para <span className="font-mono">{siteUrl("/api/webhooks/asaas")}</span> com os eventos de cobrança.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sandbox" /> Conta de teste (sandbox)</label>
            </ActionForm>
          </details>

          <details className="rounded-xl border border-zinc-200 p-4" open={org.provider === "mercadopago"}>
            <summary className="cursor-pointer font-medium">Mercado Pago</summary>
            {split ? (
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-zinc-600">Você será levado ao Mercado Pago para autorizar a plataforma a gerar cobranças na sua conta.</p>
                <a href="/api/mercadopago/conectar" className="btn-primary">
                  {org.provider === "mercadopago" ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
                </a>
              </div>
            ) : (
              <ActionForm action={savePaymentToken} className="mt-4 space-y-3" submitLabel="Validar e salvar">
                <input type="hidden" name="provider" value="mercadopago" />
                <div>
                  <label className="label">Access Token</label>
                  <input className="input font-mono" name="token" required autoComplete="off" placeholder="APP_USR-..." />
                  <p className="hint">
                    No Mercado Pago: Seu negócio → Configurações → Credenciais (ou Suas integrações → Credenciais de produção). Copie o Access Token.
                    Tokens de teste começam com TEST-.
                  </p>
                </div>
              </ActionForm>
            )}
          </details>

          <details className="rounded-xl border border-zinc-200 p-4" open={org.provider === "pagbank"}>
            <summary className="cursor-pointer font-medium">PagBank (PagSeguro)</summary>
            <ActionForm action={savePaymentToken} className="mt-4 space-y-3" submitLabel="Validar e salvar">
              <input type="hidden" name="provider" value="pagbank" />
              <div>
                <label className="label">Token</label>
                <input className="input font-mono" name="token" required autoComplete="off" />
                <p className="hint">No PagBank: Venda online → Integrações → Gerar token.</p>
              </div>
              {split && (
                <div>
                  <label className="label">ID da conta</label>
                  <input className="input font-mono" name="account" required placeholder="ACCO_..." defaultValue={org.provider === "pagbank" ? org.provider_account ?? "" : ""} />
                  <p className="hint">Necessário para a divisão do pagamento. Pagamentos pelo PagBank são feitos via Pix.</p>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sandbox" /> Conta de teste (sandbox)</label>
            </ActionForm>
          </details>
        </section>
      )}

      {org && (
        <p className="text-sm"><Link href="/painel/senha" className="link">Alterar senha</Link></p>
      )}
    </div>
  );
}
