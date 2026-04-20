/**
 * Delete duplicate / wrong Grammar Set 2 entries then re-seed Section A with exactly 40 questions.
 */
const SUPABASE_URL = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// IDs to delete (dupes + the 41-question Section A)
const TO_DELETE = [
  'd376a8d1-2199-4af6-ac79-529da832c532', // run1 Section A (dupe)
  'd8032ad7-43ad-45bb-8537-d53d6b6722b0', // run1 Section B (dupe)
  '93f447d3-2d37-4b51-900d-6ac22f1fdb7c', // run2 Section A (41 qs — wrong count)
];

// Correct Section A — exactly 40 questions
const sectionA = [
  { stem: "Neither the auditors nor the CFO __________ aware of the discrepancy before the filing deadline.", options: ["was", "were", "has been", "have been"], correct: 0, explanation: "'Neither...nor' → verb agrees with the nearer subject 'CFO' (singular) → 'was'." },
  { stem: "The company's profit, together with its subsidiary earnings, __________ projected to double this fiscal year.", options: ["are", "were", "is", "have been"], correct: 2, explanation: "'Together with' is parenthetical. The main subject 'profit' is singular → 'is'." },
  { stem: "She __________ the risk parameters for nearly four hours before the trading system crashed.", options: ["monitored", "was monitoring", "has monitored", "had been monitoring"], correct: 3, explanation: "Past perfect continuous ('had been monitoring') shows an ongoing action that continued until a specific past point — before the crash." },
  { stem: "The regulator recommended that every listed company __________ its disclosures on a quarterly basis.", options: ["updates", "update", "updated", "is updating"], correct: 1, explanation: "After 'recommended that', the subjunctive mood requires the bare infinitive → 'update'." },
  { stem: "__________ the RBI's policy statement, the bond markets rallied sharply.", options: ["Following", "Followed by", "After following", "Having been followed by"], correct: 0, explanation: "'Following' used as a preposition means 'after' → 'Following the RBI's policy statement'." },
  { stem: "The sharp __________ in crude oil prices caught most commodity traders off guard.", options: ["rise", "raise", "raising", "risen"], correct: 0, explanation: "'Rise' (noun) = a natural increase. 'Raise' implies a deliberate act. Crude oil prices rise on their own → 'rise'." },
  { stem: "The broker, whose advice __________ the client to significant losses, had his licence suspended.", options: ["led", "lead", "leads", "had led"], correct: 3, explanation: "The advice led to losses before the licence was suspended — past perfect 'had led' correctly sequences these events." },
  { stem: "Achieving financial independence requires not only discipline __________ a long-term investment mindset.", options: ["but", "and", "but also", "as well as"], correct: 2, explanation: "'Not only... but also' is the fixed correlative conjunction pair — 'but also' is the correct completion." },
  { stem: "If the interest rates __________ by 50 basis points next quarter, EMI burdens will increase across the board.", options: ["rise", "will rise", "rises", "rose"], correct: 0, explanation: "In a real (Type 1) conditional, the if-clause uses simple present → 'rise', not 'will rise'." },
  { stem: "The settlement required that the client __________ a fresh indemnity bond before the refund could be processed.", options: ["signs", "sign", "signed", "is signing"], correct: 1, explanation: "After 'required that', the subjunctive mood requires the bare infinitive → 'sign'." },
  { stem: "It was the branch manager, not the relationship executives, who __________ authorised the unauthorised overdraft.", options: ["had", "have", "has", "were"], correct: 0, explanation: "The subject is 'branch manager' (singular). Past perfect 'had authorised' shows the action preceded its discovery." },
  { stem: "The window of arbitrage __________ long before the retail investor could act on the trading signal.", options: ["closed", "had closed", "was closing", "has closed"], correct: 1, explanation: "The closing preceded another past action → past perfect 'had closed'." },
  { stem: "The sales team's performance over the last six months __________ the management team greatly.", options: ["have impressed", "has impressed", "impress", "is impressing"], correct: 1, explanation: "'The sales team's performance' — 'performance' is the head noun (singular) → 'has impressed'." },
  { stem: "The policy requires that all transactions above ₹10 lakh __________ reported to the compliance team immediately.", options: ["be", "are", "were", "should be"], correct: 0, explanation: "After 'requires that', the subjunctive passive requires the bare infinitive → 'be reported'." },
  { stem: "__________ the demat account has been opened, the client is eligible to place orders on any exchange.", options: ["Once", "Until", "Unless", "Provided"], correct: 0, explanation: "'Once' introduces a time clause meaning 'as soon as/after' — fits the sequential logic here perfectly." },
  { stem: "The fewer __________ an investor makes impulsively, the lower the brokerage cost over time.", options: ["trades", "trading", "traded", "trade"], correct: 0, explanation: "'Fewer' collocates with countable plural nouns → 'fewer trades'. 'Less' is used with uncountable nouns." },
  { stem: "By the time the fraud was detected, the perpetrators __________ over ₹2 crore through shell accounts.", options: ["siphoned", "had siphoned", "have siphoned", "were siphoning"], correct: 1, explanation: "'By the time + simple past' requires past perfect in the main clause → 'had siphoned'." },
  { stem: "The market correction __________ more severe had the RBI not stepped in with an emergency liquidity measure.", options: ["would be", "would have been", "will be", "had been"], correct: 1, explanation: "Third conditional (unreal past) result clause → 'would have been'." },
  { stem: "Each of the mutual fund schemes __________ its own risk profile, investment objective, and exit load.", options: ["have", "has", "are having", "have had"], correct: 1, explanation: "'Each of the...' always takes a singular verb → 'has'." },
  { stem: "The analyst, as well as his research associates, __________ scheduled to present the Q2 earnings findings.", options: ["are", "were", "was", "have been"], correct: 2, explanation: "'As well as' is parenthetical. The main subject 'the analyst' is singular → 'was'." },
  { stem: "She looked __________ after reading the downgraded credit rating report issued by the agency.", options: ["distressed", "distressingly", "distressing", "with distress"], correct: 0, explanation: "'Looked' is a linking verb — it takes an adjective (subject complement) → 'distressed', not an adverb." },
  { stem: "The client stopped __________ the agent once she realised the financial product was completely unsuitable.", options: ["to trust", "trusting", "having trusted", "trust"], correct: 1, explanation: "'Stop + gerund' = cease doing. 'Stop + infinitive' = pause in order to do. 'Stopped trusting' = no longer trusted." },
  { stem: "The quarterly report, __________ was submitted three days past the deadline, contained several factual errors.", options: ["that", "which", "what", "whom"], correct: 1, explanation: "A non-restrictive clause (extra information, set off by commas) uses 'which', not 'that'." },
  { stem: "There __________ widespread speculation in the market about an imminent RBI rate cut before Friday's announcement.", options: ["are", "were", "has been", "have been"], correct: 2, explanation: "'Speculation' is uncountable (singular) → 'has been'." },
  { stem: "The FD __________ matured by the time the investor needed the funds to cover his margin call.", options: ["had", "has", "would have", "will have"], correct: 0, explanation: "The FD's maturity preceded the investor's need — past perfect 'had matured'." },
  { stem: "Neither the stock tip __________ the broker's official recommendation turned out to be accurate.", options: ["or", "nor", "and", "but"], correct: 1, explanation: "'Neither...nor' is the fixed correlative conjunction pair. 'Neither...or' is non-standard." },
  { stem: "The compliance audit revealed that the agent __________ any risk disclosures to the client prior to onboarding.", options: ["did not make", "has not made", "had not made", "was not making"], correct: 2, explanation: "Past perfect 'had not made' shows the non-disclosure preceded the audit finding." },
  { stem: "__________ the client had read the fine print carefully, she would not have signed the agreement.", options: ["Had", "If", "Unless", "Provided"], correct: 0, explanation: "Inverted third conditional (without 'if') → 'Had the client read' = 'If the client had read'." },
  { stem: "She is one of those traders who __________ extremely calm and analytical even under intense market stress.", options: ["remains", "remain", "is remaining", "has remained"], correct: 1, explanation: "'One of those... who' → verb agrees with plural antecedent ('traders') → 'remain'." },
  { stem: "The number of high-net-worth clients __________ significantly over the past five financial years.", options: ["have grown", "has grown", "are growing", "were growing"], correct: 1, explanation: "'The number of...' is singular (contrast: 'A number of...' is plural) → 'has grown'." },
  { stem: "The financial advisor suggested __________ in tax-saving instruments before the end of the financial year.", options: ["to invest", "investing", "to have invested", "being invested"], correct: 1, explanation: "'Suggest' takes a gerund (not infinitive) → 'suggested investing'." },
  { stem: "The investment would have yielded far better returns, __________ the fund management fees been lower.", options: ["had", "if", "were", "unless"], correct: 0, explanation: "Inverted third conditional → 'had the fees been lower' = 'if the fees had been lower'." },
  { stem: "No sooner __________ the buyback announcement than the stock surged and hit its upper circuit.", options: ["did the company make", "had the company made", "the company made", "the company had made"], correct: 1, explanation: "'No sooner... than' triggers inversion and requires past perfect → 'had the company made'." },
  { stem: "The trader was found guilty of __________ client funds for his personal use over a period of eighteen months.", options: ["misusing", "the misuse", "misused", "to misuse"], correct: 0, explanation: "'Found guilty of' takes a gerund → 'misusing'." },
  { stem: "The firm's exposure to junk bonds is far greater than __________ of any other investment house in the sector.", options: ["which", "those", "that", "what"], correct: 2, explanation: "'Exposure' is singular → use singular pronoun 'that' to avoid repetition → 'than that of any other'." },
  { stem: "The SEBI directive, __________ by most brokerage houses as overly restrictive, was later amended after consultations.", options: ["welcomed", "welcoming", "criticised", "being welcomed"], correct: 2, explanation: "The context says 'overly restrictive' — logically it was 'criticised'. Past participle as a reduced passive relative clause." },
  { stem: "The portfolio manager admitted __________ the client's risk tolerance form before recommending the product.", options: ["to overlook", "overlooking", "having overlooked", "to have overlooked"], correct: 2, explanation: "After 'admitted', a gerund or perfect gerund is required. 'Having overlooked' (perfect gerund) conveys a completed past action that was then confessed." },
  { stem: "The merger __________ have proceeded smoothly had both legal teams agreed on the valuation methodology.", options: ["would", "could", "might", "should"], correct: 0, explanation: "'Would have' in the third conditional expresses a definite alternate outcome. 'Could/might' express possibility; 'should' implies obligation." },
  { stem: "Scarcely __________ the trading halt been lifted when another wave of sell orders flooded the exchange.", options: ["had", "has", "was", "did"], correct: 0, explanation: "'Scarcely... when' triggers auxiliary inversion with past perfect → 'Scarcely had the trading halt been lifted'." },
  { stem: "The risk committee insists that the stress-testing framework __________ updated at least twice every fiscal year.", options: ["be", "is", "are", "was"], correct: 0, explanation: "After 'insists that', the subjunctive mood (bare infinitive) is required → 'be updated'." },
];

async function run() {
  // Step 1: Delete the wrong/duplicate entries
  console.log('🗑  Deleting duplicate / wrong entries...');
  for (const id of TO_DELETE) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    console.log(`   DELETE ${id} → ${r.status}`);
  }

  // Step 2: Insert the correct 40-question Section A
  console.log('\n📥 Inserting Grammar Set 2 — Section A (40 questions)...');
  const payload = {
    module: 'grammar-assessment',
    title: 'Grammar Set 2 — Section A: MCQ (40 Questions)',
    description: 'Choose the single best answer. Topics include subject-verb agreement, tenses, conditionals, articles, and advanced grammar in a financial context.',
    scenario: '', checklist: sectionA, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/topics`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(payload)
  });
  if (!r.ok) {
    console.error('❌ Failed:', await r.text());
  } else {
    const d = await r.json();
    console.log(`✅ Inserted Section A (id: ${d[0]?.id}, questions: ${sectionA.length})`);
  }
  console.log('\n✅ Done! Grammar Set 2 is clean: 40 + 13 + 17 = 70 questions.');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
