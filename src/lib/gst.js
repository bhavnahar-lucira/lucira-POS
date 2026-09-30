// src/lib/gst.js
//
// Real CGST/SGST, summed straight from OrnaVerse's own per-line tax rows —
// reported directly (2026-09-30): the old approach here reconstructed a
// 50/50 split from one combined tax_amount, when every priced line already
// carries its OWN real, separately-computed CGST/SGST rows
// (line_items[].item_taxes[], tax_name "CGST"/"SGST" — confirmed live on
// real posted Invoice/Order documents and on live SetSalesItems pricing
// responses). There is nothing to calculate or reconstruct — every caller
// with real line items should sum THOSE, not guess a split off the total.
//
// Assumes intra-state (CGST+SGST) only — does NOT handle inter-state sales
// (which would be a single IGST line, depending on place_of_supply).
// Revisit if this business starts invoicing across state lines.

/**
 * @param {object[]|null|undefined} lineItems — real priced/posted rows, each
 *   optionally carrying its own `item_taxes` array (SetSalesItems' response
 *   shape, and what a posted Order/Invoice's own line_items[] carries too).
 * @returns {{ cgst: number, sgst: number } | null} null when there's nothing
 *   real to sum (no line items, or none carry item_taxes yet)
 */
export function sumRealGst(lineItems) {
  if (!lineItems?.length) return null;

  let cgst = 0;
  let sgst = 0;
  let found = false;

  for (const line of lineItems) {
    for (const tax of line.item_taxes ?? []) {
      found = true;
      const name = tax.tax_name?.toUpperCase();
      if (name === 'CGST') cgst += tax.tax_amount ?? 0;
      else if (name === 'SGST') sgst += tax.tax_amount ?? 0;
    }
  }

  if (!found) return null;
  return { cgst: +cgst.toFixed(2), sgst: +sgst.toFixed(2) };
}
