'use client';

import StarRating from '@/components/shared/StarRating';
import { useProductReviewSummary } from '@/hooks/products/useProductReviewSummary';

/**
 * @param {{ shopifyProductId: string|number|null }} props
 */
export default function ProductReviewSummaryLink({ shopifyProductId }) {
  const { average, count, isLoading } = useProductReviewSummary(shopifyProductId);

  if (!shopifyProductId || isLoading || count === 0) return null;

  const handleClick = () => {
    document.getElementById('product-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="self-start rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} review${count !== 1 ? 's' : ''} — jump to reviews`}
    >
      <StarRating rating={average} count={count} size="md" showValue />
    </button>
  );
}
