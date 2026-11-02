import { ObjectId } from 'mongodb';
import { getDb } from './client';

const RESPONSES = 'vocResponses_POS';
const AUDIT = 'vocAudit_POS';

let indexesReady = null;

async function collections() {
    const db = await getDb();
    const responses = db.collection(RESPONSES);
    indexesReady ??= Promise.all([
        responses.createIndex({ env: 1, 'store.id': 1, 'customer.party_id': 1, day: 1 }, { unique: true }),
        responses.createIndex({ env: 1, 'store.id': 1, day: -1 }),
        responses.createIndex({ env: 1, day: -1 }),
    ]).catch((err) => {
        indexesReady = null;
        throw err;
    });
    await indexesReady;
    return { responses, audit: db.collection(AUDIT) };
}

/** Today's date in India as 'YYYY-MM-DD' (the "one feedback per day" day). */
export const istDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);

export class DuplicateFeedbackError extends Error {}

/** Saves a new response. Throws DuplicateFeedbackError if this customer already gave feedback at this store today. */
export async function insertResponse({ env, store, customer, jc, answers, other_text, submittedBy }) {
    const { responses } = await collections();
    const now = new Date();
    const doc = { env, store, customer, jc, answers, other_text, day: istDay(now), submitted_at: now, submitted_by: submittedBy };
    try {
        const { insertedId } = await responses.insertOne(doc);
        return { ...doc, _id: insertedId };
    } catch (err) {
        if (err?.code === 11000) throw new DuplicateFeedbackError('This customer already gave feedback at this store today');
        throw err;
    }
}

export async function hasResponseToday(env, storeId, partyId) {
  const { responses } = await collections();
  const found = await responses.findOne(
    { env, 'store.id': storeId, 'customer.party_id': partyId, day: istDay() },
    { projection: { _id: 1 } },
  );
  return !!found;
}

/** The Mongo filter behind the VOL list and summary. storeIds = null means every store (super admin). */
export function buildFilter({ env, storeIds = null, fromDay, toDay, jcId, purchased }) {
  return {
    env,
    ...(storeIds && { 'store.id': { $in: storeIds } }),
    ...((fromDay || toDay) && { day: { ...(fromDay && { $gte: fromDay }), ...(toDay && { $lte: toDay }) } }),
    ...(jcId && { 'jc.id': jcId }),
    ...(purchased && { 'answers.q7': purchased }),
  };
}

export async function listResponses(filter, { skip = 0, limit = 50 } = {}) {
  const { responses } = await collections();
  const [rows, total] = await Promise.all([
    responses.find(filter).sort({ submitted_at: -1 }).skip(skip).limit(limit).toArray(),
    responses.countDocuments(filter),
  ]);
  return { rows, total };
}

/** How often each answer was given, e.g. { total: 12, counts: { q1: { google_search: 4 }, q9: { 10: 2 } } }. */
export async function countAnswers(filter) {
  const { responses } = await collections();
  const [groups, total] = await Promise.all([
    responses.aggregate([
      { $match: filter },
      { $project: { answer: { $objectToArray: '$answers' } } },
      { $unwind: '$answer' },
      { $group: { _id: { q: '$answer.k', v: '$answer.v' }, count: { $sum: 1 } } },
    ]).toArray(),
    responses.countDocuments(filter),
  ]);
  const counts = {};
  for (const { _id, count } of groups) (counts[_id.q] ??= {})[_id.v] = count;
  return { total, counts };
}

const toObjectId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

export async function getResponse(env, id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const { responses } = await collections();
  return responses.findOne({ _id, env });
}

/** Super admin correction. Keeps the previous version in the audit collection. Returns the updated response or null. */
export async function updateResponse(env, id, { jc, answers, other_text }, user) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const { responses, audit } = await collections();
  const before = await responses.findOneAndUpdate(
    { _id, env },
    { $set: { jc, answers, other_text, updated_at: new Date(), updated_by: user } },
    { returnDocument: 'before' },
  );
  if (!before) return null;
  await audit.insertOne({ env, response_id: _id, action: 'update', at: new Date(), user, before });
  return responses.findOne({ _id });
}

/** Super admin delete. The deleted response is kept in the audit collection. Returns true if something was deleted. */
export async function deleteResponse(env, id, user) {
  const _id = toObjectId(id);
  if (!_id) return false;
  const { responses, audit } = await collections();
  const before = await responses.findOneAndDelete({ _id, env });
  if (!before) return false;
  await audit.insertOne({ env, response_id: _id, action: 'delete', at: new Date(), user, before });
  return true;
}