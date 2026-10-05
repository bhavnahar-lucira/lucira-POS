/**
 * Average rating + count from a reviews-count { count, sum } pair.
 * @param {{ count: number, sum: number }} countsum
 * @returns {{ average: number, count: number }}
 */
export function normalizeReviewSummary({ count, sum } = {}) {
  const c = count ?? 0;
  const s = sum   ?? 0;
  const average = c > 0 ? Math.round((s / c) * 10) / 10 : 0;
  return { average, count: c };
}

/**
 * A single Nector review item → display shape.
 * @param {object} item — raw item from GET /reviews data.items[]
 *
 * `item.uploads` (confirmed live 2026-09-18) is a flat array shared by both
 * photo and video attachments: `{ type: 'image'|'video', link, position }`.
 * Videos are dropped here — the reviews list only has room for small photo
 * thumbnails, not a video player.
 */
export function normalizeReview(item) {
  return {
    id:         item._id,
    name:       item.name || 'Anonymous',
    rating:     item.rating ?? 0,
    text:       item.description || '',
    isVerified: !!item.is_verified,
    postedAt:   item.posted_at ?? item.created_at ?? null,
    images: Array.isArray(item.uploads)
      ? item.uploads.filter((u) => u?.type === 'image' && u?.link).map((u) => u.link)
      : [],
  };
}
