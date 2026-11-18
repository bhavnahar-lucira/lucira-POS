'use client';

import { useState } from 'react';
import BottomSheet from '@/components/shared/BottomSheet';
import PhoneLink from '@/components/shared/PhoneLink';
import { formatAmountOrDash as formatCurrency } from '@/lib/priceUtils';
import { formatDateNumeric, formatDateTime } from '@/lib/dateUtils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  User,
  Store,
  Compass,
  Calendar,
  Sparkles,
  Coins,
  MapPin,
  Gift,
  Cake,
  TrendingUp,
  Tag,
  Clock,
  Building2,
  CalendarCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function StageBadge({ stage }) {
  if (!stage) return null;
  const s = stage.toLowerCase();
  let color = 'bg-muted text-muted-foreground border-border';

  if (s.includes('won') || s.includes('converted')) {
    color = 'bg-status-in-stock/10 text-status-in-stock border-status-in-stock/20';
  } else if (s.includes('lost') || s.includes('junk') || s.includes('not interested')) {
    color = 'bg-destructive/10 text-destructive border-destructive/20';
  } else if (s.includes('negotiation') || s.includes('proposal') || s.includes('decision')) {
    color = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  } else if (s.includes('qualif') || s.includes('contact') || s.includes('lead') || s.includes('new')) {
    color = 'bg-primary/10 text-primary border-primary/20';
  }

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', color)}>
      {stage}
    </span>
  );
}

function DealScoreBadge({ score }) {
  if (score == null) return null;
  let bg = 'bg-muted text-muted-foreground';
  let label = 'Cold';

  if (score >= 70) {
    bg = 'bg-status-in-stock/15 text-status-in-stock font-bold';
    label = 'Hot';
  } else if (score >= 40) {
    bg = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium';
    label = 'Warm';
  }

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs', bg)}>
      <Sparkles size={11} aria-hidden="true" />
      Score: {score} ({label})
    </span>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 border-b border-border/60 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon size={14} className="text-primary shrink-0" aria-hidden="true" />}
        <span>{title}</span>
      </div>
      <div className="flex flex-col gap-2 pt-1">{children}</div>
    </div>
  );
}

function Row({ label, value, isPhone = false, highlight = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right font-medium text-foreground min-w-0 break-words', highlight && 'text-primary font-semibold')}>
        {isPhone ? <PhoneLink phone={value} /> : value}
      </span>
    </div>
  );
}

export default function DealDetailSheet({ deal, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('clienteling');

  if (!deal) return null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={deal.dealName}
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-4 text-sm pb-6">
        {/* Header Hero Banner */}
        <div className="flex flex-col gap-2.5 rounded-xl bg-muted/60 p-4 border border-border">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Zoho CRM Lead #{deal.id}</p>
              <h3 className="font-heading text-lg font-bold text-foreground mt-0.5">{deal.dealName}</h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Commercial / Est.</span>
              <p className="text-base font-bold text-primary tabular-nums">
                {deal.amount ? formatCurrency(deal.amount) : '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StageBadge stage={deal.stage} />
            <DealScoreBadge score={deal.dealScore} />
            {deal.intentStage && (
              <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground/80 font-medium">
                Intent: {deal.intentStage}
              </span>
            )}
            {deal.purchaseReason && (
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
                <Gift size={11} />
                {deal.purchaseReason}
              </span>
            )}
            {deal.schemeMonthlyAmount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                <Coins size={11} />
                Gold Scheme: ₹{deal.schemeMonthlyAmount.toLocaleString('en-IN')}/mo
              </span>
            )}
          </div>
        </div>

        {/* Tab-Wise Detail View */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto gap-1 p-1 bg-muted/80 rounded-xl">
            <TabsTrigger value="clienteling" className="text-xs font-medium py-1.5 px-2">
              Customer
            </TabsTrigger>
            <TabsTrigger value="store" className="text-xs font-medium py-1.5 px-2">
              Store & Staff
            </TabsTrigger>
            <TabsTrigger value="scheme" className="text-xs font-medium py-1.5 px-2">
              Scheme
            </TabsTrigger>
            <TabsTrigger value="attribution" className="text-xs font-medium py-1.5 px-2">
              Attribution
            </TabsTrigger>
            <TabsTrigger value="address" className="text-xs font-medium py-1.5 px-2">
              Location
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Customer & Clienteling */}
          <TabsContent value="clienteling" className="flex flex-col gap-3 pt-2">
            <Section title="Contact Information" icon={User}>
              <Row label="Customer Name" value={deal.contactName} />
              <Row label="Mobile Phone" value={deal.mobile} isPhone />
              <Row label="Alternate Mobile" value={deal.alternateMobile} isPhone />
              <Row label="Email Address" value={deal.email} />
              <Row label="Account / Company" value={deal.connectedTo} />
            </Section>

            <Section title="Jewelry Buying Intent & Milestones" icon={Gift}>
              <Row label="Purchase Reason" value={deal.purchaseReason} highlight />
              <Row label="Intent Stage" value={deal.intentStage} />
              <Row label="Customer Birthday" value={deal.birthday ? formatDateNumeric(deal.birthday) : null} />
              <Row label="Anniversary" value={deal.anniversary ? formatDateNumeric(deal.anniversary) : null} />
              <Row label="Engagement Score" value={deal.dealScore != null ? `${deal.dealScore} / 100` : null} />
              <Row label="Total Activities Logged" value={deal.numberOfActivity} />
            </Section>

            {deal.description && (
              <Section title="Staff Notes & Preferences" icon={Tag}>
                <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {deal.description}
                </p>
              </Section>
            )}
          </TabsContent>

          {/* TAB 2: Store & Staff Allocation */}
          <TabsContent value="store" className="flex flex-col gap-3 pt-2">
            <Section title="Store Assignment" icon={Store}>
              <Row label="Assigned Store" value={deal.storeAssigned || 'Unassigned'} highlight />
              <Row label="Store Executive" value={deal.storeExecutive || 'Not specified'} />
              <Row label="Allocation Method" value={deal.allocationType} />
              <Row label="Assignment Status" value={deal.assignmentStatus} />
              <Row label="Assigned At" value={deal.assignedAt ? formatDateTime(deal.assignedAt) : null} />
              <Row label="Record Owner" value={deal.dealOwner} />
              <Row label="Owner Email" value={deal.dealOwnerEmail} />
            </Section>

            {deal.appointmentDateTime && (
              <Section title="Store Visit Appointment" icon={CalendarCheck}>
                <Row label="Appointment Date & Time" value={formatDateTime(deal.appointmentDateTime)} highlight />
                <Row label="Scheduled Store" value={deal.storeAssigned} />
              </Section>
            )}

            <Section title="Commercial Pipeline" icon={TrendingUp}>
              <Row label="Pipeline Value" value={deal.amount ? formatCurrency(deal.amount) : '—'} />
              <Row label="Expected Revenue" value={deal.expectedRevenue ? formatCurrency(deal.expectedRevenue) : null} />
              <Row label="Closing Probability" value={deal.probability != null ? `${deal.probability}%` : null} />
              <Row label="Expected Closing Date" value={deal.closingDate ? formatDateNumeric(deal.closingDate) : null} />
              <Row label="Next Step Action" value={deal.nextStep} />
              {deal.reasonForLoss && <Row label="Loss Reason" value={deal.reasonForLoss} />}
            </Section>
          </TabsContent>

          {/* TAB 3: Jewelry Savings Scheme */}
          <TabsContent value="scheme" className="flex flex-col gap-3 pt-2">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-xs uppercase tracking-wider border-b border-amber-500/20 pb-2">
                <Coins size={15} />
                <span>Lucira Jewelry Savings Plan</span>
              </div>

              {deal.schemeId || deal.schemeMonthlyAmount ? (
                <>
                  <Row label="Scheme ID" value={deal.schemeId} />
                  <Row
                    label="Monthly Contribution"
                    value={deal.schemeMonthlyAmount ? `₹${deal.schemeMonthlyAmount.toLocaleString('en-IN')}` : null}
                    highlight
                  />
                  <Row label="Enrollment Code" value={deal.enrollmentCode} />
                  <Row label="Next Installment Due" value={deal.schemeDueDate ? formatDateNumeric(deal.schemeDueDate) : null} />
                </>
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No active jewelry savings scheme enrolled for this lead.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 4: Marketing & Campaign Attribution */}
          <TabsContent value="attribution" className="flex flex-col gap-3 pt-2">
            <Section title="UTM Parameters & Digital Source" icon={Compass}>
              <Row label="UTM Source" value={deal.utmSource} highlight />
              <Row label="UTM Campaign" value={deal.utmCampaign} />
              <Row label="UTM Medium" value={deal.utmMedium} />
              <Row label="Lead Source" value={deal.leadSource} />
              <Row label="Campaign Source" value={deal.campaignSource} />
              <Row label="Trigger Event" value={deal.dealTriggerEvent} />
              <Row label="Meta Social Lead ID" value={deal.socialLeadId} />
            </Section>

            <Section title="Attribution Timeline" icon={Clock}>
              <Row label="Lead Created" value={deal.createdTime ? formatDateTime(deal.createdTime) : null} />
              <Row label="Created By" value={deal.createdBy} />
              <Row label="First Web Activity" value={deal.firstActivityDate ? formatDateNumeric(deal.firstActivityDate) : null} />
              <Row label="Last Customer Activity" value={deal.lastActivityDate || deal.lastActivityTime ? formatDateTime(deal.lastActivityTime || deal.lastActivityDate) : null} />
              <Row label="Last Record Update" value={deal.modifiedTime ? formatDateTime(deal.modifiedTime) : null} />
            </Section>
          </TabsContent>

          {/* TAB 5: Address & Coordinates */}
          <TabsContent value="address" className="flex flex-col gap-3 pt-2">
            <Section title="Customer Address" icon={MapPin}>
              <Row label="Flat / Building" value={deal.addressFlat} />
              <Row label="Street Address" value={deal.addressStreet} />
              <Row label="City" value={deal.addressCity} />
              <Row label="State / Province" value={deal.addressState} />
              <Row label="Postal / ZIP Code" value={deal.addressZip} />
              <Row label="Country" value={deal.addressCountry} />
              <Row label="Full Formatted Address" value={deal.fullAddress} />
              {deal.addressCoordinates && <Row label="Geo Coordinates" value={deal.addressCoordinates} />}
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </BottomSheet>
  );
}
