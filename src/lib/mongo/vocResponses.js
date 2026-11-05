import { ObjectId } from 'mongodb';
import { getDb } from './client';

const RESPONSES = 'vocResponses_POS';
const AUDIT = 'vocAudit_POS';
const SKIPS = 'vocSkips_POS';

let indexesReady = null;
let skipIndexReady = null;

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
export async function insertResponse({ env, store, customer, jc, answers, other_text, referrals = [], submittedBy }) {
    const { responses } = await collections();
    const now = new Date();
    const doc = { env, store, customer, jc, answers, other_text, referrals, day: istDay(now), submitted_at: now, submitted_by: submittedBy };
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

/** Every referral given in the matching responses, newest first, one row per referral. */
export async function listReferrals(filter, { limit = 1000 } = {}) {
  const { responses } = await collections();
  const match = { ...filter, 'referrals.0': { $exists: true } };
  const [rows, [{ total = 0 } = {}]] = await Promise.all([
    responses.aggregate([
      { $match: match },
      { $sort: { submitted_at: -1 } },
      { $unwind: { path: '$referrals', includeArrayIndex: 'index' } },
      { $limit: limit },
      {
        $project: {
          _id: 0, response_id: { $toString: '$_id' }, index: 1, referral: '$referrals',
          customer: 1, store: 1, jc: 1, day: 1, submitted_at: 1,
        },
      },
    ]).toArray(),
    responses.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: { $size: '$referrals' } } } }]).toArray(),
  ]);
  return { rows, total };
}

/** Records that a customer skipped the feedback; one record per customer, store and day, counting repeats. */
export async function recordSkip({ env, store, customer, stage, user }) {
  const db = await getDb();
  skipIndexReady ??= db.collection(SKIPS).createIndex({ env: 1, 'store.id': 1, 'customer.party_id': 1, day: 1 }, { unique: true })
    .catch((err) => { skipIndexReady = null; throw err; });
  await skipIndexReady;
  const now = new Date();
  await db.collection(SKIPS).updateOne(
    { env, 'store.id': store.id, 'customer.party_id': customer.party_id, day: istDay(now) },
    {
      $set: { store, customer, stage, last_skipped_at: now, skipped_by: user },
      $inc: { times: 1 },
      $setOnInsert: { first_skipped_at: now },
    },
    { upsert: true },
  );
}

/** Skips matching the list filter (store and dates only), newest first, each marked if feedback was given later that day. */
export async function listSkips({ env, 'store.id': storeId, day }, { limit = 1000 } = {}) {
  const db = await getDb();
  const filter = { env, ...(storeId && { 'store.id': storeId }), ...(day && { day }) };
  const skips = db.collection(SKIPS);
  const [rows, total] = await Promise.all([
    skips.aggregate([
      { $match: filter },
      { $sort: { last_skipped_at: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: RESPONSES,
          let: { s: '$store.id', p: '$customer.party_id', d: '$day' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$env', env] }, { $eq: ['$store.id', '$$s'] }, { $eq: ['$customer.party_id', '$$p'] }, { $eq: ['$day', '$$d'] }] } } },
            { $project: { _id: 1 } },
          ],
          as: 'feedback',
        },
      },
      { $addFields: { id: { $toString: '$_id' }, feedback_later: { $gt: [{ $size: '$feedback' }, 0] } } },
      { $project: { _id: 0, feedback: 0 } },
    ]).toArray(),
    skips.countDocuments(filter),
  ]);
  return { rows, total };
}

const toObjectId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

export async function getResponse(env, id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const { responses } = await collections();
  return responses.findOne({ _id, env });
}

/** Super admin correction. Keeps the previous version in the audit collection. Returns the updated response or null. */
export async function updateResponse(env, id, { jc, answers, other_text, referrals = [] }, user) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const { responses, audit } = await collections();
  const before = await responses.findOneAndUpdate(
    { _id, env },
    { $set: { jc, answers, other_text, referrals, updated_at: new Date(), updated_by: user } },
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