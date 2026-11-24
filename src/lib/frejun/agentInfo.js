import { identifyStoreForCall } from './storeMapping';

/**
 * Resolves calling agent name, store, and tag details from Frejun tags or email.
 */
export function resolveAgentInfo(call) {
  if (!call) {
    return { agentName: 'Unknown Agent', storeName: null, fullTag: null, tagId: null, store: null };
  }

  const store = call.store || identifyStoreForCall(call);

  // 1. Check if call has tags matching "Store - Agent Name"
  if (Array.isArray(call.tags)) {
    for (const tag of call.tags) {
      const tagName = tag.name?.trim() || '';
      if (tagName.includes('-')) {
        const [storePart, ...rest] = tagName.split('-');
        const agentPart = rest.join('-').trim();
        if (agentPart) {
          return {
            agentName: agentPart,
            storeName: store?.label || storePart.trim(),
            fullTag: tagName,
            tagId: tag.id,
            store,
          };
        }
      } else if (tagName && tagName.toLowerCase() !== store?.key?.toLowerCase()) {
        return {
          agentName: tagName,
          storeName: store?.label || null,
          fullTag: tagName,
          tagId: tag.id,
          store,
        };
      }
    }
  }

  // 2. If identified store, use store label
  if (store) {
    return {
      agentName: `${store.label} Agent`,
      storeName: store.label,
      fullTag: store.label,
      tagId: null,
      store,
    };
  }

  // 3. Fallback to recruiter username
  const email = call.recruiter?.trim() || '';
  let agentName = email;
  if (email.includes('@')) {
    const username = email.split('@')[0];
    agentName = username
      .split(/[._]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  return {
    agentName: agentName || 'Store Agent',
    storeName: null,
    fullTag: null,
    tagId: null,
    store: null,
  };
}

export function formatCallDuration(minutes) {
  if (minutes == null || isNaN(minutes) || minutes <= 0) return '0s';
  const totalSeconds = Math.round(Number(minutes) * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function callStatusTone(status) {
  const s = String(status || '').toLowerCase();
  if (/not[-_ ]?(answer|available)|unavailable|no[-_ ]?answer|miss|fail|reject|cancel/.test(s)) return 'error';
  if (s.includes('answer') || s.includes('complete')) return 'done';
  if (s.includes('ongoing') || s.includes('progress') || s.includes('busy')) return 'active';
  return 'neutral';
}

/** FreJun call_type is 'incoming' / 'outgoing' — note 'outgoing' also contains 'in'. */
export function isIncomingCall(callType) {
  return String(callType || '').toLowerCase().startsWith('in');
}

/** Every agent tagged on a call (a call can carry more than one agent tag); falls back to the single resolved agent. */
export function resolveAllAgents(call) {
  const first = resolveAgentInfo(call);
  if (!first.tagId || !Array.isArray(call?.tags) || call.tags.length < 2) return [first];
  const seen = new Set();
  const out = [];
  for (const tag of call.tags) {
    const info = resolveAgentInfo({ ...call, tags: [tag] });
    if (info.tagId && !seen.has(info.fullTag.toLowerCase())) {
      seen.add(info.fullTag.toLowerCase());
      out.push(info);
    }
  }
  return out.length ? out : [first];
}
