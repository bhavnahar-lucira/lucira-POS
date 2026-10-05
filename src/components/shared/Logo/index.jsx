// Single source of truth for all Lucira logo assets.
//
// Variants:
//   variant  'icon' | 'full'          — icon only vs full wordmark
//   color    'brown' | 'white'        — brand brown vs white (for dark backgrounds)
//
// Usage examples:
//   <Logo />                                      — full brown (default)
//   <Logo variant="icon" />                       — brown icon only
//   <Logo variant="full" color="white" />         — white wordmark (sidebar expanded, dark bg)
//   <Logo variant="icon" color="white" />         — white icon only (sidebar collapsed, dark bg)
//   <Logo variant="full" width={160} height={48} />  — custom size

import Image from 'next/image';

const LOGOS = {
  icon: {
    brown: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/dark_brown_Logo_icon_2.svg',
    white: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/footer-logo.svg',
  },
  full: {
    brown: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/logo.svg',
    white: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Lucira_Full_White_logo_1.svg',
  },
};

const DEFAULTS = {
  icon: { width: 40,  height: 40 },
  full: { width: 120, height: 40 },
};

export default function Logo({
  variant   = 'full',
  color     = 'brown',
  width,
  height,
  className = '',
  priority  = true,
}) {
  const src            = LOGOS[variant]?.[color] ?? LOGOS.full.brown;
  const resolvedWidth  = width  ?? DEFAULTS[variant]?.width  ?? 120;
  const resolvedHeight = height ?? DEFAULTS[variant]?.height ?? 40;

  return (
    <div className={className}>
      <Image
        src={src}
        alt="Lucira"
        width={resolvedWidth}
        height={resolvedHeight}
        priority={priority}
        className="object-contain"
        unoptimized
      />
    </div>
  );
}
