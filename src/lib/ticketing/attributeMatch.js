import { getStoneTypeDetails, getComponentAttribute, getRawMaterialItems } from '@/services/customEstimateService';

export const DIAMOND_ITEM_GROUP_ID = 112;
// Stones are priced per carat; OrnaVerse's component-based promotions ignore a stone with any other unit.
export const STONE_UOC_ID = 5;
export const STONE_UOM_ID = 8;
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
/**
 * The OrnaVerse size whose name matches the panel's: exact text first, then the same number ("12" = "12.0"),
 * then the loose match. Loose-only matching would treat "1.2" and "12" as the same size.
 */
export function findSize(sizes, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted || wanted === '-' || !sizes?.length) return null;
  const nameOf = (s) => String(s.item_size_name ?? '').trim().toLowerCase();
  const exact = sizes.find((s) => nameOf(s) === wanted);
  if (exact) return exact;
  const num = Number(wanted);
  if (Number.isFinite(num)) {
    const sameNumber = sizes.find((s) => nameOf(s) !== '' && Number(nameOf(s)) === num);
    if (sameNumber) return sameNumber;
  }
  return sizes.find((s) => norm(s.item_size_name) === norm(name)) ?? null;
}

/** Karat and colour picked for the metal — re-applied after OrnaVerse re-prices a line, which resets them to the item's defaults. */
export const metalChoice = (component) => (component ? {
  karat_id: component.karat_id, karat_name: component.karat_name, purity: component.purity, rate: component.rate,
  metal_color_id: component.metal_color_id, metal_color_name: component.metal_color_name,
} : {});

const METAL_BASE_ITEM_ID = 12;
const RAW_MATERIAL_BASE_ITEM_IDS = new Set([METAL_BASE_ITEM_ID, 13, 14]);

function describeComponent(c) {
  return c.base_item_id === METAL_BASE_ITEM_ID
    ? `metal ${c.karat_name ?? ''} ${c.metal_color_name ?? ''}`.trim()
    : `stone ${c.shape_name ?? c.shape_id ?? ''} ${c.stone_color_name ?? c.stone_color_id ?? ''} ${c.quality_name ?? c.quality_id ?? ''}`.trim();
}

const rawMaterialCache = new Map();
function rawMaterialItems(baseItemId) {
  if (!rawMaterialCache.has(baseItemId)) {
    const request = getRawMaterialItems(baseItemId).catch((err) => {
      rawMaterialCache.delete(baseItemId);
      throw err;
    });
    rawMaterialCache.set(baseItemId, request);
  }
  return rawMaterialCache.get(baseItemId);
}

const isCustomerStone = (item) => item.is_customer_item === true || /customer/i.test(`${item.item_name ?? ''} ${item.item_code ?? ''}`);

/** The raw-material stone item (e.g. LRDVVSEF) matching a stone component's group, type, shape, colour and quality, or null. */
async function findStoneItem(c) {
  const candidates = (await rawMaterialItems(c.base_item_id)).filter((i) => !isCustomerStone(i)
    && i.item_group_id === c.item_group_id && i.type_id === c.type_id && i.shape_id === c.shape_id
    && i.stone_color_id === c.stone_color_id && i.quality_id === c.quality_id
    && (!c.stone_size_id || !i.stone_size_id || i.stone_size_id === c.stone_size_id));
  const rank = (i) => (c.sub_type_id && i.sub_type_id === c.sub_type_id ? 0 : i.sub_type_id ? 1 : 2);
  return candidates.sort((a, b) => rank(a) - rank(b) || a.item_id - b.item_id)[0] ?? null;
}

async function resolveComponent(c) {
  if (c.base_item_id === METAL_BASE_ITEM_ID) {
    const resolved = await getComponentAttribute(c).catch(() => null);
    if (!resolved?.attribute_id) {
      throw new Error(`OrnaVerse could not confirm the ${describeComponent(c)} details — the order was not placed. Please try again.`);
    }
    return resolved.attribute_code === c.attribute ? c : { ...c, rm_attribute_id: resolved.attribute_id, attribute: resolved.attribute_code };
  }
  const item = await findStoneItem(c);
  if (!item) {
    throw new Error(`OrnaVerse has no raw-material item for ${describeComponent(c)} — ask HO to create it before ordering.`);
  }
  return {
    ...c, rm_id: item.item_id, rm_attribute_id: item.item_attribute_id, attribute: item.attribute,
    sub_type_id: item.sub_type_id ?? c.sub_type_id, item_code: item.item_code,
    uoc_id: item.uoc_id ?? c.uoc_id, uom_id: item.uom_id ?? c.uom_id,
  };
}

/**
 * A custom order line ready for Order/Create. OrnaVerse rebuilds a saved line's details from its references, not from the
 * ids sent: each stone from its raw-material item (rm_id — with none it picks one of its own, e.g. E/VS for EF/VVS), the
 * metal from its attribute code, and the line's karat/colour from its item_attribute_id. All three are resolved here from
 * the chosen karat/colour/shape/quality. Throws when one can't be resolved, so the order isn't saved with wrong details.
 */
export async function withResolvedAttributes(line) {
  const components = await Promise.all((line.item_components ?? []).map((c) => (
    RAW_MATERIAL_BASE_ITEM_IDS.has(c.base_item_id) ? resolveComponent(c) : c
  )));
  const metal = components.find((c) => c.base_item_id === METAL_BASE_ITEM_ID);
  if (!metal) return { ...line, item_components: components };

  const variant = await getComponentAttribute({
    base_item_id: line.base_item_id, item_group_id: line.item_group_id, type_id: line.type_id, sub_type_id: line.sub_type_id,
    collection_id: line.collection_id, brand_id: line.brand_id, super_type_id: line.super_type_id,
    karat_id: metal.karat_id, metal_color_id: metal.metal_color_id,
  }).catch(() => null);
  if (!variant?.attribute_id) {
    throw new Error(`OrnaVerse could not confirm the ${describeComponent(metal)} variant of this item — the order was not placed. Please try again.`);
  }
  return {
    ...line,
    karat_id: metal.karat_id, karat_name: metal.karat_name, purity: metal.purity ?? line.purity,
    metal_color_id: metal.metal_color_id, metal_color_name: metal.metal_color_name,
    item_attribute_id: variant.attribute_id, attribute: variant.attribute_code ?? line.attribute,
    item_components: components,
    item_operations: (line.item_operations ?? []).map((op) => ({ ...op, item_attribute_id: variant.attribute_id })),
  };
}

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
