/**
 * Report exports for scheme scorecards. CSV uses the shared helper. "Excel" is an HTML-table .xls
 * file that Excel opens directly; "PDF" uses the browser's print-to-PDF on a generated page. Every
 * export states it is development data, and callers pass only rows and columns the viewer may see.
 */
import { downloadCsv, type CsvColumn } from "@/lib/csv";

const NOTE = "DEVELOPMENT / DEMO DATA — not V-Guard production figures. Calculated by the mock scheme engine";
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function table<T>(title: string, columns: CsvColumn<T>[], rows: T[]) {
  return `<h1 style="font:600 16px sans-serif">${esc(title)}</h1><p style="font:12px sans-serif">${esc(NOTE)}</p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font:12px sans-serif"><thead><tr>${columns.map((c) => `<th>${esc(c.header)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(c.value(r))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

export function exportReport<T>(format: "csv" | "xls" | "pdf", name: string, title: string, columns: CsvColumn<T>[], rows: T[]) {
  if (format === "csv") return downloadCsv(name, columns, rows, NOTE);
  if (format === "xls") {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${table(title, columns, rows)}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<html><head><title>${esc(title)}</title></head><body>${table(title, columns, rows)}</body></html>`);
  doc.close();
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 2000);
}
