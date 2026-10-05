'use client';

import { RotateCcw, ShieldCheck, RefreshCw, Award } from 'lucide-react';

const TRUST_ITEMS = [
  { icon: RotateCcw,   label: '15 Day Exchange' },
  { icon: ShieldCheck, label: '100% Certified' },
  { icon: RefreshCw,   label: 'Lifetime Exchange' },
  { icon: Award,       label: 'One Year Warranty' },
];

const PAYMENT_LOGOS = [
  { src: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Icon_visa.svg', alt: 'Visa' },
  { src: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Icon_mastercard.svg', alt: 'Mastercard' },
  { src: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Icons_rupay.svg', alt: 'RuPay' },
  { src: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Icon_upi.svg', alt: 'UPI' },
];

export default function CheckoutTrustStrip() {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 px-4 py-4 sm:flex-row sm:items-center justify-center sm:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        {TRUST_ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon size={14} className="text-accent shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {label}
            </span>
          </div>
        ))}
      </div>
      {/* <div className="flex items-center gap-3 border-t border-border/60 pt-3 sm:border-t-0 sm:pt-0">
        {PAYMENT_LOGOS.map((logo) => (
          <img
            key={logo.alt}
            src={logo.src}
            alt={logo.alt}
            width={34}
            height={22}
            loading="lazy"
            className="h-5 w-auto object-contain opacity-60 grayscale"
          />
        ))}
      </div> */}
    </section>
  );
}
