'use client';

// Live walk-in leads — Services/CRM/Customer/List, fetched fresh every visit
// (no local DB, see useCrmLeads.js's own header). Read-only: leadId is a
// customer_id, a CRM-level identity distinct from a billing party_id — same
// rule normalizeWalkInCustomer already documents for the visit-log page.

import { Users } from 'lucide-react';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { StaggerList } from '@/components/shared/StaggerList';
import { useCrmLeads } from '@/hooks/customer/useCrmLeads';
import { formatDateNumeric } from '@/lib/dateUtils';

function LeadRow({ lead }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground truncate">{lead.name ?? 'Unknown'}</p>
        <p className="text-xs text-muted-foreground shrink-0">
          {lead.createdAt ? formatDateNumeric(lead.createdAt) : '—'}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{lead.mobile ?? '—'}</p>
      {(lead.budget || lead.notes) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground/80 mt-1">
          {lead.budget && <span>Budget: ₹{lead.budget.toLocaleString('en-IN')}</span>}
          {lead.notes && <span className="truncate">{lead.notes}</span>}
        </div>
      )}
    </div>
  );
}

export default function CrmLeadsList() {
  const { leads, isLoading, isError, refetch } = useCrmLeads();

  if (isLoading) return <InlineLoader label="Loading leads…" />;
  if (isError)   return <ErrorState title="Failed to load leads." onRetry={() => refetch()} />;
  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No walk-in leads yet."
        description="A lead appears here once registered via the Register Walk-in form."
      />
    );
  }

  return (
    <StaggerList className="flex flex-col gap-1.5">
      {leads.map((lead) => <LeadRow key={lead.leadId} lead={lead} />)}
    </StaggerList>
  );
}
