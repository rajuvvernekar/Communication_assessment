/**
 * Seed script — Grammar Assessment Set 3
 * Run: node seed-grammar-set3.js
 */

const SUPABASE_URL  = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';

const HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

// ============================================================
//  SECTION A — 40 MCQ Questions (Subject-Verb Agreement,
//  Tenses, Comparatives, Conditionals, Miscellaneous)
// ============================================================
const sectionA = [
  {
    stem: "The volatility of the tech sector __________ many new investors this month.",
    options: ["is scaring", "are scaring", "were scaring", "have scared"],
    correct: 0,
    explanation: "'Volatility' is the singular subject, so it takes 'is scaring' (present continuous)."
  },
  {
    stem: "Neither the SEBI regulations nor the company's internal policy __________ short selling in this case.",
    options: ["permit", "permits", "permitting", "have permitted"],
    correct: 1,
    explanation: "With 'neither…nor', the verb agrees with the nearer subject — 'internal policy' (singular) → 'permits'."
  },
  {
    stem: "The series of interest rate hikes __________ a cooling effect on the housing market.",
    options: ["have had", "has had", "were having", "are having"],
    correct: 1,
    explanation: "'Series' is a singular collective noun, so 'has had' is correct."
  },
  {
    stem: "Each of the mutual fund schemes __________ its own benchmark index.",
    options: ["follow", "follows", "are following", "following"],
    correct: 1,
    explanation: "'Each' always takes a singular verb → 'follows'."
  },
  {
    stem: "The balance sheet data __________ audited by a third-party firm last week.",
    options: ["was", "were", "is", "are"],
    correct: 0,
    explanation: "'Data' is treated as singular in formal/business writing → 'was'."
  },
  {
    stem: "A large percentage of the profit __________ distributed as dividends.",
    options: ["was", "were", "are", "have been"],
    correct: 0,
    explanation: "'A percentage of + singular noun' takes a singular verb → 'was'."
  },
  {
    stem: "Either the CEO or the board members __________ signing the merger agreement today.",
    options: ["is", "was", "are", "has been"],
    correct: 2,
    explanation: "With 'either…or', the verb agrees with the nearer subject — 'board members' (plural) → 'are'."
  },
  {
    stem: "The group of venture capitalists __________ deliberating on the Series A funding.",
    options: ["is", "are", "were", "have been"],
    correct: 0,
    explanation: "'Group' is a collective noun treated as singular → 'is'."
  },
  {
    stem: "One of the blue-chip stocks __________ its all-time high price this morning.",
    options: ["reach", "has reached", "have reached", "reaching"],
    correct: 1,
    explanation: "'One of the…' always takes a singular verb → 'has reached'."
  },
  {
    stem: "The bulk of the retail investors __________ panic-selling during the correction.",
    options: ["was", "were", "is", "has been"],
    correct: 1,
    explanation: "'Bulk of the investors' refers to a plural group → 'were'."
  },
  {
    stem: "By the time the news is officially announced, the stock __________ the impact.",
    options: ["will price in", "will have priced in", "prices in", "is pricing in"],
    correct: 1,
    explanation: "'By the time' with a present tense clause calls for future perfect → 'will have priced in'."
  },
  {
    stem: "The algorithmic system __________ for two hours before the server crashed.",
    options: ["runs", "had been running", "has been running", "was run"],
    correct: 1,
    explanation: "An action ongoing before another past event uses past perfect continuous → 'had been running'."
  },
  {
    stem: "While the trader __________ the candlesticks, he missed the volume breakout.",
    options: ["watches", "was watching", "has watched", "is watching"],
    correct: 1,
    explanation: "'While' with a background action in the past uses past continuous → 'was watching'."
  },
  {
    stem: "The startup __________ over five million dollars in seed capital so far.",
    options: ["raised", "had raised", "has raised", "will raise"],
    correct: 2,
    explanation: "'So far' signals present perfect → 'has raised'."
  },
  {
    stem: "The central bank __________ the repo rate in the upcoming monetary policy.",
    options: ["lowered", "will lower", "has lowered", "lowering"],
    correct: 1,
    explanation: "'Upcoming' indicates a future event → 'will lower'."
  },
  {
    stem: "If the analyst __________ the debt-to-equity ratio, he would have spotted the risk.",
    options: ["checked", "had checked", "has checked", "checks"],
    correct: 1,
    explanation: "Third conditional (past unreal) → 'If + had + past participle' → 'had checked'."
  },
  {
    stem: "By next December, the firm __________ its operations to three more countries.",
    options: ["expands", "will have expanded", "will expand", "expanded"],
    correct: 1,
    explanation: "'By next December' requires future perfect → 'will have expanded'."
  },
  {
    stem: "The commodity market __________ bearish for the entire duration of the last fiscal year.",
    options: ["is", "was", "are", "has being"],
    correct: 1,
    explanation: "The action is fully completed in the past → simple past 'was'."
  },
  {
    stem: "Scarcely __________ placed the limit order when the price hit the target.",
    options: ["had I", "I had", "have I", "I have"],
    correct: 0,
    explanation: "'Scarcely' at the start triggers inversion → 'had I placed'."
  },
  {
    stem: "Small-cap stocks are generally __________ than large-cap stocks.",
    options: ["risky", "riskier", "riskiest", "more risky"],
    correct: 1,
    explanation: "One-syllable adjectives form comparatives with '-er' → 'riskier'."
  },
  {
    stem: "Of all the sectors, Information Technology is currently the __________ lucrative.",
    options: ["more", "most", "much", "many"],
    correct: 1,
    explanation: "Superlative among all sectors → 'most lucrative'."
  },
  {
    stem: "The __________ the credit rating, the __________ the interest rate offered.",
    options: ["higher / lower", "highest / lowest", "high / low", "more high / more low"],
    correct: 0,
    explanation: "The 'the…the…' comparative structure uses comparative adjectives → 'higher / lower'."
  },
  {
    stem: "This year's fiscal deficit is __________ than what the economists projected.",
    options: ["wide", "wider", "widest", "more wide"],
    correct: 1,
    explanation: "Comparing two things with a one-syllable adjective → 'wider'."
  },
  {
    stem: "Intraday trading is __________ more stressful than long-term investing.",
    options: ["far", "very", "too", "much"],
    correct: 0,
    explanation: "'Far' is used to intensify comparatives in formal writing → 'far more stressful'."
  },
  {
    stem: "Her market analysis was __________ more accurate than the consensus.",
    options: ["much", "very", "most", "more"],
    correct: 0,
    explanation: "'Much' intensifies comparative adjectives → 'much more accurate'."
  },
  {
    stem: "Corporate bonds carry __________ risk than crypto-assets.",
    options: ["many", "few", "less", "least"],
    correct: 2,
    explanation: "'Risk' is an uncountable noun → 'less' (not 'fewer') is correct."
  },
  {
    stem: "If the inflation rate ___, the stock market would have rallied.",
    options: ["drops", "dropped", "had dropped", "has dropped"],
    correct: 2,
    explanation: "Third conditional → 'If + past perfect' → 'had dropped'."
  },
  {
    stem: "By the time the ticker updated, the opportunity ___.",
    options: ["vanishes", "vanished", "had vanished", "has vanished"],
    correct: 2,
    explanation: "Action completed before another past point → past perfect → 'had vanished'."
  },
  {
    stem: "No sooner ___ the bell rung than the orders flooded in.",
    options: ["had", "has", "was", "did"],
    correct: 0,
    explanation: "'No sooner…than' triggers inversion with past perfect → 'had the bell rung'."
  },
  {
    stem: "The prospectus, including the risk factors, ___ reviewed by the lawyers.",
    options: ["was", "were", "are", "have"],
    correct: 0,
    explanation: "The main subject 'prospectus' is singular; the parenthetical phrase is ignored → 'was'."
  },
  {
    stem: "He ___ as a financial consultant for a decade now.",
    options: ["works", "is working", "has been working", "worked"],
    correct: 2,
    explanation: "'For a decade now' signals an action starting in the past and continuing → present perfect continuous → 'has been working'."
  },
  {
    stem: "Neither the promoters nor the chairman ___ willing to sell their stake.",
    options: ["is", "was", "are", "has"],
    correct: 0,
    explanation: "With 'neither…nor', the verb agrees with the nearer subject — 'chairman' (singular) → 'is'."
  },
  {
    stem: "The accountant ___ the tax filings just before the closing hour.",
    options: ["finish", "finished", "finishes", "finishing"],
    correct: 1,
    explanation: "'Just before the closing hour' is a completed past action → simple past → 'finished'."
  },
  {
    stem: "The speculator talked as if he ___ the insider information.",
    options: ["has", "had", "have", "will"],
    correct: 1,
    explanation: "'As if' with a past main verb uses past simple or past perfect in the clause → 'had'."
  },
  {
    stem: "Each of the credit cards ___ a different interest rate.",
    options: ["are having", "were having", "have", "has"],
    correct: 3,
    explanation: "'Each of the…' takes a singular verb → 'has'."
  },
  {
    stem: "The stock is not only hitting new highs ___ breaking all resistance levels.",
    options: ["but", "and", "but also", "yet"],
    correct: 2,
    explanation: "'Not only…but also' is the correct correlative conjunction pair."
  },
  {
    stem: "You have updated your KYC, ___?",
    options: ["haven't you", "isn't it", "have you", "don't you"],
    correct: 0,
    explanation: "The main clause is positive ('have updated'), so the question tag is negative → 'haven't you'."
  },
  {
    stem: "The mentor explained the concept of compounding ___ great simplicity.",
    options: ["in", "with", "on", "at"],
    correct: 1,
    explanation: "'With' is the correct preposition to express manner → 'with great simplicity'."
  },
  {
    stem: "Not only ___ the price fall, but the trading volume also spiked.",
    options: ["was", "were", "did", "had"],
    correct: 2,
    explanation: "'Not only' at the start triggers inversion with auxiliary 'did' for simple past → 'did the price fall'."
  },
  {
    stem: "You ___ consult a certified planner before making large investments.",
    options: ["must", "should", "could", "might"],
    correct: 1,
    explanation: "'Should' expresses strong advice/recommendation — the most appropriate modal here."
  }
];

// ============================================================
//  SECTION B — 13 Fill-in-the-Blank → MCQ
// ============================================================
const sectionB = [
  {
    stem: "If the investor __________ the stop-loss, the damage would have been minimal.",
    options: ["sets", "had set", "would set", "has set"],
    correct: 1,
    explanation: "Third conditional (past unreal): 'If + past perfect' → 'had set'."
  },
  {
    stem: "The trade was cancelled __________ a technical error at the exchange.",
    options: ["despite", "due to", "because", "although"],
    correct: 1,
    explanation: "'Due to' is a preposition that introduces the cause of a noun event → 'due to a technical error'."
  },
  {
    stem: "The bull run will continue __________ the earnings reports stay positive.",
    options: ["until", "unless", "as long as", "even though"],
    correct: 2,
    explanation: "'As long as' introduces a condition that must remain true → correct here."
  },
  {
    stem: "The company apologized __________ the error in the annual report.",
    options: ["about", "on", "to", "for"],
    correct: 3,
    explanation: "'Apologize for' is the correct collocation in English."
  },
  {
    stem: "Beginners are cautioned __________ trading with high leverage.",
    options: ["from", "about", "against", "of"],
    correct: 2,
    explanation: "'Cautioned against' is the correct fixed expression → warns of a risk."
  },
  {
    stem: "The trader would have gained more if he __________ his profits run.",
    options: ["let", "would let", "had let", "has let"],
    correct: 2,
    explanation: "Third conditional → 'If + past perfect' → 'had let'."
  },
  {
    stem: "The NAV (Net Asset Value) __________ even higher if the mid-cap stocks had rallied.",
    options: ["would be", "will be", "would have been", "has been"],
    correct: 2,
    explanation: "Third conditional result clause → 'would have been'."
  },
  {
    stem: "Funds will be debited __________ you click the 'Confirm' button.",
    options: ["after", "as soon as", "before", "while"],
    correct: 1,
    explanation: "'As soon as' expresses immediate sequence — 'the moment you click' → 'as soon as'."
  },
  {
    stem: "The application was rejected __________ the mismatch in signature.",
    options: ["because", "since", "owing to", "as"],
    correct: 2,
    explanation: "'Owing to' is a formal prepositional phrase used to express cause → correct here."
  },
  {
    stem: "He trades the Nifty 50 as though he __________ a seasoned veteran.",
    options: ["is", "was", "were", "would be"],
    correct: 2,
    explanation: "'As though' expressing an unreal/hypothetical situation uses subjunctive 'were'."
  },
  {
    stem: "If the promoter __________ his shares, the bank would have sanctioned the loan.",
    options: ["pledged", "had pledged", "pledges", "would pledge"],
    correct: 1,
    explanation: "Third conditional → 'If + past perfect' → 'had pledged'."
  },
  {
    stem: "The strategy __________ profitable if the market hadn't turned sideways.",
    options: ["would be", "was", "would have been", "will be"],
    correct: 2,
    explanation: "Third conditional result clause → 'would have been'."
  },
  {
    stem: "If the government __________ tax incentives, the market wouldn't have reacted negatively.",
    options: ["offers", "offered", "had offered", "would offer"],
    correct: 2,
    explanation: "Third conditional → 'If + past perfect' → 'had offered'."
  }
];

// ============================================================
//  SECTION C — 17 Error Correction → MCQ
//  (Choose the correctly rewritten sentence)
// ============================================================
const sectionC = [
  {
    stem: "Which is the corrected version of: 'Each of the shareholders have received the dividend.'?",
    options: [
      "Each of the shareholders has received the dividend.",
      "Each of shareholders have received the dividend.",
      "Each shareholders has received the dividend.",
      "Shareholders of each has received the dividend."
    ],
    correct: 0,
    explanation: "'Each of the…' always takes a singular verb → 'has received'."
  },
  {
    stem: "Which is the corrected version of: 'The analyst don't believe the stock is overvalued.'?",
    options: [
      "The analyst don't believes the stock is overvalued.",
      "The analyst doesn't believes the stock is overvalued.",
      "The analyst doesn't believe the stock is overvalued.",
      "The analyst not believe the stock is overvalued."
    ],
    correct: 2,
    explanation: "Third-person singular subject 'analyst' requires 'doesn't' (not 'don't') + base verb 'believe'."
  },
  {
    stem: "Which is the corrected version of: 'The furnitures in the new trading floor are very modern.'?",
    options: [
      "The furniture in the new trading floor is very modern.",
      "The furnitures in the new trading floor is very modern.",
      "The furniture in the new trading floor are very modern.",
      "The furnitures in new trading floor is very modern."
    ],
    correct: 0,
    explanation: "'Furniture' is an uncountable noun — no plural form. Singular verb 'is' is correct."
  },
  {
    stem: "Which is the corrected version of: 'She was knowing about the market crash before it happened.'?",
    options: [
      "She was known about the market crash before it happened.",
      "She had been knowing about the market crash.",
      "She knew about the market crash before it happened.",
      "She knows about the market crash before it happened."
    ],
    correct: 2,
    explanation: "'Know' is a stative verb and does not take continuous form → simple past 'knew' is correct."
  },
  {
    stem: "Which is the corrected version of: 'I am watching this stock since last Monday.'?",
    options: [
      "I was watching this stock since last Monday.",
      "I have been watching this stock since last Monday.",
      "I had been watching this stock from last Monday.",
      "I am watching this stock from last Monday."
    ],
    correct: 1,
    explanation: "'Since' with an ongoing action from a past point to now requires present perfect continuous → 'have been watching'."
  },
  {
    stem: "Which is the corrected version of: 'The investor returned back the documents to the bank.'?",
    options: [
      "The investor returned the documents to the bank.",
      "The investor returned back documents to the bank.",
      "The investor has returned back the documents to the bank.",
      "The investor returned the documents back to bank."
    ],
    correct: 0,
    explanation: "'Return back' is redundant — 'return' already implies going back. Use 'returned the documents'."
  },
  {
    stem: "Which is the corrected version of: 'We need to discuss about the portfolio diversification.'?",
    options: [
      "We need to discuss about portfolio diversification.",
      "We need to discuss on the portfolio diversification.",
      "We need to discuss portfolio diversification.",
      "We need to discuss regarding portfolio diversification."
    ],
    correct: 2,
    explanation: "'Discuss' is a transitive verb — it does NOT take 'about'. Remove the preposition entirely."
  },
  {
    stem: "Which is the corrected version of: 'The asset prices has increased due to inflation.'?",
    options: [
      "The asset prices have increased due to inflation.",
      "The asset prices has increased because of inflation.",
      "The assets prices have increased due to inflation.",
      "The asset price has increased due to inflation."
    ],
    correct: 0,
    explanation: "'Asset prices' is plural → plural verb 'have increased' is correct."
  },
  {
    stem: "Which is the corrected version of: 'He trade in the commodity market every evening.'?",
    options: [
      "He trading in the commodity market every evening.",
      "He trades in the commodity market every evening.",
      "He is trade in the commodity market every evening.",
      "He do trade in the commodity market every evening."
    ],
    correct: 1,
    explanation: "Third-person singular subject 'he' in simple present requires 's' → 'trades'."
  },
  {
    stem: "Which is the corrected version of: 'The expert gave many useful financial advices to the students.'?",
    options: [
      "The expert gave many useful financial advice to the students.",
      "The expert gave much useful financial advice to the students.",
      "The expert gave much useful financial advices to the students.",
      "The expert gave many useful financial advises to the students."
    ],
    correct: 1,
    explanation: "'Advice' is an uncountable noun — no plural. Use 'much' (not 'many') for uncountable nouns."
  },
  {
    stem: "Which is the corrected version of: 'I am possessing ten gold ETFs in my portfolio.'?",
    options: [
      "I am possessing ten gold ETFs in my portfolio.",
      "I had possessed ten gold ETFs in my portfolio.",
      "I possess ten gold ETFs in my portfolio.",
      "I was possessing ten gold ETFs in my portfolio."
    ],
    correct: 2,
    explanation: "'Possess' is a stative verb and cannot be used in continuous form → simple present 'I possess'."
  },
  {
    stem: "Which is the corrected version of: 'There is many loopholes in the current tax system.'?",
    options: [
      "There are many loopholes in the current tax system.",
      "There is much loopholes in the current tax system.",
      "There is many loophole in the current tax system.",
      "There were many loopholes in current tax system."
    ],
    correct: 0,
    explanation: "'Loopholes' is countable and plural → 'there are many loopholes'."
  },
  {
    stem: "Which is the corrected version of: 'The index is falling from the last four days.'?",
    options: [
      "The index was falling from the last four days.",
      "The index falls for the last four days.",
      "The index has been falling for the last four days.",
      "The index is falling for the last four days."
    ],
    correct: 2,
    explanation: "An action continuing from a past point requires present perfect continuous with 'for' → 'has been falling for'."
  },
  {
    stem: "Which is the corrected version of: 'The CEO reverted back to the shareholders\\' concerns.'?",
    options: [
      "The CEO reverted to the shareholders' concerns.",
      "The CEO reverted back the shareholders' concerns.",
      "The CEO had reverted back to shareholders' concern.",
      "The CEO has reverted back to shareholders' concerns."
    ],
    correct: 0,
    explanation: "'Revert back' is redundant — 'revert' already means 'go back'. Use 'reverted to'."
  },
  {
    stem: "Which is the corrected version of: 'We need to describe about the new trading strategy.'?",
    options: [
      "We need to describe on the new trading strategy.",
      "We need to describe about new trading strategy.",
      "We need to describe the new trading strategy.",
      "We need to describe regarding the new trading strategy."
    ],
    correct: 2,
    explanation: "'Describe' is transitive — it does NOT take a preposition. Remove 'about'."
  },
  {
    stem: "Which is the corrected version of: 'The client did not signed the power of attorney.'?",
    options: [
      "The client did not sign the power of attorney.",
      "The client didn't signed the power of attorney.",
      "The client has not signed the power of attorney.",
      "The client did not signs the power of attorney."
    ],
    correct: 0,
    explanation: "After auxiliary 'did not', always use the base form of the verb → 'did not sign'."
  },
  {
    stem: "Which is the corrected version of: 'The portfolio crashed due to because of high volatility.'?",
    options: [
      "The portfolio crashed due to because high volatility.",
      "The portfolio crashed because of due to high volatility.",
      "The portfolio crashed due to high volatility.",
      "The portfolio crashed due to because of the high volatility."
    ],
    correct: 2,
    explanation: "'Due to' and 'because of' mean the same thing — use only one, not both."
  }
];

// ============================================================
//  Topics to insert
// ============================================================
const topics = [
  {
    module:      'grammar-assessment',
    title:       'Grammar Set 3 — Section A: MCQ (40 Questions)',
    description: 'Multiple-choice questions covering subject-verb agreement, tenses, comparatives, conditionals, and miscellaneous grammar rules in a financial context.',
    scenario:    '',
    checklist:   sectionA,
    bot_script:  [],
    enabled:     true,
    created_at:  new Date().toISOString()
  },
  {
    module:      'grammar-assessment',
    title:       'Grammar Set 3 — Section B: Fill in the Blanks (13 Questions)',
    description: 'Choose the correct word or phrase to complete each sentence. Topics include conditionals, prepositions, and conjunctions in a financial context.',
    scenario:    '',
    checklist:   sectionB,
    bot_script:  [],
    enabled:     true,
    created_at:  new Date().toISOString()
  },
  {
    module:      'grammar-assessment',
    title:       'Grammar Set 3 — Section C: Error Correction (17 Questions)',
    description: 'Identify the grammatically correct rewrite of each erroneous sentence. Tests common errors like incorrect verb forms, wrong prepositions, and uncountable nouns.',
    scenario:    '',
    checklist:   sectionC,
    bot_script:  [],
    enabled:     true,
    created_at:  new Date().toISOString()
  }
];

// ============================================================
//  Insert into Supabase
// ============================================================
async function seed() {
  console.log('🚀 Seeding Grammar Assessment Set 3 into Supabase...\n');

  for (const topic of topics) {
    process.stdout.write(`  Inserting "${topic.title}" (${topic.checklist.length} questions)... `);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/topics`, {
      method:  'POST',
      headers: HEADERS,
      body:    JSON.stringify(topic)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ FAILED\n    ${err}`);
    } else {
      const data = await res.json();
      console.log(`✅ Inserted (id: ${data[0]?.id ?? 'ok'})`);
    }
  }

  console.log('\n✅ All done! Go to Admin → Topics → Grammar to confirm.');
}

seed().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
