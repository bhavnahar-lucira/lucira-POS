'use client';

import { useState } from 'react';
import {
  ShieldCheck, RefreshCw, Truck, Gem,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const WHY_LUCIRA = [
  {
    num: '01',
    title: 'Ethically lab-grown',
    body: 'Every stone is lab-grown, conflict-free, and identical in brilliance to a mined diamond.',
  },
  {
    num: '02',
    title: 'Hand-finished craft',
    body: 'Each piece is finished by master artisans and quality-checked before it reaches you.',
  },
  {
    num: '03',
    title: 'Transparent pricing',
    body: 'See exactly what you pay for — metal, diamond, and making broken down, no hidden markup.',
  },
];

function WhyLuciraSection() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <h2 className="font-heading text-lg text-foreground">Why Lucira</h2>
        <p className="text-sm text-muted-foreground">Three promises behind every piece</p>
      </div>

      <div className="mt-4 grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-y-0 md:gap-6">
        {WHY_LUCIRA.map(({ num, title, body }, i) => (
          <div
            key={num}
            className={`flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0 md:py-0 ${
              i > 0 ? 'md:border-l md:border-border md:pl-6' : ''
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 font-heading text-sm font-bold text-accent">
              {num}
            </span>
            <p className="text-sm font-semibold text-foreground mt-1">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const CERT_BADGES = ['https://cdn.shopify.com/s/files/1/0739/8516/3482/files/IGI.png', 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/SGL_528e2e93-e563-40b6-a8a6-c098475a6de9.png', 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/BIS.png'];

const ACCORDION_ITEMS = [
  {
    id: 'warranty',
    title: 'Warranty & Return Policy',
    body: 'Lucira offers lifetime exchange and a 15-day free return policy. All products come with certified quality assurance.',
    image: [],
    defaultOpen: true,
  },
  {
    id: 'care',
    title: 'Care & Maintenance',
    image: [],
    body: 'Clean your jewelry with a soft cloth and avoid chemicals or perfumes for long-lasting shine.',
  },
  {
    id: 'package',
    title: "What's In The Package",
    image: [
      'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Box.jpg',
      'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Selvet_a9064cb1-d29c-4bd2-a3b6-3f504dd02d9d.jpg',
      'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Thank-You-Card_4d9152e7-daaa-4f9c-9183-3cfbd6620035.jpg'
    ],
    body: 'Your Lucira jewelry piece arrives in a premium jewelry box, accompanied by a soft velvet polishing cloth and a thank-you card, crafted to make every unboxing feel special.',
  },
];

function CertifiedQualityBlock() {
  const [isCertOpen, setIsCertOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-base text-foreground">Certified Quality Guaranteed</h3>
          <button
            type="button"
            onClick={() => setIsCertOpen(true)}
            className="text-xs font-medium text-accent hover:underline"
          >
            See Sample Certificate
          </button>
        </div>
        <div className="flex justify-center items-center gap-6 mt-4">
          {/* unoptimized: fixed, tiny, always-identical badge set — not worth Vercel's optimizer. */}
          {CERT_BADGES.map((label ) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <Image src={label} alt="Certification badge" width={60} height={60} unoptimized loading="lazy" fetchPriority="low" />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4 leading-relaxed text-center">
          <span className="font-semibold text-foreground">Note:</span> Handcrafted and personalized with care — slight variations in metal weight are natural across different sizes.
        </p>
      </div>

      <Dialog open={isCertOpen} onOpenChange={setIsCertOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Sample Certificate</DialogTitle>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl">
            <Image
              src="/images/certificate/SampleCertificate.jpg"
              alt="Sample Certificate"
              fill
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <Accordion
          type="multiple"
          defaultValue={ACCORDION_ITEMS.filter((item) => item.defaultOpen).map((item) => item.id)}
        >
          {ACCORDION_ITEMS.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>{item.title}</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-3 pb-4">
                {item.image.length > 0 && (
                  <div className="flex items-center justify-start gap-3">
                    {/* unoptimized: same reasoning as CERT_BADGES above. */}
                    {item.image.map((src) => (
                      <Image key={src} src={src} alt="" width={80} height={80} className="rounded-xl" unoptimized loading="lazy" fetchPriority="low" />
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.body}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}

export default function ProductTrustSection() {
  return (
    <div className="flex flex-col gap-4">
      <WhyLuciraSection />
      <CertifiedQualityBlock />
    </div>
  );
}
