'use client';

// Dual-thumb range slider — two overlaid native <input type="range">
// (see globals.css's .pos-range-slider rules for the overlay technique).
// Deliberately not a new dependency: no slider primitive existed in this
// app already, and a plain double range input covers exactly this one case.

export default function RangeSlider({ min, max, value, onChange, formatValue = (n) => n }) {
  const [lo, hi] = value;
  const pct = (n) => (max > min ? ((n - min) / (max - min)) * 100 : 0);

  const handleLoChange = (e) => {
    const next = Math.min(Number(e.target.value), hi);
    onChange(next, hi);
  };
  const handleHiChange = (e) => {
    const next = Math.max(Number(e.target.value), lo);
    onChange(lo, next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="pos-range-slider">
        <div className="pos-range-slider-track" />
        <div className="pos-range-slider-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" min={min} max={max} value={lo} onChange={handleLoChange} aria-label="Minimum price" />
        <input type="range" min={min} max={max} value={hi} onChange={handleHiChange} aria-label="Maximum price" />
      </div>
      <div className="flex items-center justify-between text-sm text-foreground">
        <span>{formatValue(lo)}</span>
        <span>{formatValue(hi)}</span>
      </div>
    </div>
  );
}
