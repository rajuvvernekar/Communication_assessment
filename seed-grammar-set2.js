/**
 * Seed Grammar Set 2 — Section A (40 Qs), Section B (13 Qs), Section C (17 Qs)
 * Run: node seed-grammar-set2.js
 */
const SUPABASE_URL = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';

const HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

// ─────────────────────────────────────────────────────────────────
//  SECTION A — 40 MCQ questions (1 mark each)
//  Very tough; confusingly similar options
// ─────────────────────────────────────────────────────────────────
const sectionA = [
  {
    stem: "Neither the auditors nor the CFO __________ aware of the discrepancy before the filing deadline.",
    options: ["was", "were", "has been", "have been"],
    correct: 0,
    explanation: "'Neither...nor' → the verb agrees with the nearer subject 'CFO' (singular) → 'was'."
  },
  {
    stem: "The company's profit, together with its subsidiary earnings, __________ projected to double this fiscal year.",
    options: ["are", "were", "is", "have been"],
    correct: 2,
    explanation: "'Together with' is parenthetical. The main subject 'profit' is singular → 'is'."
  },
  {
    stem: "She __________ the risk parameters for nearly four hours before the trading system crashed.",
    options: ["monitored", "was monitoring", "has monitored", "had been monitoring"],
    correct: 3,
    explanation: "Past perfect continuous ('had been monitoring') shows an ongoing action that continued until a specific past point — before the crash."
  },
  {
    stem: "The regulator recommended that every listed company __________ its disclosures on a quarterly basis.",
    options: ["updates", "update", "updated", "is updating"],
    correct: 1,
    explanation: "After 'recommended that', the subjunctive mood requires the bare infinitive → 'update'."
  },
  {
    stem: "__________ the RBI's policy statement, the bond markets rallied sharply.",
    options: ["Following", "Followed by", "After following", "Having been followed by"],
    correct: 0,
    explanation: "'Following' used as a preposition means 'after' → 'Following the RBI's policy statement'."
  },
  {
    stem: "The sharp __________ in crude oil prices caught most commodity traders off guard.",
    options: ["rise", "raise", "raising", "risen"],
    correct: 0,
    explanation: "'Rise' (noun) = a natural increase. 'Raise' implies a deliberate act. Crude oil prices rise on their own → 'rise'."
  },
  {
    stem: "The broker, whose advice __________ the client to significant losses, had his licence suspended.",
    options: ["led", "lead", "leads", "had led"],
    correct: 3,
    explanation: "The advice led to losses before the licence was suspended — past perfect 'had led' correctly sequences these events."
  },
  {
    stem: "Achieving financial independence requires not only discipline __________ a long-term investment mindset.",
    options: ["but", "and", "but also", "as well as"],
    correct: 2,
    explanation: "'Not only... but also' is the fixed correlative conjunction pair — 'but also' is the correct completion."
  },
  {
    stem: "If the interest rates __________ by 50 basis points next quarter, EMI burdens will increase across the board.",
    options: ["rise", "will rise", "rises", "rose"],
    correct: 0,
    explanation: "In a real (Type 1) conditional, the if-clause uses simple present → 'rise', not 'will rise'."
  },
  {
    stem: "The settlement required that the client __________ a fresh indemnity bond before the refund could be processed.",
    options: ["signs", "sign", "signed", "is signing"],
    correct: 1,
    explanation: "After 'required that', the subjunctive mood requires the bare infinitive → 'sign'."
  },
  {
    stem: "It was the branch manager, not the relationship executives, who __________ authorised the unauthorised overdraft.",
    options: ["had", "have", "has", "were"],
    correct: 0,
    explanation: "The subject is 'branch manager' (singular). 'Who had authorised' uses past perfect to show the action preceded its discovery."
  },
  {
    stem: "The window of arbitrage __________ long before the retail investor could act on the trading signal.",
    options: ["closed", "had closed", "was closing", "has closed"],
    correct: 1,
    explanation: "The closing preceded another past action → past perfect 'had closed'."
  },
  {
    stem: "The sales team's performance over the last six months __________ the management team greatly.",
    options: ["have impressed", "has impressed", "impress", "is impressing"],
    correct: 1,
    explanation: "'The sales team's performance' — 'performance' is the head noun (singular) → 'has impressed'."
  },
  {
    stem: "The policy requires that all transactions above ₹10 lakh __________ reported to the compliance team immediately.",
    options: ["be", "are", "were", "should be"],
    correct: 0,
    explanation: "After 'requires that', the subjunctive passive requires the bare infinitive → 'be reported'."
  },
  {
    stem: "__________ the demat account has been opened, the client is eligible to place orders on any exchange.",
    options: ["Once", "Until", "Unless", "Provided"],
    correct: 0,
    explanation: "'Once' introduces a time clause meaning 'as soon as/after' — fits the sequential logic here perfectly."
  },
  {
    stem: "The fewer __________ an investor makes impulsively, the lower the brokerage cost over time.",
    options: ["trades", "trading", "traded", "trade"],
    correct: 0,
    explanation: "'Fewer' collocates with countable plural nouns → 'fewer trades'. 'Less' would be used with uncountable nouns."
  },
  {
    stem: "By the time the fraud was detected, the perpetrators __________ over ₹2 crore through shell accounts.",
    options: ["siphoned", "had siphoned", "have siphoned", "were siphoning"],
    correct: 1,
    explanation: "'By the time + simple past' requires past perfect in the main clause → 'had siphoned'."
  },
  {
    stem: "The market correction __________ more severe had the RBI not stepped in with an emergency liquidity measure.",
    options: ["would be", "would have been", "will be", "had been"],
    correct: 1,
    explanation: "Third conditional (unreal past) result clause → 'would have been'."
  },
  {
    stem: "Each of the mutual fund schemes __________ its own risk profile, investment objective, and exit load.",
    options: ["have", "has", "are having", "have had"],
    correct: 1,
    explanation: "'Each of the...' always takes a singular verb → 'has'."
  },
  {
    stem: "The analyst, as well as his research associates, __________ scheduled to present the Q2 earnings findings.",
    options: ["are", "were", "was", "have been"],
    correct: 2,
    explanation: "'As well as' is parenthetical. The main subject 'the analyst' is singular → 'was'."
  },
  {
    stem: "She looked __________ after reading the downgraded credit rating report issued by the agency.",
    options: ["distressed", "distressingly", "distressing", "with distress"],
    correct: 0,
    explanation: "'Looked' is a linking verb here — it takes an adjective (subject complement) → 'distressed', not an adverb."
  },
  {
    stem: "The client stopped __________ the agent once she realised the financial product was completely unsuitable.",
    options: ["to trust", "trusting", "having trusted", "trust"],
    correct: 1,
    explanation: "'Stop + gerund' = cease doing. 'Stop + infinitive' = pause in order to do. 'Stopped trusting' = no longer trusted."
  },
  {
    stem: "The quarterly report, __________ was submitted three days past the deadline, contained several factual errors.",
    options: ["that", "which", "what", "whom"],
    correct: 1,
    explanation: "A non-restrictive clause (extra information, set off by commas) uses 'which', not 'that' → 'which was submitted'."
  },
  {
    stem: "There __________ widespread speculation in the market about an imminent RBI rate cut before Friday's announcement.",
    options: ["are", "were", "has been", "have been"],
    correct: 2,
    explanation: "'Speculation' is uncountable (singular) → 'has been'. 'Have been' requires a plural noun."
  },
  {
    stem: "The FD __________ matured by the time the investor needed the funds to cover his margin call.",
    options: ["had", "has", "would have", "will have"],
    correct: 0,
    explanation: "The FD's maturity preceded the investor's need — past perfect 'had matured'."
  },
  {
    stem: "Neither the stock tip __________ the broker's official recommendation turned out to be accurate.",
    options: ["or", "nor", "and", "but"],
    correct: 1,
    explanation: "'Neither...nor' is the fixed correlative conjunction pair. 'Neither...or' is non-standard and incorrect."
  },
  {
    stem: "The compliance audit revealed that the agent __________ any risk disclosures to the client prior to onboarding.",
    options: ["did not make", "has not made", "had not made", "was not making"],
    correct: 2,
    explanation: "In a reported past context, past perfect 'had not made' shows the non-disclosure preceded the audit finding."
  },
  {
    stem: "__________ the client had read the fine print carefully, she would not have signed the agreement.",
    options: ["Had", "If", "Unless", "Provided"],
    correct: 0,
    explanation: "Inverted third conditional (without 'if') → 'Had the client read' = 'If the client had read'."
  },
  {
    stem: "She is one of those traders who __________ extremely calm and analytical even under intense market stress.",
    options: ["remains", "remain", "is remaining", "has remained"],
    correct: 1,
    explanation: "'One of those... who' → the verb agrees with the plural antecedent ('traders') → 'remain'."
  },
  {
    stem: "The number of high-net-worth clients __________ significantly over the past five financial years.",
    options: ["have grown", "has grown", "are growing", "were growing"],
    correct: 1,
    explanation: "'The number of...' is singular (contrast: 'A number of...' is plural) → 'has grown'."
  },
  {
    stem: "The financial advisor suggested __________ in tax-saving instruments before the end of the financial year.",
    options: ["to invest", "investing", "to have invested", "being invested"],
    correct: 1,
    explanation: "'Suggest' takes a gerund (not infinitive) → 'suggested investing'. 'Suggested to invest' is non-standard."
  },
  {
    stem: "The investment would have yielded far better returns, __________ the fund management fees been lower.",
    options: ["had", "if", "were", "unless"],
    correct: 0,
    explanation: "Inverted third conditional negative → 'had the fees been lower' = 'if the fees had been lower'."
  },
  {
    stem: "No sooner __________ the buyback announcement than the stock surged and hit its upper circuit.",
    options: ["did the company make", "had the company made", "the company made", "the company had made"],
    correct: 1,
    explanation: "'No sooner... than' triggers subject-auxiliary inversion and requires past perfect → 'had the company made'."
  },
  {
    stem: "The trader was found guilty of __________ client funds for his personal use over a period of eighteen months.",
    options: ["misusing", "the misuse", "misused", "to misuse"],
    correct: 0,
    explanation: "'Found guilty of' takes a gerund → 'misusing'. An infinitive or noun phrase does not follow 'of' in this pattern."
  },
  {
    stem: "The firm's exposure to junk bonds is far greater than __________ of any other investment house in the sector.",
    options: ["which", "those", "that", "what"],
    correct: 2,
    explanation: "'Exposure' is singular, so use the singular pronoun 'that' (not 'those') to avoid repetition → 'than that of any other'."
  },
  {
    stem: "The SEBI directive, __________ by most brokerage houses as overly restrictive, was later amended after consultations.",
    options: ["welcomed", "welcoming", "being welcomed", "criticised"],
    correct: 3,
    explanation: "The context says it was 'overly restrictive' — logically it was 'criticised', not welcomed. Grammatically, past participle as reduced passive clause."
  },
  {
    stem: "The portfolio manager admitted __________ the client's risk tolerance form before recommending the product.",
    options: ["to overlook", "overlooking", "having overlooked", "to have overlooked"],
    correct: 2,
    explanation: "After 'admitted', a gerund or perfect gerund is required. 'Having overlooked' (perfect gerund) best conveys a completed past action that was then confessed."
  },
  {
    stem: "The merger __________ have proceeded smoothly had both legal teams agreed on the valuation methodology.",
    options: ["would", "could", "might", "should"],
    correct: 0,
    explanation: "'Would have' in the third conditional expresses a definite alternate outcome. 'Could/might' express possibility; 'should' implies obligation."
  },
  {
    stem: "Scarcely __________ the trading halt been lifted when another wave of sell orders flooded the exchange.",
    options: ["had", "has", "was", "did"],
    correct: 0,
    explanation: "'Scarcely... when' triggers auxiliary inversion with past perfect → 'Scarcely had the trading halt been lifted'."
  },
  {
    stem: "The client's __________ to repay the loan on time saved her from a significant credit score penalty.",
    options: ["ability", "capable", "capable of", "ableness"],
    correct: 0,
    explanation: "'Ability' is the correct noun form. 'Capable' is an adjective; 'capable of' is an adjective phrase; 'ableness' is not standard English."
  },
  {
    stem: "The risk committee insists that the stress-testing framework __________ updated at least twice every fiscal year.",
    options: ["be", "is", "are", "was"],
    correct: 0,
    explanation: "After 'insists that', the subjunctive mood (bare infinitive) is required in formal writing → 'be updated'."
  }
];

// ─────────────────────────────────────────────────────────────────
//  SECTION B — 13 Fill-in-the-Blank questions (2 marks each)
//  Conditionals, prepositions, conjunctions — very tricky options
// ─────────────────────────────────────────────────────────────────
const sectionB = [
  {
    stem: "If the client __________ the SIP at the beginning of the year, the corpus would have been significantly larger.",
    options: ["had started", "started", "would start", "has started"],
    correct: 0,
    explanation: "Third conditional (unreal past): 'If + past perfect' → 'had started'."
  },
  {
    stem: "The derivatives contract will lapse __________ the settlement amount is paid before the midnight deadline.",
    options: ["unless", "until", "if", "as long as"],
    correct: 0,
    explanation: "'Unless' = 'if not' — the contract lapses if the condition is NOT met. 'If' and 'as long as' imply positive conditions; 'until' implies waiting."
  },
  {
    stem: "The trader was warned __________ taking unhedged positions in highly volatile commodity futures.",
    options: ["about", "against", "from", "of"],
    correct: 1,
    explanation: "'Warned against' is the fixed collocation — it conveys a prohibition or strong caution about a risky action."
  },
  {
    stem: "Had the central bank __________ its dovish stance, inflation would have spiralled out of control.",
    options: ["maintained", "maintain", "not maintained", "been maintaining"],
    correct: 2,
    explanation: "The sentence implies the bank did NOT maintain its dovish stance (and inflation was controlled). Inverted third conditional → 'not maintained'."
  },
  {
    stem: "The compliance officer complied __________ the SEBI directive on margin pledging within the stipulated deadline.",
    options: ["to", "with", "in", "about"],
    correct: 1,
    explanation: "'Comply with' is the fixed English collocation — no other preposition is correct."
  },
  {
    stem: "The hedging strategy works effectively __________ market conditions remain stable and system liquidity is adequate.",
    options: ["provided that", "in case", "even though", "despite"],
    correct: 0,
    explanation: "'Provided that' introduces a conditional clause ('on the condition that') — only works if the condition is met."
  },
  {
    stem: "The performance report would have been accurate if the underlying data __________ verified manually.",
    options: ["had been", "was", "were", "has been"],
    correct: 0,
    explanation: "Third conditional passive if-clause: 'If + past perfect passive' → 'had been verified'."
  },
  {
    stem: "He continued trading __________ the fact that the market was showing clear signs of an imminent correction.",
    options: ["despite", "in spite", "although", "regardless"],
    correct: 0,
    explanation: "'Despite' directly precedes a noun phrase ('the fact that...'). 'In spite' requires 'of'; 'although' introduces a clause without 'the fact that'; 'regardless' needs 'of'."
  },
  {
    stem: "The portfolio __________ performed significantly better if the fund manager had reacted to the early market signals.",
    options: ["would have", "would", "could", "had"],
    correct: 0,
    explanation: "Third conditional result clause → 'would have performed'. 'Would' alone is incomplete; 'could' implies mere possibility; 'had' is incorrect."
  },
  {
    stem: "The relationship manager apologised __________ the unexplained delay in executing the client's limit order.",
    options: ["about", "on", "for", "over"],
    correct: 2,
    explanation: "'Apologise for' is the correct fixed collocation in English — followed by the cause of the apology."
  },
  {
    stem: "The NAV __________ declined further had the equity markets not stabilised by the end of the settlement month.",
    options: ["would have", "would", "could", "had"],
    correct: 0,
    explanation: "Third conditional result clause with inverted if-clause → 'would have declined'. The 'had...not' is the inverted if-clause."
  },
  {
    stem: "Regulators insist that all client agreements __________ signed in the presence of a witness before the first transaction.",
    options: ["be", "are", "were", "should be"],
    correct: 0,
    explanation: "After 'insist that', the subjunctive mood requires the bare infinitive passive → 'be signed'."
  },
  {
    stem: "The fund performed as though it __________ completely insulated from all global macroeconomic pressures.",
    options: ["is", "was", "were", "would be"],
    correct: 2,
    explanation: "'As though' expressing a hypothetical comparison uses the subjunctive 'were' (not 'was') in formal and written English."
  }
];

// ─────────────────────────────────────────────────────────────────
//  SECTION C — 17 Error Correction questions (2 marks each)
// ─────────────────────────────────────────────────────────────────
const sectionC = [
  {
    stem: "Which is the corrected version of: 'The trader has been working in the derivatives segment since five years.'?",
    options: [
      "The trader has been working in the derivatives segment for five years.",
      "The trader is working in the derivatives segment since five years.",
      "The trader was working in the derivatives segment since five years.",
      "The trader had been working in the derivatives segment since five years."
    ],
    correct: 0,
    explanation: "'For' is used with a duration ('five years'); 'since' is used with a point in time. Present perfect continuous with 'for' → 'has been working for five years'."
  },
  {
    stem: "Which is the corrected version of: 'He is one of the best analyst who have worked in this firm.'?",
    options: [
      "He is one of the best analysts who has worked in this firm.",
      "He is one of the best analysts who have worked in this firm.",
      "He is one of the best analyst who has worked in this firm.",
      "He is one of the best analysts who had worked in this firm."
    ],
    correct: 1,
    explanation: "'One of the best analysts who...' — the relative clause verb agrees with the plural 'analysts', not the singular 'one' → 'have worked'."
  },
  {
    stem: "Which is the corrected version of: 'The reason for the market fall is because global cues were negative.'?",
    options: [
      "The reason for the market fall is that global cues were negative.",
      "The reason for the market fall is because of the negative global cues.",
      "The reason for the market fall was because global cues were negative.",
      "The reason for the market fall is because global cues are negative."
    ],
    correct: 0,
    explanation: "'The reason... is because' is redundant and non-standard. The correct form is 'The reason... is that'."
  },
  {
    stem: "Which is the corrected version of: 'Hardly had the trading session started, the circuit breaker was triggered.'?",
    options: [
      "Hardly had the trading session started than the circuit breaker was triggered.",
      "Hardly had the trading session started when the circuit breaker was triggered.",
      "Hardly the trading session started when the circuit breaker was triggered.",
      "Hardly did the trading session start when the circuit breaker was triggered."
    ],
    correct: 1,
    explanation: "'Hardly... when' is the correct collocation. 'No sooner... than' uses 'than', but 'hardly/scarcely' must be followed by 'when'. Inversion after 'hardly' requires past perfect."
  },
  {
    stem: "Which is the corrected version of: 'The broker suggested to invest in tax-free bonds before the financial year ends.'?",
    options: [
      "The broker suggested investing in tax-free bonds before the financial year ends.",
      "The broker suggested to invest in tax-free bonds before the financial year ended.",
      "The broker suggested investing in tax-free bonds before the financial year ended.",
      "The broker suggested for investing in tax-free bonds before the financial year ends."
    ],
    correct: 2,
    explanation: "Two errors: 'suggest' takes a gerund ('investing', not 'to invest'), and past tense context requires 'ended' in the subordinate time clause."
  },
  {
    stem: "Which is the corrected version of: 'She is more efficient than any agent in the team.'?",
    options: [
      "She is more efficient than any other agent in the team.",
      "She is the most efficient than any agent in the team.",
      "She is more efficient from any agent in the team.",
      "She is more efficient than every agent in the team."
    ],
    correct: 0,
    explanation: "Comparing one member with all others in the same group requires 'any other' to avoid the illogical implication that she is more efficient than herself."
  },
  {
    stem: "Which is the corrected version of: 'The management is comprised of five senior directors.'?",
    options: [
      "The management comprises five senior directors.",
      "The management is comprised by five senior directors.",
      "The management is comprising of five senior directors.",
      "The management has comprised five senior directors."
    ],
    correct: 0,
    explanation: "'Comprise' (to consist of) is active — it does not take 'of' or passive form 'is comprised of'. Correct: 'The management comprises five senior directors.'"
  },
  {
    stem: "Which is the corrected version of: 'Neither the portfolio manager nor the analysts was informed about the restructuring.'?",
    options: [
      "Neither the portfolio manager nor the analysts were informed about the restructuring.",
      "Neither the portfolio manager nor the analysts had informed about the restructuring.",
      "Neither the portfolio manager nor analysts was informed about the restructuring.",
      "Neither the portfolio managers nor the analysts was informed about the restructuring."
    ],
    correct: 0,
    explanation: "'Neither...nor' — the verb agrees with the closest subject ('analysts' = plural) → 'were informed'."
  },
  {
    stem: "Which is the corrected version of: 'The news about the rate cut were well received by the bond market.'?",
    options: [
      "The news about the rate cut was well received by the bond market.",
      "The news about the rate cut have been well received by the bond market.",
      "The news about the rate cuts were well received by the bond market.",
      "The news about the rate cut are well received by the bond market."
    ],
    correct: 0,
    explanation: "'News' is an uncountable singular noun → singular verb 'was'."
  },
  {
    stem: "Which is the corrected version of: 'She could not convince the client, despite of her best efforts.'?",
    options: [
      "She could not convince the client, despite her best efforts.",
      "She could not convince the client, despite of making her best efforts.",
      "She could not convince the client, in despite of her best efforts.",
      "She could not convince the client, despite of the best efforts she made."
    ],
    correct: 0,
    explanation: "'Despite' does not take 'of'. The correct form is 'despite + noun phrase' (no 'of')."
  },
  {
    stem: "Which is the corrected version of: 'Having lost his capital, the market appeared ruthless to the new trader.'?",
    options: [
      "Having lost his capital, the new trader found the market ruthless.",
      "Having lost the capital, the market appeared ruthless to the new trader.",
      "The new trader having lost his capital, the market appeared ruthless.",
      "After losing his capital, the market appeared ruthless to the new trader."
    ],
    correct: 0,
    explanation: "Dangling modifier — 'Having lost his capital' must refer to the grammatical subject. The market didn't lose capital; the trader did. Place 'the new trader' as the main clause subject."
  },
  {
    stem: "Which is the corrected version of: 'The amount of trades executed by the agent have increased substantially.'?",
    options: [
      "The amount of trades executed by the agent has increased substantially.",
      "The number of trades executed by the agent have increased substantially.",
      "The number of trades executed by the agent has increased substantially.",
      "The amount of trades executed by the agent has been substantially increasing."
    ],
    correct: 2,
    explanation: "Trades are countable → 'The number of trades' (not 'The amount of'). 'The number of' is singular → 'has increased'. Both errors must be fixed."
  },
  {
    stem: "Which is the corrected version of: 'If I was the fund manager, I would have rebalanced the portfolio differently.'?",
    options: [
      "If I were the fund manager, I would rebalance the portfolio differently.",
      "If I were the fund manager, I would have rebalanced the portfolio differently.",
      "If I was the fund manager, I would rebalance the portfolio differently.",
      "If I had been the fund manager, I would have rebalanced the portfolio differently."
    ],
    correct: 0,
    explanation: "Second conditional (present hypothetical): 'If + were' (subjunctive) + 'would + base verb'. Both errors corrected: 'was'→'were' and 'would have rebalanced'→'would rebalance'."
  },
  {
    stem: "Which is the corrected version of: 'The client, along with his family members, were present at the portfolio review.'?",
    options: [
      "The client, along with his family members, was present at the portfolio review.",
      "The client, along with his family members, are present at the portfolio review.",
      "The client as well as his family members was present at the portfolio review.",
      "The client, along with his family members, have been present at the portfolio review."
    ],
    correct: 0,
    explanation: "'Along with' is parenthetical. The verb agrees with the main subject 'the client' (singular) → 'was present'."
  },
  {
    stem: "Which is the corrected version of: 'He has been selected as the lead analyst since last March.'?",
    options: [
      "He has been the lead analyst since last March.",
      "He was selected as the lead analyst since last March.",
      "He has been selected as the lead analyst from last March.",
      "He had been selected as the lead analyst since last March."
    ],
    correct: 0,
    explanation: "Selection is a one-time event, not an ongoing state. The ongoing state is expressed as 'has been the lead analyst' (state verb with present perfect) + 'since' for the starting point."
  },
  {
    stem: "Which is the corrected version of: 'Inspite of the market downturn, the portfolio performed exceptional.'?",
    options: [
      "In spite of the market downturn, the portfolio performed exceptionally.",
      "Inspite of the market downturn, the portfolio performed exceptionally.",
      "Despite of the market downturn, the portfolio performed exceptional.",
      "In spite of the market downturn, the portfolio performed exceptional."
    ],
    correct: 0,
    explanation: "Two errors: 'Inspite' must be two words → 'In spite', and 'exceptional' (adjective) must be 'exceptionally' (adverb) to modify the verb 'performed'. Only option A fixes both."
  },
  {
    stem: "Which is the corrected version of: 'The committee have decided to defer the annual general meeting indefinitely.'?",
    options: [
      "The committee has decided to defer the annual general meeting indefinitely.",
      "The committee have been deciding to defer the annual general meeting.",
      "The committee decided for deferring the annual general meeting indefinitely.",
      "The committee has been deciding to defer the annual general meeting indefinitely."
    ],
    correct: 0,
    explanation: "In formal/American English usage (standard in finance and business), collective nouns like 'committee' take a singular verb → 'has decided'."
  }
];

// ─────────────────────────────────────────────────────────────────
//  Topics to insert
// ─────────────────────────────────────────────────────────────────
const topics = [
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 2 — Section A: MCQ (40 Questions)',
    description: 'Choose the single best answer for each question. Topics include subject-verb agreement, tenses, conditionals, articles, and advanced grammar in a financial context.',
    scenario: '', checklist: sectionA, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  },
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 2 — Section B: Fill in the Blanks (13 Questions)',
    description: 'Select the word or phrase that best completes each sentence. Focus areas include conditionals, prepositions, and conjunctions in financial contexts.',
    scenario: '', checklist: sectionB, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  },
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 2 — Section C: Error Correction (17 Questions)',
    description: 'Identify the fully corrected rewrite of each erroneous sentence. Each question may contain one or more errors.',
    scenario: '', checklist: sectionC, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  }
];

async function seed() {
  console.log('🚀 Seeding Grammar Set 2 (A + B + C)...\n');
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
  console.log('\n✅ Done! Grammar Set 2 is now in Supabase.');
}

seed().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
