import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { effectiveStatus, loadReceipt } from "@/lib/receipt";
import { newPdf, pdfResponse, table } from "@/lib/pdf";
import { dateShort, dateTime, eventPeriod, money } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";

export async function GET(request: NextRequest, { params }: RouteContext<"/inscricao/[code]/pdf">) {
  const { code } = await params;
  const r = await loadReceipt(code, request.nextUrl.searchParams.get("k") ?? undefined);
  if (!r) return new NextResponse("Inscrição não encontrada.", { status: 404 });
  const { order, event, organizer, attendees, items } = r;

  const pdf = newPdf("Comprovante de inscrição", event.title);
  const { doc } = pdf;
  const qr = await QRCode.toDataURL(order.code, { margin: 1, width: 240 });
  doc.addImage(qr, "PNG", 160, 10, 36, 36);

  doc.setFontSize(10).setTextColor(40);
  const lines = [
    `Código: ${order.code}`,
    `Situação: ${ORDER_STATUS_LABEL[effectiveStatus(order)]}`,
    `Evento: ${eventPeriod(event.starts_at, event.ends_at)}${event.location ? ` — ${event.location}` : ""}`,
    `Organização: ${organizer.name}`,
    `Responsável: ${order.buyer_name} (${order.buyer_email})`,
    `Inscrição feita em ${dateTime(order.created_at)}${order.paid_at ? ` · pagamento confirmado em ${dateTime(order.paid_at)}` : ""}`,
  ];
  lines.forEach((l, i) => doc.text(l, 14, 34 + i * 5.5));
  pdf.state.y = 34 + lines.length * 5.5 + 6;

  table(
    pdf,
    ["Participante", "Nascimento", "Item", "Qtd.", "Valor"],
    attendees.flatMap((a) =>
      items
        .filter((i) => i.attendee_id === a.id)
        .map((i, n) => [n === 0 ? a.name : "", n === 0 ? dateShort(a.birth_date) : "", `${i.item_name}${i.option ? ` (${i.option})` : ""}`, i.quantity, money(i.unit_price * i.quantity)]),
    ),
    { foot: [["", "", "Total", "", money(order.total)]] },
  );
  return pdfResponse(pdf, `inscricao-${order.code}.pdf`);
}
