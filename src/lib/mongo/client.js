import { MongoClient } from 'mongodb';

// The uri check/connect is deliberately deferred to getDb() rather than run
// at module scope — Next.js's build step evaluates every route module to
// collect its metadata (even for dynamic routes that never actually run
// during build), so throwing here at import time fails the BUILD itself
// the moment any new route imports this file, regardless of whether
// MONGODB_URI is correctly set for runtime (confirmed live on Vercel:
// "Failed to collect page data for /api/buyers/[customerId]").
let cachedClientPromise = globalThis._mongoClientPromise;

export async function getDb() {
  if (!cachedClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('[Lucira POS] MONGODB_URI is not set. Add it to .env.local.');
    }
    const client = new MongoClient(uri);
    cachedClientPromise = client.connect();
    globalThis._mongoClientPromise = cachedClientPromise;
  }
  const client = await cachedClientPromise;
  return client.db();
}
