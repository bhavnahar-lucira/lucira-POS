// src/lib/frejun/storeMapping.js

export const FREJUN_STORES = [
  {
    key: 'borivali',
    label: 'Borivali Store',
    match: /borivali|\bbo1\b|bombor/i,
    email: 'lcmbombor@lucirajewelry.com',
    virtualNumber: '8035230530',
    tags: ['Borivali'],
  },
  {
    key: 'chembur',
    label: 'Chembur Store',
    match: /chembur|\bcs1\b|\bfcs\b|bomchb/i,
    email: 'lcsbomchb@lucirajewelry.com',
    virtualNumber: '8035271914',
    tags: ['Chembur'],
  },
  {
    key: 'pune',
    label: 'Pune Store',
    match: /pune|\bpn1\b|pnqjmr/i,
    email: 'lcspnqjmr@lucirajewelry.com',
    virtualNumber: '8035301925',
    tags: ['Pune'],
  },
  {
    key: 'lajpat',
    label: 'Lajpat Nagar Store',
    match: /lajpat|delljn/i,
    email: 'lcsdelljn@lucirajewelry.com',
    virtualNumber: '8035060768',
    tags: ['Lajpat'],
  },
  {
    key: 'paschim',
    label: 'Paschim Vihar Store',
    match: /pa(s)?chim|\bpv1\b|delpvh/i,
    email: 'lcsdelpvh@lucirajewelry.com',
    virtualNumber: '8035294900',
    tags: ['Paschim'],
  },
  {
    key: 'noida',
    label: 'Noida Store',
    match: /noida|\bn18\b|nois18/i,
    email: 'lcnois18@lucirajewelry.com',
    virtualNumber: '8035271913',
    tags: ['Noida'],
  },
  {
    key: 'malleshwaram',
    label: 'Malleshwaram Store',
    match: /malleshwaram|\bmal\b|blrmal/i,
    email: 'lcsblrmal@lucirajewelry.com',
    virtualNumber: '8065426299',
    tags: ['Malleshwaram'],
  },
  {
    key: 'kondapur',
    label: 'Hyderabad Kondapur',
    match: /kondapur|hydkdp/i,
    email: 'ljhydkdp@lucirajewelry.com',
    virtualNumber: '8065427331',
    tags: ['Kondapur'],
  },
  {
    key: 'somajiguda',
    label: 'Hyderabad Somajiguda',
    match: /somaji|hydsmj/i,
    email: 'ljhydsmj@lucirajewelry.com',
    virtualNumber: '8065747634',
    tags: ['Somajiguda'],
  },
  {
    key: 'hsr',
    label: 'Bangalore HSR',
    match: /hsr|blrhsr/i,
    email: 'ljblrhsr@lucirajewelry.com',
    virtualNumber: '8065427335',
    tags: ['HSR'],
  },
  {
    key: 'jayanagar',
    label: 'Bangalore Jayanagar',
    match: /jayanagar|\bjyn\b|blrjyn/i,
    email: 'ljblrjyn@lucirajewelry.com',
    virtualNumber: '8065747635',
    tags: ['Jayanagar'],
  },
];

/**
 * Identifies which store a Frejun call record belongs to using:
 * 1. recruiter email exact match
 * 2. recruiter email regex pattern match (bombor, bomchb, etc.)
 * 3. virtual number
 * 4. tag content
 */
export function identifyStoreForCall(call) {
  if (!call) return null;

  for (const store of FREJUN_STORES) {
    if (call.recruiter && call.recruiter.toLowerCase() === store.email.toLowerCase()) {
      return store;
    }
    if (call.recruiter && store.match.test(call.recruiter)) {
      return store;
    }
    if (call.virtual_number && store.virtualNumber && call.virtual_number.includes(store.virtualNumber)) {
      return store;
    }
    if (Array.isArray(call.tags)) {
      for (const t of call.tags) {
        if (t.name && store.match.test(t.name)) {
          return store;
        }
      }
    }
  }

  return null;
}

/**
 * Matches an OrnaVerse active store name / code to a Frejun store config.
 */
export function matchStoreByNameOrCode(text) {
  if (!text) return null;
  return FREJUN_STORES.find((s) => s.match.test(text)) ?? null;
}

/**
 * Finds store config by its canonical key.
 */
export function getStoreByKey(key) {
  if (!key || key === 'all') return null;
  return FREJUN_STORES.find((s) => s.key === key.toLowerCase()) ?? null;
}
