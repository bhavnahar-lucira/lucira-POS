'use client';

// Reusable bottom sheet / side sheet primitive — right-side drawer on
// tablet (md+), bottom sheet on mobile. Animated in/out via Framer Motion
// (AnimatePresence), sliding on whichever axis matches the active layout.
//
// Props: isOpen, onClose, title, children, footer? (sticky footer node),
// maxWidth? (Tailwind max-w class for the side sheet, default 'max-w-md'),
// alwaysBottom? (default false — when true, keeps the bottom-sheet
// presentation at every width instead of switching to the md+ side drawer;
// added for ProductCard's "View Similar" sheet, which is explicitly a
// bottom sheet on desktop/tablet/mobile alike, not a side panel).
//
// PORTALED TO document.body (2026-09-16) — `position: fixed` is positioned
// relative to the nearest ancestor with its OWN CSS `transform`, not the
// viewport, the instant one exists. A card that triggers this sheet from
// inside a Swiper carousel (RecentlyViewedCarousel, SimilarProductsCarousel)
// sits under Swiper's own `.swiper-wrapper`, which always carries
// `transform: translate3d(...)` — without the portal, the sheet opened
// clipped/mispositioned inside that narrow slide instead of over the whole
// screen (reported as "View Similar doesn't work properly" on the product
// detail page). Rendering into document.body sidesteps every ancestor's
// transform, no matter where the trigger lives in the tree.

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/ui/useMediaQuery';
import { useBodyScrollLock } from '@/hooks/ui/useBodyScrollLock';
import { cn } from '@/lib/utils';
import { EASE_PREMIUM, DURATION } from '@/lib/motion';

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  footerClassName,
  maxWidth = 'max-w-md',
  alwaysBottom = false,
}) {
  const sheetRef = useRef(null);
  const isDesktop = useMediaQuery('(min-width: 768px)') && !alwaysBottom; // keep in sync with the md: breakpoint below
  const reduceMotion = useReducedMotion();

  useBodyScrollLock(isOpen); // prevents layout shift on open/close — see hook's own header

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && sheetRef.current) sheetRef.current.focus();
  }, [isOpen]);

  const offAxis = isDesktop ? { x: '100%' } : { y: '100%' };
  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, ...offAxis },
        animate: { opacity: 1, x: 0, y: 0 },
        exit: { opacity: 0, ...offAxis },
      };

  // document doesn't exist during SSR — isOpen is always false on the
  // server (a sheet only ever opens from a later user action), so this
  // never hides an already-open sheet; matches ProductImageZoomModal's
  // identical guard for the same reason.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            aria-hidden="true"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.standard }}
          />

          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`
              fixed z-50 shadow-2xl flex flex-col outline-none
              bg-card

              /* Mobile — bottom sheet (and every width, when alwaysBottom) */
              bottom-0 left-0 right-0
              rounded-t-2xl max-h-[85vh]

              /* Tablet — side sheet, unless alwaysBottom keeps this a bottom sheet */
              ${alwaysBottom ? '' : `
                md:bottom-0 md:top-0 md:left-auto md:right-0
                md:rounded-none md:rounded-l-2xl
                md:h-full md:max-h-full md:w-full ${maxWidth}
              `}
            `}
            {...panelMotion}
            transition={{ duration: DURATION.panel, ease: EASE_PREMIUM }}
          >
            <div className="flex items-center justify-between px-3 pt-3 pb-2.5 sm:px-5 sm:pt-5 sm:pb-4 border-b border-border shrink-0">
              {/* Visual uppercase only — aria-label above keeps the real-case title for screen readers. */}
              <h2 className="text-base font-bold uppercase tracking-wide text-foreground">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="
                  sm:min-w-11 sm:min-h-11 min-w-8 min-h-8 flex items-center justify-center
                  rounded-full text-muted-foreground
                  hover:text-foreground hover:bg-secondary
                  transition-colors duration-standard ease-premium
                "
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-5">
              {children}
            </div>

            {footer && (
              <div className={cn('shrink-0 sm:px-5 sm:py-4 px-3 py-2 border-t border-border', footerClassName)}>
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
