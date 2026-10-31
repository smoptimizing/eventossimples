import Link from "next/link";
import { requireOwnEvent } from "@/lib/auth";
import { attendeeRows, loadEventData } from "@/lib/dashboard";
import { OrderStatusBadge } from "@/components/badges";
import { ConfirmButton } from "@/components/ui";
import { dateShort, dateTime, maskPhone, money, normalizeName } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { checkOrder, setOrderStatus } from "../../../actions";

export const metadata = { title: "Inscrições" };

export default async function InscricoesPage({ params, searchParams }: PageProps<"/painel/eventos/[id]/inscricoes">) {
  const { id } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const view = sp.ver === "pessoas" ? "pessoas" : "pedidos";
  const { supabase, event } = await requireOwnEvent(id);
  const data = await loadEventData(supabase, event);
  const needle = normalizeName(q);

  const people = attendeeRows(event, data).filter(
    (r) => (!status || r.order.effective === status) && (!needle || normalizeName(`${r.attendee.name} ${r.order.buyer_name} ${r.order.code}`).includes(needle)),
  );
  const orders = data.orders
    .filter((o) => !status || o.effective === status)
    .filter((o) => {
      if (!needle) return true;
      const names = data.attendees.filter((a) => a.order_id === o.id).map((a) => a.name).join(" ");
      return normalizeName(`${o.code} ${o.buyer_name} ${o.buyer_email} ${names}`).includes(needle);
    })
    .reverse();

  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(view === "pessoas" && { ver: "pessoas" }), ...over });
    [...p.entries()].forEach(([k, v]) => !v && p.delete(k));
    return `?${p}`;
  };

  return (
    <div className="space-y-4">
      {typeof sp.erro === "string" && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Não foi possível confirmar. {sp.erro}</p>
      )}
      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Buscar nome, e-mail ou código" />
        <select className="input w-auto" name="status" defaultValue={status}>
          <option value="">Todas as situações</option>
          {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((k) => <option key={k} value={k}>{ORDER_STATUS_LABEL[k]}</option>)}
        </select>
        {view === "pessoas" && <input type="hidden" name="ver" value="pessoas" />}
        <button className="btn-secondary">Filtrar</button>
        <div className="ml-auto flex rounded-lg border border-zinc-300 p-0.5 text-sm">
          <Link href={link({ ver: "" })} className={`rounded-md px-3 py-1.5 ${view === "pedidos" ? "bg-brand-600 text-white" : ""}`}>Pedidos</Link>
          <Link href={link({ ver: "pessoas" })} className={`rounded-md px-3 py-1.5 ${view === "pessoas" ? "bg-brand-600 text-white" : ""}`}>Participantes</Link>
        </div>
      </form>

      {view === "pessoas" ? (
        <div className="card overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th><th>Idade</th><th>Itens</th>
                {data.questions.map((qq) => <th key={qq.id}>{qq.label}</th>)}
                <th>Responsável</th><th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {people.map((r) => (
                <tr key={r.attendee.id}>
                  <td className="font-medium">{r.attendee.name}</td>
                  <td>{r.age ?? "—"}</td>
                  <td>{r.itemsLabel || "—"}</td>
                  {data.questions.map((qq) => <td key={qq.id}>{r.attendee.answers?.[qq.id] ?? ""}</td>)}
                  <td>{r.order.buyer_name}<br /><span className="text-xs text-zinc-500">{maskPhone(r.order.buyer_phone)}</span></td>
                  <td><OrderStatusBadge status={r.order.effective} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {people.length === 0 && <p className="p-4 text-sm text-zinc-500">Nenhum participante encontrado.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-sm text-zinc-500">Nenhuma inscrição encontrada.</p>}
          {orders.map((o) => {
            const atts = data.attendees.filter((a) => a.order_id === o.id);
            return (
              <details key={o.id} className="card p-4">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <span className="font-mono font-bold">{o.code}</span>
                  <span className="font-medium">{o.buyer_name}</span>
                  <span className="text-sm text-zinc-500">{atts.length} pessoa(s) · {dateTime(o.created_at)}</span>
                  <span className="ml-auto font-semibold tabular-nums">{money(o.total)}</span>
                  <OrderStatusBadge status={o.effective} />
                </summary>
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-[1fr_260px]">
                  <div className="space-y-3">
                    {atts.map((a) => (
                      <div key={a.id}>
                        <p className="font-medium">{a.name} {a.birth_date && <span className="font-normal text-zinc-500">· nasc. {dateShort(a.birth_date)}</span>}</p>
                        <p className="text-zinc-600">
                          {data.orderItems.filter((l) => l.attendee_id === a.id)
                            .map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.item_name}${l.option ? ` (${l.option})` : ""} ${money(l.unit_price * l.quantity)}`)
                            .join(" · ")}
                        </p>
                        {data.questions.filter((qq) => a.answers?.[qq.id]).map((qq) => (
                          <p key={qq.id} className="text-zinc-600"><span className="text-zinc-400">{qq.label}:</span> {a.answers[qq.id]}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1 text-zinc-600">
                    <p>{o.buyer_email}</p>
                    {o.buyer_phone && <p>{maskPhone(o.buyer_phone)}</p>}
                    {o.lot_name && <p>Lote: {o.lot_name}</p>}
                    {o.paid_at && <p>Pago em {dateTime(o.paid_at)}</p>}
                    {o.effective === "pending" && <p>Reserva até {dateTime(o.expires_at)}</p>}
                    <p>Taxa da plataforma: {money(o.fee_amount)}</p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <a href={`/inscricao/${o.code}?k=${o.access_key}`} target="_blank" className="btn-secondary px-3 py-1.5">Comprovante</a>
                      {o.status !== "paid" && o.provider_payment_id && (
                        <form action={checkOrder.bind(null, id, o.id)}><button className="btn-secondary px-3 py-1.5">Verificar pagamento</button></form>
                      )}
                      {o.status !== "paid" && (
                        <form action={setOrderStatus.bind(null, id, o.id, "paid")}>
                          <ConfirmButton message={
                            o.effective === "pending"
                              ? "Confirmar manualmente? Use só se o pagamento foi recebido por fora do sistema."
                              : "Confirmar manualmente? Use só se o pagamento foi recebido por fora do sistema. Esta inscrição não segura mais a vaga: só será confirmada se ainda houver vaga e estoque dos itens."
                          } className="btn-secondary px-3 py-1.5">
                            Confirmar manualmente
                          </ConfirmButton>
                        </form>
                      )}
                      {o.status !== "cancelled" && (
                        <form action={setOrderStatus.bind(null, id, o.id, "cancelled")}>
                          <ConfirmButton message="Cancelar esta inscrição e liberar as vagas? Estornos devem ser feitos no gateway." className="btn-ghost px-3 py-1.5 text-red-600">
                            Cancelar
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
