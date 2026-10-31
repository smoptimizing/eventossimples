import { requireOwnEvent } from "@/lib/auth";
import { attendeeRows, computeStats, loadEventData } from "@/lib/dashboard";
import { heading, newPdf, pdfResponse, table } from "@/lib/pdf";
import { eventPeriod, maskPhone, money, slugify } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";

export async function GET(_: Request, { params }: RouteContext<"/painel/eventos/[id]/exportar/pdf">) {
  const { id } = await params;
  const { supabase, event } = await requireOwnEvent(id);
  const data = await loadEventData(supabase, event);
  const s = computeStats(event, data);

  const pdf = newPdf(event.title, `${eventPeriod(event.starts_at, event.ends_at)}${event.location ? ` · ${event.location}` : ""}`, true);

  heading(pdf, "Resumo");
  table(pdf, ["Vagas", "Confirmados", "Aguardando pagamento", "Restantes", "Arrecadado", "Taxa", "Líquido", "A receber"], [[
    event.capacity ?? "sem limite",
    s.confirmed,
    s.pendingPeople,
    s.remaining ?? "—",
    money(s.gross),
    money(s.fee),
    money(s.net),
    money(s.pendingValue),
  ]]);

  heading(pdf, "Itens");
  table(
    pdf,
    ["Item", "Confirmados", "Pendentes", "Estoque", "Opções", "Valor"],
    s.items.map((r) => [r.item.name, r.paidQty, r.pendingQty, r.item.stock ?? "—", r.options.map(([o, n]) => `${o}: ${n}`).join("  "), money(r.revenue)]),
  );

  if (s.lots.length) {
    heading(pdf, "Lotes (confirmados)");
    table(pdf, ["Lote", "Pessoas", "Valor"], s.lots.map((l) => [l.name, l.people, money(l.revenue)]));
  }

  heading(pdf, "Faixa etária (confirmados)");
  table(pdf, s.ages.map((a) => a.label), [s.ages.map((a) => a.count)]);

  heading(pdf, "Participantes");
  table(
    pdf,
    ["Nome", "Idade", "Itens", "Responsável", "WhatsApp", "Código", "Situação"],
    attendeeRows(event, data)
      .filter((r) => r.order.effective === "paid" || r.order.effective === "pending")
      .sort((a, b) => a.attendee.name.localeCompare(b.attendee.name, "pt-BR"))
      .map((r) => [r.attendee.name, r.age ?? "", r.itemsLabel, r.order.buyer_name, maskPhone(r.order.buyer_phone), r.order.code, ORDER_STATUS_LABEL[r.order.effective]]),
  );

  return pdfResponse(pdf, `${slugify(event.title)}.pdf`);
}
