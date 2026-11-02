// Olocker jewellery insurance for a posted POS invoice.
//
// GET  /api/insurance?transactionId=123  → policies already issued
// POST /api/insurance { transactionId, itemKeys? } → issues the missing ones
//
// Why the route re-reads the invoice instead of trusting a client payload:
// an insured value is a financial figure, and the browser has no business
// deciding what gets sent to an insurer. The client names a transaction and
// (optionally) which of its lines the customer opted in for; every weight,
// amount, date and customer detail is read back from OrnaVerse under the
// operator's own cookie session, so an operator can only ever insure an
// invoice they are already allowed to see.

import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { postUpstream } from '@/lib/reports/serverAccess';
import { generatePolicies, OlockerError } from '@/lib/olocker/client';
import { buildTagList, lineItemKey } from '@/lib/olocker/buildTagList';
import { getInvoicePolicies, appendInvoicePolicies } from '@/lib/mongo/insurancePolicies';
import API from '@/constants/apiEndpoints';

function parseTransactionId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not Authenticated' }, { status: 401 });

  const transactionId = parseTransactionId(request.nextUrl.searchParams.get('transactionId'));
  if (!transactionId) {
    return Response.json({ error: 'transactionId is required' }, { status: 400 });
  }

  try {
    const { items, unattributed } = await getInvoicePolicies({ env: session.env, transactionId });
    return Response.json({ items, unattributed });
  } catch (err) {
    console.error('[api/insurance] GET', err);
    return Response.json({ error: 'Could not load insurance policies' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not Authenticated' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const transactionId = parseTransactionId(body?.transactionId);
  if (!transactionId) {
    return Response.json({ error: 'transactionId is required' }, { status: 400 });
  }

  // Absent/empty means "every eligible line"; a list means the customer
  // opted in for just those.
  const requestedKeys = Array.isArray(body?.itemKeys) && body.itemKeys.length
    ? new Set(body.itemKeys.map(String))
    : null;

  try {
    const detail  = await postUpstream(session, API.INVOICES.RETRIEVE, { EntityId: transactionId });
    const invoice = detail?.Entity;
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const { items: existing, unattributed: alreadyUnattributed } =
      await getInvoicePolicies({ env: session.env, transactionId });

    // This invoice already holds a policy that could not be tied to a line,
    // so "which lines are still uninsured" is no longer a question this
    // route can answer — generating more would risk buying a second policy
    // for a ring that already has one. Needs a human with the Olocker
    // dashboard, not a retry.
    if (alreadyUnattributed) {
      return Response.json(
        {
          error: 'This invoice has a policy that could not be matched to an item. '
               + 'Check it in Olocker before generating any more.',
          items: existing,
        },
        { status: 409 },
      );
    }

    const alreadyInsured = new Set(existing.map((row) => String(row.key)));

    // Lines already carrying a policy are dropped here rather than in the
    // UI — a double-press, two operators, or a stale sheet would otherwise
    // buy a second policy for the same ring.
    const eligible = new Set(
      (invoice.line_items ?? [])
        .map((item, index) => lineItemKey(item, index))
        .filter((key) => !alreadyInsured.has(key))
        .filter((key) => !requestedKeys || requestedKeys.has(key)),
    );

    if (!eligible.size) {
      return Response.json(
        { error: 'Every selected item is already insured.', items: existing },
        { status: 409 },
      );
    }

    // A dry run first, purely to find lines that can't be insured (missing
    // name, zero weight, no customer mobile…). Without this, an invoice
    // where NOTHING is eligible would reach Olocker as an empty TagList —
    // which answers HTTP 500 — and the operator would get a dead-end error
    // instead of the specific reason each line was turned down.
    const preflight = buildTagList({ invoice, token: 'preflight', selectedKeys: eligible });
    const skipped = preflight.invalid.map((row) => ({
      item_name: row.item_name,
      reason:    `Missing ${row.missing.join(', ')}`,
    }));

    if (!preflight.tags.length) {
      return Response.json(
        { error: 'No item on this invoice has the details Olocker requires.', skipped },
        { status: 422 },
      );
    }

    // The token is embedded in every tag, so the TagList is rebuilt per
    // attempt (see generatePolicies). `lines` comes back parallel to `tags`.
    let lines = [];
    const rows = await generatePolicies((token) => {
      const built = buildTagList({ invoice, token, selectedKeys: eligible });
      lines = built.lines;
      return built.tags;
    });

    // Olocker answers with a bare array and no echo of what each row refers
    // to, so rows can only be attributed to lines positionally — and only
    // when the counts line up. A mismatch is recorded without per-line
    // attribution rather than guessed at and bound to the wrong ring.
    const aligned = rows.length === lines.length;

    const issued = rows
      .map((row, i) => {
        if (!row?.policy) return null;
        const line = aligned ? lines[i] : null;
        return {
          key:            line ? line.key : null,
          inv_itemsrno:   line ? String(line.index + 1) : null,
          item_code:      line?.item?.item_code ?? null,
          item_name:      line?.item?.item_name ?? null,
          insured_amount: line ? Number(line.item.gross_amount ?? line.item.net_amount ?? 0) : null,
          policy:         row.policy,
          url:            row.url ?? null,
        };
      })
      .filter(Boolean);

    const failed = rows
      .filter((row) => !row?.policy)
      .map((row) => row?.message ?? 'Policy not issued');

    if (issued.length) {
      await appendInvoicePolicies({
        env:           session.env,
        transactionId,
        documentNo:    invoice.document_no,
        partyId:       invoice.party_id ?? null,
        createdBy:     session.username ?? null,
        items:         issued,
        rawResponse:   rows,
        unattributed:  !aligned,
      });
    }

    const { items } = await getInvoicePolicies({ env: session.env, transactionId });

    return Response.json({
      items,
      issuedCount: issued.length,
      unattributed: !aligned,
      // Lines dropped before the call (missing mandatory data) and rows
      // Olocker itself declined — both are things the operator must see.
      skipped,
      failures: failed,
    });
  } catch (err) {
    if (err instanceof OlockerError) {
      console.error('[api/insurance] POST olocker', err.code, err.message);
      const status = err.code === 'NOT_CONFIGURED' ? 503 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error('[api/insurance] POST', err);
    return Response.json({ error: 'Could not generate insurance' }, { status: 500 });
  }
}
