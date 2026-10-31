import "server-only";
import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import { NextResponse } from "next/server";
import { SITE_NAME } from "@/lib/site";
import { dateTime } from "@/lib/format";

const BRAND: [number, number, number] = [31, 67, 160];

/** Documento A4 com cabeçalho; `y` aponta para onde o conteúdo começa. */
export function newPdf(title: string, subtitle?: string, landscape = false) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...BRAND).text(title, 14, 18);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  if (subtitle) doc.text(subtitle, 14, 24);
  const state = { y: subtitle ? 30 : 24 };
  return { doc, state };
}

export function heading(pdf: ReturnType<typeof newPdf>, text: string) {
  const { doc, state } = pdf;
  if (state.y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    state.y = 18;
  }
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(30).text(text, 14, state.y + 4);
  state.y += 7;
}

export function table(pdf: ReturnType<typeof newPdf>, head: string[], body: RowInput[], opts: { foot?: RowInput[] } = {}) {
  autoTable(pdf.doc, {
    startY: pdf.state.y,
    head: [head],
    body,
    foot: opts.foot,
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [235, 238, 245], textColor: 20, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf.state.y = (pdf.doc as any).lastAutoTable.finalY + 8;
}

export function pdfResponse(pdf: ReturnType<typeof newPdf>, filename: string) {
  const { doc } = pdf;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`${SITE_NAME} · gerado em ${dateTime(new Date().toISOString())}`, 14, h - 8);
    doc.text(`${i}/${pages}`, doc.internal.pageSize.getWidth() - 14, h - 8, { align: "right" });
  }
  return new NextResponse(Buffer.from(doc.output("arraybuffer")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
