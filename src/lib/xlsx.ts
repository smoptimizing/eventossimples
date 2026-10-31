import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

/** Adiciona uma aba com cabeçalho destacado, filtro e larguras automáticas. */
export function addSheet(wb: ExcelJS.Workbook, name: string, header: string[], rows: (string | number | null)[][]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(header);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F43A0" } };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col, i) => {
    const longest = Math.max(header[i]?.length ?? 8, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    col.width = Math.min(Math.max(longest + 2, 8), 50);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  return ws;
}

export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
