'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import SalesPersonSelect from '@/components/features/checkout/SalesPersonSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSalesPersonOptions } from '@/hooks/schemes/useSalesPersonOptions';
import { cn } from '@/lib/utils';
import {
  SECTIONS, OTHER_VALUE, OTHER_TEXT_MAX, visibleQuestions, isAnswered, progress,
} from '@/lib/voc/questions';

const NPS_TONE = {
  low:  { idle: 'border-status-error/30 text-status-error hover:bg-status-error/10', active: 'border-status-error bg-status-error text-white' },
  mid:  { idle: 'border-status-made-order/30 text-status-made-order hover:bg-status-made-order/10', active: 'border-status-made-order bg-status-made-order text-white' },
  high: { idle: 'border-status-in-stock/30 text-status-in-stock hover:bg-status-in-stock/10', active: 'border-status-in-stock bg-status-in-stock text-white' },
};
const npsTone = (n) => NPS_TONE[n >= 9 ? 'high' : n >= 7 ? 'mid' : 'low'];
const questionNumber = (q) => q.id.slice(1);

// Scrolls only the app's content area (scrollIntoView would also shift the fixed app shell), stopping below the sticky progress bar.
function scrollToId(id, scrollerId) {
  const target = document.getElementById(id);
  const scroller = document.getElementById(scrollerId);
  if (!target || !scroller) return;
  const stickyHeight = document.getElementById('voc-progress')?.offsetHeight ?? 0;
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - stickyHeight - 12;
  scroller.scrollBy({ top, behavior: 'smooth' });
}

function OptionButton({ selected, onClick, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
        )}
      >
        {selected && <Check size={12} strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

function NpsScale({ question, value, onAnswer, labelId }) {
  const scores = Array.from({ length: question.max - question.min + 1 }, (_, i) => question.min + i);
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {scores.map((n) => {
          const tone = npsTone(n);
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              onClick={() => onAnswer(n)}
              className={cn(
                'h-12 rounded-xl border text-base font-semibold tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                value === n ? tone.active : tone.idle,
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between gap-4 text-xs text-muted-foreground">
        <span>{question.min} · {question.minLabel}</span>
        <span className="text-right">{question.maxLabel} · {question.max}</span>
      </div>
    </div>
  );
}

function QuestionCard({ question, value, otherText, answered, highlighted, hint, onAnswer, onOtherText }) {
  const labelId = `voc-${question.id}-label`;
  return (
    <div
      id={`voc-${question.id}`}
      className={cn(
        'scroll-mt-40 flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5 transition-shadow',
        highlighted ? 'border-status-error ring-2 ring-status-error/25' : 'border-border',
      )}
    >
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            answered ? 'bg-status-in-stock text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          {answered ? <Check size={14} strokeWidth={3} /> : questionNumber(question)}
        </span>
        <p id={labelId} className="pt-0.5 text-sm font-semibold leading-snug text-foreground sm:text-base">
          <span className="sr-only">Question {questionNumber(question)}: </span>
          {question.text}
        </p>
      </div>
      {hint && <p className="text-xs text-muted-foreground sm:pl-10">{hint}</p>}

      {question.type === 'nps' ? (
        <NpsScale question={question} value={value} onAnswer={onAnswer} labelId={labelId} />
      ) : (
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className={cn('grid gap-2', question.type === 'rating' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}
        >
          {question.options.map((o) => (
            <OptionButton key={o.value} selected={value === o.value} onClick={() => onAnswer(o.value)}>
              {o.label}
            </OptionButton>
          ))}
        </div>
      )}

      {value === OTHER_VALUE && (
        <Input
          autoFocus
          value={otherText ?? ''}
          onChange={(e) => onOtherText(e.target.value)}
          maxLength={OTHER_TEXT_MAX}
          placeholder="Please specify"
          aria-label={`Other answer for question ${questionNumber(question)}`}
          className="h-11"
        />
      )}
    </div>
  );
}

/**
 * The Voice of Lucira questionnaire. `initial` = { jc, answers, other_text } (edit, or the Q7 pre-fill);
 * onSubmit receives { jc, answers, other_text } once everything visible is answered.
 */
export default function VocForm({
  storeId, initial = {}, purchasePrefilled = false, submitLabel = 'Submit feedback', isSubmitting = false, onSubmit, header,
  scrollerId = 'main-content',
}) {
  const scrollTo = (id) => scrollToId(id, scrollerId);
  const { salesPersons } = useSalesPersonOptions(storeId);
  const [jcId, setJcId] = useState(initial.jc?.id ?? null);
  const [answers, setAnswers] = useState(initial.answers ?? {});
  const [otherText, setOtherText] = useState(initial.other_text ?? {});
  const [highlight, setHighlight] = useState(null);

  const visible = visibleQuestions(answers);
  const { answered, total, percent } = progress(answers, otherText);
  const done = (q) => isAnswered(q, answers, otherText);
  const sections = SECTIONS
    .map((s) => ({ ...s, questions: visible.filter((q) => q.section === s.id) }))
    .filter((s) => s.questions.length);

  const jcName = salesPersons.find((p) => p.employee_id === jcId)?.employee_name
    ?? (initial.jc?.id === jcId ? initial.jc.name : null);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!jcId || !jcName) {
      setHighlight('jc');
      scrollTo('voc-jc');
      return toast.error('Select the Jewelry Consultant.');
    }
    const missing = visible.find((q) => !done(q));
    if (missing) {
      setHighlight(missing.id);
      scrollTo(`voc-${missing.id}`);
      return toast.error(missing.type !== 'nps' && answers[missing.id] === OTHER_VALUE
        ? `Please type the "Other" answer for question ${questionNumber(missing)}.`
        : `Please answer question ${questionNumber(missing)}.`);
    }
    onSubmit({ jc: { id: jcId, name: jcName }, answers, other_text: otherText });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div id="voc-progress" className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 pt-4 pb-3 backdrop-blur md:-mx-6 md:-mt-6 md:px-6 md:pt-5">
        {header}
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">{answered} of {total} answered</span>
          <span className="tabular-nums text-muted-foreground">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Feedback progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2.5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {sections.map((s) => {
            const complete = s.questions.every(done);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(`voc-section-${s.id}`)}
                className={cn(
                  'relative flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  complete
                    ? 'border-status-in-stock/40 bg-status-in-stock/10 text-status-in-stock'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {complete && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                {s.title}
                <span className="sr-only">{complete ? ' — complete' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        id="voc-jc"
        className={cn(
          'scroll-mt-40 flex flex-col gap-2 rounded-2xl border bg-card p-4 sm:p-5',
          highlight === 'jc' && !jcName ? 'border-status-error ring-2 ring-status-error/25' : 'border-border',
        )}
      >
        <p className="text-sm font-semibold text-foreground sm:text-base">
          Jewelry Consultant <span className="text-destructive">*</span>
        </p>
        <div className="sm:max-w-sm">
          <SalesPersonSelect companyId={storeId} value={jcId} onChange={setJcId} />
        </div>
      </div>

      {sections.map((s) => (
        <section key={s.id} id={`voc-section-${s.id}`} className="scroll-mt-40 flex flex-col gap-3" aria-label={s.title}>
          <h2 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</h2>
          {s.questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              value={answers[q.id]}
              otherText={otherText[q.id]}
              answered={done(q)}
              highlighted={highlight === q.id && !done(q)}
              hint={q.id === 'q7' && purchasePrefilled ? "Pre-filled from today's invoices and orders at this store. Change it if needed." : null}
              onAnswer={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
              onOtherText={(text) => setOtherText((prev) => ({ ...prev, [q.id]: text }))}
            />
          ))}
        </section>
      ))}

      <div className="sticky bottom-0 z-20 -mx-4 -mb-8 mt-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:-mb-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-sm text-muted-foreground sm:block">
            {answered === total ? 'All questions answered.' : `${total - answered} question${total - answered === 1 ? '' : 's'} left`}
          </p>
          <Button type="submit" className="h-12 w-full sm:w-auto sm:min-w-56" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Saving…</> : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
