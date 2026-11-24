'use client';

import { ExternalLink, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import PhoneLink from '@/components/shared/PhoneLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import CallAudioPlayer from './CallAudioPlayer';
import { callStatusTone, formatCallDuration, isIncomingCall, resolveAgentInfo } from '@/lib/frejun/agentInfo';
import { formatDateTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

export { callStatusTone, formatCallDuration, resolveAgentInfo };

const TONE = {
  done: 'bg-status-in-stock/10 text-status-in-stock ring-1 ring-status-in-stock/20',
  active: 'bg-status-made-order/10 text-status-made-order ring-1 ring-status-made-order/20',
  error: 'bg-status-error/10 text-status-error ring-1 ring-status-error/20',
  neutral: 'bg-muted text-muted-foreground ring-1 ring-border',
};

export function CallStatusBadge({ status, size = 'sm' }) {
  if (!status) return null;
  return (
    <Badge
      className={cn(
        'h-auto rounded-full font-medium capitalize',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        TONE[callStatusTone(status)],
      )}
    >
      {String(status).replace(/[-_]/g, ' ')}
    </Badge>
  );
}

export function CallTypeBadge({ type }) {
  const isIncoming = isIncomingCall(type);
  const Icon = isIncoming ? PhoneIncoming : PhoneOutgoing;
  return (
    <Badge variant="outline" className="h-auto gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize">
      <Icon aria-hidden="true" />
      {isIncoming ? 'Incoming' : 'Outgoing'}
    </Badge>
  );
}

export function CallTagBadge({ tags }) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <Badge key={t.id || t.name} variant="secondary" className="h-auto max-w-full whitespace-normal break-words rounded-full px-2 py-0.5 text-[11px] font-medium">
          {t.name?.trim()}
        </Badge>
      ))}
    </div>
  );
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-foreground">{value}</span>
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

export default function CallDetailSheet({ call, isOpen, onClose }) {
  const agent = call ? resolveAgentInfo(call) : null;
  const name = call?.candidate_name?.trim();

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Call" maxWidth="max-w-lg">
      {call && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <CallStatusBadge status={call.status} size="md" />
            <CallTypeBadge type={call.call_type} />
          </div>

          <div className="flex flex-col gap-2">
            <Row label="Customer" value={name || 'Unknown lead'} />
            <Row label="Mobile" value={call.candidate_number ? <PhoneLink phone={call.candidate_number} /> : null} />
            <Row label="Started" value={formatDateTime(call.call_start_time)} />
            <Row label="Ended" value={formatDateTime(call.call_end_time)} />
            <Row label="Talk time" value={formatCallDuration(call.call_duration)} />
          </div>

          {call.recording_url && (
            <Section title="Recording">
              <CallAudioPlayer src={call.recording_url} />
            </Section>
          )}

          <Section title="Store & agent">
            <Row label="Agent" value={agent.agentName} />
            <Row label="Store" value={agent.storeName} />
            <Row label="Agent email" value={call.recruiter} />
            <Row label="Agent phone" value={call.creator_number ? <PhoneLink phone={call.creator_number} /> : null} />
            <Row label="Virtual number" value={call.virtual_number} />
            {Array.isArray(call.tags) && call.tags.length > 0 && (
              <div className="flex justify-between gap-4">
                <span className="shrink-0 text-muted-foreground">Tags</span>
                <div className="flex justify-end"><CallTagBadge tags={call.tags} /></div>
              </div>
            )}
          </Section>

          {(call.call_reason || call.call_outcome) && (
            <Section title="Purpose & outcome">
              <Row label="Reason" value={call.call_reason} />
              <Row label="Outcome" value={call.call_outcome} />
            </Section>
          )}

          {call.recruiter_notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-foreground/80">{call.recruiter_notes}</p>
            </Section>
          )}

          {(call.ai_insights || call.call_transcript) && (
            <Section title="AI insights & transcript">
              {call.ai_insights && <p className="leading-relaxed text-foreground/80">{call.ai_insights}</p>}
              {call.call_transcript && (
                <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  {call.call_transcript}
                </div>
              )}
            </Section>
          )}

          <Section title="Reference">
            <Row label="Call ID" value={call.call_id || call.id} />
            <Row label="Cost" value={call.cost != null ? `₹${call.cost}` : null} />
          </Section>

          {call.link && (
            <Button asChild variant="outline" className="h-11 w-full gap-2">
              <a href={call.link} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                Open in FreJun
              </a>
            </Button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
