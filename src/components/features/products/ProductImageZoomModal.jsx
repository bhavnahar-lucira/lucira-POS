'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/ui/useBodyScrollLock';

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   images: Array<{ src: string, alt: string }>,
 *   currentIndex: number,
 *   onIndexChange: (index: number) => void,
 * }} props
 */
export default function ProductImageZoomModal({
  isOpen,
  onClose,
  images = [],
  currentIndex,
  onIndexChange,
}) {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const current = images[currentIndex];
  if (!current?.src) return null;

  const goPrev = () => onIndexChange(currentIndex === 0 ? images.length - 1 : currentIndex - 1);
  const goNext = () => onIndexChange(currentIndex === images.length - 1 ? 0 : currentIndex + 1);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zoomed product image"
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-sm text-white/60">
          {images.length > 1 ? `${currentIndex + 1} / ${images.length}` : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close zoom"
          className="flex items-center justify-center w-10 h-10 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        <TransformWrapper
          key={current.src}
          initialScale={1}
          minScale={1}
          maxScale={4}
          doubleClick={{ mode: 'toggle' }}
          panning={{ velocityDisabled: true }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.src}
                  alt={current.alt ?? 'Product image'}
                  className="max-h-full max-w-full object-contain select-none"
                  draggable={false}
                />
              </TransformComponent>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-2 py-2">
                <button type="button" onClick={() => zoomOut()} aria-label="Zoom out"
                  className="flex items-center justify-center w-9 h-9 rounded-full text-white/80 hover:bg-white/10 transition-colors">
                  <ZoomOut size={18} />
                </button>
                <button type="button" onClick={() => resetTransform()} aria-label="Reset zoom"
                  className="flex items-center justify-center w-9 h-9 rounded-full text-white/80 hover:bg-white/10 transition-colors">
                  <RotateCcw size={16} />
                </button>
                <button type="button" onClick={() => zoomIn()} aria-label="Zoom in"
                  className="flex items-center justify-center w-9 h-9 rounded-full text-white/80 hover:bg-white/10 transition-colors">
                  <ZoomIn size={18} />
                </button>
              </div>
            </>
          )}
        </TransformWrapper>

        {images.length > 1 && (
          <>
            <button type="button" onClick={goPrev} aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={goNext} aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors">
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      <p className="text-center text-xs text-white/40 py-3 shrink-0">
        Pinch or scroll to zoom · Double-tap to reset · Drag to pan
      </p>
    </div>,
    document.body
  );
}
