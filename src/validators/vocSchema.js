import { z } from 'zod';
import { QUESTIONS, OTHER_TEXT_MAX, visibleQuestions, isAnswered, cleanAnswers } from '../lib/voc/questions.js';

const QUESTION_IDS = new Set(QUESTIONS.map((q) => q.id));
const text = (max) => z.string().trim().max(max);
const optionalText = (max) => z.preprocess((v) => (v === '' ? null : v), text(max).nullable().optional());

const jcSchema = z.object({
  id:   z.coerce.number().int().positive('Select the Jewelry Consultant'),
  name: text(200).min(1, 'Select the Jewelry Consultant'),
});

const answersSchema = z.object({
  answers:    z.record(z.string(), z.union([z.string().max(50), z.number()])),
  other_text: z.record(z.string(), text(OTHER_TEXT_MAX)).default({}),
});

// Every visible question must be properly answered; unknown questions are refused; hidden answers are dropped.
function checkAnswers(data, ctx) {
  for (const id of Object.keys(data.answers)) {
    if (!QUESTION_IDS.has(id)) ctx.addIssue({ code: 'custom', path: ['answers', id], message: `Unknown question ${id}` });
  }
  for (const q of visibleQuestions(data.answers)) {
    if (!isAnswered(q, data.answers, data.other_text)) {
      ctx.addIssue({ code: 'custom', path: ['answers', q.id], message: `Please answer question ${q.id.slice(1)}` });
    }
  }
}

const withCleanAnswers = (data) => {
    const { answers, otherText } = cleanAnswers(data.answers, data.other_text);
    return { ...data, answers, other_text: otherText };
}

/** A new response from the form. Store, environment and submitter come from the login, never from here. */
export const vocCreateSchema = answersSchema.extend({
  customer: z.object({
    party_id: z.coerce.number().int().positive('Attach the customer first'),
    name:     text(200).min(1, 'Attach the customer first'),
    mobile:   optionalText(30),
    email:    optionalText(200),
  }),
  jc: jcSchema,
}).superRefine(checkAnswers).transform(withCleanAnswers);

/** A super admin's correction to an existing response: the JC and the answers (the customer stays as recorded). */
export const vocUpdateSchema = answersSchema.extend({ jc: jcSchema }).superRefine(checkAnswers).transform(withCleanAnswers);