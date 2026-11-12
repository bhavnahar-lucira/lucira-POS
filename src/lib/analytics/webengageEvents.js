// Payloads mirror lucirajewelry.com's own WebEngage/GTM pushes (read from the live site 2026-11-11):
// same key names and data types only, so the POS never creates new WebEngage attributes.

import { toE164India } from './phoneFormat';

const CURRENCY = 'INR';
const STOREFRONT_URL = 'https://www.lucirajewelry.com';

// OrnaVerse item_code is the Shopify variant SKU (confirmed on LIVE).
export function resolveShopifyIds({ externalProductId, handle, variants, itemCode } = {}) {
  const sku = String(itemCode ?? '').trim().toLowerCase();
  const variant = sku
    ? (variants ?? []).find((v) => String(v.sku ?? '').trim().toLowerCase() === sku)
    : null;
  const variantId = variant?.id ? String(variant.id) : null;
  return {
    shopify_product_id:  externalProductId != null ? String(externalProductId) : null,
    shopify_variant_id:  variantId,
    shopify_product_url: handle
      ? `${STOREFRONT_URL}/products/${handle}${variantId ? `?variant=${variantId}` : ''}`
      : null,
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toMoney(value) {
  const n = toNumber(value);
  return n === undefined ? undefined : Math.round(n * 100) / 100;
}

function clean(value) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text && text.toUpperCase() !== 'NA' ? text : undefined;
}

function toPurity(karatName, karatCode) {
  const name = clean(karatName);
  if (name) return name;
  const code = clean(karatCode);
  if (!code) return undefined;
  return /^\d+$/.test(code) && Number(code) <= 24 ? `${code}KT` : code;
}

function productFields(attributes = {}) {
  return {
    productName:    attributes.item_name ?? undefined,
    sku:            attributes.item_code ?? undefined,
    category:       clean(attributes.item_group_name),
    productType:    clean(attributes.category),
    subCategory:    clean(attributes.sub_category),
    purity:         toPurity(attributes.karat),
    thumbnailImage: attributes.image ?? undefined,
  };
}

function couponFrom(codes) {
  const list = (codes ?? []).filter(Boolean);
  return list.length ? list.join(',') : undefined;
}

export function buildProductViewData(attributes, price) {
  const amount = toMoney(attributes?.price_net_amount) ?? toMoney(price);
  return {
    ...productFields(attributes),
    variantId:  attributes?.shopify_variant_id ?? undefined,
    productUrl: attributes?.shopify_product_url ?? undefined,
    currency:   CURRENCY,
    price:      amount,
    offerPrice: amount,
    quantity:   1,
  };
}

export function buildCartItemData(attributes, { price, quantity } = {}) {
  const amount = toMoney(attributes?.price_net_amount) ?? toMoney(price);
  return {
    ...productFields(attributes),
    productId:  attributes?.shopify_product_id ?? undefined,
    variantId:  attributes?.shopify_variant_id ?? undefined,
    productUrl: attributes?.shopify_product_url ?? undefined,
    image:      attributes?.image ?? undefined,
    price:      amount !== undefined ? String(amount) : undefined,
    offerPrice: amount,
    quantity:   toNumber(quantity) ?? 1,
  };
}

export function cartItemsToCheckoutItems(items = []) {
  return items.map((item) => ({
    sku:         item.sku ?? item.attributes?.item_code ?? undefined,
    name:        item.itemName ?? item.attributes?.item_name ?? undefined,
    productType: clean(item.attributes?.category),
    subCategory: clean(item.attributes?.sub_category),
    variant:     clean(item.attributes?.karat),
    price:       toMoney(item.attributes?.price_net_amount) ?? toMoney(item.unitPrice),
    quantity:    toNumber(item.quantity) ?? 1,
  }));
}

export function pricedRowsToCheckoutItems(rows = []) {
  return rows.map((row) => ({
    sku:         row.item_code ?? row.sku ?? undefined,
    name:        row.item_name ?? undefined,
    productType: clean(row.type_name),
    subCategory: clean(row.sub_type_name),
    variant:     clean(row.karat_name),
    price:       toMoney(row.net_amount) ?? toMoney(row.sub_total),
    quantity:    toNumber(row.pieces) ?? 1,
  }));
}

// Item shapes copied from the website's checkout code; item_id, variant_id, image_url and
// thumbnail_image are filled server-side from Shopify by _sku.
const BRAND_FULL = 'Lucira Jewelry';

function checkoutItem(item, index, extra = {}) {
  return {
    _sku:          item.sku,
    item_name:     item.name,
    item_variant:  item.variant ?? '',
    item_brand:    BRAND_FULL,
    item_category: '',
    price:         item.price ?? 0,
    quantity:      item.quantity,
    category:      item.productType,
    index,
    ...extra,
  };
}

function cartItem(item, index) {
  return {
    _sku:           item.sku,
    sku:            item.sku,
    product_name:   item.name,
    product_type:   item.productType,
    category:       BRAND_FULL,
    sub_category:   item.subCategory ?? item.productType,
    price:          item.price ?? 0,
    offer_price:    item.price ?? 0,
    quantity:       item.quantity,
    index_position: index + 1,
  };
}

const sumQuantity = (items) => (items ?? []).reduce((sum, i) => sum + (toNumber(i.quantity) ?? 0), 0);

export function buildBeginCheckoutData({ value, items, couponCodes }) {
  return {
    value:    toMoney(value),
    currency: CURRENCY,
    items:    (items ?? []).map((item, i) => checkoutItem(item, i, { shopify_product_id: item.sku })),
    coupon:   couponFrom(couponCodes) ?? 'NA',
  };
}

export function buildPaymentInfoData({ value, paymentType, items, couponCodes }) {
  return {
    payment_type: paymentType ?? undefined,
    value:        toMoney(value),
    currency:     CURRENCY,
    coupon:       couponFrom(couponCodes) ?? 'NA',
    items:        (items ?? []).map((item, i) => checkoutItem(item, i)),
  };
}

export function buildPurchaseData({ transactionId, value, tax, items, couponCodes }) {
  return {
    currency:       CURRENCY,
    value:          toMoney(value),
    tax:            toMoney(tax),
    shipping:       0,
    affiliation:    BRAND_FULL,
    transaction_id: transactionId != null ? String(transactionId) : undefined,
    coupon:         couponFrom(couponCodes) ?? 'NA',
    items:          (items ?? []).map((item, i) => checkoutItem(item, i)),
  };
}

const BRAND = 'LuciraJewelry';

function catalogFields(product = {}, externalProductId = null, names = {}) {
  return {
    productName:    product.item_name ?? undefined,
    sku:            product.item_code ?? undefined,
    productId:      externalProductId != null ? String(externalProductId) : undefined,
    category:       clean(product.item_group_name ?? names.groupNames?.get(product.item_group_id)),
    productType:    clean(product.type_name ?? names.typeNames?.get(product.type_id)),
    subCategory:    clean(product.sub_type_name ?? names.subTypeNames?.get(product.sub_type_id)),
    purity:         toPurity(product.karat_name, product.karat_code),
    thumbnailImage: product.thumbnailImage ?? undefined,
    brand:          BRAND,
    currency:       CURRENCY,
  };
}

export function buildProductImpressionData(product, { externalProductId, image, index, names } = {}) {
  return {
    ...catalogFields({ ...product, thumbnailImage: image }, externalProductId, names),
    image:         image ?? undefined,
    offer_price:   toMoney(product?.price),
    quantity:      1,
    indexPosition: index != null ? String(index) : undefined,
  };
}

export function buildProductClickData(product, { externalProductId, image, names, index } = {}) {
  const fields = catalogFields({ ...product, thumbnailImage: image }, externalProductId, names);
  const amount = toMoney(product?.price);
  return {
    productId:      fields.productId,
    sku:            fields.sku,
    productName:    fields.productName,
    productType:    fields.productType,
    category:       fields.category,
    thumbnailImage: fields.thumbnailImage,
    purity:         fields.purity,
    price:          amount !== undefined ? String(amount) : undefined,
    offerPrice:     amount !== undefined ? String(amount) : undefined,
    indexPosition:  index != null ? String(index) : undefined,
  };
}

export function buildWishlistData(product, { externalProductId, image, names } = {}) {
  const fields = catalogFields({ ...product, thumbnailImage: image }, externalProductId, names);
  const amount = toMoney(product?.price);
  return {
    sku:             fields.sku,
    productId:       fields.productId,
    productName:     fields.productName,
    brand:           BRAND,
    productCategory: fields.category,
    productType:     fields.productType,
    price:           amount !== undefined ? String(amount) : undefined,
    offerPrice:      amount !== undefined ? String(amount) : undefined,
    quantity:        1,
    thumbnailImage:  fields.thumbnailImage,
    currency:        CURRENCY,
  };
}

export function buildViewCartData({ value, items }) {
  const total = toMoney(value) ?? 0;
  return {
    currency:        CURRENCY,
    cart_total:      total,
    grand_total:     total,
    discount_amount: 0,
    total_quantity:  sumQuantity(items),
    total_product:   (items ?? []).length,
    items:           (items ?? []).map(cartItem),
  };
}

export function buildShippingInfoData({ value, items, couponCodes }) {
  return {
    value:    toMoney(value),
    currency: CURRENCY,
    items:    (items ?? []).map((item, i) => checkoutItem(item, i)),
    coupon:   couponFrom(couponCodes) ?? 'NA',
  };
}

export function buildPaymentFailureData({ value, items }) {
  return {
    currency: CURRENCY,
    value:    toMoney(value),
    items:    (items ?? []).map((item, i) => checkoutItem(item, i)),
  };
}

export function buildRemoveFromCartData(attributes, { price, quantity } = {}) {
  const amount = toMoney(attributes?.price_net_amount) ?? toMoney(price);
  return {
    productId:       attributes?.shopify_product_id ?? undefined,
    sku:             attributes?.item_code ?? undefined,
    variantId:       attributes?.shopify_variant_id ?? undefined,
    productName:     attributes?.item_name ?? undefined,
    productType:     clean(attributes?.category),
    category:        clean(attributes?.category),
    sub_category:    clean(attributes?.sub_category),
    price:           amount !== undefined ? String(amount) : undefined,
    offerPrice:      amount !== undefined ? String(amount) : undefined,
    quantity:        String(toNumber(quantity) ?? 1),
    thumbnail_image: attributes?.image ?? undefined,
  };
}

export function buildPromoClickData({ name, code }) {
  return {
    creative_name: name ?? undefined,
    promo_id:      code != null ? String(code) : undefined,
  };
}

export function buildUserEventData({ mobile, email, name }) {
  const phone = toE164India(mobile);
  return {
    cuid:   phone ?? undefined,
    mobile: phone ?? undefined,
    phone:  phone ?? undefined,
    email:  email ?? undefined,
    name:   name ?? undefined,
  };
}
