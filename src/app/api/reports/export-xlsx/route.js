import * as XLSX from 'xlsx';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

// Generates the workbook server-side and returns it as a real file response
// (Content-Disposition), the same mechanism OrnaVerse's own Excel export
// uses (confirmed live: a hidden form POST to its own server endpoint) — a
// client-side Blob + <a download> download was unreliable on at least one
// real user's machine (saved with a generated filename, no extension),
// which a genuine server response + browser-native download handling can't
// hit, since there's no Blob URL or JS-simulated click involved at all.
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function toSheetRows(columns, rows) {
  return rows.map((row) => {
    const out = {};
    columns.forEach((c) => { out[c.label] = row[c.key] ?? ''; });
    return out;
  });
}

// SECURITY (2026-10-19): this route had no auth check at all — an
// unauthenticated client could hit it directly with an arbitrary, unbounded
// payload (CPU/memory abuse generating a workbook server-side), and
// `filename` was interpolated straight into a response header with no
// sanitization (CR/LF or a stray quote in it could corrupt/inject header
// content). Now requires a real session and strips header-unsafe characters
// from the filename before it reaches Content-Disposition.
function sanitizeFilename(name) {
  const cleaned = String(name ?? 'export')
    .replace(/[\r\n"]/g, '')
    .trim();
  return cleaned || 'export.xlsx';
}

export async function POST(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const { filename, sheets } = JSON.parse(formData.get('payload'));

  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, columns, rows }) => {
    const sheet = XLSX.utils.json_to_sheet(toSheetRows(columns, rows));
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  });

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  return new Response(buffer, {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${sanitizeFilename(filename)}"`,
    },
  });
}
