import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateShort, maskPhone, money } from "@/lib/format";
import { PROVIDER_LABEL, type Organizer } from "@/lib/types";

export const metadata = { title: "Administração" };

const percent = (form: FormData) => Number(String(form.get("fee") ?? "").replace(",", "."));

async function setDefaultFee(form: FormData) {
  "use server";
  const { supabase } = await requirePlatformAdmin();
  const fee = percent(form);
  if (fee >= 0 && fee <= 50) await supabase.from("platform_settings").update({ default_fee_percent: fee }).eq("id", 1);
  revalidatePath("/admin");
}

async function updateOrganizer(organizerId: string, form: FormData) {
  "use server";
  const { supabase } = await requirePlatformAdmin();
  const fee = percent(form);
  if (!(fee >= 0 && fee <= 50)) return;
  await supabase.from("organizers").update({ fee_percent: fee, active: form.get("active") === "on" }).eq("id", organizerId);
  revalidatePath("/admin");
}

export default async function AdminPage() {
  const { supabase } = await requirePlatformAdmin();
  const [{ data: settings }, { data: orgData }, { count: pendingCount }] = await Promise.all([
    supabase.from("platform_settings").select("default_fee_percent").eq("id", 1).single(),
    supabase.from("organizers").select("*, events(id)").order("created_at", { ascending: false }),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
  ]);
  // Totais pagos por cliente (leitura com a chave secreta para somar todos os eventos).
  const { data: paid } = await createAdminClient().from("orders").select("total, fee_amount, events(organizer_id)").eq("status", "paid");
  const totals = new Map<string, { gross: number; fee: number }>();
  (paid ?? []).forEach((o) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgId = (o.events as any)?.organizer_id as string;
    const t = totals.get(orgId) ?? { gross: 0, fee: 0 };
    t.gross += Number(o.total);
    t.fee += Number(o.fee_amount);
    totals.set(orgId, t);
  });
  const { data: feePayments } = await supabase.from("fee_payments").select("organizer_id, amount");
  const paidBy = new Map<string, number>();
  (feePayments ?? []).forEach((p) => paidBy.set(p.organizer_id, (paidBy.get(p.organizer_id) ?? 0) + Number(p.amount)));
  const orgs = (orgData ?? []) as (Organizer & { events: { id: string }[] })[];
  const allFees = [...totals.values()].reduce((s, t) => s + t.fee, 0);
  const allPaid = [...paidBy.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Administração da plataforma</h1>
        <Link href="/admin/eventos" className={pendingCount ? "btn-primary" : "btn-secondary"}>
          Aprovação de eventos{pendingCount ? ` (${pendingCount} aguardando)` : ""}
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs font-semibold text-zinc-500 uppercase">Clientes</p>
          <p className="mt-1 text-2xl font-bold">{orgs.length}</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-zinc-500 uppercase">Taxas geradas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{money(allFees)}</p>
          <p className="text-xs text-zinc-500">{money(allPaid)} já pagos</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-zinc-500 uppercase">A receber dos clientes</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">{money(allFees - allPaid)}</p>
        </div>
        <form action={setDefaultFee} className="card space-y-2">
          <label className="text-xs font-semibold text-zinc-500 uppercase" htmlFor="fee">Taxa padrão para novos clientes (%)</label>
          <div className="flex gap-2">
            <input className="input" id="fee" name="fee" inputMode="decimal" defaultValue={String(settings?.default_fee_percent ?? 1).replace(".", ",")} />
            <button className="btn-primary">Salvar</button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="data-table">
          <thead>
            <tr><th>Cliente</th><th>Contato</th><th>Gateway</th><th className="text-right">Eventos</th><th className="text-right">Vendido</th><th className="text-right">Taxas</th><th className="text-right">Saldo a pagar</th><th>Taxa (%) e situação</th></tr>
          </thead>
          <tbody>
            {orgs.map((o) => {
              const t = totals.get(o.id) ?? { gross: 0, fee: 0 };
              return (
                <tr key={o.id}>
                  <td className="font-medium"><Link className="link" href={`/admin/clientes/${o.id}`}>{o.name}</Link><br /><span className="text-xs text-zinc-500">desde {dateShort(o.created_at)}</span></td>
                  <td>{o.email}<br /><span className="text-xs text-zinc-500">{maskPhone(o.phone)}</span></td>
                  <td>{o.provider ? PROVIDER_LABEL[o.provider] : <span className="text-zinc-400">—</span>}{o.provider_sandbox && " (teste)"}</td>
                  <td className="text-right">{o.events.length}</td>
                  <td className="text-right tabular-nums">{money(t.gross)}</td>
                  <td className="text-right tabular-nums">{money(t.fee)}</td>
                  <td className="text-right tabular-nums">
                    <Link className="link" href={`/admin/clientes/${o.id}`}>{money(t.fee - (paidBy.get(o.id) ?? 0))}</Link>
                  </td>
                  <td>
                    <form action={updateOrganizer.bind(null, o.id)} className="flex items-center gap-2">
                      <input className="input w-20" name="fee" inputMode="decimal" defaultValue={String(o.fee_percent).replace(".", ",")} />
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={o.active} /> ativo</label>
                      <button className="btn-secondary px-3 py-1.5">Salvar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">A nova taxa vale para inscrições feitas a partir da alteração; as anteriores mantêm a taxa da época.</p>
    </div>
  );
}
