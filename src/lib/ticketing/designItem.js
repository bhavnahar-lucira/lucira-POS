import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { uploadTemporaryFile } from '@/services/fileUploadService';
import { getComponentAttribute } from '@/services/customEstimateService';
import { DIAMOND_ITEM_GROUP_ID, norm } from '@/lib/ticketing/attributeMatch';
import { finalSku } from '@/lib/ticketing/normalize';

// HO's convention for "Customer Order" designs in OrnaVerse.
const JEWELLERY_BASE_ITEM_ID = 11;
const METAL_BASE_ITEM_ID = 12;
const DIAMOND_JEWELLERY_GROUP_ID = 101;
const PLAIN_GOLD_GROUP_ID = 102;
const LUCIRA_BRAND_ID = 893;
const GOLD_METAL_ID = 106;
const GENDER_WOMEN = 2;
const SOURCING_BUY = 1;
const PIECES_UOC_ID = 3;
const PIECES_UOM_ID = 6;
const STYLE_COMPONENT_FIELDS = [
  'rm_id', 'rm_attribute_id', 'setting_id', 'stone_status_id', 'pieces', 'weight', 'uoc_id', 'purity', 'pure_weight',
  'pointer_weight', 'parts', 'is_center_stone', 'base_item_id', 'karat_id', 'item_group_id', 'type_id', 'sub_type_id',
  'stone_color_id', 'shape_id', 'metal_color_id', 'quality_id', 'stone_size_id', 'sieve_id', 'attribute', 'item_code', 'uom_id',
];

/** The OrnaVerse style code for a product: the workflow team's design code. */
export const designStyleCode = (final) => String(finalSku(final) ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

const singular = (v) => norm(v).replace(/s$/, '');

async function post(path, body) {
  const { data } = await axiosInstance.post(path, body);
  return data;
}

async function uploadDesignImage(url, code) {
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
  return uploadTemporaryFile(new File([jpeg], `${code}.jpg`, { type: 'image/jpeg' }));
}

async function findStyle(code) {
  const list = await post(API.ITEMS.STYLE_LIST, { Take: 20, ContainsText: code });
  const row = (list?.Entities ?? []).find((s) => String(s.style_code).toUpperCase() === code);
  return row ? (await post(API.ITEMS.DESIGN_DETAIL, { EntityId: row.style_id }))?.Entity ?? null : null;
}

const findVariant = (style, metal, sizeId) => (style?.style_variants ?? []).find((v) => v.karat_id === metal.karat_id
  && v.metal_color_id === metal.metal_color_id && (v.item_size_id || null) === (sizeId || null));

async function typeIdFor(category, fallback) {
  const types = (await post(API.CATEGORIES.GET_TYPES, { Take: 0 }))?.Entities ?? [];
  const wanted = singular(category);
  return types.find((t) => wanted && singular(t.type_name) === wanted)?.type_id ?? fallback;
}

async function createStyle({ code, final, line, metal, sizeId, ref }) {
  const stones = line.item_components.filter((c) => c.base_item_id !== METAL_BASE_ITEM_ID);
  const diamonds = stones.filter((c) => c.item_group_id === DIAMOND_ITEM_GROUP_ID);
  const others = stones.filter((c) => c.item_group_id !== DIAMOND_ITEM_GROUP_ID);
  const sum = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
  const carats = sum(stones, 'weight');
  const itemGroupId = stones.length ? DIAMOND_JEWELLERY_GROUP_ID : PLAIN_GOLD_GROUP_ID;
  const category = final.lineItem?.category ?? final.lineItem?.item_name;
  const typeId = await typeIdFor(category, line.type_id);
  const attribute = await getComponentAttribute({
    base_item_id: JEWELLERY_BASE_ITEM_ID, item_group_id: itemGroupId, type_id: typeId, sub_type_id: 0,
    collection_id: 0, brand_id: LUCIRA_BRAND_ID, super_type_id: 0, karat_id: metal.karat_id, metal_color_id: metal.metal_color_id,
  });
  if (!attribute?.attribute_id) throw new Error(`OrnaVerse could not resolve the item attribute for design ${code}.`);

  let image = null;
  if (final.lineItem?.image) {
    try {
      image = await uploadDesignImage(final.lineItem.image, code);
    } catch {
      image = null;
    }
  }

  const res = await post(API.ITEMS.STYLE_CREATE, {
    Entity: {
      style_code: code,
      style_name: `Customer Order ${code}`,
      item_group_id: itemGroupId,
      base_item_id: JEWELLERY_BASE_ITEM_ID,
      item_attribute_id: attribute.attribute_id,
      type_id: typeId,
      sub_type_id: 0,
      brand_id: LUCIRA_BRAND_ID,
      collection_id: 0,
      super_type_id: 0,
      sourcing_type: SOURCING_BUY,
      parts: /earring/i.test(category ?? '') ? 2 : 1,
      pieces: 1,
      net_weight: metal.weight,
      weight: +(Number(metal.weight) + carats / 5).toFixed(3),
      diamond_pieces: sum(diamonds, 'pieces'),
      diamond_weight: +sum(diamonds, 'weight').toFixed(3),
      stone_pieces: sum(others, 'pieces'),
      stone_weight: +sum(others, 'weight').toFixed(3),
      ...(image && { image }),
      is_bom: true,
      // OrnaVerse fails on a missing or 0 size; an unsized piece (earrings, pendants) must send null.
      item_size_id: sizeId ?? null,
      metal_id: GOLD_METAL_ID,
      karat_id: metal.karat_id,
      purity: metal.purity,
      metal_color_id: metal.metal_color_id,
      gender: GENDER_WOMEN,
      uoc_id: PIECES_UOC_ID,
      uom_id: PIECES_UOM_ID,
      narration: ref ? `Ticket ${ref}` : undefined,
      components: line.item_components.map((c) => Object.fromEntries(
        STYLE_COMPONENT_FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]),
      )),
    },
  });
  if (!res?.EntityId) throw new Error(`OrnaVerse did not create design ${code}.`);
}

/**
 * The OrnaVerse item a ticket product is ordered as: its own "Customer Order <design code>" design and the
 * variant for its karat, colour and size — reused when it already exists, otherwise created the way HO
 * creates custom designs. `line` is the order line built from the final details (metal + resolved stones).
 */
export async function ensureDesignItem({ final, line, ref }) {
  const code = designStyleCode(final);
  if (!code) throw new Error('The workflow team sent no design code for this product, so its OrnaVerse item cannot be created.');
  const metal = line.item_components.find((c) => c.base_item_id === METAL_BASE_ITEM_ID);
  if (!metal) throw new Error(`Design ${code} has no metal.`);
  const sizeId = line.item_size_id || null;

  let style = await findStyle(code);
  if (!style) {
    await createStyle({ code, final, line, metal, sizeId, ref });
    style = await findStyle(code);
  }
  let variant = findVariant(style, metal, sizeId);
  if (!variant) {
    const created = await post(API.ITEMS.STYLE_CREATE_VARIANTS, {
      style_code: style?.style_code ?? code,
      metals: [GOLD_METAL_ID], karats: [metal.karat_id], metal_colors: [metal.metal_color_id],
      itemsizes: sizeId ? [sizeId] : [], genders: [GENDER_WOMEN],
      color_quality_mappings: [], carats: [], centerstoneshapes: [],
    });
    if (created?.Error) throw new Error(created.Error.Message ?? String(created.Error));
    style = await findStyle(code);
    variant = findVariant(style, metal, sizeId);
  }
  if (!variant) throw new Error(`OrnaVerse did not create the ${metal.karat_name ?? ''} ${metal.metal_color_name ?? ''} item for design ${code}.`);
  return (await post(API.ITEMS.RETRIEVE, { EntityId: variant.item_id }))?.Entity ?? variant;
}
