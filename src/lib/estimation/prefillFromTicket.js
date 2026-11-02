import { calculateItemRates } from '@/services/pricingService';
import {
  getMetalRateForItem, getItemSizesByType, getStoneRate, getStoneTypeDetails, getLabourRate, applyLabourToLine,
} from '@/services/customEstimateService';
import { uploadTemporaryFile } from '@/services/fileUploadService';
import APP_CONFIG from '@/constants/appConfig';

export const DIAMOND_ITEM_GROUP_ID = 112;
export const STONE_COSTING_DEFAULTS = {
  [DIAMOND_ITEM_GROUP_ID]: { baseItemId: 13, salesCostingId: 10, purchaseCostingId: 10 },
};

/**
 * Whether OrnaVerse charges this item's metal on PURE weight (weight × purity) rather than gross weight —
 * read from its own priced row, since it depends on the item's costing setup.
 */
export function isMetalOnPureWeight(row) {
  const m = row?.item_components?.[0];
  if (!m?.rate || m.amount == null) return false;
  return Math.abs(m.amount - (m.pure_weight ?? 0) * m.rate) < Math.abs(m.amount - (m.weight ?? 0) * m.rate);
}

const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const karatNumber = (v) => String(v ?? '').match(/\d+/)?.[0] ?? null;
const findByLabel = (options, label) => (label ? options.find((o) => norm(o.label) === norm(label)) ?? null : null);

/** Custom-estimate item for the panel's category, e.g. "Pendants" → "Customized Pendant"; falls back to the generic custom order item. */
export function matchCustomItem(items, category) {
  const word = norm(category).replace(/s$/, '');
  return (word && items.find((i) => norm(i.item_name).includes(word)))
    ?? items.find((i) => /customi[sz]ed?order/.test(norm(i.item_name)))
    ?? null;
}

async function uploadRemoteImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // The CDN may serve AVIF/WebP to browsers, which OrnaVerse rejects — re-encode as JPEG.
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!jpeg) throw new Error('Image could not be converted.');
  return uploadTemporaryFile(new File([jpeg], 'final-design.jpg', { type: 'image/jpeg' }));
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

  const colorOpt = findByLabel(metalColorOptions, metal.color);
  if (colorOpt) patchMetal({ metal_color_id: colorOpt.value, metal_color_name: colorOpt.label });
  else if (metal.color) warnings.push(`Metal colour "${metal.color}" was not found — the item's default colour is used.`);

  const weight = Number(metal.weight ?? lineItem.weight) || Number(selectedItem.weight) || 0;

  let sizeId = '';
  const sizeName = lineItem.item_size_name;
  if (sizeName && sizeName.trim() !== '-') {
    const sizes = await getItemSizesByType(selectedItem.type_id);
    const size = sizes.find((s) => norm(s.item_size_name) === norm(sizeName));
    if (size) sizeId = size.item_size_id;
    else warnings.push(`Size "${sizeName}" was not found — select it manually.`);
  }

  const stones = [];
  for (const s of final.stones ?? []) {
    const group = stoneItemGroups.find((g) => g.item_group_id === s.groupId) ?? stoneItemGroups.find((g) => norm(g.item_group_name) === norm(s.group));
    const shape = findByLabel(shapeOptions, s.shape);
    const color = findByLabel(colorOptions, s.color);
    const quality = findByLabel(qualityOptions, s.quality);
    const defaults = group && STONE_COSTING_DEFAULTS[group.item_group_id];
    const types = group ? await getStoneTypeDetails(group.item_group_id) : [];
    const type = types.find((t) => norm(t.type_name) === norm(s.type));
    const missing = [
      !group && `group "${s.group}"`, group && !defaults && `costing for group "${s.group}"`,
      !shape && `shape "${s.shape}"`, !color && `colour "${s.color}"`, !quality && `quality "${s.quality}"`, !type && `type "${s.type}"`,
    ].filter(Boolean);
    if (missing.length) {
      warnings.push(`Stone ${s.pieces ?? ''} pcs / ${s.weight ?? ''} ct not added — not found: ${missing.join(', ')}. Add it manually.`);
      continue;
    }
    const stoneWeight = Number(s.weight) || 0;
    const { rate } = await getStoneRate({
      baseItemId: defaults.baseItemId, itemGroupId: group.item_group_id, typeId: type.type_id, shapeId: shape.value,
      stoneColorId: color.value, qualityId: quality.value, weight: stoneWeight,
      salesCostingId: defaults.salesCostingId, purchaseCostingId: defaults.purchaseCostingId,
    });
    if (!(rate > 0)) {
      warnings.push(`OrnaVerse has no rate for ${s.type} · ${s.color} · ${s.quality} (${s.pieces ?? ''} pcs / ${s.weight ?? ''} ct) — choose a priced combination and add it manually.`);
      continue;
    }
    stones.push({
      itemGroupId: group.item_group_id, shapeId: shape.value, stoneColorId: color.value, qualityId: quality.value, typeId: type.type_id,
      pieces: Number(s.pieces) || 1, weight: stoneWeight, rate, amount: +(stoneWeight * rate).toFixed(2),
      baseItemId: defaults.baseItemId, salesCostingId: defaults.salesCostingId, purchaseCostingId: defaults.purchaseCostingId,
      itemGroupName: group.item_group_name, shapeName: shape.label, colorName: color.label, qualityName: quality.label,
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
        baseRow = rePriced;
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

  let imagePath = null;
  if (lineItem.image) {
    try {
      imagePath = await uploadRemoteImage(lineItem.image);
    } catch {
      warnings.push('The final design image could not be attached — upload it manually.');
    }
  }

  return {
    snapshot: { selectedItem, sizeId, weight, baseRow, taxTemplate, metalOnPure, stones, labourProposal, appliedLabour, imagePath },
    warnings,
  };
}
