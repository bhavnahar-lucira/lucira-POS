'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ZoomIn, Play } from 'lucide-react';
import ProductImageZoomModal from '@/components/features/products/ProductImageZoomModal';
import { resolveImageSrc } from '@/lib/resolveImageSrc';
import { filterShopifyImagesByColor } from '@/lib/productImages';
import { isShopifyImageUrl, shopifyImageLoader } from '@/lib/shopifyImageLoader';
import { Skeleton } from '@/components/ui/skeleton';
import StockStatusBadge from '@/components/shared/StockStatusBadge';
import Logo from '@/components/shared/Logo';

function NoImagePlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted">
      <Logo variant="icon" color="brown" width={48} height={48} className="opacity-40" />
      <span className="text-xs text-muted-foreground/70">No image available</span>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="w-full rounded-2xl" style={{ aspectRatio: '1 / 1' }} />
      <div className="flex gap-2 justify-center">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="w-14 h-14 rounded-lg shrink-0" />
        ))}
      </div>
    </div>
  );
}

/**
  * @param {object}   product         — OrnaVerse item/style object
 * @param {Array}    shopifyImages   — [{ id, src, alt, width, height, position }]
 *                                     from useShopifyProductImages; defaults to []
 * @param {Array}    shopifyVideos   — [{ id, src, poster, alt, position }]
 *                                     from useShopifyProductImages; defaults to []
 * @param {string}   activeColorName — the currently active item's metal_color_name
 *                                     (e.g. "Yellow Gold"), used to filter shopifyImages
 *                                     down to just that colour's photos
 * @param {boolean}  isLoading       — true while variant/Shopify data is still
 *                                     resolving — shows a skeleton instead of
 *                                     the "no image" empty state
 * @param {string|null} stockStatus  — 'in_stock' | 'out_stock' | null;
 *                                     when provided, renders a floating
 *                                     StockStatusBadge over the top-right
 *                                     corner of the main image
 */
export default function ProductImageGallery({
  product, shopifyImages = [], shopifyVideos = [], activeColorName = null, isLoading = false, stockStatus = null,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imgErrors, setImgErrors]       = useState({});
  const [zoomOpen, setZoomOpen]         = useState(false);
  const touchStartX                     = useRef(null);
  const images = (() => {
    if (shopifyImages.length > 0) {
      const filtered = filterShopifyImagesByColor(shopifyImages, activeColorName);
      return filtered.map((img) => ({
        src: img.src,
        alt: img.alt ?? product?.item_name ?? 'Product image',
      }));
    }
    const fields = [
      product?.image,
      product?.image_1,
      product?.image_2,
      product?.image_3,
      product?.image_4,
      product?.image_5,
      product?.image_6,
      product?.image_7,
      product?.image_8,
    ];
    return fields
      .map(resolveImageSrc)
      .filter(Boolean)
      .map((src) => ({ src, alt: product?.item_name ?? 'Product image' }));
  })();

  const videos = shopifyVideos.map((v) => ({
    src:    v.src,
    poster: v.poster ?? null,
    alt:    v.alt ?? product?.item_name ?? 'Product video',
  }));
  
  const slides = [
    ...images.map((img, i) => ({ type: 'image', ...img, imageIndex: i })),
    ...videos.map((vid) => ({ type: 'video', ...vid })),
  ];
  
  const safeIndex = currentIndex < slides.length ? currentIndex : 0;

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) delta > 0 ? goNext() : goPrev();
    touchStartX.current = null;
  };

  const goPrev = () => setCurrentIndex((i) => (i === 0 ? slides.length - 1 : i - 1));
  const goNext = () => setCurrentIndex((i) => (i === slides.length - 1 ? 0 : i + 1));
  const handleImgError = (index) => setImgErrors((prev) => ({ ...prev, [index]: true }));

  if (isLoading && slides.length === 0) {
    return <GallerySkeleton />;
  }

  const current    = slides[safeIndex];
  const isVideo    = current?.type === 'video';
  const showImage  = !isVideo && current?.src && !imgErrors[safeIndex];
  const showVideo  = isVideo && !!current?.src;
  
  const renderThumb = (slide, i) => (
    <button
      key={slide.src}
      role="tab"
      aria-selected={i === safeIndex}
      aria-label={slide.type === 'video' ? 'Product video' : `Image ${i + 1}`}
      onClick={() => setCurrentIndex(i)}
      className={`relative w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        i === safeIndex ? 'border-accent' : 'border-transparent hover:border-border'
      }`}
    >
      {slide.type === 'video' ? (
        <>
          {slide.poster ? (
            <Image
              src={slide.poster}
              alt={slide.alt}
              fill
              sizes="56px"
              className="object-cover"
              loading="lazy"
              fetchPriority="low"
              loader={isShopifyImageUrl(slide.poster) ? shopifyImageLoader : undefined}
            />
          ) : (
            <div className="h-full w-full bg-stone-800" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <Play size={16} className="fill-white text-white" aria-hidden="true" />
          </span>
        </>
      ) : !imgErrors[i] ? (
        <Image
          src={slide.src}
          alt={slide.alt}
          fill
          sizes="56px"
          className="object-cover"
          loading="lazy"
          fetchPriority="low"
          onError={() => handleImgError(i)}
          loader={isShopifyImageUrl(slide.src) ? shopifyImageLoader : undefined}
        />
      ) : (
        <div className="w-full h-full bg-muted" />
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col md:flex-row md:items-stretch xl:flex-col gap-3">

        {slides.length > 1 && (
          <div
            role="tablist"
            aria-label="Media thumbnails"
            className="hidden md:flex xl:hidden flex-col gap-2 overflow-y-auto scrollbar-none shrink-0 px-0.5 py-0.5"
          >
            {slides.map((slide, i) => renderThumb(slide, i))}
          </div>
        )}

        <div
          className="relative w-full flex-1 min-w-0 overflow-hidden rounded-2xl bg-muted"
          style={{ aspectRatio: '1 / 1' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          aria-label="Product media gallery"
        >
          {showVideo ? (
            <video
              key={current.src}
              src={current.src}
              poster={current.poster ?? undefined}
              controls
              playsInline
              autoPlay
              muted
              loop
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : showImage ? (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label="Tap to zoom image"
              className="absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Image
                key={current.src}
                src={current.src}
                alt={current.alt}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
                fetchPriority="high"
                onError={() => handleImgError(safeIndex)}
                loader={isShopifyImageUrl(current.src) ? shopifyImageLoader : undefined}
              />
            </button>
          ) : (
            <NoImagePlaceholder />
          )}
          
          {stockStatus && (
            <div className="absolute right-3 top-3 rounded-full bg-white/95">
              <StockStatusBadge status={stockStatus} size="sm" />
            </div>
          )}
          
          {showImage && (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label="Open image zoom"
              className="absolute right-2 bottom-2 flex items-center justify-center w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-sm text-stone-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            >
              <ZoomIn size={16} />
            </button>
          )}

          {slides.length > 1 && (
            <>
              <button onClick={goPrev} aria-label="Previous"
                className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm shadow-sm text-stone-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors">
                <ChevronLeft size={18} />
              </button>
              <button onClick={goNext} aria-label="Next"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm shadow-sm text-stone-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors">
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      {slides.length > 1 && (
        <div
          role="tablist"
          aria-label="Media thumbnails"
          className="flex md:hidden xl:flex items-center gap-2 overflow-x-auto scrollbar-none px-0.5 py-0.5"
        >
          {slides.map((slide, i) => renderThumb(slide, i))}
        </div>
      )}

      <ProductImageZoomModal
        isOpen={zoomOpen}
        onClose={() => setZoomOpen(false)}
        images={images}
        currentIndex={isVideo ? 0 : (current?.imageIndex ?? 0)}
        onIndexChange={(i) => setCurrentIndex(i)}
      />
    </div>
  );
}
