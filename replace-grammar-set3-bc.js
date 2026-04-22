/**
 * Replace Grammar Set 3 — Section B & C
 *
 * Converts existing MCQ questions to written-answer format:
 *   Section B → fill-blank   (13 Qs × 2 marks = 26)
 *   Section C → rewrite      (17 Qs × 2 marks = 34)
 *
 * Run with: node replace-grammar-set3-bc.js
 */

const SUPABASE_URL = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';

const SECTION_B_ID = '02e85c95-e3ce-475c-bedd-f8e0b21cf0e5';
const SECTION_C_ID = 'a11238bb-010e-4227-ad12-148917e780d8';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

// ── Section B — Fill in the Blanks (13 Qs × 2 marks = 26) ─────────────────────
const sectionBQuestions = [
  {
    stem: 'If the investor __________ the stop-loss, the damage would have been minimal.',
    type: 'fill-blank',
    acceptedAnswers: ['had set'],
    explanation: 'Third conditional (past unreal): "If + past perfect" → "had set".'
  },
  {
    stem: 'The trade was cancelled __________ a technical error at the exchange.',
    type: 'fill-blank',
    acceptedAnswers: ['due to', 'because of', 'owing to'],
    explanation: '"due to", "because of", and "owing to" all express reason/cause correctly here.'
  },
  {
    stem: 'The bull run will continue __________ the earnings reports stay positive.',
    type: 'fill-blank',
    acceptedAnswers: ['as long as'],
    explanation: '"as long as" expresses a condition that must remain true.'
  },
  {
    stem: 'The company apologized __________ the error in the annual report.',
    type: 'fill-blank',
    acceptedAnswers: ['for'],
    explanation: '"apologize for" is the correct collocation.'
  },
  {
    stem: 'Beginners are cautioned __________ trading with high leverage.',
    type: 'fill-blank',
    acceptedAnswers: ['against'],
    explanation: '"cautioned against" means warned not to do something.'
  },
  {
    stem: 'The trader would have gained more if he __________ his profits run.',
    type: 'fill-blank',
    acceptedAnswers: ['had let'],
    explanation: 'Third conditional: "would have gained" + "if + past perfect" → "had let".'
  },
  {
    stem: 'The NAV (Net Asset Value) __________ even higher if the mid-cap stocks had rallied.',
    type: 'fill-blank',
    acceptedAnswers: ['would have been'],
    explanation: 'Third conditional result clause: "would have been".'
  },
  {
    stem: 'Funds will be debited __________ you click the \'Confirm\' button.',
    type: 'fill-blank',
    acceptedAnswers: ['the moment', 'as soon as'],
    explanation: '"the moment" or "as soon as" indicate immediacy of the action.'
  },
  {
    stem: 'The application was rejected __________ the mismatch in signature.',
    type: 'fill-blank',
    acceptedAnswers: ['owing to', 'due to'],
    explanation: '"owing to" and "due to" both correctly express reason/cause.'
  },
  {
    stem: 'He trades the Nifty 50 as though he __________ a seasoned veteran.',
    type: 'fill-blank',
    acceptedAnswers: ['were'],
    explanation: '"as though" introduces a hypothetical — subjunctive "were" is correct.'
  },
  {
    stem: 'If the promoter __________ his shares, the bank would have sanctioned the loan.',
    type: 'fill-blank',
    acceptedAnswers: ['had pledged'],
    explanation: 'Third conditional: "if + past perfect" → "had pledged".'
  },
  {
    stem: 'The strategy __________ profitable if the market hadn\'t turned sideways.',
    type: 'fill-blank',
    acceptedAnswers: ['would have been'],
    explanation: 'Third conditional result clause: "would have been".'
  },
  {
    stem: 'If the government __________ tax incentives, the market wouldn\'t have reacted negatively.',
    type: 'fill-blank',
    acceptedAnswers: ['had offered'],
    explanation: 'Third conditional: "if + past perfect" → "had offered".'
  }
];

// ── Section C — Rewrite the Sentence (17 Qs × 2 marks = 34) ──────────────────
const sectionCQuestions = [
  {
    stem: 'Each of the shareholders have received the dividend.',
    type: 'rewrite',
    acceptedAnswers: ['Each of the shareholders has received the dividend.'],
    explanation: '"Each" is singular — the verb must be "has", not "have".'
  },
  {
    stem: "The analyst don't believe the stock is overvalued.",
    type: 'rewrite',
    acceptedAnswers: ["The analyst doesn't believe the stock is overvalued."],
    explanation: '"The analyst" is third-person singular — use "doesn\'t".'
  },
  {
    stem: 'The furnitures in the new trading floor are very modern.',
    type: 'rewrite',
    acceptedAnswers: ['The furniture in the new trading floor is very modern.'],
    explanation: '"Furniture" is uncountable — no plural form; verb changes to "is".'
  },
  {
    stem: 'She was knowing about the market crash before it happened.',
    type: 'rewrite',
    acceptedAnswers: ['She knew about the market crash before it happened.'],
    explanation: 'Stative verbs like "know" do not use the continuous form.'
  },
  {
    stem: 'I am watching this stock since last Monday.',
    type: 'rewrite',
    acceptedAnswers: ['I have been watching this stock since last Monday.'],
    explanation: '"Since" requires the present perfect continuous tense.'
  },
  {
    stem: 'The investor returned back the documents to the bank.',
    type: 'rewrite',
    acceptedAnswers: ['The investor returned the documents to the bank.'],
    explanation: '"Returned back" is redundant — "returned" already means "gave back".'
  },
  {
    stem: 'We need to discuss about the portfolio diversification.',
    type: 'rewrite',
    acceptedAnswers: ['We need to discuss portfolio diversification.'],
    explanation: '"Discuss" is a transitive verb — "about" is not needed after it.'
  },
  {
    stem: 'The asset prices has increased due to inflation.',
    type: 'rewrite',
    acceptedAnswers: ['The asset prices have increased due to inflation.'],
    explanation: '"Prices" is plural — the verb must be "have", not "has".'
  },
  {
    stem: 'He trade in the commodity market every evening.',
    type: 'rewrite',
    acceptedAnswers: ['He trades in the commodity market every evening.'],
    explanation: 'Third-person singular present requires the "-s" ending: "trades".'
  },
  {
    stem: 'The expert gave many useful financial advices to the students.',
    type: 'rewrite',
    acceptedAnswers: ['The expert gave much useful financial advice to the students.'],
    explanation: '"Advice" is uncountable — use "much advice", not "many advices".'
  },
  {
    stem: 'I am possessing ten gold ETFs in my portfolio.',
    type: 'rewrite',
    acceptedAnswers: ['I possess ten gold ETFs in my portfolio.'],
    explanation: '"Possess" is a stative verb — it does not take the continuous form.'
  },
  {
    stem: 'There is many loopholes in the current tax system.',
    type: 'rewrite',
    acceptedAnswers: ['There are many loopholes in the current tax system.'],
    explanation: '"Loopholes" is plural — use "There are", not "There is".'
  },
  {
    stem: 'The index is falling from the last four days.',
    type: 'rewrite',
    acceptedAnswers: ['The index has been falling for the last four days.'],
    explanation: '"For" (not "from") is used with duration; present perfect continuous is needed.'
  },
  {
    stem: "The CEO reverted back to the shareholders' concerns.",
    type: 'rewrite',
    acceptedAnswers: ["The CEO reverted to the shareholders' concerns."],
    explanation: '"Reverted back" is redundant — "reverted" already means "went back".'
  },
  {
    stem: 'We need to describe about the new trading strategy.',
    type: 'rewrite',
    acceptedAnswers: ['We need to describe the new trading strategy.'],
    explanation: '"Describe" is a transitive verb — "about" is not needed after it.'
  },
  {
    stem: 'The client did not signed the power of attorney.',
    type: 'rewrite',
    acceptedAnswers: ['The client did not sign the power of attorney.'],
    explanation: 'After "did not" (auxiliary), use the base form "sign", not "signed".'
  },
  {
    stem: 'The portfolio crashed due to because of high volatility.',
    type: 'rewrite',
    acceptedAnswers: ['The portfolio crashed due to high volatility.'],
    explanation: '"Due to" and "because of" are synonyms — only one is needed.'
  }
];

async function patchSection(id, questions) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify({ checklist: questions })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PATCH failed for ${id}: ${res.status} — ${err}`);
  }
  const data = await res.json();
  return data[0];
}

async function main() {
  console.log('Replacing Grammar Set 3 — Section B & C checklists...\n');

  try {
    console.log('Patching Section B (fill-blank, 13 questions)…');
    const b = await patchSection(SECTION_B_ID, sectionBQuestions);
    console.log(`  ✅ Section B updated: "${b.title}" — ${b.checklist.length} questions\n`);

    console.log('Patching Section C (rewrite, 17 questions)…');
    const c = await patchSection(SECTION_C_ID, sectionCQuestions);
    console.log(`  ✅ Section C updated: "${c.title}" — ${c.checklist.length} questions\n`);

    console.log('Done! Grammar Set 3 Sections B & C are now written-answer format.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
