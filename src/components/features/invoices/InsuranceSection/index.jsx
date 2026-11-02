'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, ShieldCheck, ShieldPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useInvoiceInsurance } from '@/hooks/invoices/useInvoiceInsurance';
import { useGenerateInsurance } from '@/hooks/invoices/useGenerateInsurance';
import { lineItemKey } from '@/lib/olocker/buildTagList';
import { formatAmountOrNull as formatCurrency } from '@/lib/priceUtils';

/**
 * One already-issued policy.
 *
 * `showLink` is decided by the caller, not by whether this row has a url:
 * every policy issued in the same generatePolicies call comes back with
 * the SAME url, because Olocker's certificate is one PDF covering that
 * whole call (confirmed live 2026-10-31 — two policies, two urls, byte
 * -identical documents listing both). Rendering a "Certificate" link on
 * each row would be several identical links to one document.
 */
function PolicyRow({ policy, showLink }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-foreground/80">
          {policy.item_name
            || (policy.inv_itemsrno ? `Item ${policy.inv_itemsrno}` : 'Unmatched item')}
        </p>
        <p className="truncate text-xs text-muted-foreground">{policy.policy}</p>
      </div>
      {policy.url && showLink && (
        <a
          href={policy.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Certificate
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

/**
 * Olocker insurance for one posted invoice.
 *
 * Opt-in is per item and captured here, at generation time, rather than on
 * the invoice itself — the customer decides when the bill is in front of
 * them, and nothing about the invoice has to change to record it.
 *
 * @param {{ raw: object }} props — the Invoice/Retrieve Entity
 */
export default function InsuranceSection({ raw }) {
  const transactionId = raw?.transaction_id ?? null;
  const { policies, unattributed, isLoading } = useInvoiceInsurance(transactionId);
  const generate = useGenerateInsurance();
  const [isPicking, setIsPicking] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const insuredKeys = useMemo(
    () => new Set(policies.map((p) => String(p.key))),
    [policies],
  );

  const uninsured = useMemo(() => {
    const lines = Array.isArray(raw?.line_items) ? raw.line_items : [];
    return lines
      .map((item, index) => ({ item, index, key: lineItemKey(item, index) }))
      .filter((line) => !insuredKeys.has(line.key));
  }, [raw, insuredKeys]);

  if (!transactionId || isLoading) return null;

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openPicker = () => {
    // Pre-ticking everything matches the common case (customer opts in for
    // the whole bill) while leaving the operator free to untick.
    setSelected(new Set(uninsured.map((line) => line.key)));
    setIsPicking(true);
  };

  const submit = async () => {
    await generate.mutateAsync({
      transactionId,
      itemKeys: [...selected],
    });
    setIsPicking(false);
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col gap-3">
      {policies.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldCheck size={13} />
            Insured ({policies.length})
          </span>
          {policies.map((policy, i) => (
            <PolicyRow
              key={policy.policy}
              policy={policy}
              // First row for each distinct certificate carries the link.
              showLink={policies.findIndex((p) => p.url === policy.url) === i}
            />
          ))}
        </div>
      )}

      {unattributed && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-700 dark:text-amber-500">
            A policy on this invoice could not be matched to an item. Check it in Olocker
            before generating any more.
          </p>
        </div>
      )}

      {uninsured.length > 0 && !isPicking && !unattributed && (
        <Button variant="outline" className="w-full gap-2" onClick={openPicker}>
          <ShieldPlus size={16} />
          Generate Insurance
        </Button>
      )}

      {isPicking && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Generate Insurance</p>
          <p className="text-xs text-muted-foreground">
            Select the items the customer has opted in for.
          </p>

          <div className="flex flex-col gap-2">
            {uninsured.map(({ item, key }) => (
              <label key={key} className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(key)}
                  onCheckedChange={() => toggle(key)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground/80">{item.item_name}</span>
                  {item.item_code && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.item_code}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-medium text-foreground">
                  {formatCurrency(item.gross_amount ?? item.net_amount)}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-1 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={generate.isPending || selected.size === 0}
              onClick={submit}
            >
              {generate.isPending ? 'Generating…' : `Insure ${selected.size} item${selected.size === 1 ? '' : 's'}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={generate.isPending}
              onClick={() => setIsPicking(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
