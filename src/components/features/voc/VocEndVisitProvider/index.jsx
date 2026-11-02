'use client';

import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useStore } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquareHeart, X } from 'lucide-react';
import { toast } from 'sonner';

import VocForm from '@/components/features/voc/VocForm';
import VocThankYouDialog from '@/components/features/voc/VocThankYouDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useCreateVoc } from '@/hooks/voc/useVoc';
import { getVocToday } from '@/services/vocService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { selectActiveStoreId, selectActiveStoreName } from '@/store/slices/storeSlice';
import {
  selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile, selectCartCustomerContactMobile,
} from '@/store/slices/cartSlice';

const EndVisitContext = createContext(null);
const OVERLAY_ID = 'voc-end-visit';

/**
 * endVisit(onEnd): before a customer is removed by hand, offers to take their feedback.
 * onEnd (the actual removal) runs after Skip, after the feedback is saved, or straight away when
 * there is nothing to ask (no store, or feedback already given here today).
 */
export function useEndCustomerVisit() {
  return useContext(EndVisitContext);
}

export default function VocEndVisitProvider({ children }) {
  const reduxStore = useStore();
  const queryClient = useQueryClient();
  const storeId = useSelector(selectActiveStoreId);
  const storeName = useSelector(selectActiveStoreName);
  const createVoc = useCreateVoc();
  const [visit, setVisit] = useState(null);
  const [checking, setChecking] = useState(false);

  const endVisit = async (onEnd) => {
    const state = reduxStore.getState();
    const partyId = selectCartCustomerId(state);
    if (!partyId || !storeId) return onEnd();
    if (checking || visit) return;

    setChecking(true);
    let today = null;
    try {
      today = await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.VOC.TODAY(partyId),
        queryFn: () => getVocToday(partyId),
        staleTime: 0,
      });
    } catch {
      // still offer feedback; Q7 is just left for the manager
    } finally {
      setChecking(false);
    }
    if (today?.alreadyGiven) {
      toast.info(`${selectCartCustomerName(state) ?? 'This customer'} already gave feedback here today.`);
      return onEnd();
    }

    setVisit({
      stage: 'ask',
      onEnd,
      purchased: today?.purchased ?? null,
      customer: {
        party_id: partyId,
        name: selectCartCustomerName(state),
        mobile: selectCartCustomerContactMobile(state) ?? selectCartCustomerMobile(state) ?? null,
        email: null,
      },
    });
  };

  const finish = () => {
    visit?.onEnd();
    setVisit(null);
  };

  const handleSubmit = (payload) => {
    createVoc.mutate(
      { customer: visit.customer, ...payload },
      {
        onSuccess: () => setVisit((v) => ({ ...v, stage: 'thanks' })),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <EndVisitContext.Provider value={{ endVisit, checking }}>
      {children}

      <Dialog open={visit?.stage === 'ask'} onOpenChange={(open) => { if (!open) setVisit(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquareHeart size={24} aria-hidden="true" />
            </span>
            <DialogTitle>Take {visit?.customer.name}&rsquo;s feedback?</DialogTitle>
            <DialogDescription>
              A quick Voice of Lucira survey before ending this visit. It takes about a minute.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col">
            <Button type="button" className="h-11 w-full" onClick={() => setVisit((v) => ({ ...v, stage: 'form' }))} autoFocus>
              Take feedback
            </Button>
            <Button type="button" variant="outline" className="h-11 w-full" onClick={finish}>
              Skip &amp; end visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {visit?.stage === 'form' && createPortal(
        <div
          id={OVERLAY_ID}
          role="dialog"
          aria-modal="true"
          aria-label={`Feedback from ${visit.customer.name}`}
          className="fixed inset-0 z-50 overflow-y-auto bg-background"
        >
          <div className="mx-auto max-w-3xl p-4 pb-8 md:p-6">
            <VocForm
              storeId={storeId}
              scrollerId={OVERLAY_ID}
              initial={visit.purchased ? { answers: { q7: visit.purchased } } : {}}
              purchasePrefilled={!!visit.purchased}
              isSubmitting={createVoc.isPending}
              onSubmit={handleSubmit}
              header={(
                <div className="mb-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-foreground">{visit.customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">Feedback · {storeName}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 shrink-0 gap-1 px-2 text-muted-foreground"
                    onClick={finish}
                    disabled={createVoc.isPending}
                  >
                    <X size={16} aria-hidden="true" /> Close &amp; end visit
                  </Button>
                </div>
              )}
            />
          </div>
        </div>,
        document.body,
      )}

      <VocThankYouDialog customerName={visit?.stage === 'thanks' ? visit.customer.name : null} onDone={finish} />
    </EndVisitContext.Provider>
  );
}
