'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BadgeCheck } from 'lucide-react';
import StarRating from '@/components/shared/StarRating';
import { Skeleton } from '@/components/ui/skeleton';
import BottomSheet from '@/components/shared/BottomSheet';
import ReviewImageDialog from '@/components/features/products/ReviewImageDialog';
import { useProductReviews } from '@/hooks/products/useProductReviews';
import { useProductReviewSummary } from '@/hooks/products/useProductReviewSummary';
import { formatDateShort as formatDate } from '@/lib/dateUtils';

const PREVIEW_COUNT = 3;
const MAX_REVIEW_IMAGES = 4;
const MAX_GRID_PHOTOS = 8;

function ReviewImageThumb({ src, alt, onClick }) {
  const [errored, setErrored] = useState(false);
  if (errored) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${alt} full size`}
      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="56px"
        className="object-cover"
        loading="lazy"
        fetchPriority="low"
        onError={() => setErrored(true)}
      />
    </button>
  );
}

function ReviewImageGridOverflow({ count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${count} more review photos`}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      +{count}
    </button>
  );
}

function ReviewCard({ review, onImageClick }) {
  const images = review.images?.slice(0, MAX_REVIEW_IMAGES) ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{review.name}</p>
          {review.isVerified && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-status-in-stock shrink-0">
              <BadgeCheck size={13} aria-hidden="true" />
              Verified
            </span>
          )}
        </div>
        {formatDate(review.postedAt) && (
          <p className="text-xs text-muted-foreground shrink-0">{formatDate(review.postedAt)}</p>
        )}
      </div>
      <StarRating rating={review.rating} size="sm" />
      {review.text && (
        <p className="text-sm text-muted-foreground leading-relaxed">{review.text}</p>
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {images.map((src, i) => (
            <ReviewImageThumb
              key={src}
              src={src}
              alt={`${review.name}'s photo ${i + 1}`}
              onClick={() => onImageClick(review)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewsSkeleton({ count = PREVIEW_COUNT }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-14 shrink-0 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {{ shopifyProductId: string|number|null }} props
 */
export default function ProductReviewsList({ shopifyProductId }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openReviewIndex, setOpenReviewIndex] = useState(null);

  const { average, count, isLoading: summaryLoading } = useProductReviewSummary(shopifyProductId);
  const {
    reviews, isLoading, isFetchingMore, hasMore, loadMore,
  } = useProductReviews(shopifyProductId);

  const openPhoto = (review) => {
    const index = reviews.findIndex((r) => r.id === review.id);
    if (index !== -1) setOpenReviewIndex(index);
  };
  if (!shopifyProductId) return null;

  if (summaryLoading) return null;

  if (count === 0) return null;

  const previewReviews = reviews.slice(0, PREVIEW_COUNT);
  const hasMoreThanPreview = count > PREVIEW_COUNT;
  
  const allPhotos = reviews.flatMap((review) =>
    (review.images ?? []).map((src, i) => ({ src, review, key: `${review.id}-${i}` }))
  );

  return (
    <section id="product-reviews" className="flex flex-col gap-4 scroll-mt-20">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg text-foreground">Customer Reviews</h2>
        {count > 0 && <StarRating rating={average} count={count} size="md" showValue />}
      </div>

      {!isLoading && allPhotos.length > 0 && (() => {
        const overflow = allPhotos.length - MAX_GRID_PHOTOS;
        const visible = overflow > 0 ? allPhotos.slice(0, MAX_GRID_PHOTOS - 1) : allPhotos;
        return (
          <div className="flex flex-wrap gap-2">
            {visible.map(({ src, review, key }) => (
              <ReviewImageThumb
                key={key}
                src={src}
                alt={`${review.name}'s photo`}
                onClick={() => openPhoto(review)}
              />
            ))}
            {overflow > 0 && (
              <ReviewImageGridOverflow
                count={overflow + 1}
                onClick={() => openPhoto(allPhotos[visible.length].review)}
              />
            )}
          </div>
        );
      })()}

      {isLoading ? (
        <ReviewsSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          {previewReviews.map((review) => (
            <ReviewCard key={review.id} review={review} onImageClick={openPhoto} />
          ))}
        </div>
      )}

      {!isLoading && hasMoreThanPreview && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="self-start text-sm font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          View all {count.toLocaleString('en-IN')} reviews
        </button>
      )}

      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Customer Reviews (${count.toLocaleString('en-IN')})`}
      >
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} onImageClick={openPhoto} />
          ))}
        </div>
        {hasMore && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={loadMore}
              disabled={isFetchingMore}
              className="text-sm font-semibold text-accent hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {isFetchingMore ? 'Loading…' : 'Load more reviews'}
            </button>
          </div>
        )}
      </BottomSheet>

      <ReviewImageDialog
        isOpen={openReviewIndex != null}
        onClose={() => setOpenReviewIndex(null)}
        reviews={reviews}
        currentIndex={openReviewIndex ?? 0}
        onIndexChange={setOpenReviewIndex}
      />
    </section>
  );
}
