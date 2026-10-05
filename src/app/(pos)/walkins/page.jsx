'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Footprints, UserPlus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { StaggerList } from '@/components/shared/StaggerList';
import BottomSheet from '@/components/shared/BottomSheet';
import PillTabs from '@/components/shared/PillTabs';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import CrmLeadsList from '@/components/features/customers/CrmLeadsList';
import WalkInRegisterForm from '@/components/features/customers/WalkInRegisterForm';
import { useCrmVisits } from '@/hooks/customer/useCrmVisits';
import { selectActiveStoreId, selectActiveStoreName } from '@/store/slices/storeSlice';
import { todayDateString } from '@/lib/dateUtils';

const TABS = [
  { key: 'visits', label: 'Visit Log' },
  { key: 'leads',  label: 'Leads' },
];

function fmtVisitedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function VisitRow({ visit }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {visit.customerName ?? 'Unknown customer'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {visit.mobile ?? '—'}{visit.source ? ` · ${visit.source}` : ''}
        </p>
      </div>
      <p className="text-xs text-muted-foreground shrink-0 text-right">
        {fmtVisitedAt(visit.visitedAt)}
      </p>
    </div>
  );
}

export default function WalkInsPage() {
  const companyId   = useSelector(selectActiveStoreId);
  const companyName = useSelector(selectActiveStoreName);

  const [activeTab, setActiveTab] = useState('visits');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const hasFilters = !!fromDate || !!toDate;

  const { visits, isLoading, isError, refetch } = useCrmVisits(companyId);
  
  const filteredVisits = visits.filter((v) => {
    if (!v.visitedAt) return !hasFilters;
    const day = v.visitedAt.slice(0, 10);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return true;
  });

  const handleClearAll = () => {
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Walk-ins</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {companyName ? `Logged for ${companyName}` : 'Logged for the active store'}
          </p>
        </div>
        <Button type="button" onClick={() => setIsRegisterOpen(true)} className="gap-1.5 shrink-0">
          <UserPlus size={16} aria-hidden="true" />
          Register Walk-in
        </Button>
      </div>

      <PillTabs
        tabs={TABS}
        value={activeTab}
        onChange={setActiveTab}
        getKey={(t) => t.key}
        getLabel={(t) => t.label}
      />

      <ErrorBoundary
        resetKey={activeTab}
        fallbackTitle={activeTab === 'leads' ? 'Could not display leads.' : 'Could not display the visit log.'}
      >
        {activeTab === 'leads' ? (
          <CrmLeadsList />
        ) : (
          <>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="date"
                  value={fromDate}
                  max={todayDateString()}
                  onChange={(e) => setFromDate(e.target.value)}
                  aria-label="From date"
                  className="flex-1 min-w-0"
                />
                <span className="text-muted-foreground text-sm shrink-0">to</span>
                <Input
                  type="date"
                  value={toDate}
                  max={todayDateString()}
                  onChange={(e) => setToDate(e.target.value)}
                  aria-label="To date"
                  className="flex-1 min-w-0"
                />
              </div>

              {hasFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  className="gap-1.5 shrink-0 w-full md:w-auto"
                  aria-label="Clear date filter"
                >
                  <X size={14} aria-hidden="true" />
                  Clear
                </Button>
              )}
            </div>

            {!isLoading && !isError && (
              <p className="text-xs text-muted-foreground -mt-1">
                {filteredVisits.length} visit{filteredVisits.length !== 1 ? 's' : ''}{hasFilters ? ' in this range' : ''}
              </p>
            )}

            <StaggerList className="flex flex-col gap-1.5">
              {isLoading ? (
                <InlineLoader label="Loading visits…" />
              ) : isError ? (
                <ErrorState title="Failed to load the visit log." onRetry={() => refetch()} />
              ) : filteredVisits.length === 0 ? (
                <EmptyState
                  icon={Footprints}
                  title={hasFilters ? 'No visits in this range.' : 'No visits logged for this store yet.'}
                />
              ) : (
                filteredVisits.map((visit) => <VisitRow key={visit.visitId} visit={visit} />)
              )}
            </StaggerList>
          </>
        )}
      </ErrorBoundary>

      <BottomSheet
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        title="Register Walk-in"
      >
        <WalkInRegisterForm onRegistered={() => { setIsRegisterOpen(false); setActiveTab('leads'); }} />
      </BottomSheet>
    </div>
  );
}
