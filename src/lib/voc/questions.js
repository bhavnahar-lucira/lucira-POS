// Voice of Lucira questionnaire: the single source for the questions, their options, when each one shows,
// and how answers are scored. Answers are stored as these option codes (never the display text), so reports
// stay correct even if the wording changes later.

export const LUCIRA_BRAND = "lucira";

export const SECTIONS = [
  { id: 'awareness',  title: 'Customer Awareness & Brand Preference' },
  { id: 'experience', title: 'Customer Experience' },
  { id: 'purchase',   title: 'Purchase Behaviour & Loyalty' },
  { id: 'follow_up',  title: 'A Little More About Your Choice' },
];

export const QUESTIONS = [
    {
        id: 'q1', section: 'awareness', type: 'choice',
        text: 'How did you first hear about Lucira Jewelry?',
        options: [
            { value: 'instagram_facebook', label: 'Instagram / Facebook' },
            { value: 'google_search',      label: 'Google Search' },
            { value: 'online_ad',          label: 'Online Advertisement' },
            { value: 'referral',           label: 'Friend / Family Referral' },
            { value: 'walk_in',            label: 'Store Visibility / Walk-in' },
            { value: 'influencer',         label: 'Influencer / Social Media Content' },
            { value: 'existing_customer',  label: 'Existing Lucira Customer' },
            { value: 'other',              label: 'Other' },
        ],
    },
    {
        id: 'q2', section: 'awareness', type: 'choice',
        text: 'Which jewellery brand did you last purchase from?',
        options: [
            { value: LUCIRA_BRAND,     label: 'Lucira Jewelry' },
            { value: 'tanishq',        label: 'Tanishq' },
            { value: 'malabar',        label: 'Malabar Gold & Diamonds' },
            { value: 'kalyan',         label: 'Kalyan Jewellers' },
            { value: 'caratlane',      label: 'CaratLane' },
            { value: 'local_jeweller', label: 'Local Jeweller' },
            { value: 'other',          label: 'Other' },
        ],
    },
    {
        id: 'q3', section: 'experience', type: 'rating',
        text: 'How would you rate your overall experience at Lucira Jewelry?',
        options: [
            { value: 'excellent', label: 'Excellent', score: 4 },
            { value: 'good',      label: 'Good',      score: 3 },
            { value: 'average',   label: 'Average',   score: 2 },
            { value: 'poor',      label: 'Poor',      score: 1 },
        ],
    },
    {
        id: 'q4', section: 'experience', type: 'rating',
        text: 'How satisfied were you with the assistance provided by our Jewelry Consultant (JC)?',
        options: [
            { value: 'very_satisfied', label: 'Very Satisfied', score: 4 },
            { value: 'satisfied',      label: 'Satisfied',      score: 3 },
            { value: 'neutral',        label: 'Neutral',        score: 2 },
            { value: 'dissatisfied',   label: 'Dissatisfied',   score: 1 },
        ],
    },
    {
        id: 'q5', section: 'experience', type: 'rating',
        text: 'How would you rate our jewellery collection, designs, and variety?',
        options: [
            { value: 'excellent',         label: 'Excellent',         score: 4 },
            { value: 'good',              label: 'Good',              score: 3 },
            { value: 'average',           label: 'Average',           score: 2 },
            { value: 'needs_improvement', label: 'Needs Improvement', score: 1 },
        ],
    },
    {
        id: 'q6', section: 'experience', type: 'rating',
        text: 'How satisfied were you with our pricing and value for money?',
        options: [
            { value: 'very_satisfied', label: 'Very Satisfied', score: 4 },
            { value: 'satisfied',      label: 'Satisfied',      score: 3 },
            { value: 'neutral',        label: 'Neutral',        score: 2 },
            { value: 'dissatisfied',   label: 'Dissatisfied',   score: 1 },
        ],
    },
    {
        id: 'q7', section: 'purchase', type: 'choice',
        text: 'Did you make a purchase during your visit?',
        options: [
            { value: 'yes',     label: 'Yes' },
            { value: 'no',      label: 'No' },
            { value: 'pending', label: 'Purchase Decision Pending' },
        ],
    },
    {
        id: 'q8', section: 'purchase', type: 'choice',
        text: 'What was the primary reason for choosing Lucira Jewelry?',
        showIf: (answers) => answers.q7 === 'yes',
        options: [
            { value: 'designs',          label: 'Jewellery Designs' },
            { value: 'brand_trust',      label: 'Brand Trust' },
            { value: 'pricing',          label: 'Pricing / Value for Money' },
            { value: 'offers_schemes',   label: 'Offers / Schemes' },
            { value: 'customer_service', label: 'Customer Service' },
            { value: 'recommendation',   label: 'Recommendation' },
            { value: 'other',            label: 'Other' },
        ],
    },
    {
        id: 'q9', section: 'purchase', type: 'nps',
        text: 'How likely are you to recommend Lucira Jewelry to your friends and family?',
        min: 0, max: 10, minLabel: 'Not at all likely', maxLabel: 'Extremely likely',
    },
    {
        id: 'q10', section: 'purchase', type: 'choice',
        text: 'What is one thing we could improve to make your Lucira experience better?',
        options: [
            { value: 'designs',              label: 'Jewellery Designs / Collection' },
            { value: 'pricing_offers',       label: 'Pricing / Offers' },
            { value: 'customer_service',     label: 'Customer Service' },
            { value: 'store_ambience',       label: 'Store Ambience' },
            { value: 'product_availability', label: 'Product Availability' },
            { value: 'payment_options',      label: 'Payment Options' },
            { value: 'other',                label: 'Other' },
        ],
    },
    {
        id: 'q11', section: 'follow_up', type: 'choice',
        text: 'If you did not purchase, what was the primary reason?',
        showIf: (answers) => answers.q7 === 'no' || answers.q7 === 'pending',
        options: [
            { value: 'price_budget',         label: 'Price / Budget' },
            { value: 'design_unavailable',   label: 'Design Not Available' },
            { value: 'product_availability', label: 'Product Availability' },
            { value: 'comparing_brands',     label: 'Comparing with Other Brands' },
            { value: 'need_time',            label: 'Need More Time to Decide' },
            { value: 'payment_options',      label: 'Payment Options' },
            { value: 'other',                label: 'Other' },
        ],
    },
    {
        id: 'q12', section: 'follow_up', type: 'choice',
        text: 'What would make you choose Lucira over your preferred jewellery brand?',
        showIf: (answers) => !!answers.q2 && answers.q2 !== LUCIRA_BRAND,
        options: [
            { value: 'better_designs',          label: 'Better Designs' },
            { value: 'better_pricing',          label: 'Better Pricing' },
            { value: 'schemes_emi',             label: 'Attractive Schemes / EMI' },
            { value: 'better_service',          label: 'Better Customer Service' },
            { value: 'brand_trust',             label: 'Brand Trust' },
            { value: 'buyback_exchange_policy', label: 'Better Buyback / Exchange Policy' },
            { value: 'other',                   label: 'Other' },
        ],
    },
]

export const OTHER_VALUE = 'other';
export const OTHER_TEXT_MAX = 200;

/** The questions that apply to these answers (conditional ones only when their rule matches). */
export function visibleQuestions(answers) {
    return QUESTIONS.filter(q => !q.showIf || q.showIf(answers));
}

/** Whether one question has a complete answer ("Other" needs its text too). */
export function isAnswered(question, answers, otherText) {
    const value = answers[question.id];
    if(question.type === 'nps') return Number.isInteger(value) && value >= question.min && value <= question.max;
    if(!question.options.some((o) => o.value === value)) return false;
    return value !== OTHER_VALUE || !!otherText[question.id]?.trim();
}

/** Progress over the questions currently visible, for the progress bar. */
export function progress(answers, otherText) {
    const visible = visibleQuestions(answers);
    const answered = visible.filter((q) => isAnswered(q, answers, otherText)).length;
    return { answered, total: visible.length, percent: Math.round((answered / visible.length) * 100) };
}

/** Drops answers to questions that are now hidden, and "Other" text that no longer applies. */
export function cleanAnswers(answers, otherText) {
  const cleaned = { answers: {}, otherText: {} };
  for (const q of visibleQuestions(answers)) {
    if (answers[q.id] === undefined) continue;
    cleaned.answers[q.id] = answers[q.id];
    if (answers[q.id] === OTHER_VALUE && otherText[q.id]?.trim()) cleaned.otherText[q.id] = otherText[q.id].trim();
  }
  return cleaned;
}

/** Display text for a stored answer, including the typed "Other" text. */
export function answerLabel(questionId, value, otherText = {}) {
  const question = QUESTIONS.find((q) => q.id === questionId);
  if (!question || value === undefined || value === null) return '';
  if (question.type === 'nps') return String(value);
  if (value === OTHER_VALUE) return otherText[questionId] ? `Other: ${otherText[questionId]}` : 'Other';
  return question.options.find((o) => o.value === value)?.label ?? String(value);
}

// NPS = Net Promoter Score: how likely customers are to recommend Lucira, from Q9 (0-10).
// NPS = % promoters (9-10) minus % detractors (0-6); passives (7-8) count in the total only. Range -100 to +100.
export const NPS_LABEL = 'Net Promoter Score (NPS)';
export const NPS_HELP = 'How likely customers are to recommend Lucira.';

/** Net Promoter Score group for a 0-10 score: 9-10 promoter, 7-8 passive, 0-6 detractor. */
export const npsGroup = (score) => (score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor');