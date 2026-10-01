// Lets client-side code ask which OrnaVerse environment this server is
// CURRENTLY pointed at, instead of importing a value that would otherwise
// get baked into the client bundle at build time (see
// lib/ornaverse/environment.js's own header for why that matters here).
// No auth needed — this isn't a secret, just "LIVE" or "UAT".
import { ACTIVE_ENV } from '@/lib/ornaverse/environment';

export async function GET() {
  return Response.json({ activeEnv: ACTIVE_ENV });
}
