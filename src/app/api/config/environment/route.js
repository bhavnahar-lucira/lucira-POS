import { ACTIVE_ENV } from '@/lib/ornaverse/environment';

export async function GET() {
  return Response.json({ activeEnv: ACTIVE_ENV });
}
