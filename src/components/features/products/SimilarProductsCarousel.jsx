'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Navigation, Mousewheel } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/free-mode';
// 'swiper/css/navigation' deliberately not imported — see NavButton below.
import ProductCard from '@/components/features/catalog/ProductCard';
import { useLiveCatalogPrices } from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';
import { useSimilarProducts } from '@/hooks/products/useSimilarProducts';
import { Skeleton } from '@/components/ui/skeleton';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { buildProductAttributes } from '@/lib/analytics/productAttributes';

function CarouselSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden sm:gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex w-32 shrink-0 flex-col gap-2 sm:w-40 md:w-44">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function NavButton({ direction }) {
  const isPrev = direction === 'prev';
  return (
    <button
      type="button"
      aria-label={isPrev ? 'Previous' : 'Next'}
      className={[
        isPrev ? 'swiper-button-prev' : 'swiper-button-next',
        'after:hidden',
        'flex! h-9! w-9! items-center justify-center rounded-full border border-border',
        'bg-card text-foreground shadow-sm hover:bg-muted',
        'top-1/2! mt-0! -translate-y-1/2',
        'disabled:opacity-0!',
      ].join(' ')}
    >
      {isPrev ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
    </button>
  );
}

/**
 * @param {{ product: object|null, activeStoreId: number|null }} props
 */
export default function SimilarProductsCarousel({ product, activeStoreId }) {
  const { items, isLoading } = useSimilarProducts(product, activeStoreId);

  const { priceById, settledIds } = useLiveCatalogPrices(items);

  const itemIds = items.map((i) => i.item_id);
  const { stockByItemId, isLoading: stockLoading } = useCrossStoreStockCodes(itemIds);
  
  const trackedItemIdRef = useRef(null);
  useEffect(() => {
    if (!product?.item_id || items.length === 0) return;
    if (trackedItemIdRef.current === product.item_id) return;
    trackedItemIdRef.current = product.item_id;

    tracker.track(EVENTS.SIMILAR_PRODUCTS_VIEWED, {
      surface: 'pdp_carousel',
      item_count: items.length,
      ...buildProductAttributes({ product }),
    });
  }, [product, items.length]);
  
  if (!isLoading && items.length === 0) return null;

  if (items.length === 0) {
    return (
      <section className="relative flex flex-col gap-4">
        <h2 className="font-heading text-lg text-foreground">Similar Products</h2>
        <CarouselSkeleton />
      </section>
    );
  }

  return (
    <section className="relative flex flex-col gap-4">
      <h2 className="font-heading text-lg text-foreground">Similar Products</h2>

      <div className="group/carousel relative -mx-4 px-4 md:-mx-6 md:px-6">
        <Swiper
          modules={[FreeMode, Navigation, Mousewheel]}
          freeMode
          navigation={{ prevEl: '.swiper-button-prev', nextEl: '.swiper-button-next' }}
          mousewheel={{ forceToAxis: true }}
          slidesPerView={1.5}
          spaceBetween={12}
          breakpoints={{
            768:  { slidesPerView: 2.5, spaceBetween: 12 },
            1024: { slidesPerView: 3.5, spaceBetween: 16 },
            1200: { slidesPerView: 5, spaceBetween: 16 },
          }}
        >
          {items.map((item) => {
            const price = priceById.get(item.item_id) ?? null;
            const isPricing = price == null && !settledIds.has(item.item_id);
            return (
              <SwiperSlide key={item.item_id}>
                <ProductCard
                  product={{ ...item, price, is_pricing: isPricing }}
                  showStockBadge={!stockLoading}
                  realStock={stockByItemId.get(item.item_id) ?? null}
                  similarProductsSurface="pdp_carousel"
                />
              </SwiperSlide>
            );
          })}
        </Swiper>

        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden items-center pl-1 opacity-0 transition-opacity duration-standard group-hover/carousel:opacity-100 sm:flex [&>button]:pointer-events-auto">
          <NavButton direction="prev" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden items-center pr-1 opacity-0 transition-opacity duration-standard group-hover/carousel:opacity-100 sm:flex [&>button]:pointer-events-auto">
          <NavButton direction="next" />
        </div>
      </div>
    </section>
  );
}
