'use client';

import { Clock, MessageSquareText, Phone, Store, User } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import PhoneLink from '@/components/shared/PhoneLink';
import CallAudioPlayer from './CallAudioPlayer';
import { CallStatusBadge, CallTypeBadge, resolveAgentInfo, formatCallDuration } from './CallDetailSheet';
import { formatDateTime } from '@/lib/dateUtils';

export default function CallListItem({ call, onSelect }) {
  const name = call.candidate_name?.trim();
  const agent = resolveAgentInfo(call);
  const purpose = [call.call_reason, call.call_outcome].filter(Boolean).join(' · ');

  return (
    <ListItemCard
      onSelect={onSelect}
      header={(
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 break-words">{name || 'Unknown lead'}</span>
          <CallTypeBadge type={call.call_type} />
        </span>
      )}
      footer={(
        <>
          {call.recording_url ? <CallAudioPlayer src={call.recording_url} compact /> : <span className="text-xs text-muted-foreground">No recording</span>}
          <CallStatusBadge status={call.status} />
        </>
      )}
    >
      {call.candidate_number && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Phone size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <PhoneLink phone={call.candidate_number} />
        </div>
      )}

      <div className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <User size={13} className="mt-0.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span className="min-w-0 break-words">{agent.agentName}</span>
      </div>

      {agent.storeName && (
        <div className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <Store size={13} className="mt-0.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="min-w-0 break-words">{agent.storeName}</span>
        </div>
      )}

      {purpose && (
        <div className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <MessageSquareText size={13} className="mt-0.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="min-w-0 break-words">{purpose}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Clock size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span>
          {formatDateTime(call.call_start_time) || '—'}
          {' · '}
          {formatCallDuration(call.call_duration)}
        </span>
      </div>
    </ListItemCard>
  );
}
