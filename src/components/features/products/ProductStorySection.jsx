'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { buildProductAttributes } from '@/lib/analytics/productAttributes';

const DEFAULT_TITLE = 'Story Behind The Product';
const DEFAULT_IMAGE = 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/story-ring.jpg';

function StorySkeleton() {
  return (
    <div className="grid grid-cols-1 items-center gap-6 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-2 md:gap-10 md:p-8 lg:grid-cols-5">
      <div className="flex flex-col gap-3 lg:col-span-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-3/4" />
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <Skeleton className="aspect-[16/10] w-full rounded-2xl lg:col-span-2" />
    </div>
  );
}

/**
 * @param {{
 *   body?: string|null,
 *   isLoading?: boolean,
 *   title?: string,
 *   imageSrc?: string,
 *   imageAlt?: string,
 *   product?: object|null,
 * }} props
 */
export default function ProductStorySection({
  body = null,
  isLoading = false,
  title = DEFAULT_TITLE,
  imageSrc = DEFAULT_IMAGE,
  imageAlt = 'Hand-drawn sketch of the piece’s design',
  product = null,
}) {
  const trackedItemIdRef = useRef(null);
  useEffect(() => {
    if (isLoading || !body || !product?.item_id) return;
    if (trackedItemIdRef.current === product.item_id) return;
    trackedItemIdRef.current = product.item_id;

    tracker.track(EVENTS.PRODUCT_STORY_VIEWED, buildProductAttributes({ product }));
  }, [isLoading, body, product]);

  if (isLoading) return <StorySkeleton />;
  if (!body) return null;

  return (
    <div className="grid grid-cols-1 items-center gap-6 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-1 md:gap-10 md:p-8 lg:grid-cols-5 lg:gap-12">
      <div className="flex flex-col gap-4 lg:col-span-3">
        <div className="flex items-center gap-1.5 text-accent">
          <Sparkles size={13} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-[0.15em]">
            Crafted With Care
          </span>
        </div>
        <h2 className="font-heading text-2xl text-foreground md:text-3xl">{title}</h2>
        <div className="border-l-2 border-accent/50 pl-4">
          <p className="text-base leading-relaxed text-foreground/90">{body}</p>
        </div>
      </div>

      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl shadow-sm lg:col-span-2">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="object-cover"
          unoptimized
          loading="lazy"
          fetchPriority="low"
        />
      </div>
    </div>
  );
}
