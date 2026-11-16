'use client';

import { useState } from 'react';
import { Package, Users, Footprints, FileText, ShoppingBag, Calendar, Phone } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import PillTabs from '@/components/shared/PillTabs';
import EmptyState from '@/components/shared/EmptyState';
import PhoneLink from '@/components/shared/PhoneLink';
import { Badge } from '@/components/ui/badge';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatDateNumeric } from '@/lib/dateUtils';

function formatINR(val) {
  if (val == null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

const TABS = [
  { key: 'categories', label: 'Categories' },
  { key: 'customers',  label: 'Customers Sold' },
  { key: 'walkins',    label: 'Walk-ins' },
];

function StatCard({ label, value, subtext }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3 shadow-xs">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-base font-bold text-foreground tabular-nums">{value}</span>
      {subtext && <span className="text-xs text-muted-foreground">{subtext}</span>}
    </div>
  );
}

export default function JewelryConsultantDetailSheet({ consultant, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('categories');

  if (!consultant) return null;

  const categories = consultant.categories_breakdown ?? [];
  const customers = consultant.customers_sold ?? [];
  const walkins = consultant.walkin_customers ?? [];

  const totalSales = Number(consultant.net_amount) || Number(consultant.invoice_value) || 1;

  const tabsWithCounts = [
    { key: 'categories', label: `Categories (${categories.length})` },
    { key: 'customers',  label: `Customers Sold (${customers.length})` },
    { key: 'walkins',    label: `Walk-ins Attended (${walkins.length})` },
  ];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={consultant.employee_name || 'Jewelry Consultant Details'}
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        {/* Consultant subtitle */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground -mt-2">
          {consultant.employee_code && (
            <Badge variant="outline" className="font-mono text-[11px]">
              Code: {consultant.employee_code}
            </Badge>
          )}
          {consultant.company_code && (
            <span>
              Store: <strong>{consultant.company_code}</strong> {consultant.mailing_name ? `(${consultant.mailing_name})` : ''}
            </span>
          )}
        </div>

        {/* Customer names attended callout */}
        {consultant.attended_customers && consultant.attended_customers !== '—' && (
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs">
            <Users size={14} className="shrink-0 text-primary mt-0.5" />
            <div className="min-w-0">
              <span className="font-semibold text-foreground mr-1">Customers Attended:</span>
              <span className="text-muted-foreground">{consultant.attended_customers}</span>
            </div>
          </div>
        )}

        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard
            label="Total Sales"
            value={formatINR(consultant.net_amount)}
            subtext={consultant.pieces ? `${consultant.pieces} pcs` : undefined}
          />
          <StatCard
            label="Invoices & MTO"
            value={`${consultant.invoice_count ?? 0} Inv · ${consultant.mto_count ?? 0} MTO`}
            subtext={formatINR((Number(consultant.invoice_value) || 0) + (Number(consultant.mto_value) || 0))}
          />
          <StatCard
            label="Customers Sold"
            value={`${consultant.buyers_count ?? 0} buyers`}
            subtext="Purchased in period"
          />
          <StatCard
            label="Walk-ins Attended"
            value={`${consultant.walkin_count ?? 0} visits`}
            subtext="Attended in period"
          />
        </div>

        {/* Tabs */}
        <PillTabs
          tabs={tabsWithCounts}
          value={activeTab}
          onChange={setActiveTab}
        />

        {/* Tab 1: Categories Breakdown */}
        {activeTab === 'categories' && (
          <div className="flex flex-col gap-2">
            {categories.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No product categories sold"
                description="No specific product categories were recorded under this consultant in the selected period."
              />
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {categories.map((cat) => {
                  const pct = Math.min(100, Math.round(((cat.total_value || 0) / totalSales) * 100));
                  return (
                    <div key={cat.category} className="flex flex-col gap-1.5 p-3.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                            {cat.category[0]}
                          </span>
                          <span className="font-semibold text-sm text-foreground truncate">{cat.category}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            ({cat.pieces} pc{cat.pieces !== 1 ? 's' : ''})
                          </span>
                        </div>
                        <span className="text-sm font-bold text-foreground tabular-nums shrink-0">
                          {formatINR(cat.total_value)}
                        </span>
                      </div>
                      {/* Visual contribution bar */}
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Customers Sold To */}
        {activeTab === 'customers' && (
          <div className="flex flex-col gap-2.5">
            {customers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No customer purchases recorded"
                description="No customer sales were recorded under this consultant in the selected period."
              />
            ) : (
              customers.map((c, i) => (
                <div
                  key={`${c.document_no}-${i}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{c.customer_name || 'Customer'}</p>
                      {c.customer_mobile && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Phone size={12} className="shrink-0 text-muted-foreground/70" />
                          <PhoneLink phone={c.customer_mobile} />
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-foreground tabular-nums block">
                        {formatINR(c.total_amount)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {c.items_count} item{c.items_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-dashed border-border text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={c.document_type === 'order' ? 'secondary' : 'default'} className="text-[10px] uppercase">
                        {c.document_type === 'order' ? 'MTO Order' : 'Invoice'}
                      </Badge>
                      <span className="font-mono">{c.document_no}</span>
                    </div>
                    {c.document_date && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <Calendar size={11} className="shrink-0" />
                        {formatDateNumeric(c.document_date)}
                      </span>
                    )}
                  </div>

                  {c.categories?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.categories.map((cat) => (
                        <span
                          key={cat}
                          className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Walk-ins Attended */}
        {activeTab === 'walkins' && (
          <div className="flex flex-col gap-2.5">
            {walkins.length === 0 ? (
              <EmptyState
                icon={Footprints}
                title="No walk-ins attended"
                description="No walk-in visits were registered under this consultant in the selected period."
              />
            ) : (
              walkins.map((w, i) => (
                <div
                  key={`${w.visit_id ?? w.mobile ?? i}-${i}`}
                  className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{w.customer_name || 'Walk-in Visitor'}</p>
                      {w.mobile && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Phone size={12} className="shrink-0 text-muted-foreground/70" />
                          <PhoneLink phone={w.mobile} />
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-foreground">{w.visited_on || '—'}</p>
                      {w.visited_time && <p className="text-[11px] text-muted-foreground">{w.visited_time}</p>}
                    </div>
                  </div>

                  {(w.source || w.notes) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-border text-xs">
                      {w.source && (
                        <Badge variant="outline" className="text-[10px]">
                          {w.source}
                        </Badge>
                      )}
                      {w.notes && (
                        <span className="text-muted-foreground italic truncate max-w-xs">{w.notes}</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
