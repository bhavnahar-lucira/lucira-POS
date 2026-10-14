// Custom Estimate "Hold" / "Retrieve Held" — CONFIRMED LIVE 2026-10-14
// against OrnaVerse's own Estimation > Custom tab: there is no server-side
// hold endpoint at all. OrnaVerse's own "Hold Estimate" writes a reason +
// snapshot into localStorage (key "ornaverse.pos.hold.<company_id>") and
// "Retrieve Held" just reads that array back — confirmed by watching the
// key's value flip from one held entry to `[]` the moment "Select" loaded
// it back into the cart, with zero matching network requests either side.
// This mirrors that same till-local, per-store mechanism under our own key
// (not OrnaVerse's) so a browser running both clients never cross-reads the
// other's snapshot shape.
const KEY_PREFIX = 'lucira.pos.estimation.hold.';

function keyFor(storeId) {
  return `${KEY_PREFIX}${storeId}`;
}

function readList(storeId) {
  try {
    return JSON.parse(localStorage.getItem(keyFor(storeId)) ?? '[]');
  } catch {
    return [];
  }
}

function writeList(storeId, list) {
  localStorage.setItem(keyFor(storeId), JSON.stringify(list));
}

export function listHeldEstimates(storeId) {
  return readList(storeId).sort((a, b) => b.heldAt.localeCompare(a.heldAt));
}

export function holdEstimate(storeId, snapshot) {
  const list = readList(storeId);
  list.push({ id: crypto.randomUUID(), heldAt: new Date().toISOString(), ...snapshot });
  writeList(storeId, list);
}

export function removeHeldEstimate(storeId, id) {
  writeList(storeId, readList(storeId).filter((r) => r.id !== id));
}
