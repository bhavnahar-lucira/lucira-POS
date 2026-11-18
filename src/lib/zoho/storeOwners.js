// SERVER-ONLY. How each POS store appears in Zoho CRM: the users who own its leads, and the
// "Store Name" its meetings are tagged with (meetings are often booked by central staff).
// Matched on the OrnaVerse store's name and code; Zoho user ids are stable even if the user is renamed.
const STORE_OWNERS = [
  { match: /chembur|\bcs1\b|\bfcs\b/i, zohoStore: 'Chembur Store', owners: [
    { id: '1135580000020946001', name: 'Chembur Omniteam' },
    { id: '1135580000006081058', name: 'Chembur Store' },
  ] },
  { match: /borivali|\bbo1\b/i, zohoStore: 'Borivali Store', owners: [
    { id: '1135580000020945001', name: 'Borivali Omniteam' },
    { id: '1135580000006144001', name: 'Borivali Team' },
  ] },
  { match: /pune|\bpn1\b/i, zohoStore: 'Pune Store', owners: [
    { id: '1135580000022563477', name: 'Pune Omni team' },
    { id: '1135580000006281001', name: 'Pune Store' },
  ] },
  { match: /noida|\bn18\b/i, zohoStore: 'Noida Store', owners: [
    { id: '1135580000021244001', name: 'Noida Omni Team' },
    { id: '1135580000005701001', name: 'Noida Store' },
  ] },
  { match: /lajpat/i, zohoStore: 'Lajpat Nagar Store', owners: [
    { id: '1135580000021239046', name: 'Lajpat Omni Team' },
    { id: '1135580000011201001', name: 'Lajpat Nagar Store' },
  ] },
  { match: /pa(s)?chim|\bpv1\b/i, zohoStore: 'Paschim Vihar Store', owners: [
    { id: '1135580000021242259', name: 'Paschim Omni Team' },
    { id: '1135580000007560001', name: 'Pashchim Vihar' },
  ] },
  { match: /malleshwaram|\bmal\b/i, zohoStore: 'Malleshwaram Store', owners: [
    { id: '1135580000017929001', name: 'Malleshwaram Store' },
  ] },
  { match: /kondapur/i, zohoStore: 'Hyderabad Kondapur', owners: [
    { id: '1135580000030621001', name: 'Hyderabad Kondapur' },
  ] },
  { match: /somaji/i, zohoStore: 'Hyderabad Somaji guda', owners: [
    { id: '1135580000030620001', name: 'Hyderabad Somaji guda' },
  ] },
];

/** The Zoho mapping for an OrnaVerse store (GetUserStores row): { zohoStore, owners }, or null if none is set up. */
export function zohoMappingForStore(store) {
  if (!store) return null;
  const text = [store.mailing_name, store.company_name, store.company_code, store.store_code].filter(Boolean).join(' ');
  return STORE_OWNERS.find((s) => s.match.test(text)) ?? null;
}
