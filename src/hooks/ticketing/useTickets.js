import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listTickets, getTicket, createTicket, runTicketAction, getTicketNotifications,
} from '@/services/ticketingService';
import { QUERY_KEYS } from '@/constants/queryKeys';

const TICKETS_STALE_MS = 60 * 1000;

/** The active store's tickets, or one customer's tickets from every store when partyId is given. */
export function useTickets({ partyId } = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.TICKETING.LIST(partyId),
    queryFn: () => listTickets({ partyId }),
    staleTime: TICKETS_STALE_MS,
  });
}

export function useTicket(ticketNumber, { partyId } = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.TICKETING.DETAIL(ticketNumber),
    queryFn: () => getTicket(ticketNumber, { partyId }),
    enabled: !!ticketNumber,
    staleTime: TICKETS_STALE_MS,
  });
}

export function useTicketNotifications() {
  return useQuery({
    queryKey: QUERY_KEYS.TICKETING.NOTIFICATIONS(),
    queryFn: getTicketNotifications,
    staleTime: TICKETS_STALE_MS,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTicket,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETING.ALL() }),
  });
}

export function useTicketAction(ticketNumber, { partyId } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => runTicketAction(ticketNumber, payload, { partyId }),
    onSuccess: (ticket) => {
      queryClient.setQueryData(QUERY_KEYS.TICKETING.DETAIL(ticketNumber), ticket);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETING.ALL() });
    },
  });
}
