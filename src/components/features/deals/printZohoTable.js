const escape = (v) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Opens a print-ready page with just this table (no POS chrome) and prints it.
 * @param {{ title: string, subtitle?: string, columns: { label: string, value: (row: object) => string|number|null }[], rows: object[] }} args
 */
export function printZohoTable({ title, subtitle, columns, rows }) {
  const win = window.open('', '_blank', 'width=1000,height=700');
  if (!win) return false;
  const head = columns.map((c) => `<th>${escape(c.label)}</th>`).join('');
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td>${escape(c.value(r))}</td>`).join('')}</tr>`).join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>${escape(title)}</h1><p>${escape(subtitle ?? '')} · ${rows.length} record${rows.length === 1 ? '' : 's'} · printed ${escape(new Date().toLocaleString('en-IN'))}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
