// Maps an OrnaVerse POS invoice (Invoice/Retrieve's Entity) onto Olocker's
// TagList — one tag per insured line item. Pure, so the mapping can be
// reasoned about and tested without touching either API.
//
// Every Olocker value is a STRING, including the numbers; their samples are
// consistently quoted and mixing in raw numerals is not worth the risk.

import { GRAMS_PER_CARAT, metalFromKaratName } from './constants';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const wt  = (v) => num(v).toFixed(3);
const amt = (v) => num(v).toFixed(2);

/** Olocker wants a bare national number; invoices carry "+91 81496 39991" etc. */
function normalizeMobile(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** "2026-10-03T10:37:00" | Date | "03/10/2026" → "2026-10-03" (Olocker's only accepted form). */
function toIsoDate(value) {
  if (!value) return '';
  const asString = String(value);
  const alreadyIso = asString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (alreadyIso) return alreadyIso[1];

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * Stone rows for one line, in carats — the unit Olocker's current sample
 * uses ("cts"). OrnaVerse splits stones three ways and a line can carry any
 * combination, so each non-zero bucket becomes its own row. Certification
 * fields stay empty strings: the invoice has no stone certificate data, and
 * their guide marks the whole section optional.
 */
function buildStoneDetails(item) {
  const buckets = [
    { name: 'Diamond',      wtKey: 'diamond_weight',     cntKey: 'diamond_pieces' },
    { name: 'Colour Stone', wtKey: 'color_stone_weight', cntKey: 'color_stone_pieces' },
    { name: 'Stone',        wtKey: 'stone_weight',       cntKey: 'stone_pieces' },
  ];

  return buckets
    .filter((b) => num(item[b.wtKey]) > 0)
    .map((b) => ({
      name:       b.name,
      properties: '',
      wt:         wt(item[b.wtKey]),
      unitofwt:   'cts',
      stonecnt:   num(item[b.cntKey]) > 0 ? String(num(item[b.cntKey])) : '',
      certified:  '',
      cert_by:    '',
      cert_no:    '',
      cert_dt:    '',
    }));
}

/**
 * Non-metal, non-stone components, in grams.
 *
 * Olocker's guide is explicit that when metal net weight plus stones don't
 * add up to gross weight, the difference has to be declared here or the
 * item's weights won't reconcile on their side. OrnaVerse already carries
 * an `other_weight` bucket (thread, beads, enamel and the like) which is
 * used first; anything still unaccounted for after that is declared as one
 * residual row rather than quietly dropped. A negative residual (stones and
 * metal already exceeding gross — bad invoice data) is never sent.
 */
function buildDecorativeItems(item, { grossWeight, metalWeight, stoneWeightGrams }) {
  const rows = [];
  const other = num(item.other_weight);
  if (other > 0) {
    rows.push({ name: 'Other', wt: wt(other), unitofwt: 'gms' });
  }

  const residual = +(grossWeight - metalWeight - stoneWeightGrams - other).toFixed(3);
  if (residual > 0.005) {
    rows.push({ name: 'Other components', wt: wt(residual), unitofwt: 'gms' });
  }
  return rows;
}

/**
 * BIS hallmarking is mandatory for gold jewellery sold in India, and the
 * invoice carries no hallmark flag of its own, so gold is declared
 * hallmarked and everything else is not. If a hallmark field is added to
 * the line items later, read it here instead of inferring.
 */
function hallmarkedFlag(metalType) {
  return metalType === 'GOLD' ? 'yes' : 'no';
}

/** Mandatory per the developer guide; `cust_email` and the arrays are not. */
const REQUIRED_FIELDS = [
  'id', 'name', 'grosswt', 'inv_no', 'inv_dt',
  'inv_itemsrno', 'cust_name', 'cust_mobile', 'inv_amt',
];

// Present-but-zero is not a real value for any of these: a policy covering
// 0.000g or ₹0.00 is meaningless, and Olocker would issue it anyway rather
// than complain. Checked separately because "0.000" passes a blank test.
const POSITIVE_FIELDS = ['grosswt', 'inv_amt', 'insurance'];

/**
 * One Olocker tag for one invoice line.
 *
 * `inv_itemsrno` is the line's 1-based position on the invoice as OrnaVerse
 * returns it — stable for a posted invoice, and what makes a policy
 * traceable back to a line later.
 */
export function buildTag({ invoice, item, index, token }) {
  const { type: metalType, fineness } = metalFromKaratName(item.karat_name);

  const grossWeight = num(item.weight);
  const metalWeight = num(item.net_weight) || grossWeight;
  const stoneCarats = num(item.diamond_weight) + num(item.color_stone_weight) + num(item.stone_weight);
  const stoneWeightGrams = +(stoneCarats * GRAMS_PER_CARAT).toFixed(3);

  // OrnaVerse's own per-line purity is a 0–1 fraction; Olocker wants
  // millesimal fineness, so it scales. Falls back to the karat table.
  const linePurity = num(item.purity);
  const purity = linePurity > 0 && linePurity <= 1
    ? Math.round(linePurity * 1000)
    : fineness;

  return {
    token,
    id:      String(item.item_code || item.transaction_item_id || `${invoice.document_no}-${index + 1}`),
    name:    String(item.item_name ?? '').trim(),
    grosswt: wt(grossWeight),
    metaldetails: metalWeight > 0
      ? [{
          wt:       wt(metalWeight),
          unitofwt: 'G',
          type:     metalType,
          purity:   purity != null ? String(purity) : '',
        }]
      : [],
    hallmarked: hallmarkedFlag(metalType),
    stonedetails: buildStoneDetails(item),
    decovativeitem: buildDecorativeItems(item, { grossWeight, metalWeight, stoneWeightGrams }),
    jewellerycertificatedetails: [],
    inv_no:        String(invoice.document_no ?? ''),
    inv_dt:        toIsoDate(invoice.document_date),
    inv_itemsrno:  String(index + 1),
    cust_name:     String(invoice.party_name ?? '').trim(),
    cust_email:    String(invoice.email ?? '').trim(),
    cust_mobile:   normalizeMobile(invoice.mobile),
    // `inv_amt` is the invoice total; `insurance` is the sum covered for
    // THIS item — so a multi-item invoice repeats the same total on every
    // tag and varies only the insured value. Confirmed live 2026-10-31 by
    // issuing two policies off one invoice with inv_amt 44486.44 and
    // per-item insurance of 11225.44 / 33261.00: the certificates read
    // "Rs. 11225" and "Rs. 33261", so cover follows `insurance` alone and
    // `inv_amt` never leaks into the sum insured.
    inv_amt:   amt(invoice.net_amount),
    insurance: amt(item.gross_amount ?? item.net_amount),
  };
}

/** @returns {string[]} names of mandatory fields this tag left empty or at zero */
export function missingRequiredFields(tag) {
  const blank = REQUIRED_FIELDS.filter((field) => {
    const value = tag[field];
    return value === null || value === undefined || String(value).trim() === '';
  });
  const zero = POSITIVE_FIELDS.filter((field) => !blank.includes(field) && num(tag[field]) <= 0);
  return [...blank, ...zero];
}

/**
 * Builds the whole TagList for an invoice.
 *
 * @param {{
 *   invoice: object,              // Invoice/Retrieve Entity
 *   token: string,                // Olocker auth token
 *   selectedKeys?: Set<string>|null, // item keys to insure; null = every line
 * }} params
 * @returns {{
 *   tags: object[],
 *   lines: { key: string, index: number, item: object }[], // parallel to tags
 *   invalid: { key: string, item_name: string, missing: string[] }[],
 * }}
 */
export function buildTagList({ invoice, token, selectedKeys = null }) {
  const lineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];

  const tags = [];
  const lines = [];
  const invalid = [];

  lineItems.forEach((item, index) => {
    const key = lineItemKey(item, index);
    if (selectedKeys && !selectedKeys.has(key)) return;

    const tag = buildTag({ invoice, item, index, token });
    const missing = missingRequiredFields(tag);
    if (missing.length) {
      invalid.push({ key, item_name: item.item_name || `Line ${index + 1}`, missing });
      return;
    }
    tags.push(tag);
    lines.push({ key, index, item });
  });

  return { tags, lines, invalid };
}

/**
 * Stable identity for one invoice line, shared by the API, the stored
 * policy records and the UI's selection state. `transaction_item_id` is
 * OrnaVerse's own per-line id; the positional fallback only matters for a
 * draft that has not been saved yet.
 */
export function lineItemKey(item, index) {
  return String(item?.transaction_item_id ?? `idx-${index}`);
}
