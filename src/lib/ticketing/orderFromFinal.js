import { calculateItemRates } from '@/services/pricingService';
import { getItemSizesByType, getStoneRate, getStoneTypeDetails } from '@/services/customEstimateService';
import { uploadTemporaryFile } from '@/services/fileUploadService';
import { matchCustomItem, DIAMOND_ITEM_GROUP_ID, STONE_COSTING_DEFAULTS } from '@/lib/estimation/prefillFromTicket';
import APP_CONFIG from '@/constants/appConfig';

// OrnaVerse's "Making Charges" operation (per gram), used when its labour rule returns nothing for a
// plain-gold piece. Same shape GetLabourRate returns for this item once diamonds are present.
const MAKING_CHARGES_OP = {
  operation_id: 1, operation_name: 'Making Charges', uoc_id: 62, labour_rate_type: 1, calculate_to: 1,
  parts: 1, markup: 1, wastage_percent: 0, wastage_weight: 0, discount_percent: 0, discount: 0,
};

const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const karatNumber = (v) => String(v ?? '').match(/\d+/)?.[0] ?? null;
const findByLabel = (options, label) => (label ? options.find((o) => norm(o.label) === norm(label)) ?? null : null);
const round2 = (n) => +(Number(n) || 0).toFixed(2);
const num = (v) => (v == null || v === '' ? null : Number(v));

async function uploadRemoteImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

function check(label, workflow, reference, { unit = '₹', note } = {}) {
  const ok = workflow == null || reference == null || Math.abs(workflow - reference) <= (unit === '' ? 0.005 : 1);
  return { label, workflow, reference, unit, ok, note };
}

/**
 * Builds the order line from the workflow team's final details — their weights, rates, labour and amounts
 * are what the order carries — and checks each figure against OrnaVerse's own pricing and arithmetic.
 * Mismatches are reported, never corrected. Blockers are data the order cannot be built without.
 */
export async function buildOrderFromFinal(final, ticket, lookups) {
  const { items, karatOptions, metalColorOptions, stoneItemGroups, shapeOptions, colorOptions, qualityOptions } = lookups;
  const warnings = [];
  const blockers = [];
  const lineItem = final.lineItem ?? {};
  const metal = final.metal ?? {};

  const selectedItem = matchCustomItem(items, lineItem.category ?? lineItem.item_name);
  if (!selectedItem) {
    return { blockers: [`No OrnaVerse custom order item matches "${lineItem.category ?? lineItem.item_name}".`], warnings, checks: [] };
  }

  const weight = num(metal.weight) ?? num(lineItem.weight) ?? 0;
  if (!(weight > 0)) blockers.push('The final details have no metal weight.');

  const karatOpt = karatOptions.find((o) => karatNumber(o.label) === karatNumber(metal.karat));
  if (!karatOpt) blockers.push(`Karat "${metal.karat ?? '—'}" was not found in OrnaVerse.`);
  const colorOpt = findByLabel(metalColorOptions, metal.color);
  if (metal.color && !colorOpt) warnings.push(`Metal colour "${metal.color}" was not found — the item's default colour is used.`);

  let sizeId = null;
  let sizeName = null;
  const wantedSize = lineItem.item_size_name;
  if (wantedSize && wantedSize.trim() !== '-') {
    const size = (await getItemSizesByType(selectedItem.type_id)).find((s) => norm(s.item_size_name) === norm(wantedSize));
    if (size) ({ item_size_id: sizeId, item_size_name: sizeName } = size);
    else warnings.push(`Size "${wantedSize}" was not found in OrnaVerse — the order goes without a size.`);
  }
  if (blockers.length) return { blockers, warnings, checks: [] };

  // OrnaVerse's own price for the same metal, karat and weight — the reference the workflow rate is checked against.
  const [defaultRow] = await calculateItemRates([selectedItem], APP_CONFIG.DOCUMENT_TYPES.POS_ORDER);
  if (!defaultRow) throw new Error('OrnaVerse could not price the custom order item.');
  const metalPatch = {
    karat_id: karatOpt.value, karat_name: karatOpt.label, purity: karatOpt.purity, weight,
    ...(colorOpt && { metal_color_id: colorOpt.value, metal_color_name: colorOpt.label }),
  };
  const [refRow] = await calculateItemRates([{
    ...selectedItem, weight, net_weight: weight,
    item_components: [{ ...defaultRow.item_components[0], ...metalPatch }],
  }], APP_CONFIG.DOCUMENT_TYPES.POS_ORDER);
  const refMetal = refRow?.item_components?.[0];
  const ovRate = refMetal?.rate ?? null;
  const ovMetalAmount = ovRate != null ? round2(weight * ovRate) : null;

  const metalRate = num(metal.rate) ?? 0;
  const metalAmount = round2(num(metal.amount) ?? weight * metalRate);
  const purity = karatOpt.purity || num(metal.purity) || 0;
  const pureWeight = +(weight * purity).toFixed(3);

  const checks = [
    check(`Gold rate ₹/g (${karatOpt.label}) vs OrnaVerse today`, metalRate, ovRate),
    ...(ticket.order_details?.gold_rate ? [check('Gold rate ₹/g vs rate locked at order confirmation', metalRate, ticket.order_details.gold_rate)] : []),
    check('Metal amount vs OrnaVerse (weight × today’s rate)', metalAmount, ovMetalAmount),
    check('Metal amount = weight × workflow rate', metalAmount, round2(weight * metalRate)),
    ...(metal.purity != null && karatOpt.purity ? [check('Purity vs OrnaVerse', num(metal.purity), karatOpt.purity, { unit: '' })] : []),
  ];

  const workflowStones = (final.stones ?? []).filter((s) => (num(s.weight) ?? 0) > 0 || (num(s.amount) ?? 0) > 0);
  const workflowStonesTotal = round2(workflowStones.reduce((t, s) => t + (num(s.amount) ?? 0), 0));
  const specs = ticket.specs ?? {};
  const workflowDiamonds = workflowStones.filter((s) => s.groupId === DIAMOND_ITEM_GROUP_ID || norm(s.group) === 'diamond');
  if (num(specs.diamond_weight) != null && workflowDiamonds.length) {
    checks.push(check('Diamond weight (ct) vs approved design', +workflowDiamonds.reduce((t, s) => t + (num(s.weight) ?? 0), 0).toFixed(3), num(specs.diamond_weight), { unit: '' }));
  }
  if (num(specs.diamond_pieces) != null && workflowDiamonds.length) {
    checks.push(check('Diamond pieces vs approved design', workflowDiamonds.reduce((t, s) => t + (num(s.pieces) ?? 0), 0), num(specs.diamond_pieces), { unit: '' }));
  }

  const stones = [];
  for (const s of workflowStones) {
    const stoneWeight = num(s.weight) ?? 0;
    const stoneAmount = num(s.amount) ?? 0;
    const desc = `${s.type ?? s.group ?? 'Stone'} · ${s.color ?? '—'} · ${s.quality ?? '—'} (${s.pieces ?? 0} pcs / ${stoneWeight} ct)`;
    const group = stoneItemGroups.find((g) => g.item_group_id === s.groupId) ?? stoneItemGroups.find((g) => norm(g.item_group_name) === norm(s.group));
    const shape = findByLabel(shapeOptions, s.shape);
    const color = findByLabel(colorOptions, s.color);
    const quality = findByLabel(qualityOptions, s.quality);
    const defaults = group && STONE_COSTING_DEFAULTS[group.item_group_id];
    const type = group ? (await getStoneTypeDetails(group.item_group_id)).find((t) => norm(t.type_name) === norm(s.type)) : null;
    const missing = [
      !group && `group "${s.group}"`, group && !defaults && `costing for "${s.group}"`,
      !shape && `shape "${s.shape}"`, !color && `colour "${s.color}"`, !quality && `quality "${s.quality}"`, !type && `type "${s.type}"`,
    ].filter(Boolean);
    if (missing.length) {
      blockers.push(`${desc}: not found in OrnaVerse — ${missing.join(', ')}.`);
      continue;
    }
    const rate = num(s.rate) ?? 0;
    const { rate: ovStoneRate } = await getStoneRate({
      baseItemId: defaults.baseItemId, itemGroupId: group.item_group_id, typeId: type.type_id, shapeId: shape.value,
      stoneColorId: color.value, qualityId: quality.value, weight: stoneWeight,
      salesCostingId: defaults.salesCostingId, purchaseCostingId: defaults.purchaseCostingId,
    });
    checks.push(check(`${desc} rate ₹/ct vs OrnaVerse`, rate, ovStoneRate > 0 ? ovStoneRate : null, {
      note: ovStoneRate > 0 ? undefined : 'OrnaVerse has no rate for this stone',
    }));
    checks.push(check(`${desc} amount = weight × rate`, stoneAmount, round2(stoneWeight * rate)));
    stones.push({
      item_id: selectedItem.item_id, rm_id: 0, rm_attribute_id: 0, setting_id: 0,
      stone_status_id: 1, certificate_no: '', pieces: num(s.pieces) || 1, weight: stoneWeight,
      uoc_id: 4, uom_id: 7, purity: 0, pure_weight: stoneWeight,
      rate, amount: stoneAmount, base_amount: stoneAmount,
      markup: 0, pointer_weight: 0, parts: 0, discount: 0, discount_percent: 0,
      is_center_stone: false, base_item_id: defaults.baseItemId,
      metal_id: 0, metal_name: 'NA', metal_code: 'NA', karat_id: 0,
      item_group_id: group.item_group_id, type_id: type.type_id, sub_type_id: 0, metal_color_id: 0,
      attribute: '', item_code: '', is_customer_item: false,
      sales_costing_id: defaults.salesCostingId, purchase_costing_id: defaults.purchaseCostingId,
      is_configurable: false, shape_id: shape.value, stone_color_id: color.value, quality_id: quality.value,
    });
  }

  const labour = final.labour ?? null;
  const labourAmount = round2(labour?.amount ?? 0);
  const labourRate = labour?.type === 'per_gram' && labour.ratePerGram != null
    ? Number(labour.ratePerGram)
    : weight > 0 ? round2(labourAmount / weight) : 0;
  if (labour?.type === 'per_gram' && labour.ratePerGram != null) {
    checks.push(check('Labour amount = rate/g × weight', labourAmount, round2(weight * Number(labour.ratePerGram))));
  }
  const template = refRow?.item_operations?.[0] ?? defaultRow.item_operations?.[0] ?? {};
  const operations = labourAmount > 0 ? [{
    ...MAKING_CHARGES_OP,
    item_attribute_id: template.item_attribute_id ?? selectedItem.item_attribute_id,
    base_item_id: template.base_item_id ?? 11,
    item_group_id: template.item_group_id ?? selectedItem.item_group_id,
    item_group_name: template.item_group_name,
    pieces: 1, weight, rate: labourRate, amount: labourAmount, base_amount: labourRate,
  }] : [];

  const diamonds = stones.filter((s) => s.item_group_id === DIAMOND_ITEM_GROUP_ID);
  const others = stones.filter((s) => s.item_group_id !== DIAMOND_ITEM_GROUP_ID);
  const sumOf = (rows, key) => rows.reduce((t, r) => t + (r[key] || 0), 0);
  // Totals use every stone the workflow team sent, so a stone that couldn't be matched still counts in the summary.
  const stonesTotal = workflowStonesTotal;
  const subTotal = round2(metalAmount + stonesTotal + labourAmount);
  const taxAmount = round2(subTotal * APP_CONFIG.TAX.GST_RATE);
  const netAmount = round2(subTotal + taxAmount);

  checks.push(
    check('Sub total = metal + stones + labour', num(final.subTotal), subTotal),
    check(`Tax = ${APP_CONFIG.TAX.GST_RATE * 100}% of sub total`, num(final.taxAmount), taxAmount),
    check('Net amount = sub total + tax', num(final.netAmount), netAmount),
  );

  let imagePath = null;
  if (lineItem.image) {
    try {
      imagePath = await uploadRemoteImage(lineItem.image);
    } catch {
      warnings.push('The final design image could not be attached to the order.');
    }
  }

  const taxTemplate = refRow?.item_taxes?.length ? refRow.item_taxes : defaultRow.item_taxes ?? [];
  const rowTax = taxTemplate.length ? round2(taxAmount / taxTemplate.length) : 0;
  const line = {
    ...(refRow ?? defaultRow),
    weight, net_weight: weight, pure_weight: pureWeight,
    sub_total: subTotal, taxable_amount: subTotal, tax_amount: taxAmount, net_amount: netAmount,
    base_sub_total: subTotal, base_tax_amount: taxAmount, base_net_amount: netAmount,
    ...(sizeId && { item_size_id: sizeId, item_size_name: sizeName }),
    item_components: [
      { ...defaultRow.item_components[0], ...metalPatch, pure_weight: pureWeight, rate: metalRate, amount: metalAmount, base_amount: metalAmount },
      ...stones,
    ],
    item_operations: operations,
    item_taxes: taxTemplate.map((t) => ({ ...t, taxable_amount: subTotal, tax_amount: rowTax, base_tax_amount: rowTax })),
    metal_amount: metalAmount,
    diamond_amount: round2(sumOf(diamonds, 'amount')), diamond_pieces: sumOf(diamonds, 'pieces'), diamond_weight: +sumOf(diamonds, 'weight').toFixed(3),
    stone_amount: round2(sumOf(others, 'amount')), stone_pieces: sumOf(others, 'pieces'), stone_weight: +sumOf(others, 'weight').toFixed(3),
    item_labour: labourAmount,
    ...(imagePath && { image: imagePath }),
  };

  return {
    blockers,
    warnings,
    checks,
    line,
    item: selectedItem,
    summary: {
      itemName: selectedItem.item_name, sizeName, karat: karatOpt.label, color: colorOpt?.label ?? null, weight, purity,
      metalRate, metalAmount, stonesTotal, labourRate, labourAmount, subTotal, taxAmount, netAmount, imagePath,
    },
  };
}
