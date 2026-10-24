import { MongoClient } from 'mongodb';

let cachedClientPromise = globalThis._websiteMongoClientPromise;

export async function getWebsiteDb() {
  if (!cachedClientPromise) {
    const uri = process.env.WEBSITE_MONGODB_URI;
    if (!uri) {
      throw new Error('[Lucira POS] WEBSITE_MONGODB_URI is not set. Add it to .env.local.');
    }
    const client = new MongoClient(uri);
    cachedClientPromise = client.connect();
    globalThis._websiteMongoClientPromise = cachedClientPromise;
  }
  const client = await cachedClientPromise;
  return client.db();
}
