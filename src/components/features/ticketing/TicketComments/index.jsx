'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTicketAction } from '@/hooks/ticketing/useTickets';

const TEAM_LABELS = { store: 'Store', cad: 'CAD team', workflow: 'Workflow team' };
const WHOLE_TICKET = 'ticket';

const formatTime = (value) => (value
  ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '');

/**
 * Two-way comments shared with the CAD / workflow teams. With itemId it shows and posts that product's thread;
 * without it, every comment on the ticket, with a product picker for multi-product tickets.
 */
export default function TicketComments({ ticket, partyId, itemId = null, items = null, bare = false }) {
  const action = useTicketAction(ticket.ticket_number, { partyId });
  const [text, setText] = useState('');
  const [target, setTarget] = useState(itemId ?? WHOLE_TICKET);
  const labelOf = (id) => {
    const item = items?.find((i) => i.item_id === id);
    return item ? `${item.item_id} · ${item.requested_specs?.category ?? 'Product'}` : id;
  };

  const comments = (ticket.comments ?? []).filter((c) => !itemId || c.item_id === itemId);
  const textId = `comment-${itemId ?? ticket.ticket_number}`;

  const post = () => {
    const body = text.trim();
    if (!body) return;
    action.mutate(
      { action: 'add_comment', item_id: target === WHOLE_TICKET ? null : target, text: body },
      {
        onSuccess: () => {
          setText('');
          toast.success('Comment sent to the CAD team.');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const content = (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {comments.map((c, i) => {
            const mine = c.team === 'store';
            return (
              <li
                key={c.id ?? i}
                className={`flex flex-col gap-0.5 rounded-lg p-2.5 text-sm ${mine ? 'ml-6 bg-primary/10' : 'mr-6 bg-muted/60'}`}
              >
                <span className="text-xs text-muted-foreground">
                  <strong className="font-medium text-foreground">{c.author}</strong>
                  {' · '}{TEAM_LABELS[c.team] ?? c.team}{c.store_code ? ` (${c.store_code})` : ''} · {formatTime(c.at)}
                </span>
                {!itemId && c.item_id && <span className="text-xs font-medium text-primary">{labelOf(c.item_id)}</span>}
                <p className="whitespace-pre-line wrap-break-word text-foreground">{c.text}</p>
              </li>
            );
          })}
        </ol>
      )}
      <div className="relative flex flex-col gap-2">
        {!itemId && items?.length > 0 && (
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="h-10 w-full" aria-label="Comment about">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHOLE_TICKET}>Whole ticket</SelectItem>
              {items.filter((i) => i.status !== 'cancelled').map((i) => <SelectItem key={i.item_id} value={i.item_id}>{labelOf(i.item_id)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Label htmlFor={textId} className="sr-only">Comment</Label>
        <Textarea
          id={textId}
          rows={2}
          maxLength={2000}
          value={text}
          placeholder="Write to the CAD team…"
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="button" className="h-10 gap-1.5 self-end" disabled={!text.trim() || action.isPending} onClick={post}>
          <Send size={14} aria-hidden="true" /> {action.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );

  if (bare) return content;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comments</h2>
      {content}
    </section>
  );
}
