import { dateShort, eventPeriod, money } from "@/lib/format";
import type { FeePayment, FeeStatement } from "@/lib/fee-statement";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  const color = tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "";
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

/** Extrato da taxa da plataforma (Cliente e administração). */
export function FeeStatementView({ s, paymentAction }: { s: FeeStatement; paymentAction?: (p: FeePayment) => React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Taxas geradas" value={money(s.feeTotal)} />
        <Stat label="Já pago" value={money(s.paidTotal)} />
        <Stat label={s.balance < 0 ? "Crédito" : "Saldo a pagar"} value={money(Math.abs(s.balance))} tone={s.balance > 0 ? "warn" : "ok"} />
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Evento</th><th className="text-right">Inscrições pagas</th><th className="text-right">Arrecadado</th><th className="text-right">Taxa</th></tr>
          </thead>
          <tbody>
            {s.byEvent.map((e) => (
              <tr key={e.id}>
                <td>{e.title}<p className="text-xs text-zinc-500">{eventPeriod(e.starts_at, null)}</p></td>
                <td className="text-right tabular-nums">{e.orders}</td>
                <td className="text-right tabular-nums">{money(e.gross)}</td>
                <td className="text-right tabular-nums">{money(e.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.byEvent.length === 0 && <p className="py-3 text-sm text-zinc-500">Nenhuma inscrição paga até agora.</p>}
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Pagamentos à plataforma</h3>
        {s.payments.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pagamento registrado.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Data</th><th>Observação</th><th className="text-right">Valor</th>{paymentAction && <th />}</tr></thead>
            <tbody>
              {s.payments.map((p) => (
                <tr key={p.id}>
                  <td>{dateShort(p.paid_on)}</td>
                  <td>{p.note}</td>
                  <td className="text-right tabular-nums">{money(p.amount)}</td>
                  {paymentAction && <td className="text-right">{paymentAction(p)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
