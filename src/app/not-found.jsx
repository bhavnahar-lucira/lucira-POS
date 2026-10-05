'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { Gem, ArrowLeft, ShoppingBag } from 'lucide-react';
import Diamond from '@/components/shared/icons/BrandDiamond';
import { Button } from '@/components/ui/button';
import { EASE_PREMIUM, DURATION } from '@/lib/motion';

const STONES = [
  { Icon: Diamond, size: 30, top: '2%',  left: '14%', duration: 5.5, delay: 0,   rotate: -14 },
  { Icon: Gem,     size: 56, top: '18%', left: '46%', duration: 6.5, delay: 0.4, rotate: 10  },
  { Icon: Diamond, size: 22, top: '6%',  left: '76%', duration: 4.8, delay: 0.9, rotate: 18  },
];

function ScatteredStones({ reduceMotion }) {
  return (
    <div className="relative h-28 w-72" aria-hidden="true">
      {STONES.map(({ Icon, size, top, left, duration, delay, rotate }, i) => (
        <motion.div
          key={i}
          className="absolute text-accent drop-shadow-sm"
          style={{ top, left }}
          initial={reduceMotion ? undefined : { opacity: 0, y: -16, rotate: 0 }}
          animate={reduceMotion ? { opacity: 1 } : {
            opacity: 1,
            y: [0, -10, 0],
            rotate: [rotate, rotate + 8, rotate],
          }}
          transition={reduceMotion ? { duration: 0.4 } : {
            opacity: { duration: 0.6, delay },
            y:      { duration, repeat: Infinity, ease: 'easeInOut', delay },
            rotate: { duration, repeat: Infinity, ease: 'easeInOut', delay },
          }}
        >
          <Icon size={size} strokeWidth={1.25} fill={Icon === Diamond ? 'currentColor' : 'none'} />
        </motion.div>
      ))}
    </div>
  );
}

function GemWatermark({ reduceMotion }) {
  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 top-1/2 text-primary"
      style={{ x: '-50%', y: '-50%' }}
      animate={reduceMotion ? undefined : { rotate: 360 }}
      transition={reduceMotion ? undefined : { duration: 90, repeat: Infinity, ease: 'linear' }}
      aria-hidden="true"
    >
      <Gem size={620} strokeWidth={0.5} className="opacity-[0.05]" />
    </motion.div>
  );
}

export default function NotFound() {
  const reduceMotion = useReducedMotion();
  const fadeUp = reduceMotion ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-grad-corner-wash" aria-hidden="true" />
      <GemWatermark reduceMotion={reduceMotion} />

      <div className="relative flex flex-col items-center gap-6">
        <motion.div {...fadeUp} transition={{ duration: DURATION.panel, ease: EASE_PREMIUM }}>
          <ScatteredStones reduceMotion={reduceMotion} />
        </motion.div>

        <motion.div
          className="flex flex-col items-center gap-3"
          {...fadeUp}
          transition={{ duration: DURATION.panel, ease: EASE_PREMIUM, delay: 0.1 }}
        >
          <h1
            className="animate-shimmer-text bg-clip-text text-8xl font-bold tracking-tight text-transparent"
            style={{
              backgroundImage: 'linear-gradient(100deg, var(--primary) 20%, var(--accent) 45%, var(--status-made-order) 60%, var(--primary) 85%)',
            }}
          >
            404
          </h1>
          <p className="text-lg font-medium text-foreground">
            A few stones have come loose.
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            The page you&apos;re looking for may have been moved, renamed, or doesn&apos;t exist.
          </p>
        </motion.div>

        <motion.div
          className="flex flex-wrap items-center justify-center gap-3"
          {...fadeUp}
          transition={{ duration: DURATION.panel, ease: EASE_PREMIUM, delay: 0.2 }}
        >
          <Button asChild size="lg">
            <Link href="/dashboard">
              <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
              Back to Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/catalog">
              <ShoppingBag size={16} className="mr-2" aria-hidden="true" />
              Browse Catalog
            </Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
