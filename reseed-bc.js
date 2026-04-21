/**
 * Re-seed Section B and Section C only (A already exists)
 */
const SUPABASE_URL  = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';

const HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

const sectionB = [
  { stem: "If the investor __________ the stop-loss, the damage would have been minimal.", options: ["sets", "had set", "would set", "has set"], correct: 1, explanation: "Third conditional (past unreal): 'If + past perfect' → 'had set'." },
  { stem: "The trade was cancelled __________ a technical error at the exchange.", options: ["despite", "due to", "because", "although"], correct: 1, explanation: "'Due to' is a preposition that introduces the cause of a noun event → 'due to a technical error'." },
  { stem: "The bull run will continue __________ the earnings reports stay positive.", options: ["until", "unless", "as long as", "even though"], correct: 2, explanation: "'As long as' introduces a condition that must remain true → correct here." },
  { stem: "The company apologized __________ the error in the annual report.", options: ["about", "on", "to", "for"], correct: 3, explanation: "'Apologize for' is the correct collocation in English." },
  { stem: "Beginners are cautioned __________ trading with high leverage.", options: ["from", "about", "against", "of"], correct: 2, explanation: "'Cautioned against' is the correct fixed expression → warns of a risk." },
  { stem: "The trader would have gained more if he __________ his profits run.", options: ["let", "would let", "had let", "has let"], correct: 2, explanation: "Third conditional → 'If + past perfect' → 'had let'." },
  { stem: "The NAV (Net Asset Value) __________ even higher if the mid-cap stocks had rallied.", options: ["would be", "will be", "would have been", "has been"], correct: 2, explanation: "Third conditional result clause → 'would have been'." },
  { stem: "Funds will be debited __________ you click the 'Confirm' button.", options: ["after", "as soon as", "before", "while"], correct: 1, explanation: "'As soon as' expresses immediate sequence → 'as soon as'." },
  { stem: "The application was rejected __________ the mismatch in signature.", options: ["because", "since", "owing to", "as"], correct: 2, explanation: "'Owing to' is a formal prepositional phrase used to express cause → correct here." },
  { stem: "He trades the Nifty 50 as though he __________ a seasoned veteran.", options: ["is", "was", "were", "would be"], correct: 2, explanation: "'As though' expressing an unreal/hypothetical situation uses subjunctive 'were'." },
  { stem: "If the promoter __________ his shares, the bank would have sanctioned the loan.", options: ["pledged", "had pledged", "pledges", "would pledge"], correct: 1, explanation: "Third conditional → 'If + past perfect' → 'had pledged'." },
  { stem: "The strategy __________ profitable if the market hadn't turned sideways.", options: ["would be", "was", "would have been", "will be"], correct: 2, explanation: "Third conditional result clause → 'would have been'." },
  { stem: "If the government __________ tax incentives, the market wouldn't have reacted negatively.", options: ["offers", "offered", "had offered", "would offer"], correct: 2, explanation: "Third conditional → 'If + past perfect' → 'had offered'." }
];

const sectionC = [
  { stem: "Which is the corrected version of: 'Each of the shareholders have received the dividend.'?", options: ["Each of the shareholders has received the dividend.", "Each of shareholders have received the dividend.", "Each shareholders has received the dividend.", "Shareholders of each has received the dividend."], correct: 0, explanation: "'Each of the…' always takes a singular verb → 'has received'." },
  { stem: "Which is the corrected version of: 'The analyst don't believe the stock is overvalued.'?", options: ["The analyst don't believes the stock is overvalued.", "The analyst doesn't believes the stock is overvalued.", "The analyst doesn't believe the stock is overvalued.", "The analyst not believe the stock is overvalued."], correct: 2, explanation: "Third-person singular subject 'analyst' requires 'doesn't' + base verb 'believe'." },
  { stem: "Which is the corrected version of: 'The furnitures in the new trading floor are very modern.'?", options: ["The furniture in the new trading floor is very modern.", "The furnitures in the new trading floor is very modern.", "The furniture in the new trading floor are very modern.", "The furnitures in new trading floor is very modern."], correct: 0, explanation: "'Furniture' is an uncountable noun — no plural form. Singular verb 'is' is correct." },
  { stem: "Which is the corrected version of: 'She was knowing about the market crash before it happened.'?", options: ["She was known about the market crash before it happened.", "She had been knowing about the market crash.", "She knew about the market crash before it happened.", "She knows about the market crash before it happened."], correct: 2, explanation: "'Know' is a stative verb and does not take continuous form → simple past 'knew' is correct." },
  { stem: "Which is the corrected version of: 'I am watching this stock since last Monday.'?", options: ["I was watching this stock since last Monday.", "I have been watching this stock since last Monday.", "I had been watching this stock from last Monday.", "I am watching this stock from last Monday."], correct: 1, explanation: "'Since' with an ongoing action from a past point to now requires present perfect continuous → 'have been watching'." },
  { stem: "Which is the corrected version of: 'The investor returned back the documents to the bank.'?", options: ["The investor returned the documents to the bank.", "The investor returned back documents to the bank.", "The investor has returned back the documents to the bank.", "The investor returned the documents back to bank."], correct: 0, explanation: "'Return back' is redundant — 'return' already implies going back." },
  { stem: "Which is the corrected version of: 'We need to discuss about the portfolio diversification.'?", options: ["We need to discuss about portfolio diversification.", "We need to discuss on the portfolio diversification.", "We need to discuss portfolio diversification.", "We need to discuss regarding portfolio diversification."], correct: 2, explanation: "'Discuss' is transitive — it does NOT take 'about'. Remove the preposition." },
  { stem: "Which is the corrected version of: 'The asset prices has increased due to inflation.'?", options: ["The asset prices have increased due to inflation.", "The asset prices has increased because of inflation.", "The assets prices have increased due to inflation.", "The asset price has increased due to inflation."], correct: 0, explanation: "'Asset prices' is plural → plural verb 'have increased' is correct." },
  { stem: "Which is the corrected version of: 'He trade in the commodity market every evening.'?", options: ["He trading in the commodity market every evening.", "He trades in the commodity market every evening.", "He is trade in the commodity market every evening.", "He do trade in the commodity market every evening."], correct: 1, explanation: "Third-person singular subject 'he' in simple present requires 's' → 'trades'." },
  { stem: "Which is the corrected version of: 'The expert gave many useful financial advices to the students.'?", options: ["The expert gave many useful financial advice to the students.", "The expert gave much useful financial advice to the students.", "The expert gave much useful financial advices to the students.", "The expert gave many useful financial advises to the students."], correct: 1, explanation: "'Advice' is uncountable — no plural. Use 'much' for uncountable nouns." },
  { stem: "Which is the corrected version of: 'I am possessing ten gold ETFs in my portfolio.'?", options: ["I am possessing ten gold ETFs in my portfolio.", "I had possessed ten gold ETFs in my portfolio.", "I possess ten gold ETFs in my portfolio.", "I was possessing ten gold ETFs in my portfolio."], correct: 2, explanation: "'Possess' is a stative verb — cannot be used in continuous form → 'I possess'." },
  { stem: "Which is the corrected version of: 'There is many loopholes in the current tax system.'?", options: ["There are many loopholes in the current tax system.", "There is much loopholes in the current tax system.", "There is many loophole in the current tax system.", "There were many loopholes in current tax system."], correct: 0, explanation: "'Loopholes' is countable and plural → 'there are many loopholes'." },
  { stem: "Which is the corrected version of: 'The index is falling from the last four days.'?", options: ["The index was falling from the last four days.", "The index falls for the last four days.", "The index has been falling for the last four days.", "The index is falling for the last four days."], correct: 2, explanation: "An action continuing from a past point requires present perfect continuous with 'for' → 'has been falling for'." },
  { stem: "Which is the corrected version of: 'The CEO reverted back to the shareholders\\' concerns.'?", options: ["The CEO reverted to the shareholders' concerns.", "The CEO reverted back the shareholders' concerns.", "The CEO had reverted back to shareholders' concern.", "The CEO has reverted back to shareholders' concerns."], correct: 0, explanation: "'Revert back' is redundant — 'revert' already means 'go back'. Use 'reverted to'." },
  { stem: "Which is the corrected version of: 'We need to describe about the new trading strategy.'?", options: ["We need to describe on the new trading strategy.", "We need to describe about new trading strategy.", "We need to describe the new trading strategy.", "We need to describe regarding the new trading strategy."], correct: 2, explanation: "'Describe' is transitive — it does NOT take a preposition. Remove 'about'." },
  { stem: "Which is the corrected version of: 'The client did not signed the power of attorney.'?", options: ["The client did not sign the power of attorney.", "The client didn't signed the power of attorney.", "The client has not signed the power of attorney.", "The client did not signs the power of attorney."], correct: 0, explanation: "After auxiliary 'did not', always use the base form → 'did not sign'." },
  { stem: "Which is the corrected version of: 'The portfolio crashed due to because of high volatility.'?", options: ["The portfolio crashed due to because high volatility.", "The portfolio crashed because of due to high volatility.", "The portfolio crashed due to high volatility.", "The portfolio crashed due to because of the high volatility."], correct: 2, explanation: "'Due to' and 'because of' mean the same — use only one." }
];

const topics = [
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 3 — Section B: Fill in the Blanks (13 Questions)',
    description: 'Choose the correct word or phrase to complete each sentence. Topics include conditionals, prepositions, and conjunctions in a financial context.',
    scenario: '', checklist: sectionB, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  },
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 3 — Section C: Error Correction (17 Questions)',
    description: 'Identify the grammatically correct rewrite of each erroneous sentence.',
    scenario: '', checklist: sectionC, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  }
];

async function seed() {
  console.log('🚀 Re-seeding Section B and Section C...\n');
  for (const topic of topics) {
    process.stdout.write(`  Inserting "${topic.title}" (${topic.checklist.length} questions)... `);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/topics`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(topic)
    });
    if (!res.ok) {
      console.error('❌ FAILED\n   ', await res.text());
    } else {
      const data = await res.json();
      console.log(`✅ Inserted (id: ${data[0]?.id ?? 'ok'})`);
    }
  }
  console.log('\n✅ Done! All three sections are now in Supabase.');
}

seed().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
