'use client';

// Review lightbox — centered light card (not a fullscreen dark viewer),
// matching a real reviews-app lightbox reference the user supplied: photo on
// one side (edge-to-edge, when the review has one), reviewer identity +
// rating + date + quoted text on the other.
//
// Next/Prev page through the WHOLE REVIEW LIST, one review per slide — not
// through one review's own multiple photos (dropped in favor of this
// simpler, flatter model per explicit direction: "click next, the other
// review comment loads"). A review with no photo shows just the content
// column, narrower, rather than an empty image gap.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, BadgeCheck } from 'lucide-react';
import StarRating from '@/components/shared/StarRating';
import { useBodyScrollLock } from '@/hooks/ui/useBodyScrollLock';
import { formatDateShort as formatDate } from '@/lib/dateUtils';

function Avatar({ name }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-800 text-base font-bold text-white">
      {initial}
    </div>
  );
}

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   reviews: { id: string, name: string, rating: number, text: string, isVerified: boolean, postedAt: string|null, images: string[] }[],
 *   currentIndex: number,
 *   onIndexChange: (index: number) => void,
 * }} props
 */
export default function ReviewImageDialog({
  isOpen, onClose, reviews = [], currentIndex, onIndexChange,
}) {
  useBodyScrollLock(isOpen);

  const goPrev = () => onIndexChange(currentIndex === 0 ? reviews.length - 1 : currentIndex - 1);
  const goNext = () => onIndexChange(currentIndex === reviews.length - 1 ? 0 : currentIndex + 1);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && reviews.length > 1) goPrev();
      if (e.key === 'ArrowRight' && reviews.length > 1) goNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, reviews.length, currentIndex]);

  if (!isOpen || typeof document === 'undefined') return null;

  const review = reviews[currentIndex];
  if (!review) return null;

  const photo = review.images?.[0] ?? null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${review.name}'s review`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      {reviews.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="Previous review"
            className="fixed left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-md transition-colors hover:bg-white sm:left-6"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="Next review"
            className="fixed right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-md transition-colors hover:bg-white sm:right-6"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className={[
          'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:flex-row',
          photo ? 'max-w-4xl' : 'max-w-lg',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-sm transition-colors hover:bg-stone-100 hover:text-stone-700"
        >
          <X size={18} />
        </button>

        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`${review.name}'s photo`}
            className="h-56 w-full shrink-0 object-cover md:h-auto md:w-1/2 lg:w-3/5"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Avatar name={review.name} />
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-stone-900">{review.name}</p>
              {review.isVerified && (
                <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
                  <BadgeCheck size={14} aria-hidden="true" />
                  Verified Customer
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <StarRating rating={review.rating} size="md" />
            {formatDate(review.postedAt) && (
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-400">
                {formatDate(review.postedAt)}
              </span>
            )}
          </div>

          {review.text && (
            <p className="italic leading-relaxed text-stone-600">&ldquo;{review.text}&rdquo;</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
