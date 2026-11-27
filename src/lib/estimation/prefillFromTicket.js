import { calculateItemRates } from '@/services/pricingService';
import {
  getMetalRateForItem, getItemSizesByType, getStoneRate, getLabourRate, applyLabourToLine,
} from '@/services/customEstimateService';
import {
  DIAMOND_ITEM_GROUP_ID, STONE_COSTING_DEFAULTS, norm, matchLabel, resolveStone, findSize, metalChoice,
} from '@/lib/ticketing/attributeMatch';
import APP_CONFIG from '@/constants/appConfig';

export { DIAMOND_ITEM_GROUP_ID, STONE_COSTING_DEFAULTS };

/**
 * Whether OrnaVerse charges this item's metal on PURE weight (weight × purity) rather than gross weight —
 * read from its own priced row, since it depends on the item's costing setup.
 */
export function isMetalOnPureWeight(row) {
  const m = row?.item_components?.[0];
  if (!m?.rate || m.amount == null) return false;
  return Math.abs(m.amount - (m.pure_weight ?? 0) * m.rate) < Math.abs(m.amount - (m.weight ?? 0) * m.rate);
}

const karatNumber = (v) => String(v ?? '').match(/\d+/)?.[0] ?? null;

/** Custom-estimate item for the panel's category, e.g. "Pendants" → "Customized Pendant"; falls back to the generic custom order item. */
export function matchCustomItem(items, category) {
  const word = norm(category).replace(/s$/, '');
  return (word && items.find((i) => norm(i.item_name).includes(word)))
    ?? items.find((i) => /customi[sz]ed?order/.test(norm(i.item_name)))
    ?? null;
}

/**
 * Rebuilds a Custom Estimate from the workflow panel's final data, priced at OrnaVerse's live rates.
 * Returns the same snapshot shape as a held estimate, plus anything that could not be matched.
 */
export async function prefillFromTicket(final, lookups) {
  const {
    items, karatOptions, metalColorOptions, stoneItemGroups, shapeOptions, colorOptions, qualityOptions, storeId,
  } = lookups;
  const warnings = [];
  const lineItem = final.lineItem ?? {};
  const metal = final.metal ?? {};

  const selectedItem = matchCustomItem(items, lineItem.category ?? lineItem.item_name);
  if (!selectedItem) throw new Error(`No Custom Estimate item matches "${lineItem.category ?? lineItem.item_name}".`);

  const [priced] = await calculateItemRates([selectedItem], APP_CONFIG.DOCUMENT_TYPES.POS_ORDER);
  if (!priced) throw new Error('Could not price the custom estimate item.');
  let baseRow = priced;
  const taxTemplate = priced.item_taxes ?? [];
  const metalOnPure = isMetalOnPureWeight(priced);
  const metalComponent = () => baseRow.item_components[0];
  const patchMetal = (patch) => {
    baseRow = { ...baseRow, item_components: [{ ...metalComponent(), ...patch }, ...baseRow.item_components.slice(1)] };
  };

  const karatOpt = karatOptions.find((o) => karatNumber(o.label) === karatNumber(metal.karat));
  if (!karatOpt) {
    warnings.push(`Karat "${metal.karat}" was not found — the item's default karat is used.`);
  } else if (karatOpt.value !== metalComponent().karat_id) {
    const m = metalComponent();
    const { rate } = await getMetalRateForItem({
      baseItemId: m.base_item_id, typeId: m.type_id, subTypeId: m.sub_type_id, karatId: karatOpt.value,
      metalId: m.metal_id, itemGroupId: m.item_group_id, salesCostingId: m.sales_costing_id, purchaseCostingId: m.purchase_costing_id,
    });
    patchMetal({ karat_id: karatOpt.value, karat_name: karatOpt.label, purity: karatOpt.purity, rate: rate || 0 });
  }

  const { match: colorOpt, exact: colorExact } = matchLabel(metalColorOptions, metal.color);
  if (colorOpt) patchMetal({ metal_color_id: colorOpt.value, metal_color_name: colorOpt.label });
  if (colorOpt && !colorExact) warnings.push(`Metal colour "${metal.color}" mapped to "${colorOpt.label}" — check it.`);
  else if (!colorOpt && metal.color) warnings.push(`Metal colour "${metal.color}" was not found — the item's default colour is used.`);

  const weight = Number(metal.weight ?? lineItem.weight) || Number(selectedItem.weight) || 0;

  let sizeId = '';
  const sizeName = lineItem.item_size_name;
  if (sizeName && sizeName.trim() !== '-') {
    const sizes = await getItemSizesByType(selectedItem.type_id);
    const size = findSize(sizes, sizeName);
    if (size) sizeId = size.item_size_id;
    else warnings.push(`Size "${sizeName}" was not found — select it manually.`);
  }

  const stones = [];
  for (const s of final.stones ?? []) {
    const label = `Stone ${s.pieces ?? ''} pcs / ${s.weight ?? ''} ct`;
    const { group, costing: defaults, shape, color, quality, type, notes, unresolved, complete } = await resolveStone(s, {
      stoneItemGroups, shapeOptions, colorOptions, qualityOptions,
    });
    if (!complete) {
      const missing = [
        !group && `group "${s.group ?? '—'}"`,
        ...unresolved.filter((u) => u.chosen == null).map((u) => `${u.name} "${u.raw || '—'}"`),
      ].filter(Boolean);
      warnings.push(`${label} not added — not found in OrnaVerse: ${missing.join(', ')}. Add it manually.`);
      continue;
    }
    warnings.push(...notes);

    const stoneWeight = Number(s.weight) || 0;
    let rate = Number(s.rate) || 0;
    if (!(rate > 0)) {
      try {
        const ov = await getStoneRate({
          baseItemId: defaults.baseItemId, itemGroupId: group.item_group_id, typeId: type.type_id, shapeId: shape.value,
          stoneColorId: color.value, qualityId: quality.value, weight: stoneWeight,
          salesCostingId: defaults.salesCostingId, purchaseCostingId: defaults.purchaseCostingId,
        });
        rate = ov?.rate || 0;
      } catch {
        rate = 0;
      }
    }
    if (!(rate > 0)) {
      warnings.push(`OrnaVerse has no rate for ${s.type} · ${s.color} · ${s.quality} (${label}) — choose a priced combination and add it manually.`);
      continue;
    }

    stones.push({
      itemGroupId: group.item_group_id,
      shapeId: shape.value,
      stoneColorId: color.value,
      qualityId: quality.value,
      typeId: type.type_id,
      pieces: Number(s.pieces) || 1,
      weight: stoneWeight,
      rate,
      amount: +(stoneWeight * rate).toFixed(2),
      baseItemId: defaults.baseItemId,
      salesCostingId: defaults.salesCostingId,
      purchaseCostingId: defaults.purchaseCostingId,
      itemGroupName: group.item_group_name,
      shapeName: shape.label,
      colorName: color.label,
      qualityName: quality.label,
    });
  }

  let labourProposal = null;
  let appliedLabour = null;
  if (final.labour) {
    const m = metalComponent();
    labourProposal = await getLabourRate({
      itemId: selectedItem.item_id, itemAttributeId: selectedItem.item_attribute_id, itemGroupId: selectedItem.item_group_id,
      typeId: selectedItem.type_id, karatId: m.karat_id, pieces: 1, weight, netWeight: weight,
      diamondWeight: stones.filter((s) => s.itemGroupId === DIAMOND_ITEM_GROUP_ID).reduce((sum, s) => sum + s.weight, 0),
      stoneWeight: stones.reduce((sum, s) => sum + s.weight, 0),
      companyId: storeId, purity: m.purity, baseItemId: selectedItem.base_item_id,
    });
    if (labourProposal.length) {
      const [rePriced] = await applyLabourToLine({
        item: { ...baseRow, weight, net_weight: weight }, operations: labourProposal, documentId: APP_CONFIG.DOCUMENT_TYPES.POS_ORDER,
      });
      if (rePriced) {
        const chosen = metalChoice(metalComponent());
        baseRow = rePriced;
        patchMetal(chosen);
        appliedLabour = labourProposal;
      } else {
        warnings.push('Labour could not be applied — apply it manually.');
      }
    } else {
      warnings.push(stones.length
        ? 'OrnaVerse has no labour rate for this item — labour is not included.'
        : "Labour not included — this item's labour rule needs its diamonds; add them, then use Apply labour.");
      labourProposal = null;
    }
  }

  const imagePath = lineItem.image || null;

  return {
    snapshot: { selectedItem, sizeId, weight, baseRow, taxTemplate, metalOnPure, stones, labourProposal, appliedLabour, imagePath },
    warnings,
  };
}
