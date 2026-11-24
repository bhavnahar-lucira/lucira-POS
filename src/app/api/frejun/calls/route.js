// src/app/api/frejun/calls/route.js
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getFrejunCalls } from '@/lib/frejun/frejunClient';
import { scanCalls } from '@/lib/frejun/callScan';
import { enrichCallsWithCustomerNames } from '@/lib/frejun/customerNameResolver';
import { FREJUN_STORES, identifyStoreForCall, getStoreByKey } from '@/lib/frejun/storeMapping';
import { getFrejunScope, scopeAllowsEmail, filterCallsToScope } from '@/lib/frejun/access';

export const dynamic = 'force-dynamic';

const EMPTY = { count: 0, next: null, previous: null, results: [], pageCount: 0, isFiltered: false };

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Math.min(Number(searchParams.get('pageSize') || searchParams.get('page_size')) || 50, 100);
  let userEmail = searchParams.get('userEmail') || searchParams.get('user_email') || '';
  const candidateNumber = searchParams.get('candidateNumber') || searchParams.get('candidate_number') || '';
  const dateStart = searchParams.get('dateStart') || searchParams.get('date_start') || '';
  const dateEnd = searchParams.get('dateEnd') || searchParams.get('date_end') || '';
  const callId = searchParams.get('callId') || searchParams.get('call_id') || '';
  const storeKey = (searchParams.get('store') || searchParams.get('storeKey') || '').toLowerCase().trim();
  const tag = (searchParams.get('tag') || '').toLowerCase().trim();
  const search = searchParams.get('search') || '';

  let scope;
  try {
    scope = await getFrejunScope(session);
  } catch (err) {
    console.error('[API /api/frejun/calls] scope check failed:', err);
    return Response.json({ ok: false, error: 'Could not verify store access' }, { status: 502 });
  }
  if (!scope.isAdmin && scope.stores.length === 0) {
    return Response.json({ ok: true, data: EMPTY, scope: { isAdmin: false, stores: [] } });
  }

  let selectedStore = null;
  if (storeKey && storeKey !== 'all') {
    selectedStore = getStoreByKey(storeKey) || FREJUN_STORES.find((s) => s.match.test(storeKey));
  }
  if (!selectedStore && tag && tag !== 'all') {
    const inferred = FREJUN_STORES.find((s) => s.match.test(tag));
    if (inferred && (scope.isAdmin || scope.stores.some((s) => s.key === inferred.key))) selectedStore = inferred;
  }
  if (!scope.isAdmin && !scope.stores.some((s) => s.key === selectedStore?.key)) {
    selectedStore = scope.stores[0];
  }
  if (userEmail && !scopeAllowsEmail(scope, userEmail)) userEmail = '';
  if (selectedStore && !userEmail) userEmail = selectedStore.email;

  let resolvedNumber = candidateNumber;
  let resolvedEmail = userEmail;
  const cleanSearch = search.trim();
  if (cleanSearch && !resolvedNumber) {
    if (cleanSearch.includes('@')) {
      if (scopeAllowsEmail(scope, cleanSearch)) resolvedEmail = cleanSearch;
    } else {
      resolvedNumber = cleanSearch;
    }
  }

  const isAgentFilter = !!(tag && tag !== 'all' && selectedStore && !(
    selectedStore.tags?.some((t) => t.toLowerCase() === tag)
    || selectedStore.key.toLowerCase() === tag
    || selectedStore.label.toLowerCase().includes(tag)
  ));
  const matchesTag = (call) => (Array.isArray(call.tags) && call.tags.some((t) => t.name?.toLowerCase().includes(tag)))
    || call.recruiter?.toLowerCase().includes(tag);

  if (isAgentFilter && !callId) {
    try {
      const { calls: scanned, truncated } = await scanCalls({
        userEmail: resolvedEmail, dateStart, dateEnd, candidateNumber: resolvedNumber, refresh: searchParams.get('refresh') === '1',
      });
      const matches = filterCallsToScope(scope, scanned).filter(matchesTag);
      const start = (page - 1) * pageSize;
      const results = matches.slice(start, start + pageSize);
      results.forEach((call) => {
        const storeObj = identifyStoreForCall(call);
        if (storeObj) call.store = { key: storeObj.key, label: storeObj.label, email: storeObj.email, virtualNumber: storeObj.virtualNumber };
      });
      await enrichCallsWithCustomerNames(results);
      return Response.json({
        ok: true,
        data: {
          count: matches.length,
          next: start + pageSize < matches.length ? page + 1 : null,
          previous: page > 1 ? page - 1 : null,
          results,
          pageCount: results.length,
          isFiltered: false,
          truncated,
        },
      });
    } catch (err) {
      console.error('[API /api/frejun/calls] agent scan error:', err);
      return Response.json({ ok: false, error: err.message || 'Failed to fetch Frejun call logs' }, { status: 500 });
    }
  }

  try {
    const data = await getFrejunCalls({
      page,
      pageSize,
      userEmail: resolvedEmail,
      candidateNumber: resolvedNumber,
      dateStart,
      dateEnd,
      callId,
    });

    let results = filterCallsToScope(scope, data?.results ?? []);
    const pageCount = results.length;
    let isFiltered = false;

    if (tag && tag !== 'all') {
      const isStoreTag = selectedStore && (
        selectedStore.tags?.some((t) => t.toLowerCase() === tag)
        || selectedStore.key.toLowerCase() === tag
        || selectedStore.label.toLowerCase().includes(tag)
      );
      if (!isStoreTag) {
        isFiltered = true;
        results = results.filter((call) => {
          const hasMatchingTag = Array.isArray(call.tags) && call.tags.some((t) => t.name?.toLowerCase().includes(tag));
          return hasMatchingTag || call.recruiter?.toLowerCase().includes(tag);
        });
      }
    }

    results.forEach((call) => {
      const storeObj = identifyStoreForCall(call);
      if (storeObj) {
        call.store = { key: storeObj.key, label: storeObj.label, email: storeObj.email, virtualNumber: storeObj.virtualNumber };
      }
    });

    await enrichCallsWithCustomerNames(results);

    return Response.json({
      ok: true,
      data: { ...data, results, pageCount, isFiltered },
    });
  } catch (err) {
    console.error('[API /api/frejun/calls] Error:', err);
    return Response.json({ ok: false, error: err.message || 'Failed to fetch Frejun call logs' }, { status: 500 });
  }
}
