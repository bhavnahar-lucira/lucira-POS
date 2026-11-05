'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import BottomSheet from '@/components/shared/BottomSheet';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useDeleteVoc } from '@/hooks/voc/useVoc';
import { QUESTIONS, answerLabel } from '@/lib/voc/questions';

const formatWhen = (date) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(date));

function Field({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground wrap-break-word">{value || '—'}</dd>
    </div>
  );
}

export default function VocDetailSheet({ response, onClose, canManage }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteVoc = useDeleteVoc();

  const handleDelete = () => {
    deleteVoc.mutate(response?.id, {
      onSuccess: () => {
        toast.success('Feedback deleted.');
        onClose();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <>
      <BottomSheet
        isOpen={!!response}
        onClose={onClose}
        title="Feedback"
        maxWidth="max-w-lg"
        footer={canManage && response ? (
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-11 flex-1 gap-1.5">
              <Link href={`/voc/${response.id}/edit`}><Pencil size={15} aria-hidden="true" /> Edit</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={deleteVoc.isPending}
            >
              <Trash2 size={15} aria-hidden="true" /> Delete
            </Button>
          </div>
        ) : null}
      >
        {response && (
          <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3">
              <Field label="Customer" value={response.customer.name} />
              <Field label="Mobile" value={response.customer.mobile} />
              <Field label="Email" value={response.customer.email} />
              <Field label="Customer ID" value={response.customer.party_id} />
              <Field label="Store" value={response.store.name} />
              <Field label="Jewelry Consultant" value={response.jc.name} />
              <Field label="Submitted" value={formatWhen(response.submitted_at)} />
              <Field label="By" value={response.submitted_by} />
              {response.updated_at && <Field label="Edited" value={`${formatWhen(response.updated_at)} · ${response.updated_by}`} />}
            </dl>
            <ol className="flex flex-col gap-3">
              {QUESTIONS.filter((q) => response.answers[q.id] !== undefined).map((q) => (
                <li key={q.id} className="flex flex-col gap-0.5 border-b border-border pb-3 last:border-0">
                  <p className="text-xs text-muted-foreground">{q.id.slice(1)}. {q.text}</p>
                  <p className="text-sm font-medium text-foreground">{answerLabel(q.id, response.answers[q.id], response.other_text)}</p>
                </li>
              ))}
            </ol>
            {response.referrals?.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Referrals</p>
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {response.referrals.map((r) => (
                    <li key={`${r.name}-${r.mobile}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">{r.name}</span>
                      <a href={`tel:${r.mobile}`} className="shrink-0 tabular-nums text-primary underline-offset-2 hover:underline">{r.mobile}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this feedback?"
        description="It is removed from the list and reports. A copy is kept in the audit log."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
