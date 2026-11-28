// SERVER-ONLY. HO approval requests for branch transfers — the POS's own gate in front of OrnaVerse's
// Branch Out posting (send) and Branch In authorisation (receive). OrnaVerse has no such step.
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongo/client';
import { UPSTREAM } from '@/lib/ornaverse/upstream';

const COLLECTION = 'branchTransferApprovals_POS';
let indexReady = null;

export const APPROVAL_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', CLOSED: 'closed' };

/** Off only when explicitly disabled, so the gate can be switched off without a code change. */
export const approvalRequired = () => process.env.BRANCH_TRANSFER_HO_APPROVAL !== 'off';

export async function getApprovalsCollection() {
  const col = (await getDb()).collection(COLLECTION);
  indexReady ??= Promise.all([
    col.createIndex({ env: 1, kind: 1, transaction_id: 1, requested_at: -1 }),
    col.createIndex({ env: 1, status: 1, requested_at: -1 }),
  ]).catch((err) => {
    indexReady = null;
    throw err;
  });
  await indexReady;
  return col;
}

export const toObjectId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

export function toPublicApproval(a) {
  const { _id, ...rest } = a;
  return { id: String(_id), ...rest };
}

/** An OrnaVerse service call that keeps OrnaVerse's own error message (e.g. a piece already sold). */
export async function ornaverseCall(session, path, body) {
  const headers = { 'Content-Type': 'application/json', Cookie: session.cookie };
  if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;
  const res = await fetch(`${UPSTREAM}/${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(25_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.Error) {
    const err = new Error(data?.Error?.Message ?? `${path} failed: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const RETRIEVE = { send: 'Services/Inventory/BranchOut/Retrieve', receive: 'Services/Inventory/BranchIn/Retrieve' };

/** Why a pending request no longer needs HO — the transfer was completed or cancelled directly in OrnaVerse — or null. */
function closedInOrnaverse(kind, entity) {
  if (!entity) return 'deleted_in_ornaverse';
  if (entity.document_status === 2) return 'cancelled_in_ornaverse';
  if (kind === 'send' && entity.document_status === 1) return 'posted_in_ornaverse';
  if (kind === 'receive' && entity.authorize) return 'received_in_ornaverse';
  return null;
}

/** Closes pending requests whose OrnaVerse document has moved on without the POS, so HO only sees real decisions. */
const RECONCILE_EVERY_MS = 10 * 60 * 1000;
const RECONCILE_MAX_PER_CALL = 8;
const RECONCILE_CONCURRENCY = 2;

export async function reconcilePending(session, col, approvals) {
  const cutoff = Date.now() - RECONCILE_EVERY_MS;
  const due = approvals
    .filter((a) => a.status === APPROVAL_STATUS.PENDING && !(a.reconciled_at?.getTime?.() > cutoff))
    .sort((a, b) => (a.reconciled_at?.getTime?.() ?? 0) - (b.reconciled_at?.getTime?.() ?? 0))
    .slice(0, RECONCILE_MAX_PER_CALL);
  let next = 0;
  const worker = async () => {
    while (next < due.length) await reconcileOne(session, col, due[next++], cutoff);
  };
  await Promise.all(Array.from({ length: Math.min(RECONCILE_CONCURRENCY, due.length) }, worker));
  return approvals;
}

async function reconcileOne(session, col, a, cutoff) {
  const now = new Date();
  const claim = await col.updateOne(
    {
      _id: a._id,
      status: APPROVAL_STATUS.PENDING,
      $or: [{ reconciled_at: { $exists: false } }, { reconciled_at: { $lt: new Date(cutoff) } }],
    },
    { $set: { reconciled_at: now } },
  );
  if (!claim.modifiedCount) return;
  a.reconciled_at = now;
  let entity;
  try {
    entity = (await ornaverseCall(session, RETRIEVE[a.kind], { EntityId: a.transaction_id }))?.Entity ?? null;
  } catch (err) {
    if (err.status !== 400) return;
    entity = null;
  }
  const reason = closedInOrnaverse(a.kind, entity);
  if (!reason) return;
  const update = {
    status: APPROVAL_STATUS.CLOSED, closed_reason: reason, decided_at: new Date(),
    decided_by: reason === 'received_in_ornaverse' ? entity?.authorized_by_name ?? null : entity?.posted_by_name ?? null,
  };
  await col.updateOne({ _id: a._id, status: APPROVAL_STATUS.PENDING }, { $set: update });
  Object.assign(a, update);
}
