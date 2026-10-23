// ─────────────────────────────────────────────────────────────────────────────
// Reusable transaction printout.
//
// Builds a clean, standard business-document printout (company header, document
// title + number, party block, meta grid, line-items table, totals, signature
// footer) and opens the browser print dialog. Shared by every transaction detail
// page so the printed format is consistent across the app.
// ─────────────────────────────────────────────────────────────────────────────

export interface PrintCompany {
  name?: string;
  legal_name?: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  postal_code?: string;
}

export interface PrintColumn {
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Extract the cell value for a row. */
  value: (row: any) => string | number;
}

export interface PrintTotal {
  label: string;
  value: string;
  bold?: boolean;
}

export interface PrintField {
  label: string;
  value: string;
}

export interface PrintDoc {
  /** Document type, e.g. "Sales Order", "Invoice", "Purchase Order". */
  title: string;
  /** Document number shown large near the title. */
  number?: string;
  /** Optional status text shown as a badge. */
  status?: string;
  /** Bill-to / party block heading, e.g. "Customer", "Vendor", "Bill To". */
  partyLabel?: string;
  /** Party name + optional lines (address, email, phone). */
  partyName?: string;
  partyLines?: string[];
  /** Meta fields shown in a grid at the top-right (Date, Terms, etc.). */
  meta?: PrintField[];
  /** Line-item table columns + rows (optional; some docs have no lines). */
  columns?: PrintColumn[];
  rows?: any[];
  /** Totals shown bottom-right (Subtotal, Tax, Total, etc.). */
  totals?: PrintTotal[];
  /** Free-text memo/notes printed below the table. */
  memo?: string;
  /** Whether to render a signature footer (default true). */
  showSignatures?: boolean;
}

const esc = (v: any): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function companyHeaderHtml(c: PrintCompany): string {
  const name = esc(c.name || c.legal_name || 'Company');
  const addrParts = [c.address, c.city, c.postal_code, c.country].filter(Boolean).map(esc);
  const contactParts = [
    c.phone ? `Tel: ${esc(c.phone)}` : '',
    c.email ? `Email: ${esc(c.email)}` : '',
    c.website ? esc(c.website) : '',
  ].filter(Boolean);
  return `
    <div class="co">
      <div class="co-name">${name}</div>
      ${addrParts.length ? `<div class="co-line">${addrParts.join(', ')}</div>` : ''}
      ${contactParts.length ? `<div class="co-line">${contactParts.join(' · ')}</div>` : ''}
      ${c.tax_id ? `<div class="co-line">NPWP / Tax ID: ${esc(c.tax_id)}</div>` : ''}
    </div>`;
}

export function buildPrintHtml(doc: PrintDoc, company: PrintCompany): string {
  const metaHtml = (doc.meta || [])
    .filter(m => m.value != null && m.value !== '')
    .map(m => `<div class="meta-row"><span class="meta-label">${esc(m.label)}</span><span class="meta-value">${esc(m.value)}</span></div>`)
    .join('');

  const partyHtml = doc.partyName
    ? `<div class="party">
         <div class="party-label">${esc(doc.partyLabel || 'To')}</div>
         <div class="party-name">${esc(doc.partyName)}</div>
         ${(doc.partyLines || []).filter(Boolean).map(l => `<div class="party-line">${esc(l)}</div>`).join('')}
       </div>`
    : '';

  let tableHtml = '';
  if (doc.columns && doc.columns.length) {
    const head = doc.columns
      .map(c => `<th class="${c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : 'l'}">${esc(c.label)}</th>`)
      .join('');
    const body = (doc.rows || [])
      .map(
        (row, i) =>
          `<tr>${doc.columns!
            .map(c => `<td class="${c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : 'l'}">${i >= 0 ? esc(c.value(row)) : ''}</td>`)
            .join('')}</tr>`,
      )
      .join('');
    tableHtml = `
      <table class="lines">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td class="empty" colspan="${doc.columns.length}">No line items</td></tr>`}</tbody>
      </table>`;
  }

  const totalsHtml = (doc.totals || []).length
    ? `<div class="totals">
        ${doc
          .totals!.map(
            t =>
              `<div class="tot-row ${t.bold ? 'tot-bold' : ''}"><span>${esc(t.label)}</span><span>${esc(t.value)}</span></div>`,
          )
          .join('')}
       </div>`
    : '';

  const memoHtml = doc.memo
    ? `<div class="memo"><div class="memo-label">Notes</div><div class="memo-text">${esc(doc.memo)}</div></div>`
    : '';

  const signatures =
    doc.showSignatures === false
      ? ''
      : `<div class="sign">
           <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Prepared By</div></div>
           <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Approved By</div></div>
           <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Received By</div></div>
         </div>`;

  const printedAt = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${esc(doc.title)} ${esc(doc.number || '')}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.45; }
  .page { max-width: 780px; margin: 0 auto; padding: 32px 36px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 14px; }
  .co-name { font-size: 18px; font-weight: 700; color: #0f172a; }
  .co-line { color: #475569; font-size: 11px; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 22px; letter-spacing: 1px; text-transform: uppercase; color: #0f172a; }
  .doc-num { font-size: 13px; color: #475569; margin-top: 2px; font-family: ui-monospace, monospace; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 10px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 10px; text-transform: capitalize; color: #334155; }
  .info { display: flex; justify-content: space-between; gap: 24px; margin-top: 18px; }
  .party { max-width: 55%; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 3px; }
  .party-name { font-weight: 700; font-size: 13px; }
  .party-line { color: #475569; font-size: 11px; }
  .meta { min-width: 240px; }
  .meta-row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dotted #e2e8f0; }
  .meta-label { color: #64748b; }
  .meta-value { font-weight: 600; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 22px; }
  table.lines th { background: #f1f5f9; border-bottom: 2px solid #cbd5e1; padding: 7px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #475569; }
  table.lines td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  table.lines td.empty { text-align: center; color: #94a3b8; font-style: italic; padding: 14px; }
  .l { text-align: left; } .r { text-align: right; } .c { text-align: center; }
  .totals { margin-top: 12px; margin-left: auto; width: 280px; }
  .tot-row { display: flex; justify-content: space-between; padding: 4px 8px; }
  .tot-bold { border-top: 2px solid #1e293b; font-weight: 700; font-size: 13px; margin-top: 2px; }
  .memo { margin-top: 22px; }
  .memo-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #64748b; }
  .memo-text { color: #334155; font-size: 11px; white-space: pre-wrap; }
  .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 56px; }
  .sign-box { flex: 1; text-align: center; }
  .sign-line { border-top: 1px solid #94a3b8; margin: 0 8px; }
  .sign-label { font-size: 10px; color: #64748b; margin-top: 4px; }
  .foot { margin-top: 34px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
  @media print {
    .page { padding: 0; }
    @page { margin: 14mm; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="top">
      ${companyHeaderHtml(company)}
      <div class="doc-title">
        <h1>${esc(doc.title)}</h1>
        ${doc.number ? `<div class="doc-num">${esc(doc.number)}</div>` : ''}
        ${doc.status ? `<div class="badge">${esc(doc.status)}</div>` : ''}
      </div>
    </div>

    <div class="info">
      ${partyHtml}
      <div class="meta">${metaHtml}</div>
    </div>

    ${tableHtml}
    ${totalsHtml}
    ${memoHtml}
    ${signatures}

    <div class="foot">
      <span>${esc(company.name || company.legal_name || '')}</span>
      <span>Printed ${esc(printedAt)}</span>
    </div>
  </div>
  <script>
    window.onload = function () { window.focus(); window.print(); };
  </script>
</body>
</html>`;
}

/** Open a print window for the given document. */
export function printDocument(doc: PrintDoc, company: PrintCompany = {}): void {
  const html = buildPrintHtml(doc, company);
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    // Popup blocked — fall back to a hidden iframe.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const idoc = iframe.contentWindow?.document;
    if (idoc) {
      idoc.open();
      idoc.write(html);
      idoc.close();
    }
    setTimeout(() => document.body.removeChild(iframe), 2000);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
