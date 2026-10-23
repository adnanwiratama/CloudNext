// Lightweight client-side export/print for financial reports — no external deps.
// CSV + Excel(.xls via HTML table) are generated and downloaded directly; PDF &
// Print open a styled window and use the browser's native print/"Save as PDF".

export interface ReportColumn { label: string; align?: 'left' | 'right'; }
export interface ReportCell { text: string; align?: 'left' | 'right'; }
// A row is: indent level (for the label column), bold flag, and the cell values.
export interface ReportRow { cells: (string | number)[]; indent?: number; bold?: boolean; }

export interface ReportModel {
  title: string;
  subtitle?: string;      // e.g. period / as-of
  company?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}

const esc = (s: any) => String(s ?? '');
const csvEsc = (s: any) => {
  const v = esc(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const htmlEsc = (s: any) => esc(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (t: string) => t.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase();

export function exportReportCSV(m: ReportModel) {
  const lines: string[] = [];
  lines.push(csvEsc(m.title));
  if (m.subtitle) lines.push(csvEsc(m.subtitle));
  lines.push('');
  lines.push(m.columns.map(c => csvEsc(c.label)).join(','));
  for (const r of m.rows) {
    const cells = r.cells.map((c, i) => {
      // indent the first (label) column with spaces so the hierarchy is readable
      if (i === 0 && r.indent) return csvEsc(`${'  '.repeat(r.indent)}${c}`);
      return csvEsc(c);
    });
    lines.push(cells.join(','));
  }
  download(`${safeName(m.title)}.csv`, lines.join('\n'), 'text/csv;charset=utf-8;');
}

function buildTableHTML(m: ReportModel): string {
  const head = `<tr>${m.columns.map(c => `<th style="text-align:${c.align || 'left'}">${htmlEsc(c.label)}</th>`).join('')}</tr>`;
  const body = m.rows.map(r => {
    const tds = r.cells.map((c, i) => {
      const col = m.columns[i];
      const pad = i === 0 && r.indent ? `padding-left:${12 + r.indent * 18}px;` : '';
      const weight = r.bold ? 'font-weight:bold;' : '';
      return `<td style="text-align:${col?.align || 'left'};${pad}${weight}">${htmlEsc(c)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function exportReportExcel(m: ReportModel) {
  // An HTML document with an Excel MIME opens natively in Excel/Sheets as a table.
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
    <h3>${htmlEsc(m.title)}</h3>${m.subtitle ? `<div>${htmlEsc(m.subtitle)}</div>` : ''}
    <table border="1">${buildTableHTML(m).replace(/^<table>|<\/table>$/g, '')}</table></body></html>`;
  download(`${safeName(m.title)}.xls`, html, 'application/vnd.ms-excel');
}

function openPrintWindow(m: ReportModel, autoPrint: boolean) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) return;
  const style = `
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color:#1e293b; padding:24px; }
      h1 { font-size:18px; margin:0 0 2px; }
      .sub { font-size:12px; color:#64748b; margin-bottom:14px; }
      .co { font-size:13px; font-weight:bold; margin-bottom:2px; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th { text-align:left; border-bottom:2px solid #cbd5e1; padding:6px 8px; font-size:11px; text-transform:uppercase; color:#475569; }
      td { padding:4px 8px; border-bottom:1px solid #f1f5f9; }
      tfoot td { border-top:2px solid #94a3b8; font-weight:bold; }
      @media print { body { padding:0; } }
    </style>`;
  w.document.write(`<html><head><title>${htmlEsc(m.title)}</title>${style}</head><body>
    ${m.company ? `<div class="co">${htmlEsc(m.company)}</div>` : ''}
    <h1>${htmlEsc(m.title)}</h1>
    ${m.subtitle ? `<div class="sub">${htmlEsc(m.subtitle)}</div>` : ''}
    ${buildTableHTML(m)}
  </body></html>`);
  w.document.close();
  if (autoPrint) { w.focus(); setTimeout(() => w.print(), 300); }
}

export function printReport(m: ReportModel) { openPrintWindow(m, true); }
// "PDF" uses the same print window; the user chooses "Save as PDF" in the dialog.
export function exportReportPDF(m: ReportModel) { openPrintWindow(m, true); }
