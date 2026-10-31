import ExcelJS from "exceljs";
import { requireOwnEvent } from "@/lib/auth";
import { attendeeRows, computeStats, loadEventData } from "@/lib/dashboard";
import { addSheet, xlsxResponse } from "@/lib/xlsx";
import { dateShort, dateTime, maskCpf, maskPhone, slugify } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";

export async function GET(_: Request, { params }: RouteContext<"/painel/eventos/[id]/exportar/excel">) {
  const { id } = await params;
  const { supabase, event } = await requireOwnEvent(id);
  const data = await loadEventData(supabase, event);
  const s = computeStats(event, data);
  const wb = new ExcelJS.Workbook();

  addSheet(wb, "Resumo", ["Indicador", "Valor"], [
    ["Evento", event.title],
    ["Vagas", event.capacity ?? "sem limite"],
    ["Inscritos confirmados", s.confirmed],
    ["Aguardando pagamento", s.pendingPeople],
    ["Vagas restantes", s.remaining ?? "sem limite"],
    ["Arrecadado (R$)", s.gross],
    ["Taxa da plataforma (R$)", s.fee],
    ["Líquido (R$)", s.net],
    ["A receber (R$)", s.pendingValue],
    ...Object.entries(s.ordersByStatus).map(([k, v]) => [`Pedidos: ${ORDER_STATUS_LABEL[k as keyof typeof ORDER_STATUS_LABEL]}`, v] as [string, number]),
  ]);

  addSheet(
    wb,
    "Participantes",
    ["Código", "Situação", "Nome", "Nascimento", "Idade", "Itens", "Valor (R$)", ...data.questions.map((q) => q.label), "Responsável", "E-mail", "WhatsApp", "Lote", "Inscrito em", "Pago em"],
    attendeeRows(event, data).map((r) => [
      r.order.code,
      ORDER_STATUS_LABEL[r.order.effective],
      r.attendee.name,
      dateShort(r.attendee.birth_date),
      r.age,
      r.itemsLabel,
      r.value,
      ...data.questions.map((q) => r.attendee.answers?.[q.id] ?? ""),
      r.order.buyer_name,
      r.order.buyer_email,
      maskPhone(r.order.buyer_phone),
      r.order.lot_name,
      dateTime(r.order.created_at),
      dateTime(r.order.paid_at),
    ]),
  );

  addSheet(
    wb,
    "Pedidos",
    ["Código", "Situação", "Responsável", "E-mail", "WhatsApp", "CPF", "Pessoas", "Total (R$)", "Taxa (R$)", "Lote", "Gateway", "Criado em", "Pago em"],
    data.orders.map((o) => [
      o.code,
      ORDER_STATUS_LABEL[o.effective],
      o.buyer_name,
      o.buyer_email,
      maskPhone(o.buyer_phone),
      maskCpf(o.buyer_cpf),
      data.attendees.filter((a) => a.order_id === o.id).length,
      Number(o.total),
      Number(o.fee_amount),
      o.lot_name,
      o.provider,
      dateTime(o.created_at),
      dateTime(o.paid_at),
    ]),
  );

  addSheet(
    wb,
    "Itens",
    ["Item", "Opção", "Quantidade confirmada", "Pendente", "Valor (R$)"],
    s.items.flatMap((r) => [
      [r.item.name, "", r.paidQty, r.pendingQty, r.revenue],
      ...r.options.map(([o, n]) => [r.item.name, o, n, null, null] as (string | number | null)[]),
    ]),
  );

  // Lista de entrega: quem recebe cada item (confirmados).
  addSheet(
    wb,
    "Entrega de itens",
    ["Item", "Opção", "Quantidade", "Participante", "Código"],
    data.orderItems
      .filter((l) => data.orderById.get(l.order_id)?.effective === "paid" && !data.items.find((i) => i.id === l.item_id)?.is_registration)
      .map((l) => [l.item_name, l.option, l.quantity, data.attendees.find((a) => a.id === l.attendee_id)?.name ?? "", data.orderById.get(l.order_id)?.code ?? ""])
      .sort((a, b) => `${a[0]}${a[1]}${a[3]}`.localeCompare(`${b[0]}${b[1]}${b[3]}`, "pt-BR")),
  );

  return xlsxResponse(wb, `${slugify(event.title)}.xlsx`);
}
