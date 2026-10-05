'use client';

import { Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useIsWishlisted, useToggleWishlist } from '@/hooks/products/useWishlist';
import { EASE_PREMIUM } from '@/lib/motion';

export default function WishlistButton({ product, reduceMotion, className }) {
  const isWishlisted = useIsWishlisted(product.item_id, product.item_size_id ?? null);
  const toggleWishlist = useToggleWishlist();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleWishlist(product);
      }}
      aria-label={isWishlisted ? `Remove ${product.item_name ?? 'item'} from wishlist` : `Add ${product.item_name ?? 'item'} to wishlist`}
      aria-pressed={isWishlisted}
      className={
        className ??
        'absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-card/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
      }
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        <AnimatePresence initial={false} mode="wait">
          {isWishlisted ? (
            <motion.span
              key="filled"
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: reduceMotion ? 1 : [0, 1.35, 1] }}
              exit={{ scale: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE_PREMIUM }}
              className="flex items-center justify-center"
            >
              <Heart size={16} className="fill-status-error text-status-error" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="outline"
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_PREMIUM }}
              className="flex items-center justify-center"
            >
              <Heart size={16} className="text-muted-foreground" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}
