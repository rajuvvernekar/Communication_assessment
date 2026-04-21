/**
 * Listening Set 2 — 4 Sections, 100 marks total
 *
 * Section 1: Audio — Communication Skills talk  (6 Qs × 4 marks = 24)
 * Section 2: Video — Pursuit of Happiness clip  (7 Qs × 5 marks = 35)
 * Section 3: Call  — Tele-call trade support    (5 Qs × 3 marks = 15)
 * Section 4: Reading — Brokerage passage        (13 Qs × 2 marks = 26)
 *                                              Total = 100 marks
 */

const SUPABASE_URL = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// ─── SECTION 1 — Audio: Communication Skills (6 Qs × 4 marks = 24) ──────────
// Source: "download (4).wav" — spoken passage on professional communication
const section1 = [
  {
    stem: "According to the audio, what does the speaker describe as the BEST way to develop strong communication habits?",
    options: [
      "Practising public speaking in formal settings regularly",
      "Observing great communicators and adopting their styles and traits",
      "Focusing primarily on written communication rather than verbal",
      "Reading books on communication theories and applying them daily"
    ],
    correct: 1, marksPerQ: 4,
    explanation: "The speaker says 'learn to observe great communicators and adopt their styles and traits — in written and verbal forms.' Both channels are equally stressed."
  },
  {
    stem: "How does the speaker describe 'the art of listening and learning from each and every interaction'?",
    options: [
      "A core professional competency that every employee must master",
      "A fundamental rule applicable only to leadership roles",
      "Another secret recipe for communication success",
      "An underrated career skill often ignored in training programmes"
    ],
    correct: 2, marksPerQ: 4,
    explanation: "The exact phrase used in the audio is 'another secret recipe' — not a 'competency', a 'rule', or an 'underrated skill'."
  },
  {
    stem: "What does the speaker say about learning what NOT to say, compared to learning what to say?",
    options: [
      "It is equally as important as learning what to say",
      "It is something you learn only through years of professional experience",
      "It is probably MORE important than learning what to say",
      "It is particularly important for senior executives managing teams"
    ],
    correct: 2, marksPerQ: 4,
    explanation: "'Probably MORE important' is the speaker's exact claim. Option A ('equally important') is a common distractor — the audio specifically says 'more', not 'equally'."
  },
  {
    stem: "According to Abraham Lincoln's quote cited in the audio, how does he divide his preparation time before speaking?",
    options: [
      "Half thinking about what to say, half listening to the audience",
      "Two-thirds thinking about what they want to hear, one-third on what he wants to say",
      "One-third thinking about what they want to hear, two-thirds on what he wants to say",
      "Equal thirds split between preparation, delivery, and audience reflection"
    ],
    correct: 1, marksPerQ: 4,
    explanation: "Lincoln's quote: 'two-thirds of the time thinking what they WANT TO HEAR and one-third thinking what I want to say.' Options B and C swap the fractions — a deliberate trap."
  },
  {
    stem: "The speaker says poorly constructed emails with grammatical errors are acceptable in which specific context?",
    options: [
      "Never acceptable in any professional context whatsoever",
      "Acceptable between friends but must be avoided when communicating formally with seniors",
      "Acceptable only in internal team chats and instant messaging tools",
      "Acceptable between friends and workplace peers, but not with clients"
    ],
    correct: 1, marksPerQ: 4,
    explanation: "'Between friends' and 'avoided with seniors' is the exact scope given. Option D substitutes 'clients' for 'seniors' — a subtle but incorrect change."
  },
  {
    stem: "What does the speaker say you should do IMMEDIATELY if an unnecessary word is uttered at the wrong time or place?",
    options: [
      "Explain your intent clearly and continue the conversation naturally",
      "You should immediately apologize, else it may haunt you for life",
      "Avoid the person until emotions on both sides have settled",
      "Seek guidance from a senior before addressing the affected person"
    ],
    correct: 1, marksPerQ: 4,
    explanation: "The speaker says 'you should immediately apologize, else it may haunt you for life.' Options A and D sound professional but are not what the audio states."
  }
];

// ─── SECTION 2 — Video: The Pursuit of Happiness (7 Qs × 5 marks = 35) ──────
// Source: Chris Gardner job interview scene at Dean Witter Reynolds
// NEW questions — different from Listening Set 1 Section 1
const section2 = [
  {
    stem: "When Chris Gardner arrives at Dean Witter Reynolds for his interview in a dishevelled state, what reason does he give for his appearance?",
    options: [
      "His apartment had a plumbing emergency that forced him to leave without changing",
      "He was involved in a minor road accident on his way to the interview",
      "He had been working overnight on a construction project near his home",
      "He was held in a police holding cell overnight for unpaid parking tickets"
    ],
    correct: 3, marksPerQ: 5,
    explanation: "Chris explains he was detained overnight in a police holding cell for unpaid parking tickets and came directly to the interview from the station."
  },
  {
    stem: "What is the name of the interviewer who conducts Chris Gardner's interview in this scene?",
    options: [
      "Mr. Walker",
      "Mr. Henderson",
      "Mr. Witter",
      "Mr. Twistle"
    ],
    correct: 3, marksPerQ: 5,
    explanation: "The interviewer is Mr. Jay Twistle. 'Mr. Witter' is a common wrong answer because Dean WITTER is the firm's name — a deliberate distractor."
  },
  {
    stem: "When the interviewer poses the hypothetical — 'What would you say if a man walked in here for an interview without a shirt on?' — what is Chris Gardner's response?",
    options: [
      "He must be very confident in his abilities to walk in looking like that",
      "He must have had on some really nice pants",
      "He must have an extraordinary and compelling reason for it",
      "He must have had an exceptional track record to take that risk"
    ],
    correct: 1, marksPerQ: 5,
    explanation: "Chris's exact words: 'He must have had on some really nice pants.' It's a quick, witty deflection that demonstrates fast thinking under pressure."
  },
  {
    stem: "What quality does Chris Gardner's response to the 'no shirt' question PRIMARILY demonstrate in a professional context?",
    options: [
      "Deep knowledge of the financial industry and brokerage culture",
      "Willingness to be completely transparent with potential employers",
      "Quick wit and the ability to convert a disadvantageous situation into an advantage",
      "Strong emotional resilience developed through repeated failure"
    ],
    correct: 2, marksPerQ: 5,
    explanation: "The response demonstrates quick wit and reframing — a key sales skill. It doesn't show financial knowledge (A), transparency (B), or resilience per se (D)."
  },
  {
    stem: "What is Chris Gardner applying for at Dean Witter Reynolds in this scene?",
    options: [
      "A junior analyst position in the research department",
      "A full-time stockbroker role in the retail division",
      "A six-month paid training programme for sales associates",
      "A stockbroker internship position"
    ],
    correct: 3, marksPerQ: 5,
    explanation: "Chris is applying for an unpaid internship programme. It is not a paid role, not an analyst position, and not a training programme — the internship distinction is critical."
  },
  {
    stem: "What does the interviewer's decision to continue the interview — despite Chris's appearance — suggest about the firm's evaluation approach?",
    options: [
      "Dean Witter had a policy of interviewing all walk-in candidates regardless of appearance",
      "The interviewer was personally acquainted with Chris Gardner from a previous meeting",
      "The firm valued substance, attitude, and composure above surface presentation",
      "The firm was under pressure to increase diversity in hiring"
    ],
    correct: 2, marksPerQ: 5,
    explanation: "The interviewer proceeds because Chris's confidence, honesty, and quick thinking signal high potential — substance over appearance. None of the other options are supported by the scene."
  },
  {
    stem: "What is the outcome at the end of Chris Gardner's interview in this scene?",
    options: [
      "He is placed on a shortlist and told he will be contacted within a week",
      "He is given a conditional offer pending a second-round panel interview",
      "He is offered the internship position",
      "He is politely declined but encouraged to reapply once he has relevant experience"
    ],
    correct: 2, marksPerQ: 5,
    explanation: "Chris is offered the internship. He is not waitlisted, not given a conditional offer, and not rejected — the interview results in an immediate acceptance."
  }
];

// ─── SECTION 3 — Call: Trade Support Desk (5 Qs × 3 marks = 15) ─────────────
// Source: "Tele-call (1).wav" — trade support call with Mr. Sharma (XYZ Limited order)
const section3 = [
  {
    stem: "What exact reason did the trade support representative give for the delay in Mr. Sharma's order execution?",
    options: [
      "The order was placed outside of regular market trading hours",
      "Insufficient funds in the trading account at the time of order placement",
      "Sudden system latency caused by unusually high market volumes",
      "A manual verification error that required the order to be re-entered"
    ],
    correct: 2, marksPerQ: 3,
    explanation: "The rep specifically says: 'sudden system latency due to unusually high market volumes.' Options A, B, and D are common trading-desk reasons — but not the one given in this call."
  },
  {
    stem: "Mr. Sharma placed a buy order for XYZ Limited at approximately what time, and when was it actually executed?",
    options: [
      "Placed at 1:30 PM; executed at 2:00 PM",
      "Placed at 1:40 PM; executed at 2:03 PM",
      "Placed at 1:45 PM; executed at 2:03 PM",
      "Placed at 2:00 PM; executed at 2:15 PM"
    ],
    correct: 2, marksPerQ: 3,
    explanation: "Order placed around 1:45 PM, executed at 2:03 PM. The 1:40–2:00 PM window is when system latency occurred — not when the order was placed. Options B and C are the key trap."
  },
  {
    stem: "At what average execution price was Mr. Sharma's buy order for XYZ Limited finally filled?",
    options: [
      "$254.50",
      "$255.75",
      "$256.80",
      "$257.20"
    ],
    correct: 2, marksPerQ: 3,
    explanation: "The representative clearly states the average execution price was $256.80. The other prices are deliberate distractors placed within a narrow range to test careful listening."
  },
  {
    stem: "When Mr. Sharma asks for compensation for the price difference caused by the delay, what is the representative's response?",
    options: [
      "He agrees to escalate the compensation request to the settlements team",
      "He offers a fee waiver on the next three trades as goodwill",
      "He says the firm cannot take responsibility for market movements as they are beyond the firm's control",
      "He informs Mr. Sharma that the matter will be reviewed under the firm's delayed-execution policy"
    ],
    correct: 2, marksPerQ: 3,
    explanation: "The rep explicitly states they 'cannot take responsibility for market movement as the market is entirely beyond our control.' No compensation or escalation is offered."
  },
  {
    stem: "What specific instruction does the representative give Mr. Sharma regarding his contract note at the end of the day?",
    options: [
      "To email any discrepancies to the compliance team within 48 hours",
      "To call the trade desk back the same afternoon if prices do not match",
      "To report any discrepancies in trade details to the firm within 24 hours",
      "To submit a written dispute form within 24 hours through the trading portal"
    ],
    correct: 2, marksPerQ: 3,
    explanation: "The rep says: 'if you notice any discrepancies in your trade details, please report them to us within 24 hours.' It's 'report to us' — not 'email compliance', not 'call back', not a 'written form'."
  }
];

// ─── SECTION 4 — Reading: Brokerage Client Communication (13 Qs × 2 marks = 26)
// Source: Passage from document — stock brokerage communication in volatile markets
const section4 = [
  {
    stem: "According to the passage, which of the following is NOT mentioned as a reason clients contact brokerage support during market volatility?",
    options: [
      "Unexpected changes in portfolio value",
      "Requests to switch or reallocate their investment strategy",
      "Delays in order execution",
      "Discrepancies in transaction status"
    ],
    correct: 1, marksPerQ: 2,
    explanation: "The passage lists portfolio value changes, order delays, and transaction discrepancies. 'Switching investment strategy' is not mentioned — it is an inference-based distractor."
  },
  {
    stem: "The passage states that clients contacting support during market volatility are often emotionally affected primarily because of:",
    options: [
      "The complexity and lack of transparency in financial products they hold",
      "The financial impact caused by market movements",
      "Infrequent or delayed communication from the brokerage firm",
      "Misunderstanding the terms and conditions of their trading account"
    ],
    correct: 1, marksPerQ: 2,
    explanation: "The passage states: 'clients are often emotionally affected due to the financial impact.' The other options may be real causes but are not what the passage states."
  },
  {
    stem: "According to the passage, what is identified as the FIRST step in handling any client concern?",
    options: [
      "Providing a detailed investigation report to the client",
      "Transferring the client to the relevant specialist department",
      "Acknowledge the issue and reassure the client that it is being reviewed",
      "Asking the client to submit the concern in writing for formal escalation"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "'The first step in handling any client concern is to acknowledge the issue and reassure the client that it is being reviewed.' A, B, D sound professional but are not the stated first step."
  },
  {
    stem: "What type of information does the passage explicitly warn support executives against sharing with clients?",
    options: [
      "Technical information about settlement cycles and their timelines",
      "Details about ongoing margin requirements applicable to the account",
      "Assumptions or unconfirmed details about the issue",
      "Internal data about system processes and performance metrics"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "'Sharing assumptions or unconfirmed details can create confusion and damage trust.' Note: A and B are things the passage says SHOULD be explained — a deliberate reversal trap."
  },
  {
    stem: "When explaining technical processes to clients, the passage recommends that employees AVOID:",
    options: [
      "Providing written summaries of technical explanations",
      "Referring to standardised industry terminology for precision",
      "Using unnecessary jargon",
      "Explaining margin requirements in simplified terms"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "'Employees should avoid unnecessary jargon and instead focus on explaining what the issue means for the client.' Option B (using industry terminology) is the exact opposite of the advice."
  },
  {
    stem: "The passage states employees should focus on explaining which TWO things when addressing a client issue?",
    options: [
      "What caused the problem and who in the firm is responsible for it",
      "What the issue means for the client and what actions are being taken",
      "How the trading system works and what the client should do to prevent recurrence",
      "What the investigation has found and what compensation is being considered"
    ],
    correct: 1, marksPerQ: 2,
    explanation: "'Explaining what the issue means for the client and what actions are being taken.' Option C is similar but substitutes 'how the system works' — which is not what the passage says."
  },
  {
    stem: "According to the passage, what is the PRIMARY benefit of setting realistic expectations by outlining next steps and timelines?",
    options: [
      "It prevents regulatory violations and formal client complaints",
      "It demonstrates the firm's operational transparency and efficiency",
      "It helps reduce uncertainty and prevents repeated follow-ups",
      "It builds long-term client trust and increases portfolio retention"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "The passage explicitly says: 'helps reduce uncertainty and prevents repeated follow-ups.' B and D sound like benefits but are not the specific outcomes mentioned."
  },
  {
    stem: "The passage cautions employees not to make commitments that depend on external teams or system validations UNLESS:",
    options: [
      "They have obtained approval from their direct team leader",
      "The matter has been formally escalated to senior management",
      "Confirmation from the external team or system has been received",
      "The client has specifically requested a firm timeline commitment"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "'Not to make commitments that depend on external teams or system validations unless confirmation has been received.' A and B add organisational steps not mentioned in the passage."
  },
  {
    stem: "According to the passage, the principle of transparency in communication should be balanced with which two qualities?",
    options: [
      "Empathy and speed of response",
      "Regulatory compliance and full documentation",
      "Accuracy and responsibility",
      "Professionalism and client-friendly language"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "'Transparency is important, but it should be balanced with accuracy and responsibility.' The other pairs are professional values but are not what the passage specifies."
  },
  {
    stem: "When updates to a client's issue are delayed, what does the passage say plays a 'key role in maintaining credibility'?",
    options: [
      "Escalating the case immediately to a senior relationship manager",
      "Proactive communication with the client",
      "Offering the client interim compensation or a goodwill gesture",
      "Providing the client with a written explanation of the delay"
    ],
    correct: 1, marksPerQ: 2,
    explanation: "'Proactive communication plays a key role in maintaining credibility and managing client expectations.' A, C, and D may seem credibility-maintaining but are not the passage's specific answer."
  },
  {
    stem: "Which of the following MOST ACCURATELY lists ALL the outcomes the passage associates with structured communication training in brokerage firms?",
    options: [
      "Higher satisfaction scores and fewer regulatory violations",
      "Reduced client escalations, higher satisfaction scores, and increased employee confidence",
      "Improved employee retention and stronger long-term client portfolios",
      "Reduced escalations, faster query resolution times, and better teamwork"
    ],
    correct: 1, marksPerQ: 2,
    explanation: "The passage names exactly: 'reduced client escalations, higher satisfaction scores, and increased employee confidence.' Options A, C, D each replace one correct item with an incorrect one."
  },
  {
    stem: "The passage explicitly states that effective communication should NOT be viewed merely as:",
    options: [
      "A strategic organisational priority",
      "A core capability of frontline employees",
      "A soft skill",
      "A measurable driver of service quality"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "'Effective communication is NOT merely a soft skill, but a core capability.' The passage re-categorises it — dismissing the 'soft skill' label as insufficient."
  },
  {
    stem: "Based on the passage, what does it MOST STRONGLY suggest should be the brokerage firm's long-term view of communication training?",
    options: [
      "An optional investment to be considered when client complaints rise",
      "A regulatory requirement to satisfy compliance audits",
      "A strategic capability investment that directly impacts service quality and client relationships",
      "A basic onboarding activity primarily for frontline new hires"
    ],
    correct: 2, marksPerQ: 2,
    explanation: "The passage frames communication training as something that directly impacts 'service quality and long-term client relationships' — positioning it as a strategic investment, not optional or compliance-driven."
  }
];

// ─── Sections manifest ─────────────────────────────────────────────────────────
const SECTIONS = [
  {
    title:       'Listening Set 2 — Section 1: Audio (6 Questions)',
    description: 'Listen carefully to the communication skills audio passage and answer all 6 questions. Each correct answer carries 4 marks.',
    questions:   section1
  },
  {
    title:       'Listening Set 2 — Section 2: Video (7 Questions)',
    description: 'Watch the Pursuit of Happiness job interview scene and answer all 7 questions. Each correct answer carries 5 marks.',
    questions:   section2
  },
  {
    title:       'Listening Set 2 — Section 3: Call (5 Questions)',
    description: 'Listen to the trade support call between the representative and Mr. Sharma, then answer all 5 questions. Each correct answer carries 3 marks.',
    questions:   section3
  },
  {
    title:       'Listening Set 2 — Section 4: Reading (13 Questions)',
    description: 'Read the brokerage client communication passage carefully and answer all 13 questions. Each correct answer carries 2 marks.',
    questions:   section4
  }
];

async function run() {
  console.log('🚀 Seeding Listening Assessment Set 2...\n');

  for (const sec of SECTIONS) {
    process.stdout.write(`  Inserting "${sec.title}" (${sec.questions.length} questions)... `);
    const payload = {
      module:      'listening-assessment',
      title:       sec.title,
      description: sec.description,
      scenario:    '',
      checklist:   sec.questions,
      bot_script:  [],
      enabled:     true,
      created_at:  new Date().toISOString()
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/topics`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const err = await r.text();
      console.error(`❌ FAILED: ${err}`);
      process.exit(1);
    }
    const d = await r.json();
    console.log(`✅ id: ${d[0]?.id}`);
  }

  const total = SECTIONS.reduce((s, sec) => s + sec.questions.length, 0);
  const marks = SECTIONS.reduce((s, sec) => s + sec.questions.reduce((m, q) => m + q.marksPerQ, 0), 0);
  console.log(`\n✅ Done! Listening Set 2: ${total} questions, ${marks} marks total.`);
  console.log('   Section 1 (Audio): 6 × 4 = 24 marks');
  console.log('   Section 2 (Video): 7 × 5 = 35 marks');
  console.log('   Section 3 (Call):  5 × 3 = 15 marks');
  console.log('   Section 4 (Reading): 13 × 2 = 26 marks');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
