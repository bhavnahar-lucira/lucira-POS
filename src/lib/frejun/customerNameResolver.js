// src/lib/frejun/customerNameResolver.js
// SERVER-ONLY. Resolves customer/lead names for phone numbers from:
// 1. In-memory cache (TTL + size cap)
// 2. POS MongoDB (buyerPurchases_POS, walkins_POS)
// 3. Zoho CRM Leads API

import { getDb } from '@/lib/mongo/client';
import { getZohoAccessToken } from '@/lib/zoho/zohoCrmService';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const CACHE_MAX_ENTRIES = 5000;

globalThis.__frejunCustomerNameCache = globalThis.__frejunCustomerNameCache || new Map();

function cacheSet(cache, key, value) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

function cleanName(raw) {
  if (!raw) return null;
  let str = String(raw).trim();
  // Strip common placeholder suffixes like "Last Name"
  str = str.replace(/\bLast\s+Name\b/gi, '').trim();
  // If name is duplicated like "Saba Saba", collapse to "Saba"
  const parts = str.split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    str = parts[0];
  }
  return str || null;
}

function extract10Digits(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Resolves customer names for an array of call objects.
 * Modifies calls in place or returns enriched array.
 * @param {Array} calls
 * @returns {Promise<Array>}
 */
export async function enrichCallsWithCustomerNames(calls = []) {
  if (!Array.isArray(calls) || calls.length === 0) return calls;

  const now = Date.now();
  const cache = globalThis.__frejunCustomerNameCache;

  // Identify phone numbers that need lookup
  const missingByDigits = new Map(); // 10digit -> Set of call indices

  calls.forEach((call, idx) => {
    // If call already has a valid name from Frejun, use it
    if (call.candidate_name && call.candidate_name.trim()) {
      return;
    }

    const digits10 = extract10Digits(call.candidate_number);
    if (!digits10) return;

    const cached = cache.get(digits10);
    if (cached && cached.expiresAt <= now) cache.delete(digits10);
    if (cached && cached.expiresAt > now) {
      if (cached.name) {
        call.candidate_name = cached.name;
      }
      return;
    }

    if (!missingByDigits.has(digits10)) {
      missingByDigits.set(digits10, []);
    }
    missingByDigits.get(digits10).push(idx);
  });

  const numbersToFetch = Array.from(missingByDigits.keys());
  if (numbersToFetch.length === 0) {
    return calls;
  }

  // 1. Try POS MongoDB (buyerPurchases_POS & walkins_POS)
  try {
    const db = await getDb();
    const [buyers, walkins] = await Promise.all([
      db
        .collection('buyerPurchases_POS')
        .find({ customerMobile: { $in: numbersToFetch } }, { projection: { customerMobile: 1, customerName: 1 } })
        .toArray()
        .catch(() => []),
      db
        .collection('walkins_POS')
        .find({ mobile: { $in: numbersToFetch } }, { projection: { mobile: 1, customerName: 1 } })
        .toArray()
        .catch(() => []),
    ]);

    for (const b of buyers) {
      const d = extract10Digits(b.customerMobile);
      const name = cleanName(b.customerName);
      if (d && name) {
        cacheSet(cache, d, { name, expiresAt: now + CACHE_TTL_MS });
        const indices = missingByDigits.get(d) || [];
        indices.forEach((i) => {
          calls[i].candidate_name = name;
        });
        missingByDigits.delete(d);
      }
    }

    for (const w of walkins) {
      const d = extract10Digits(w.mobile);
      const name = cleanName(w.customerName);
      if (d && name) {
        cacheSet(cache, d, { name, expiresAt: now + CACHE_TTL_MS });
        const indices = missingByDigits.get(d) || [];
        indices.forEach((i) => {
          calls[i].candidate_name = name;
        });
        missingByDigits.delete(d);
      }
    }
  } catch (err) {
    console.warn('[customerNameResolver] MongoDB lookup error:', err.message);
  }

  // 2. Try Zoho CRM Leads for remaining numbers
  const remainingNumbers = Array.from(missingByDigits.keys());
  if (remainingNumbers.length > 0) {
    try {
      const token = await getZohoAccessToken();
      const apiUrl = (process.env.ZOHO_CRM_API_URL || 'https://www.zohoapis.in').replace(/\/+$/, '');

      // Lookup leads in parallel (capped at batches of 10)
      const batches = [];
      for (let i = 0; i < remainingNumbers.length; i += 10) {
        batches.push(remainingNumbers.slice(i, i + 10));
      }

      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(async (phone) => {
            try {
              const res = await fetch(`${apiUrl}/crm/v8/Leads/search?phone=${encodeURIComponent(phone)}`, {
                headers: {
                  Authorization: `Zoho-oauthtoken ${token}`,
                },
              });

              if (res.status === 200) {
                const data = await res.json();
                const lead = data.data?.[0];
                const rawName = lead?.Full_Name || lead?.First_Name || '';
                const name = cleanName(rawName);
                if (name) {
                  cacheSet(cache, phone, { name, expiresAt: now + CACHE_TTL_MS });
                  const indices = missingByDigits.get(phone) || [];
                  indices.forEach((idx) => {
                    calls[idx].candidate_name = name;
                  });
                  return;
                }
              }
              // Negative cache for 15 mins to avoid hitting Zoho repeatedly
              cacheSet(cache, phone, { name: null, expiresAt: now + 15 * 60 * 1000 });
            } catch {
              // Ignore single phone lookup failure
            }
          })
        );
      }
    } catch (err) {
      console.warn('[customerNameResolver] Zoho lookup error:', err.message);
    }
  }

  return calls;
}
