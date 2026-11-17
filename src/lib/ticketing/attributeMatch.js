import { getStoneTypeDetails } from '@/services/customEstimateService';

export const DIAMOND_ITEM_GROUP_ID = 112;
export const STONE_COSTING_DEFAULTS = {
  [DIAMOND_ITEM_GROUP_ID]: { baseItemId: 13, salesCostingId: 10, purchaseCostingId: 10 },
};

export const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const segmentsOf = (label) => String(label ?? '').split(/[|/,]+|\s+-\s+/).map(norm).filter(Boolean);
const DIAMOND_HINT = /diamond|lgd|lab/i;

/**
 * Matches a workflow label to an OrnaVerse option by exact (normalised) name, or exactly one of its
 * "A | B" / "A / B" parts. Never guesses by substring and never falls back to the first option.
 * @returns {{ match: object|null, exact: boolean }}
 */
export function matchLabel(options, label, getLabel = (o) => o.label) {
  if (!label || !options?.length) return { match: null, exact: false };
  const target = norm(label);
  const exact = options.find((o) => norm(getLabel(o)) === target);
  if (exact) return { match: exact, exact: true };
  const parts = segmentsOf(label);
  const byPart = parts.length > 1 ? options.find((o) => parts.includes(norm(getLabel(o)))) : null;
  return { match: byPart ?? null, exact: false };
}

/**
 * Resolves one workflow stone to OrnaVerse ids. `notes` lists every value that was not an exact
 * match (for staff to review); `unresolved` lists values with no OrnaVerse match at all, with the
 * options staff can choose from and `chosen` (null until picked) — `overrides`
 * ({ shape, color, quality, type } → OrnaVerse id) is their choice. `group` is null when the stone's group can't be identified at all.
 */
export async function resolveStone(s, { stoneItemGroups, shapeOptions, colorOptions, qualityOptions }, overrides = {}) {
  const notes = [];
  const unresolved = [];
  const desc = `${s.type ?? s.group ?? 'Stone'} (${s.pieces ?? 0} pcs / ${s.weight ?? 0} ct)`;

  let group = (s.groupId && stoneItemGroups.find((g) => g.item_group_id === s.groupId))
    || matchLabel(stoneItemGroups, s.group, (g) => g.item_group_name).match;
  if (!group && DIAMOND_HINT.test(`${s.type ?? ''} ${s.group ?? ''}`)) {
    group = stoneItemGroups.find((g) => g.item_group_id === DIAMOND_ITEM_GROUP_ID) ?? null;
    if (group) notes.push(`${desc}: group "${s.group ?? '—'}" not found — treated as ${group.item_group_name}.`);
  }

  let costing = group ? STONE_COSTING_DEFAULTS[group.item_group_id] : null;
  if (group && !costing) {
    costing = STONE_COSTING_DEFAULTS[DIAMOND_ITEM_GROUP_ID];
    notes.push(`${desc}: no costing is set up for "${group.item_group_name}" — diamond costing is used.`);
  }

  const chosen = (field, options, label, name, getValue = (o) => o.value, getLabel = (o) => o.label) => {
    const pick = overrides[field] != null ? options.find((o) => getValue(o) === overrides[field]) : null;
    if (pick) notes.push(`${desc}: ${name} "${label ?? '—'}" set to "${getLabel(pick)}" by staff.`);
    unresolved.push({
      field, name, raw: label ?? '', desc, chosen: pick ? getValue(pick) : null,
      options: options.map((o) => ({ value: getValue(o), label: getLabel(o) })),
    });
    return pick ?? null;
  };
  const attr = (field, options, label, name) => {
    const { match, exact } = matchLabel(options, label);
    if (match && !exact) notes.push(`${desc}: ${name} "${label}" mapped to "${match.label}".`);
    return match ?? chosen(field, options, label, name) ?? { value: 0, label: label || 'NA' };
  };
  const shape = attr('shape', shapeOptions, s.shape, 'shape');
  const color = attr('color', colorOptions, s.color, 'colour');
  const quality = attr('quality', qualityOptions, s.quality, 'quality');

  let type = null;
  if (group) {
    const types = await getStoneTypeDetails(group.item_group_id).catch(() => []);
    const { match, exact } = matchLabel(types, s.type, (t) => t.type_name);
    type = match;
    if (match && !exact) notes.push(`${desc}: type "${s.type}" mapped to "${match.type_name}".`);
    if (!type && DIAMOND_HINT.test(s.type ?? '')) {
      type = types.find((t) => DIAMOND_HINT.test(t.type_name)) ?? null;
      if (type) notes.push(`${desc}: type "${s.type}" mapped to "${type.type_name}".`);
    }
    if (!type) type = chosen('type', types, s.type, 'type', (t) => t.type_id, (t) => t.type_name);
  }
  if (!type) type = { type_id: 0, type_name: s.type || 'Stone' };

  const complete = !!group && !!type.type_id && !!shape.value && !!color.value && !!quality.value;
  return { group, costing, shape, color, quality, type, notes, unresolved, complete };
}
