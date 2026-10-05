import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('[Lucira POS] MONGODB_URI is not set. Add it to .env.local.');
}

let cachedClientPromise = globalThis._mongoClientPromise;

if (!cachedClientPromise) {
  const client = new MongoClient(uri);
  cachedClientPromise = client.connect();
  globalThis._mongoClientPromise = cachedClientPromise;
}

export async function getDb() {
  const client = await cachedClientPromise;
  return client.db();
}
