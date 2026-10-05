'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const COLORS = ['#B77767', '#AF7C3E', '#189351', '#5A413F', '#F4E7DE'];
const PARTICLE_COUNT = 70;
const DURATION_MS = 2700;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x:        randomBetween(0, 100), // vw, spread across full width
    delay:    randomBetween(0, 0.5),
    duration: randomBetween(2, 2.5),
    rotate:   randomBetween(-360, 360),
    drift:    randomBetween(-60, 60), // px of horizontal sway while falling
    size:     randomBetween(6, 11),
    color:    COLORS[i % COLORS.length],
    round:    i % 3 === 0,
  }));
}

/**
 * @param {{ onDone?: () => void }} props
 */
export default function Confetti({ onDone }) {
  const reduceMotion = useReducedMotion();
  const [particles] = useState(() => (reduceMotion ? [] : makeParticles()));

  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), particles.length ? DURATION_MS : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!particles.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-100 overflow-hidden"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0"
          style={{
            left:            `${p.x}vw`,
            width:           p.size,
            height:          p.size,
            backgroundColor: p.color,
            borderRadius:    p.round ? '50%' : 2,
          }}
          initial={{ y: -20, x: 0, opacity: 1, rotate: 0 }}
          animate={{
            y:       '110vh',
            x:       p.drift,
            opacity: [1, 1, 0],
            rotate:  p.rotate,
          }}
          transition={{
            duration: p.duration,
            delay:    p.delay,
            ease:     [0.4, 0, 0.6, 1],
          }}
        />
      ))}
    </div>
  );
}
