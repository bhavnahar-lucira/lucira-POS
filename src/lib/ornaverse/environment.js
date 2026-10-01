const raw = process.env.ACTIVE_ENV;

if (raw && raw !== 'LIVE' && raw !== 'UAT') {
  console.warn(`[environment] ACTIVE_ENV="${raw}" is not "LIVE" or "UAT" — defaulting to LIVE.`);
}

export const ACTIVE_ENV = raw === 'UAT' ? 'UAT' : 'LIVE';
