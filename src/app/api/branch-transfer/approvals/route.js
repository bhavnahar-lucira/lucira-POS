import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getUserStoresCached } from '@/lib/reports/serverAccess';
import { approvalRequestSchema, approvalDecisionSchema, APPROVAL_KINDS } from '@/validators/branchTransferSchema';
import {
  APPROVAL_STATUS, approvalRequired, getApprovalsCollection, toObjectId, toPublicApproval, ornaverseCall, reconcilePending,
} from '@/lib/branchTransfer/approvals';
import API from '@/constants/apiEndpoints';

const EP = API.BRANCH_TRANSFER;
const DAY_MS = 24 * 60 * 60 * 1000;

const SWITCH_COMPANY = 'Account/SwitchCompany';

/**
 * OrnaVerse fills the auto-created Branch In's sender (party + ledgers) from the poster's current company, so HO
 * posting a store's transfer from its own HO session would record HO as the sender. Post as the sending store,
 * then always return the approver's session to the company it was on.
 */
async function postAsSendingStore(session, entity, transactionId) {
  const original = session.companyId;
  const switching = entity.company_id && entity.company_id !== original;
  if (switching) await ornaverseCall(session, SWITCH_COMPANY, { company_id: entity.company_id });
  try {
    await ornaverseCall(session, EP.OUT_POST, { EntityId: transactionId, Entity: entity });
  } finally {
    if (switching && original) {
      await ornaverseCall(session, SWITCH_COMPANY, { company_id: original }).catch((err) => {
        console.error('[api/branch-transfer/approvals] could not switch the approver back to their store', err.message);
      });
    }
  }
}

const activeStore = async (session) => (session.companyId
  ? (await getUserStoresCached(session).catch(() => [])).find((s) => s.company_id === session.companyId) ?? null
  : null);

/**
 * ?transaction_ids=1,2&kind=send → latest request per document (for status chips)
 * ?scope=pending → super admin: every store's pending requests; a store: its own pending + decided in the last day
 */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  try {
    const col = await getApprovalsCollection();
    const ids = (params.get('transaction_ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
    const kind = params.get('kind');
    if (ids.length && APPROVAL_KINDS.includes(kind)) {
      const rows = await col.find({ env: session.env, kind, transaction_id: { $in: ids } }).sort({ requested_at: -1 }).toArray();
      const newest = {};
      for (const r of rows) newest[r.transaction_id] ??= r;
      await reconcilePending(session, col, Object.values(newest));
      const latest = Object.fromEntries(Object.entries(newest).map(([k, r]) => [k, toPublicApproval(r)]));
      return Response.json({ required: approvalRequired(), approvals: latest });
    }
    if (params.get('scope') === 'pending') {
      const filter = session.isSuperAdmin
        ? { env: session.env, status: APPROVAL_STATUS.PENDING }
        : {
          env: session.env,
          store_id: session.companyId ?? -1,
          $or: [{ status: APPROVAL_STATUS.PENDING }, { decided_at: { $gte: new Date(Date.now() - DAY_MS) } }],
        };
      const rows = await reconcilePending(session, col, await col.find(filter).sort({ requested_at: -1 }).limit(300).toArray());
      const visible = session.isSuperAdmin ? rows.filter((r) => r.status === APPROVAL_STATUS.PENDING) : rows;
      return Response.json({ required: approvalRequired(), isApprover: !!session.isSuperAdmin, approvals: visible.map(toPublicApproval) });
    }
    return Response.json({ required: approvalRequired(), isApprover: !!session.isSuperAdmin });
  } catch (err) {
    console.error('[api/branch-transfer/approvals] GET', err);
    return Response.json({ error: 'Failed to load approvals' }, { status: 500 });
  }
}

/** A store asks HO to approve sending (posting a draft Branch Out) or receiving (authorising a Branch In). */
export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  const parsed = approvalRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const body = parsed.data;
  try {
    const col = await getApprovalsCollection();
    const open = await col.findOne({
      env: session.env, kind: body.kind, transaction_id: body.transaction_id,
      status: { $in: [APPROVAL_STATUS.PENDING, APPROVAL_STATUS.APPROVED] },
    });
    if (open) return Response.json({ approval: toPublicApproval(open) });
    const store = await activeStore(session);
    const doc = {
      env: session.env, kind: body.kind, transaction_id: body.transaction_id, document_no: body.document_no ?? null,
      counterparty: body.counterparty ?? null, pieces: body.pieces ?? null, net_amount: body.net_amount ?? null, note: body.note ?? null,
      store_id: session.companyId ?? null, store_code: store?.company_code ?? null, store_name: store?.mailing_name ?? null,
      status: APPROVAL_STATUS.PENDING, requested_by: session.username, requested_at: new Date(),
      decided_by: null, decided_at: null, reason: null,
    };
    const { insertedId } = await col.insertOne(doc);
    return Response.json({ approval: toPublicApproval({ ...doc, _id: insertedId }) }, { status: 201 });
  } catch (err) {
    console.error('[api/branch-transfer/approvals] POST', err);
    return Response.json({ error: 'Failed to send for approval' }, { status: 500 });
  }
}

/** Super admin decision. Approving a send posts the Branch Out in OrnaVerse first; approving a receive unlocks the store's own authorisation. */
export async function PATCH(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) return Response.json({ error: 'Only HO can approve transfers' }, { status: 403 });
  const parsed = approvalDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { id, decision, reason } = parsed.data;
  try {
    const col = await getApprovalsCollection();
    const _id = toObjectId(id);
    const approval = _id && await col.findOne({ _id, env: session.env });
    if (!approval) return Response.json({ error: 'Approval request not found' }, { status: 404 });
    if (approval.status !== APPROVAL_STATUS.PENDING) {
      return Response.json({ error: `Already ${approval.status} by ${approval.decided_by ?? 'HO'}` }, { status: 409 });
    }

    if (decision === 'approve' && approval.kind === 'send') {
      const entity = (await ornaverseCall(session, EP.OUT_RETRIEVE, { EntityId: approval.transaction_id }))?.Entity;
      if (!entity) return Response.json({ error: 'The transfer no longer exists in OrnaVerse' }, { status: 409 });
      if (entity.document_status === 0) {
        try {
          await postAsSendingStore(session, entity, approval.transaction_id);
        } catch (err) {
          return Response.json({ error: `OrnaVerse did not post the transfer: ${err.message}` }, { status: 409 });
        }
      } else {
        const closedReason = entity.document_status === 2 ? 'cancelled_in_ornaverse' : 'posted_in_ornaverse';
        await col.updateOne({ _id, status: APPROVAL_STATUS.PENDING }, {
          $set: { status: APPROVAL_STATUS.CLOSED, closed_reason: closedReason, decided_at: new Date(), decided_by: entity.posted_by_name ?? null },
        });
        return Response.json({
          error: entity.document_status === 2 ? 'This transfer was already cancelled in OrnaVerse.' : 'This transfer was already posted directly in OrnaVerse — nothing to approve.',
        }, { status: 409 });
      }
    }
    if (decision === 'approve' && approval.kind === 'receive') {
      const entity = (await ornaverseCall(session, EP.IN_RETRIEVE, { EntityId: approval.transaction_id }).catch(() => null))?.Entity;
      if (entity && (entity.authorize || entity.document_status === 2)) {
        const closedReason = entity.authorize ? 'received_in_ornaverse' : 'cancelled_in_ornaverse';
        await col.updateOne({ _id, status: APPROVAL_STATUS.PENDING }, {
          $set: { status: APPROVAL_STATUS.CLOSED, closed_reason: closedReason, decided_at: new Date(), decided_by: entity.authorized_by_name ?? null },
        });
        return Response.json({
          error: entity.authorize ? 'This receipt was already authorised directly in OrnaVerse — nothing to approve.' : 'This receipt was cancelled in OrnaVerse.',
        }, { status: 409 });
      }
    }
    if (decision === 'reject' && approval.kind === 'send') {
      const entity = (await ornaverseCall(session, EP.OUT_RETRIEVE, { EntityId: approval.transaction_id }).catch(() => null))?.Entity;
      if (entity?.document_status === 0) {
        await ornaverseCall(session, EP.OUT_CANCEL, { EntityId: approval.transaction_id, Entity: entity }).catch((err) => {
          console.warn('[api/branch-transfer/approvals] draft cancel on reject failed', err.message);
        });
      }
    }

    const status = decision === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED;
    const update = { status, decided_by: session.username, decided_at: new Date(), reason: reason ?? null };
    await col.updateOne({ _id, status: APPROVAL_STATUS.PENDING }, { $set: update });
    return Response.json({ approval: toPublicApproval({ ...approval, ...update }) });
  } catch (err) {
    console.error('[api/branch-transfer/approvals] PATCH', err);
    return Response.json({ error: err.message || 'Failed to record the decision' }, { status: 500 });
  }
}
