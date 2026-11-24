'use client';

import BottomSheet from '@/components/shared/BottomSheet';
import PhoneLink from '@/components/shared/PhoneLink';
import WorkflowStageBadge from './WorkflowStageBadge';
import WorkflowStatusBadge from './WorkflowStatusBadge';
import WorkflowLifecycleStepper from './WorkflowLifecycleStepper';
import { formatAmountOrNull } from '@/lib/priceUtils';
import { formatDateTime } from '@/lib/dateUtils';

function Row({ label, value, bold, border }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={`flex justify-between gap-4 ${border ? 'border-t border-border pt-2' : ''}`}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words text-right ${bold ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
      {children}
    </section>
  );
}

const CHANNEL_LABELS = { 'shopify Admin API': 'Website', web: 'Website', store: 'Store', Amazon: 'Amazon' };

export default function WorkflowOrderDetailSheet({ order, isOpen, onClose }) {
  const address = order?.shipping_address;
  const addressText = address
    ? [address.address1, address.city, address.province, address.zip].filter(Boolean).join(', ')
    : null;
  const fin = order?.financials ?? {};
  const logs = order?.timeline_logs ?? [];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Workflow Order" maxWidth="max-w-lg">
      {order && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <WorkflowStatusBadge status={order.status} size="md" />
            <WorkflowStageBadge stageKey={order.current_step} className="text-xs" />
            {order.priority === 'high' && (
              <span className="rounded-full bg-status-error/10 px-3 py-1 text-xs font-medium text-status-error">High priority</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Row label="Order No." value={order.order_number} />
            <Row label="ERP Doc No." value={order.erp_document_no} />
            <Row label="PO No." value={order.po_number} />
            <Row label="Created" value={formatDateTime(order.created_at)} />
            <Row label="Last updated" value={formatDateTime(order.updated_at)} />
            <Row label="Channel" value={CHANNEL_LABELS[order.channel] ?? order.channel} />
            <Row label="Payment" value={order.payment_mode} />
            <Row label="ERP sync" value={order.erp_sync?.status ? order.erp_sync.status.replace(/^\w/, (c) => c.toUpperCase()) : null} />
          </div>

          <Section title="Customer">
            <Row label="Name" value={order.customer?.name} />
            <Row label="Mobile" value={order.customer?.phone ? <PhoneLink phone={order.customer.phone} /> : null} />
            <Row label="Email" value={order.customer?.email} />
            <Row label="Address" value={addressText} />
          </Section>

          {order.items?.length > 0 && (
            <Section title={`Items (${order.items.reduce((n, i) => n + (Number(i.quantity) || 1), 0)})`}>
              {order.items.map((item, i) => (
                <div key={`${item.sku}-${i}`} className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {item.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- small remote thumbnail from the website CDN
                      <img src={item.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" loading="lazy" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-foreground/80">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.sku, `Qty ${item.quantity ?? 1}`, item.variant_title].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-medium text-foreground">{formatAmountOrNull(item.price)}</span>
                </div>
              ))}
            </Section>
          )}

          <Section title="Payment">
            <Row label="Sub total" value={formatAmountOrNull(fin.subtotal)} />
            <Row label="Discount" value={fin.discounts ? `− ${formatAmountOrNull(fin.discounts)}` : null} />
            <Row label="Total" value={formatAmountOrNull(fin.total ?? order.total_amount)} bold border />
            <Row label="Paid" value={formatAmountOrNull(fin.paid)} />
            <Row label="Outstanding" value={fin.outstanding ? formatAmountOrNull(fin.outstanding) : null} />
          </Section>

          {order.narration && (
            <Section title="Notes">
              <p className="whitespace-pre-line text-foreground/80">{order.narration}</p>
            </Section>
          )}

          <Section title="Lifecycle">
            <WorkflowLifecycleStepper key={order.id} order={order} />
          </Section>

          {logs.length > 0 && (
            <Section title="Activity">
              <ol className="flex flex-col gap-2.5">
                {logs.map((log, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <span className="text-foreground">{log.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {[formatDateTime(log.timestamp), log.user, log.role].filter(Boolean).join(' · ')}
                    </span>
                    {log.notes && <span className="text-xs text-muted-foreground">{log.notes}</span>}
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
