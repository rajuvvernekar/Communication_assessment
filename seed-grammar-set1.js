/**
 * Seed Grammar Set 1 — Section A (40 Qs), Section B (13 Qs), Section C (17 Qs)
 * Run: node seed-grammar-set1.js
 */
const SUPABASE_URL = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// ─────────────────────────────────────────────────────────────────
//  SECTION A — 40 MCQ questions (1 mark each)
// ─────────────────────────────────────────────────────────────────
const sectionA = [
  {
    stem: "The compliance head told the traders that they __________ adhere to the new margin norms from the following Monday.",
    options: ["must", "had to", "will", "would have to"],
    correct: 1,
    explanation: "Reported speech requires backshift. 'Must' (obligation) becomes 'had to' in reported past speech."
  },
  {
    stem: "Not only __________ without authorisation, but she also failed to report the transaction to the compliance team.",
    options: ["she traded", "did she trade", "she did trade", "had she traded"],
    correct: 1,
    explanation: "After 'Not only' at the start of a clause, subject-auxiliary inversion is required → 'did she trade'."
  },
  {
    stem: "The investor wishes she __________ more SIP instalments before the bull run commenced.",
    options: ["starts", "started", "had started", "would start"],
    correct: 2,
    explanation: "'Wish + past perfect' expresses regret about an action that did not happen in the past → 'had started'."
  },
  {
    stem: "If the agent had studied the client's risk profile carefully, she __________ a more suitable product today.",
    options: ["recommends", "would recommend", "would have recommended", "recommended"],
    correct: 1,
    explanation: "Mixed conditional: if-clause (past perfect) + present result → 'would recommend' (not 'would have recommended')."
  },
  {
    stem: "__________ efficient fund manager always maintains a contingency allocation in highly liquid assets.",
    options: ["A", "An", "The", "—"],
    correct: 1,
    explanation: "'Efficient' begins with a vowel sound /ɪ/ → the indefinite article 'An' is required before vowel sounds."
  },
  {
    stem: "A number of complaints __________ received by the investor grievance cell regarding the revised fee structure.",
    options: ["has been", "have been", "was", "is"],
    correct: 1,
    explanation: "'A number of' means 'several' and is treated as plural → plural verb 'have been'."
  },
  {
    stem: "The report was both comprehensive __________ well-structured, making it easy for the board to assess risk.",
    options: ["but", "and", "yet", "or"],
    correct: 1,
    explanation: "Parallel structure with 'both... and' requires 'and' → 'both comprehensive and well-structured'."
  },
  {
    stem: "The managing director had the annual accounts __________ by an independent forensic auditor.",
    options: ["verify", "verified", "verifying", "to verify"],
    correct: 1,
    explanation: "Causative 'have something done' requires the past participle → 'had the accounts verified'."
  },
  {
    stem: "The __________ the uncertainty in the market, the higher the demand for safe-haven assets like gold.",
    options: ["great", "greater", "greatest", "more great"],
    correct: 1,
    explanation: "Double comparative structure 'The + comparative, the + comparative' → 'The greater the uncertainty, the higher...'."
  },
  {
    stem: "It was __________ a complex derivatives strategy that even experienced traders struggled to comprehend it.",
    options: ["so", "such", "very", "too"],
    correct: 1,
    explanation: "'Such + a/an + adjective + noun + that' → 'such a complex strategy that'. 'So' precedes adjectives without a noun: 'so complex that'."
  },
  {
    stem: "By March 31, the fund manager __________ the portfolio three times to meet the annual rebalancing targets.",
    options: ["rebalanced", "has rebalanced", "had rebalanced", "was rebalancing"],
    correct: 2,
    explanation: "'By + past time reference' requires past perfect → 'had rebalanced'."
  },
  {
    stem: "The majority of the fund's assets __________ currently invested in government securities and AAA-rated corporate bonds.",
    options: ["is", "are", "was", "has been"],
    correct: 1,
    explanation: "'The majority of + plural noun (assets)' → plural verb 'are'."
  },
  {
    stem: "Seldom __________ such a dramatic recovery been witnessed in the Indian equity markets within a single session.",
    options: ["has", "have", "had", "was"],
    correct: 0,
    explanation: "Inversion is required after negative adverb 'Seldom' → 'Seldom has such a recovery been witnessed'."
  },
  {
    stem: "The client __________ been informed about the risks if the relationship manager had followed the standard protocol.",
    options: ["should have", "would have", "could have", "had"],
    correct: 1,
    explanation: "Third conditional result clause expresses the certain alternate outcome → 'would have been informed'. 'Could' = possibility; 'should' = obligation."
  },
  {
    stem: "The prospectus, __________ the fund's investment strategy and risk factors are disclosed, must be read before investing.",
    options: ["which", "where", "that", "in which"],
    correct: 3,
    explanation: "The prospectus is the document 'in which' disclosures are made — the preposition 'in' is required for the relative clause."
  },
  {
    stem: "The foreign investor's profits are subject __________ capital gains tax under the applicable Double Tax Avoidance Agreement.",
    options: ["of", "to", "for", "with"],
    correct: 1,
    explanation: "'Subject to' is the fixed prepositional collocation in legal and financial English."
  },
  {
    stem: "Little __________ the client know that the agent had been mis-selling the same insurance product for over two years.",
    options: ["did", "does", "had", "was"],
    correct: 0,
    explanation: "'Little' in a negative sense at the start of a clause triggers inversion → 'Little did the client know' (past simple inverted)."
  },
  {
    stem: "__________ the broker warned the client about the volatility, the client insisted on investing in small-cap funds.",
    options: ["Although", "Despite", "In spite", "However"],
    correct: 0,
    explanation: "'Although' introduces a full adverbial clause. 'Despite' and 'In spite of' require noun phrases; 'However' is a conjunctive adverb, not a subordinating conjunction."
  },
  {
    stem: "The interest income __________ from the government bonds is exempt from income tax up to a specified limit.",
    options: ["derived", "deriving", "which derived", "that derives"],
    correct: 0,
    explanation: "Past participle 'derived' functions as a reduced passive relative clause (= 'which is derived') — standard in formal financial writing."
  },
  {
    stem: "Had the index fund __________ the Nifty 50 more accurately, the tracking error would have been negligible.",
    options: ["track", "tracked", "been tracking", "been tracked"],
    correct: 1,
    explanation: "Inverted third conditional: 'Had + subject + past participle' → 'Had the index fund tracked'."
  },
  {
    stem: "The RBI's decision to hold rates __________ as a relief by both bond market participants and equity investors.",
    options: ["saw", "was seen", "had seen", "is seen"],
    correct: 1,
    explanation: "Passive voice is required — the decision was perceived by others → 'was seen as a relief'."
  },
  {
    stem: "The analyst recommended __________ the long position immediately before the quarterly results were announced.",
    options: ["to exit", "exiting", "to have exited", "exit"],
    correct: 1,
    explanation: "'Recommend' takes a gerund → 'recommended exiting'. 'Recommend to exit' is non-standard in formal English."
  },
  {
    stem: "__________ is no doubt that the emerging markets will attract significant FII inflows in the next fiscal year.",
    options: ["It", "There", "That", "This"],
    correct: 1,
    explanation: "Existential 'There is no doubt' is the correct structure. 'It is no doubt' is non-standard; 'That/This' cannot serve as existential subjects."
  },
  {
    stem: "The portfolio manager, __________ strategic calls have consistently outperformed the benchmark, was awarded Fund Manager of the Year.",
    options: ["who", "whose", "whom", "which"],
    correct: 1,
    explanation: "Possessive relative pronoun 'whose' links the portfolio manager to their strategic calls — 'whose strategic calls'."
  },
  {
    stem: "The board meeting was adjourned __________ all agenda items could be discussed in sufficient depth.",
    options: ["so as to", "so that", "in order to", "to"],
    correct: 1,
    explanation: "'So that' introduces a purpose clause with its own subject. 'So as to' and 'in order to' are followed by bare infinitives without a new subject."
  },
  {
    stem: "The derivatives desk processed __________ fewer contracts this quarter compared to the same period last year.",
    options: ["significant", "significantly", "more", "much"],
    correct: 1,
    explanation: "'Fewer' is a comparative adjective modified by an adverb → 'significantly fewer'. 'Significant' is an adjective and cannot modify another adjective."
  },
  {
    stem: "The index __________ to its pre-correction levels only after the government announced the fiscal stimulus package.",
    options: ["recovers", "recovered", "had recovered", "would recover"],
    correct: 1,
    explanation: "Simple past 'recovered' is correct for a completed action that happened after a specific past event."
  },
  {
    stem: "The regulator's order __________ to only those entities that operate without a valid SEBI registration certificate.",
    options: ["applies", "is applying", "applied", "would apply"],
    correct: 0,
    explanation: "General truths and standing orders use simple present tense → 'applies'. The order remains continuously in force."
  },
  {
    stem: "The analyst was __________ to observe that the company's debt-to-equity ratio had improved significantly over the year.",
    options: ["pleasing", "please", "pleased", "pleasant"],
    correct: 2,
    explanation: "'Was pleased' — past participle as adjective after a stative passive verb, describing the analyst's emotional state."
  },
  {
    stem: "The fund's performance over the last decade __________ that active management can still outperform passive index strategies.",
    options: ["demonstrate", "demonstrates", "is demonstrating", "have demonstrated"],
    correct: 1,
    explanation: "'The fund's performance' — singular noun phrase → singular present simple 'demonstrates' for a general/standing truth."
  },
  {
    stem: "The chairman __________ no sooner announced the dividend than trading in the stock was suspended by the exchange.",
    options: ["was", "had", "has", "did"],
    correct: 1,
    explanation: "'No sooner... than' requires the past perfect for the first event → 'had no sooner announced'."
  },
  {
    stem: "The client insisted on the agent __________ a detailed breakdown of all charges before signing the application form.",
    options: ["provide", "providing", "to provide", "provided"],
    correct: 1,
    explanation: "'Insist on + (possessive/object) + gerund' → 'insisted on the agent providing'. The gerund follows the preposition 'on'."
  },
  {
    stem: "Owing __________ the technical glitch in the trading platform, several client orders went unexecuted during the session.",
    options: ["to", "for", "of", "by"],
    correct: 0,
    explanation: "'Owing to' is the fixed prepositional phrase meaning 'because of' → 'owing to the technical glitch'."
  },
  {
    stem: "The client's reluctance to invest was __________ overcome after the advisor presented a detailed risk-return analysis.",
    options: ["eventual", "eventually", "eventful", "evenly"],
    correct: 1,
    explanation: "An adverb is required to modify the verb/adjective 'overcome' → 'eventually overcome'. 'Eventual' is an adjective; 'eventful' means full of events."
  },
  {
    stem: "__________ receiving the margin call, the trader had just 15 minutes to either top up funds or have positions squared off.",
    options: ["On", "After", "Since", "While"],
    correct: 0,
    explanation: "'On + gerund' = 'immediately upon doing something' — a formal expression of immediate sequence → 'On receiving the margin call'."
  },
  {
    stem: "No sooner __________ the market open than a flurry of buy orders pushed the index up by 2% within minutes.",
    options: ["had", "did", "does", "was"],
    correct: 0,
    explanation: "'No sooner... than' uses inversion with past perfect → 'No sooner had the market opened than...'."
  },
  {
    stem: "The new SEBI regulation __________ into effect from the first working day of the next financial year.",
    options: ["comes", "will come", "came", "has come"],
    correct: 1,
    explanation: "Future reference ('next financial year') requires future simple → 'will come into effect'."
  },
  {
    stem: "The mutual fund's NAV __________ to the market value of the underlying securities and is recalculated on a daily basis.",
    options: ["links", "is linked", "was linked", "has linked"],
    correct: 1,
    explanation: "NAV is systematically/mechanically linked — passive present tense for a standing relationship → 'is linked'."
  },
  {
    stem: "The securities __________ by the promoters as collateral must be disclosed in the company's quarterly shareholding pattern.",
    options: ["pledge", "pledged", "pledging", "that pledged"],
    correct: 1,
    explanation: "Past participle 'pledged' functions as a reduced passive relative clause (= 'that are pledged') modifying 'securities'."
  },
  {
    stem: "The agent's persistent follow-up __________ in the client finally agreeing to increase her SIP contribution.",
    options: ["result", "resulted", "has resulted", "was resulting"],
    correct: 1,
    explanation: "Simple past 'resulted' is appropriate for a completed sequence of events narrated in the past."
  }
];

// ─────────────────────────────────────────────────────────────────
//  SECTION B — 13 Fill-in-the-Blank (2 marks each)
// ─────────────────────────────────────────────────────────────────
const sectionB = [
  {
    stem: "If the fund manager __________ the portfolio earlier, the losses would have been significantly lower.",
    options: ["rebalanced", "had rebalanced", "would rebalance", "has rebalanced"],
    correct: 1,
    explanation: "Third conditional: 'If + past perfect' → 'had rebalanced'."
  },
  {
    stem: "The bond prices are likely __________ sharply unless the central bank intervenes with open market operations.",
    options: ["continue to fall", "to continue to fall", "continuing to fall", "continued to fall"],
    correct: 1,
    explanation: "'Are likely to + base verb' is the correct structure for probability → 'are likely to continue to fall'."
  },
  {
    stem: "The applicant was disqualified __________ submitting forged income documents during the loan application process.",
    options: ["for", "due to", "because", "on account"],
    correct: 0,
    explanation: "'Disqualified for + gerund' is the fixed collocation — 'for' introduces the reason/act for which one is disqualified."
  },
  {
    stem: "__________ the RBI announces a rate cut, the equity markets typically rally in anticipation of improved liquidity.",
    options: ["Whenever", "Although", "Provided that", "Unless"],
    correct: 0,
    explanation: "'Whenever' introduces a habitual or general-truth condition — correct for describing a recurring market behaviour pattern."
  },
  {
    stem: "The agent was held accountable __________ the mis-selling, even though the client had signed the suitability declaration.",
    options: ["to", "for", "of", "about"],
    correct: 1,
    explanation: "'Held accountable for' is the fixed collocation — 'for' introduces the action or outcome one is responsible for."
  },
  {
    stem: "The market would perform better __________ political stability is maintained and fiscal deficits are kept in check.",
    options: ["provided that", "despite", "although", "regardless of"],
    correct: 0,
    explanation: "'Provided that' introduces a conditional clause ('on condition that') — the market performs well only if the conditions are met."
  },
  {
    stem: "__________ he invested in index funds, he would have avoided the substantial losses that came from stock picking.",
    options: ["If", "Had", "Unless", "Though"],
    correct: 1,
    explanation: "Inverted third conditional without 'if' → 'Had he invested' = 'If he had invested'. The blank alone must be 'Had' for the inversion."
  },
  {
    stem: "The client agreed __________ sign the power of attorney only after consulting her legal advisor and family members.",
    options: ["to", "for", "on", "with"],
    correct: 0,
    explanation: "'Agree to + infinitive' is the correct construction → 'agreed to sign'."
  },
  {
    stem: "The scheme would have attracted more retail investors __________ the lock-in period been two years instead of three.",
    options: ["had", "if", "were", "though"],
    correct: 0,
    explanation: "Inverted third conditional → 'had the lock-in period been shorter' = 'if the lock-in period had been shorter'."
  },
  {
    stem: "The risk officer insisted __________ all new structured products undergo a mandatory three-stage internal review.",
    options: ["that", "on", "for", "about"],
    correct: 0,
    explanation: "'Insisted that + subjunctive' → 'insisted that all products undergo' (bare infinitive subjunctive after 'insisted that')."
  },
  {
    stem: "She continued investing in small-cap stocks __________ her advisor's repeated warnings about high volatility risk.",
    options: ["despite", "although", "in spite", "even if"],
    correct: 0,
    explanation: "'Despite + noun phrase' → 'despite her advisor's warnings'. 'In spite' requires 'of'; 'although' introduces a full clause; 'even if' is conditional."
  },
  {
    stem: "The debentures will mature __________ three years from the date of allotment, as stated in the offer document.",
    options: ["in", "within", "after", "by"],
    correct: 0,
    explanation: "'In three years' specifies the exact fixed maturity point. 'Within' means any time before that deadline; 'after' implies beyond it; 'by' is a general deadline expression."
  },
  {
    stem: "The portfolio manager acted as if he __________ the only person capable of predicting the direction of the markets.",
    options: ["is", "was", "were", "would be"],
    correct: 2,
    explanation: "'As if/as though' expressing a hypothetical or contrary-to-fact comparison requires the subjunctive 'were' in formal English."
  }
];

// ─────────────────────────────────────────────────────────────────
//  SECTION C — 17 Error Correction (2 marks each)
// ─────────────────────────────────────────────────────────────────
const sectionC = [
  {
    stem: "Which is the corrected version of: 'The manager recommended to review the investment strategy immediately.'?",
    options: [
      "The manager recommended reviewing the investment strategy immediately.",
      "The manager recommended to reviewing the investment strategy immediately.",
      "The manager recommended for reviewing the investment strategy immediately.",
      "The manager recommended that to review the investment strategy immediately."
    ],
    correct: 0,
    explanation: "'Recommend' takes a gerund → 'recommended reviewing'. 'Recommended to review' is non-standard in formal English."
  },
  {
    stem: "Which is the corrected version of: 'The company not only failed to declare dividends but also did not disclosed its losses.'?",
    options: [
      "The company not only failed to declare dividends but also did not disclose its losses.",
      "The company not only failed to declare dividends but also not disclosed its losses.",
      "The company not only failed to declare dividends but also did not to disclose its losses.",
      "The company not only failed declaring dividends but also did not disclose its losses."
    ],
    correct: 0,
    explanation: "After auxiliary 'did not', the base form is required → 'did not disclose'. Option D also breaks parallel structure with 'failed declaring' instead of 'failed to declare'."
  },
  {
    stem: "Which is the corrected version of: 'The new RBI guidelines effect the way banks calculate interest rates.'?",
    options: [
      "The new RBI guidelines affect the way banks calculate interest rates.",
      "The new RBI guidelines effect the way banks calculated interest rates.",
      "The new RBI guidelines affected the way banks calculate interest rates.",
      "The new RBI guidelines are effecting the way banks calculate interest rates."
    ],
    correct: 0,
    explanation: "'Effect' here is misused as a verb. The correct verb meaning 'to have an impact on' is 'affect' → 'affect the way banks calculate'."
  },
  {
    stem: "Which is the corrected version of: 'Investing in emerging markets, the risks must be carefully assessed.'?",
    options: [
      "When investing in emerging markets, the risks must be carefully assessed.",
      "Investing in emerging markets, careful assessment of the risks must be done.",
      "When investing in emerging markets, investors must carefully assess the risks.",
      "To invest in emerging markets, one must be careful about the risks."
    ],
    correct: 2,
    explanation: "Dangling modifier — 'Investing in emerging markets' needs a logical subject. Only option C supplies 'investors' as the correct subject of both clauses."
  },
  {
    stem: "Which is the corrected version of: 'She has been appointed as the Chief Risk Officer since last April.'?",
    options: [
      "She was appointed as the Chief Risk Officer last April.",
      "She has been the Chief Risk Officer since last April.",
      "She was the Chief Risk Officer since last April.",
      "She had been appointed as the Chief Risk Officer since last April."
    ],
    correct: 1,
    explanation: "Appointment is a one-time event. For the ongoing role from a past point to now, use state: 'has been the CRO since last April'."
  },
  {
    stem: "Which is the corrected version of: 'The investor wished he invested in gold ETFs when the prices were at their lowest.'?",
    options: [
      "The investor wished he would invest in gold ETFs when the prices were at their lowest.",
      "The investor wishes he invested in gold ETFs when the prices were at their lowest.",
      "The investor wished he had invested in gold ETFs when the prices were at their lowest.",
      "The investor wished he was investing in gold ETFs when the prices were at their lowest."
    ],
    correct: 2,
    explanation: "'Wish + past perfect' expresses regret about a missed past opportunity → 'wished he had invested'."
  },
  {
    stem: "Which is the corrected version of: 'The board of directors have unanimously voted to increase the dividend payout ratio.'?",
    options: [
      "The board of directors has unanimously voted to increase the dividend payout ratio.",
      "The board of directors have unanimously been voting to increase the dividend payout ratio.",
      "The board of directors unanimously have voted to increase the dividend payout ratio.",
      "The board of directors has unanimously been voted to increase the dividend payout ratio."
    ],
    correct: 0,
    explanation: "'The board of directors' is treated as a singular entity in formal business English → 'has unanimously voted'."
  },
  {
    stem: "Which is the corrected version of: 'If I would have known about the rights issue, I would have applied for additional shares.'?",
    options: [
      "If I had known about the rights issue, I would have applied for additional shares.",
      "If I would know about the rights issue, I would have applied for additional shares.",
      "If I have known about the rights issue, I would have applied for additional shares.",
      "If I knew about the rights issue, I would apply for additional shares."
    ],
    correct: 0,
    explanation: "Third conditional if-clause never uses 'would' → 'If I had known' (past perfect). 'If I would have known' is a common but incorrect form."
  },
  {
    stem: "Which is the corrected version of: 'The indices fell down drastically after the foreign investors began selling aggressively.'?",
    options: [
      "The indices fell drastically after the foreign investors began selling aggressively.",
      "The indices fell down drastically after the foreign investors started to sell aggressively.",
      "The indices fallen drastically after the foreign investors began selling aggressively.",
      "The indices had fallen down drastically after the foreign investors began selling."
    ],
    correct: 0,
    explanation: "'Fall down' is redundant — 'fall' already implies downward movement. Remove 'down' → 'fell drastically'."
  },
  {
    stem: "Which is the corrected version of: 'The chairman, together with the directors, were present at the emergency board meeting.'?",
    options: [
      "The chairman, together with the directors, was present at the emergency board meeting.",
      "The chairman together with directors were present at the emergency board meeting.",
      "The chairman, along with the directors, were present at the emergency board meeting.",
      "The chairman, together with the directors, have been present at the emergency board meeting."
    ],
    correct: 0,
    explanation: "'Together with' is parenthetical. The verb agrees with the main subject 'the chairman' (singular) → 'was present'."
  },
  {
    stem: "Which is the corrected version of: 'She explained the risk profile of each and every funds to the client.'?",
    options: [
      "She explained the risk profile of each and every fund to the client.",
      "She explained the risk profiles of each and every funds to the client.",
      "She explained the risk profile of each and every fund for the client.",
      "She explained the risk profiles of each and every fund for the client."
    ],
    correct: 0,
    explanation: "'Each and every' requires a singular countable noun → 'fund' (not 'funds'). 'Explained... to the client' is the correct prepositional collocation."
  },
  {
    stem: "Which is the corrected version of: 'The SEBI has banned the trading firm from operate in the derivatives segment.'?",
    options: [
      "The SEBI has banned the trading firm from operating in the derivatives segment.",
      "The SEBI has banned the trading firm to operate in the derivatives segment.",
      "The SEBI banned the trading firm from operating in the derivatives segment.",
      "The SEBI has been banning the trading firm from operating in the derivatives segment."
    ],
    correct: 0,
    explanation: "'Banned from' takes a gerund → 'banned from operating'. SEBI as an institution uses present perfect for recent/ongoing rulings → 'has banned'."
  },
  {
    stem: "Which is the corrected version of: 'The information regarding the merger was keep confidential until the official announcement.'?",
    options: [
      "The information regarding the merger was kept confidential until the official announcement.",
      "The information regarding the merger kept confidential until the official announcement.",
      "The information regarding the merger was keeping confidential until the official announcement.",
      "The information regarding the merger had kept confidential until the official announcement."
    ],
    correct: 0,
    explanation: "Passive voice requires 'was + past participle' → 'was kept'. 'Was keep' is grammatically incorrect."
  },
  {
    stem: "Which is the corrected version of: 'No sooner the market opened, the circuit breaker was triggered due to excessive volatility.'?",
    options: [
      "No sooner had the market opened than the circuit breaker was triggered due to excessive volatility.",
      "No sooner the market had opened when the circuit breaker was triggered due to excessive volatility.",
      "No sooner did the market open when the circuit breaker was triggered due to excessive volatility.",
      "No sooner has the market opened than the circuit breaker was triggered due to excessive volatility."
    ],
    correct: 0,
    explanation: "'No sooner... than' requires inversion with past perfect → 'No sooner had the market opened than'. 'When' is incorrect here; 'than' is required."
  },
  {
    stem: "Which is the corrected version of: 'The amount of investors participating in the IPO were higher than expected.'?",
    options: [
      "The number of investors participating in the IPO was higher than expected.",
      "The amount of investors participating in the IPO was higher than expected.",
      "The number of investors participating in the IPO were higher than expected.",
      "The number of investors who participated in the IPO were higher than expected."
    ],
    correct: 0,
    explanation: "Investors are countable → 'The number of investors' (not 'The amount of'). 'The number of' takes a singular verb → 'was higher'. Both errors corrected in option A."
  },
  {
    stem: "Which is the corrected version of: 'Dispite the market volatility, the portfolio generated a positive return last quarter.'?",
    options: [
      "Despite the market volatility, the portfolio generated a positive return last quarter.",
      "Dispite of the market volatility, the portfolio generated a positive return last quarter.",
      "In despite of the market volatility, the portfolio generated a positive return last quarter.",
      "Despite of the market volatility, the portfolio generated a positive return last quarter."
    ],
    correct: 0,
    explanation: "'Despite' is the correct spelling (not 'Dispite'), and 'despite' never takes 'of'. Only option A corrects both errors."
  },
  {
    stem: "Which is the corrected version of: 'The analyst team have prepared a comprehensive report on the sector outlook.'?",
    options: [
      "The analyst team has prepared a comprehensive report on the sector outlook.",
      "The analysts team have prepared a comprehensive report on the sector outlook.",
      "The analyst team have been preparing a comprehensive report on the sector outlook.",
      "The analyst team had prepared a comprehensive report on the sector outlook."
    ],
    correct: 0,
    explanation: "'The analyst team' is a singular collective noun (treated as one unit) → singular verb 'has prepared'."
  }
];

// ─────────────────────────────────────────────────────────────────
//  Topics to insert
// ─────────────────────────────────────────────────────────────────
const topics = [
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 1 — Section A: MCQ (40 Questions)',
    description: 'Choose the single best answer. Topics cover reported speech, inversions, mixed conditionals, wish clauses, causative structures, parallel constructions, and more — in a financial context.',
    scenario: '', checklist: sectionA, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  },
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 1 — Section B: Fill in the Blanks (13 Questions)',
    description: 'Select the word or phrase that best completes each sentence. Focus areas: conditionals, prepositions, conjunctions, and verb patterns in financial contexts.',
    scenario: '', checklist: sectionB, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  },
  {
    module: 'grammar-assessment',
    title: 'Grammar Set 1 — Section C: Error Correction (17 Questions)',
    description: 'Identify the fully corrected rewrite. Each erroneous sentence may contain one or more mistakes — dangling modifiers, wrong verb forms, confusion between similar words, and more.',
    scenario: '', checklist: sectionC, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  }
];

async function seed() {
  console.log('🚀 Seeding Grammar Set 1 (A + B + C)...\n');
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
  console.log('\n✅ Done! Grammar Set 1 is now in Supabase (40 + 13 + 17 = 70 questions).');
}

seed().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
