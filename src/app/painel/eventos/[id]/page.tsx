import Link from "next/link";
import { requireOwnEvent } from "@/lib/auth";
import { computeStats, loadEventData } from "@/lib/dashboard";
import { dateShort, money } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";

const ERRORS: Record<string, string> = {
  data: "Informe a data de início do evento em Dados do evento.",
  aprovacao: "O evento precisa ser aprovado pela plataforma antes de ir ao ar.",
  gateway: "Para publicar um evento pago, configure antes o recebimento em Conta e recebimento.",
  inativo: "Sua conta está suspensa; não é possível publicar.",
  excluir: "Não é possível excluir um evento que já tem inscrições.",
};

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

/** Barras horizontais de uma série só (rótulo e valor em texto; barra na cor da marca). */
function Bars({ rows, format = (n: number) => String(n) }: { rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="text-sm text-zinc-500">Sem dados ainda.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="group grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}`}>
          <span className="truncate text-zinc-600">{r.label}</span>
          <span className="h-3 rounded-r bg-zinc-100">
            <span
              className="block h-3 rounded-r bg-brand-500 transition group-hover:bg-brand-700"
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 3 : 0 }}
            />
          </span>
          <span className="font-medium tabular-nums">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage({ params, searchParams }: PageProps<"/painel/eventos/[id]">) {
  const { id } = await params;
  const { erro } = await searchParams;
  const { supabase, event, organizer } = await requireOwnEvent(id);
  const data = await loadEventData(supabase, event);
  const s = computeStats(event, data);
  const occupancy = s.capacity ? Math.round(((s.confirmed + s.pendingPeople) / s.capacity) * 100) : null;
  const days = s.perDay.slice(-21);

  return (
    <div className="space-y-6">
      {typeof erro === "string" && ERRORS[erro] && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[erro]} {erro === "gateway" && <Link href="/painel/conta" className="link">Configurar agora</Link>}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <a href={`/painel/eventos/${id}/exportar/excel`} className="btn-secondary">Exportar Excel</a>
        <a href={`/painel/eventos/${id}/exportar/pdf`} className="btn-secondary">Exportar PDF</a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Inscritos confirmados"
          value={s.confirmed}
          sub={s.capacity ? `de ${s.capacity} vagas · ${s.pendingPeople} aguardando pagamento` : `${s.pendingPeople} aguardando pagamento`}
        />
        <Stat label="Vagas restantes" value={s.remaining ?? "sem limite"} sub={occupancy != null ? `${occupancy}% ocupado (inclui reservas)` : undefined} />
        <Stat label="Arrecadado" value={money(s.gross)} sub={`${money(s.pendingValue)} a receber`} />
        <Stat label="Líquido para você" value={money(s.net)} sub={`taxa da plataforma ${money(s.fee)} (${Number(organizer.fee_percent).toLocaleString("pt-BR")}%)`} />
      </div>

      {s.capacity && (
        <div className="card">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold">Ocupação</span>
            <span className="text-zinc-600">{s.confirmed} confirmados · {s.pendingPeople} reservados · {s.remaining} livres</span>
          </div>
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={`${s.confirmed} confirmados, ${s.pendingPeople} reservados de ${s.capacity}`}>
            <span className="bg-brand-600" style={{ width: `${(s.confirmed / s.capacity) * 100}%` }} title={`Confirmados: ${s.confirmed}`} />
            <span className="bg-brand-200" style={{ width: `${(s.pendingPeople / s.capacity) * 100}%` }} title={`Aguardando pagamento: ${s.pendingPeople}`} />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-zinc-600">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Confirmados</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> Aguardando pagamento</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Itens vendidos (confirmados)</h2>
          <table className="data-table">
            <thead>
              <tr><th>Item</th><th className="text-right">Qtd.</th><th className="text-right">Pendentes</th><th className="text-right">Estoque</th><th className="text-right">Valor</th></tr>
            </thead>
            <tbody>
              {s.items.map((r) => (
                <tr key={r.item.id}>
                  <td>
                    {r.item.name}
                    {r.options.length > 0 && <p className="text-xs text-zinc-500">{r.options.map(([o, n]) => `${o}: ${n}`).join(" · ")}</p>}
                  </td>
                  <td className="text-right tabular-nums">{r.paidQty}</td>
                  <td className="text-right tabular-nums text-zinc-500">{r.pendingQty}</td>
                  <td className="text-right tabular-nums text-zinc-500">{r.item.stock ?? "—"}</td>
                  <td className="text-right tabular-nums">{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Inscrições por situação</h2>
          <Bars rows={(Object.keys(s.ordersByStatus) as OrderStatus[]).map((k) => ({ label: ORDER_STATUS_LABEL[k], value: s.ordersByStatus[k] }))} />
          {s.lots.length > 0 && (
            <>
              <h2 className="mt-6 mb-3 font-semibold">Por lote (confirmados)</h2>
              <table className="data-table">
                <thead><tr><th>Lote</th><th className="text-right">Pessoas</th><th className="text-right">Valor</th></tr></thead>
                <tbody>
                  {s.lots.map((l) => (
                    <tr key={l.name}><td>{l.name}</td><td className="text-right tabular-nums">{l.people}</td><td className="text-right tabular-nums">{money(l.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Faixa etária (confirmados)</h2>
          <Bars rows={s.ages.map((a) => ({ label: a.label, value: a.count }))} />
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Confirmados por dia da inscrição</h2>
          <Bars rows={days.map(([d, n]) => ({ label: dateShort(d), value: n }))} />
          {s.perDay.length > days.length && <p className="hint">Últimos {days.length} dias com inscrições.</p>}
        </div>

        {s.answers.map((a) => (
          <div key={a.question.id} className="card">
            <h2 className="mb-3 font-semibold">{a.question.label}</h2>
            <Bars rows={a.counts.map(([label, value]) => ({ label, value }))} />
          </div>
        ))}
      </div>
    </div>
  );
}
