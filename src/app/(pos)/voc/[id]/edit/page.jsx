'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import VocForm from '@/components/features/voc/VocForm';
import ErrorState from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { useUpdateVoc, useVocResponse } from '@/hooks/voc/useVoc';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';

export default function EditVocPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const { data: response, isLoading, isError, refetch } = useVocResponse(isSuperAdmin ? id : null);
  const updateVoc = useUpdateVoc();

  if (!isSuperAdmin) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Only a super admin can edit feedback.</p>
        </div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground md:p-6">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading feedback…
      </p>
    );
  }
  if (isError || !response) {
    return <div className="p-4 md:p-6"><ErrorState title="Couldn't load this feedback." onRetry={refetch} /></div>;
  }

  const handleSubmit = (payload) => {
    updateVoc.mutate(
      { id, ...payload },
      {
        onSuccess: () => {
          toast.success('Feedback updated.');
          router.replace('/voc');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="p-4 pb-8 md:p-6">
      <VocForm
        storeId={response.store.id}
        initial={response}
        submitLabel="Save changes"
        isSubmitting={updateVoc.isPending}
        onSubmit={handleSubmit}
        header={(
          <div className="mb-3 flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="-ml-2 size-9 shrink-0" aria-label="Back to Voice of Lucira">
              <Link href="/voc"><ArrowLeft size={18} aria-hidden="true" /></Link>
            </Button>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">Edit · {response.customer.name}</p>
              <p className="truncate text-xs text-muted-foreground">{response.store.name} · {response.day}</p>
            </div>
          </div>
        )}
      />
    </div>
  );
}
