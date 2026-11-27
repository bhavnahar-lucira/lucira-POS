import { downloadXlsx } from '@/lib/excelExport';

const STATUS_LABELS = { 0: 'Draft', 1: 'Posted', 2: 'Cancelled' };

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
};

const num = (v) => (v == null || v === '' ? '' : Number(v));

const COLUMNS = [
  { key: 'date',     label: 'Document Date' },
  { key: 'no',       label: 'Document No' },
  { key: 'party',    label: 'Party Name' },
  { key: 'pieces',   label: 'Pieces' },
  { key: 'weight',   label: 'Weight' },
  { key: 'tax',      label: 'Tax Amount' },
  { key: 'subTotal', label: 'Sub Total' },
  { key: 'net',      label: 'Net Amount' },
  { key: 'status',   label: 'Document Status' },
];

/** Same columns as OrnaVerse's POS Invoice/Order/Reserve list Excel export; `entities` are raw list rows. */
export function downloadDocumentList({ kind, entities }) {
  const rows = [...entities]
    .sort((a, b) => new Date(b.document_date ?? 0) - new Date(a.document_date ?? 0))
    .map((e) => ({
      date:     formatDate(e.document_date),
      no:       e.document_no ?? '',
      party:    e.party_name ?? '',
      pieces:   num(e.pieces),
      weight:   num(e.weight),
      tax:      num(e.tax_amount),
      subTotal: num(e.sub_total),
      net:      num(e.net_amount),
      status:   STATUS_LABELS[e.document_status] ?? String(e.document_status ?? ''),
    }));

  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).replaceAll('-', '');
  const name = { order: 'Order', reserve: 'Reserve' }[kind] ?? 'Invoice';
  downloadXlsx(`${name}List_${stamp}.xlsx`, [{ name: `${name}s`, columns: COLUMNS, rows }]);
}
