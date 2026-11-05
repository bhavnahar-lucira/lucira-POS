import * as XLSX from 'xlsx';
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { listResponses, istDay } from '@/lib/mongo/vocResponses';
import { QUESTIONS, answerLabel } from '@/lib/voc/questions';
import { filterFromParams, toPublicResponse, withFullMobiles } from '@/lib/voc/server';

// shortcut: every customer's full mobile is looked up live, so very large exports are slow; narrow the dates if that bites.
const EXPORT_LIMIT = 2000;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const timeOf = (date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(date));

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) return Response.json({ error: 'Only a super admin can export feedback.' }, { status: 403 });

  const { filter, error, status } = filterFromParams(session, new URL(request.url).searchParams);
  if (error) return Response.json({ error }, { status });

  try {
    const { rows, total } = await listResponses(filter, { limit: EXPORT_LIMIT });
    if (total > EXPORT_LIMIT) {
      return Response.json({ error: `${total} responses match. Narrow the dates to ${EXPORT_LIMIT} or fewer to export.` }, { status: 413 });
    }
    const responses = await withFullMobiles(session, rows.map(toPublicResponse));

    const sheetRows = responses.map((r) => ({
      Date: r.day,
      Time: timeOf(r.submitted_at),
      Store: r.store.name ?? '',
      'Store code': r.store.code ?? '',
      Customer: r.customer.name,
      'Customer ID': r.customer.party_id,
      Mobile: r.customer.mobile ?? '',
      Email: r.customer.email ?? '',
      'Jewelry Consultant': r.jc.name,
      'Jewelry Consultant ID': r.jc.id,
      ...Object.fromEntries(QUESTIONS.map((q) => [`Q${q.id.slice(1)}. ${q.text}`, answerLabel(q.id, r.answers[q.id], r.other_text)])),
      Referrals: (r.referrals ?? []).map((ref) => `${ref.name} (${ref.mobile})`).join('; '),
      'Submitted by': r.submitted_by,
      'Edited by': r.updated_by ?? '',
    }));

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sheetRows), 'Voice of Lucira');
    const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'buffer' });
    return new Response(buffer, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="voice-of-lucira-${istDay()}.xlsx"`,
      },
    });
  } catch (err) {
    console.error('[api/voc/export] GET', err);
    return Response.json({ error: 'Failed to export feedback' }, { status: 500 });
  }
}
