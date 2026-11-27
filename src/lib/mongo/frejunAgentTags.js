// SERVER-ONLY. Every FreJun agent tag ("Store - JC Name") the POS has seen on a call. FreJun has no tag-list API,
// so tags are learnt from call logs and kept here; the agent filter lists them for every store without a code change.
import { getDb } from './client';
import { getFrejunCalls } from '@/lib/frejun/frejunClient';
import { FREJUN_STORES, identifyStoreForCall } from '@/lib/frejun/storeMapping';
import { splitAgentTag } from '@/lib/frejun/agentInfo';

const COLLECTION = 'frejunAgentTags_POS';
const META_ID = '__discovery__';
const DISCOVERY_EVERY_MS = 30 * 60 * 1000;
const DISCOVERY_DAYS = 3;
const DISCOVERY_MAX_PAGES = 30;

let indexReady = null;

async function collection() {
  const col = (await getDb()).collection(COLLECTION);
  indexReady ??= col.createIndex({ key: 1 }, { unique: true }).catch((err) => {
    indexReady = null;
    throw err;
  });
  await indexReady;
  return col;
}

function storeForTag(storePart, call) {
  return FREJUN_STORES.find((s) => s.match.test(storePart)) || identifyStoreForCall({ ...call, tags: [] }) || null;
}

/** Saves the agent tags found on these calls (fire-and-forget safe: never throws). */
export async function rememberAgentTags(calls) {
  try {
    const found = new Map();
    for (const call of calls ?? []) {
      for (const tag of call?.tags ?? []) {
        const parts = splitAgentTag(tag?.name);
        if (!parts) continue;
        const name = tag.name.trim().replace(/\s+/g, ' ');
        const store = storeForTag(parts.storePart, call);
        const seenAt = call.call_start_time ? new Date(call.call_start_time) : new Date();
        const prev = found.get(name.toLowerCase());
        if (!prev || seenAt > prev.lastSeenAt) {
          found.set(name.toLowerCase(), {
            name, tagId: tag.id ?? null, agentName: parts.agentName, storeKey: store?.key ?? null, lastSeenAt: seenAt,
          });
        }
      }
    }
    if (!found.size) return;
    const now = new Date();
    await (await collection()).bulkWrite([...found].map(([key, t]) => ({
      updateOne: {
        filter: { key },
        update: [{
          $set: {
            key,
            name: t.name,
            tagId: t.tagId,
            agentName: t.agentName,
            storeKey: { $ifNull: [t.storeKey, '$storeKey'] },
            lastSeenAt: { $max: ['$lastSeenAt', t.lastSeenAt] },
            createdAt: { $ifNull: ['$createdAt', now] },
            updatedAt: now,
          },
        }],
        upsert: true,
      },
    })), { ordered: false });
  } catch (err) {
    console.error('[frejunAgentTags] remember failed:', err.message);
  }
}

/** Known agent tags, optionally limited to some store keys. */
export async function listAgentTags(storeKeys = null) {
  const filter = { key: { $ne: META_ID } };
  if (storeKeys) filter.storeKey = { $in: storeKeys };
  const rows = await (await collection())
    .find(filter, { projection: { _id: 0, name: 1, agentName: 1, storeKey: 1, tagId: 1, lastSeenAt: 1 } })
    .sort({ storeKey: 1, agentName: 1 })
    .toArray();
  return rows;
}

export async function findAgentTagStore(tagName) {
  const row = await (await collection()).findOne({ key: String(tagName || '').trim().replace(/\s+/g, ' ').toLowerCase() });
  return row?.storeKey ?? null;
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Reads the last few days of every store line and records any tags on them; runs at most once per 30 min. */
export async function discoverAgentTagsIfDue() {
  try {
    const col = await collection();
    const now = Date.now();
    const claimed = await col.findOneAndUpdate(
      { key: META_ID, $or: [{ nextRunAt: { $lte: new Date(now) } }, { nextRunAt: { $exists: false } }] },
      { $set: { nextRunAt: new Date(now + DISCOVERY_EVERY_MS), startedAt: new Date(now) } },
      { returnDocument: 'after' },
    ).catch(() => null);
    if (!claimed) {
      const exists = await col.findOne({ key: META_ID });
      if (exists) return;
      try {
        await col.insertOne({ key: META_ID, nextRunAt: new Date(now + DISCOVERY_EVERY_MS), startedAt: new Date(now) });
      } catch {
        return;
      }
    }

    const dateEnd = isoDay(new Date(now + 330 * 60 * 1000));
    const dateStart = isoDay(new Date(now + 330 * 60 * 1000 - (DISCOVERY_DAYS - 1) * 86400000));
    for (const store of FREJUN_STORES) {
      for (let page = 1; page <= DISCOVERY_MAX_PAGES; page += 1) {
        const data = await getFrejunCalls({ page, pageSize: 100, userEmail: store.email, dateStart, dateEnd }).catch(() => null);
        if (!data) break;
        await rememberAgentTags(data.results);
        if (!data.next) break;
      }
    }
    await col.updateOne({ key: META_ID }, { $set: { finishedAt: new Date() } });
  } catch (err) {
    console.error('[frejunAgentTags] discovery failed:', err.message);
  }
}
