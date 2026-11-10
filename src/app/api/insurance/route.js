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
import { generatePolicies, getOlockerToken, OlockerError } from '@/lib/olocker/client';
import { buildTagList, lineItemKey } from '@/lib/olocker/buildTagList';
import { getInvoicePolicies, appendInvoicePolicies } from '@/lib/mongo/insurancePolicies';
import { getInsuranceWindow, formatWindowDate } from '@/lib/olocker/insuranceWindow';
import {
  INSURANCE_WINDOW_DAYS,
  OLOCKER_MAX_TAGS_PER_CALL,
  OLOCKER_MAX_TAGS_PER_REQUEST,
} from '@/lib/olocker/constants';
import API from '@/constants/apiEndpoints';

// One request runs up to OLOCKER_MAX_PARALLEL_CALLS Olocker calls side by
// side, each bounded by OLOCKER_GENERATE_TIMEOUT_MS (45s). Only matters on
// a serverless host; live runs behind nginx, whose own ~60s request limit
// is what the 45s budget is sized against.
export const maxDuration = 60;

const UNATTRIBUTED_MESSAGES = {
  mismatch: 'This invoice has a policy that could not be matched to an item. '
          + 'Check it in Olocker before generating any more.',
  timeout:  'Olocker did not confirm the last insurance request for this invoice, so policies '
          + 'may have been issued without being recorded here. Check the Olocker dashboard '
          + 'before generating any more.',
};

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * One Olocker call for one batch of lines, recorded the moment it returns.
 * Never throws: every outcome comes back as data, so sibling batches
 * running alongside it are unaffected.
 *
 * @returns {Promise<{ issued: object[], failed: string[], unattributed?: boolean, timeout?: boolean, error?: Error }>}
 */
async function runBatch({ invoice, keys, save }) {
  // The token is embedded in every tag, so the TagList is rebuilt per
  // attempt (see generatePolicies). `lines` comes back parallel to `tags`.
  let lines = [];
  let rows;
  try {
    rows = await generatePolicies((token) => {
      const built = buildTagList({ invoice, token, selectedKeys: keys });
      lines = built.lines;
      return built.tags;
    });
  } catch (err) {
    // A timeout leaves the outcome unknown: Olocker may well have issued
    // these policies (and charged for them) after we stopped waiting, and
    // it offers no way to look them up. Latch the invoice so nobody re-buys
    // them on a retry — the same guard as a row-count mismatch.
    if (err instanceof OlockerError && err.code === 'TIMEOUT') {
      try {
        await save({
          items:              [],
          rawResponse:        { timeout: true, attemptedKeys: [...keys], message: err.message },
          unattributed:       true,
          unattributedReason: 'timeout',
        });
      } catch (saveErr) {
        console.error('[api/insurance] could not latch timed-out batch', [...keys], saveErr);
      }
      return { issued: [], failed: [], timeout: true };
    }
    return { issued: [], failed: [], error: err };
  }

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
    try {
      await save({ items: issued, rawResponse: rows, unattributed: !aligned });
    } catch (err) {
      // Policies exist at Olocker but not in our record — the one outcome
      // nobody can recover from the UI. Log every row so support can.
      console.error('[api/insurance] ISSUED BUT NOT RECORDED', JSON.stringify(rows), err);
      return { issued: [], failed, error: err };
    }
  }
  return { issued, failed, unattributed: !aligned };
}

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
    const { items, unattributed, unattributedReason } =
      await getInvoicePolicies({ env: session.env, transactionId });
    return Response.json({ items, unattributed, unattributedReason });
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
    // Independent reads, so they run together. The Olocker token is fetched
    // here too purely so it is warm by the time the batches go out (it is
    // cached server-wide); a failure is ignored here and resurfaces,
    // properly reported, from generatePolicies itself.
    const [detail, policyRecord] = await Promise.all([
      postUpstream(session, API.INVOICES.RETRIEVE, { EntityId: transactionId }),
      getInvoicePolicies({ env: session.env, transactionId }),
      getOlockerToken().catch(() => null),
    ]);
    const invoice = detail?.Entity;
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Olocker only insures within a fixed window after purchase. Enforced
    // here, not just by the disabled button, so a stale sheet left open
    // overnight or a direct API call can't buy a policy outside it.
    const insuranceWindow = getInsuranceWindow(invoice.document_date);
    if (!insuranceWindow.isOpen) {
      return Response.json(
        {
          error: insuranceWindow.lastDay
            ? `Insurance can only be generated within ${INSURANCE_WINDOW_DAYS} days of purchase. `
              + `The window for this invoice closed after ${formatWindowDate(insuranceWindow.lastDay)}.`
            : 'This invoice has no valid purchase date, so insurance cannot be generated.',
          code: 'WINDOW_CLOSED',
        },
        { status: 422 },
      );
    }

    const { items: existing, unattributed: alreadyUnattributed, unattributedReason } = policyRecord;

    // This invoice already holds a policy that could not be tied to a line,
    // so "which lines are still uninsured" is no longer a question this
    // route can answer — generating more would risk buying a second policy
    // for a ring that already has one. Needs a human with the Olocker
    // dashboard, not a retry.
    if (alreadyUnattributed) {
      return Response.json(
        {
          error: UNATTRIBUTED_MESSAGES[unattributedReason] ?? UNATTRIBUTED_MESSAGES.mismatch,
          code:  'UNATTRIBUTED',
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
        { error: 'Every selected item is already insured.', code: 'ALREADY_INSURED', items: existing },
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

    // Up to OLOCKER_MAX_TAGS_PER_REQUEST lines per request, split into
    // Olocker calls of OLOCKER_MAX_TAGS_PER_CALL that run side by side. The
    // client already sends selections in requests of this size; anything
    // beyond the cap is reported back as `deferred`, never silently dropped.
    const accepted = preflight.lines.slice(0, OLOCKER_MAX_TAGS_PER_REQUEST);
    const deferred = preflight.lines.length - accepted.length;
    const batches = chunk(accepted.map((line) => line.key), OLOCKER_MAX_TAGS_PER_CALL)
      .map((keys) => new Set(keys));

    // Batches finish in any order but their writes are applied one at a
    // time: the first creates this invoice's record (an upsert), and two
    // upserts racing on a record that doesn't exist yet would create two.
    let writeQueue = Promise.resolve();
    const save = (args) => {
      const write = writeQueue.then(() => appendInvoicePolicies({
        env:        session.env,
        transactionId,
        documentNo: invoice.document_no,
        partyId:    invoice.party_id ?? null,
        createdBy:  session.username ?? null,
        ...args,
      }));
      writeQueue = write.catch(() => {}); // one failed write must not block the rest
      return write;
    };

    const outcomes = await Promise.all(batches.map((keys) => runBatch({ invoice, keys, save })));

    const issued       = outcomes.flatMap((o) => o.issued);
    const failures     = outcomes.flatMap((o) => o.failed);
    const errors       = outcomes.map((o) => o.error).filter(Boolean);
    const timedOut     = outcomes.some((o) => o.timeout);
    const unattributed = timedOut || outcomes.some((o) => o.unattributed);

    if (!issued.length) {
      if (timedOut) {
        return Response.json(
          { error: UNATTRIBUTED_MESSAGES.timeout, code: 'TIMEOUT' },
          { status: 504 },
        );
      }
      // Every batch failed outright: report it exactly as a single failed
      // call always has been (status mapping in the catch below).
      if (errors.length) throw errors[0];
    }

    // Some batches issued, others didn't — the operator sees both.
    errors.forEach((err) => {
      console.error('[api/insurance] POST batch', err?.code ?? '', err?.message, err?.cause ?? '');
      failures.push(err?.message || 'Policy not issued');
    });
    if (timedOut) failures.push(UNATTRIBUTED_MESSAGES.timeout);

    const { items } = await getInvoicePolicies({ env: session.env, transactionId });

    return Response.json({
      items,
      issuedCount: issued.length,
      unattributed,
      // Lines dropped before the call (missing mandatory data) and rows
      // Olocker itself declined — both are things the operator must see.
      skipped,
      failures,
      deferred,
    });
  } catch (err) {
    if (err instanceof OlockerError) {
      console.error('[api/insurance] POST olocker', err.code, err.message, err.cause ?? '');
      const status = err.code === 'NOT_CONFIGURED' ? 503 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error('[api/insurance] POST', err);
    return Response.json({ error: 'Could not generate insurance' }, { status: 500 });
  }
}
