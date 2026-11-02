import { QUESTIONS, npsGroup } from './questions.js';

const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const sum = (counts) => Object.values(counts).reduce((n, c) => n + c, 0);

/** Net Promoter Score (NPS) = % promoters (9-10) minus % detractors (0-6), from the Q9 0-10 counts. */
export function npsScore(counts = {}) {
  const groups = { promoter: 0, passive: 0, detractor: 0 };
  for (const [score, count] of Object.entries(counts)) groups[npsGroup(Number(score))] += count;
  const responses = sum(counts);
  return {
    score: responses ? Math.round(((groups.promoter - groups.detractor) / responses) * 100) : null,
    promoters: groups.promoter,
    passives: groups.passive,
    detractors: groups.detractor,
    responses,
  };
}

/** % of answers that were the top two options (e.g. Excellent + Good). */
function satisfaction(question, counts = {}) {
  const answered = sum(counts);
  const happy = question.options.filter((o) => o.score >= 3).reduce((n, o) => n + (counts[o.value] ?? 0), 0);
  return { id: question.id, question: question.text, percent: answered ? Math.round((happy / answered) * 100) : null, answered };
}

/** A question's answers as [{ value, label, count }], most common first. */
function ranked(questionId, counts = {}) {
  const options = byId[questionId].options;
  return options
    .map((o) => ({ value: o.value, label: o.label, count: counts[o.value] ?? 0 }))
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function summarize({ total, counts }) {
  return {
    total,
    nps: npsScore(counts.q9),
    satisfaction: QUESTIONS.filter((q) => q.type === 'rating').map((q) => satisfaction(q, counts[q.id])),
    purchased: ranked('q7', counts.q7),
    awareness: ranked('q1', counts.q1),
    brands: ranked('q2', counts.q2),
    whyBought: ranked('q8', counts.q8),
    notBuying: ranked('q11', counts.q11),
    whyOthers: ranked('q12', counts.q12),
  };
}