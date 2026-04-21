/**
 * Seed Listening Assessment Set 1 — Section 1 Video (10 Qs × 2 marks),
 * Section 2 Audio (10 Qs × 5 marks), Section 3 Reading (10 Qs × 3 marks)
 * Run: node seed-listening-set1.js
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
//  SECTION 1 — VIDEO  (10 questions × 2 marks = 20 marks)
//  Based on: "The Pursuit of Happiness" — Job Interview Scene
//  Chris Gardner interviews for a stockbroker internship at Dean Witter
//  Reynolds in paint-stained clothes after spending the night in jail.
// ─────────────────────────────────────────────────────────────────
const section1Video = [
  {
    stem: "Why is Chris Gardner's appearance unconventional when he arrives for the interview at Dean Witter Reynolds?",
    options: [
      "He forgot to wear a tie and jacket",
      "He had been painting his apartment and had no time to change",
      "His formal clothes were stolen on the way to the interview",
      "He arrived straight from a construction site"
    ],
    correct: 1,
    explanation: "Chris had been working on painting his apartment and was arrested; he had no opportunity to change before attending the interview."
  },
  {
    stem: "What position is Chris Gardner interviewing for in the scene?",
    options: [
      "Financial analyst at Goldman Sachs",
      "Relationship manager at a retail bank",
      "Stockbroker internship at Dean Witter Reynolds",
      "Investment advisor at Merrill Lynch"
    ],
    correct: 2,
    explanation: "Chris Gardner is interviewing for a competitive unpaid stockbroker internship at Dean Witter Reynolds."
  },
  {
    stem: "When the interviewer asks what Chris would say if a man walked in for an interview without a shirt, Chris responds:",
    options: [
      "'He should go home and return properly dressed.'",
      "'That shows real dedication to getting the job.'",
      "'He must have had on some really nice pants.'",
      "'It depends entirely on his qualifications.'"
    ],
    correct: 2,
    explanation: "Chris uses wit and humour — 'He must have had on some really nice pants' — turning a pointed question into a memorable, confident response."
  },
  {
    stem: "What does Chris Gardner's witty response to the 'no shirt' question primarily demonstrate?",
    options: [
      "His lack of seriousness about professional norms",
      "Quick thinking, confidence, and appropriate use of humour under pressure",
      "His attempt to change the subject away from his appearance",
      "His discomfort and nervousness during the interview"
    ],
    correct: 1,
    explanation: "The response shows Chris can think on his feet, handle a difficult moment with composure, and use humour constructively — key communication skills."
  },
  {
    stem: "How does Chris Gardner address his unconventional appearance directly to the interviewers?",
    options: [
      "He ignores the issue and focuses only on his qualifications",
      "He apologises and asks to reschedule for a better day",
      "He acknowledges it honestly and explains the circumstances confidently",
      "He claims it was a deliberate test of the firm's open-mindedness"
    ],
    correct: 2,
    explanation: "Chris addresses his appearance head-on with transparency and self-assurance, without making excuses or becoming defensive."
  },
  {
    stem: "Which communication quality does Chris Gardner demonstrate most consistently throughout the interview scene?",
    options: [
      "Extensive technical knowledge of financial products",
      "Formal vocabulary and rehearsed answers",
      "Honesty and confident self-expression under difficult circumstances",
      "Strict adherence to traditional interview protocol"
    ],
    correct: 2,
    explanation: "Despite his circumstances, Chris remains honest, clear, and self-assured — the hallmarks of strong professional communication."
  },
  {
    stem: "How do the interviewers initially react when Chris Gardner walks in?",
    options: [
      "They immediately end the interview and ask him to leave",
      "They laugh openly at his appearance",
      "They show visible surprise but continue to engage him professionally",
      "They ask a colleague to handle the interview instead"
    ],
    correct: 2,
    explanation: "The interviewers are clearly surprised by his paint-stained clothes but maintain professionalism and proceed with the interview."
  },
  {
    stem: "What key lesson about professional communication does the interview scene illustrate?",
    options: [
      "Physical appearance is the single most important factor in any interview",
      "Technical expertise always outweighs communication skills",
      "Authenticity, clarity, and composure can overcome adverse circumstances",
      "It is always better to postpone an interview than attend unprepared"
    ],
    correct: 2,
    explanation: "The scene demonstrates that genuine confidence, directness, and the ability to handle pressure can be more impactful than a polished exterior."
  },
  {
    stem: "Which of the following best describes Chris Gardner's tone throughout the interview?",
    options: [
      "Defensive and overly apologetic",
      "Casual and inappropriately familiar",
      "Rehearsed and overly formal",
      "Calm, direct, and self-assured"
    ],
    correct: 3,
    explanation: "Chris maintains a calm, direct, and self-assured tone throughout — he neither over-apologises nor becomes flustered despite the difficult situation."
  },
  {
    stem: "What is the outcome of Chris Gardner's interview at Dean Witter Reynolds?",
    options: [
      "He is rejected due to his unprofessional appearance",
      "He is asked to return the following week in appropriate attire",
      "He is offered the internship position",
      "He is placed on a waiting list pending a background check"
    ],
    correct: 2,
    explanation: "Despite arriving in paint-stained clothes and having spent the night in jail, Chris's communication skills and confidence win him the internship."
  }
];

// ─────────────────────────────────────────────────────────────────
//  SECTION 2 — AUDIO  (10 questions × 5 marks = 50 marks)
//  Based on: Finit Securities customer service call
//  Sara handles an angry client (Mr. Sharma) whose 500 Reliance shares
//  were squared off by the RMS team at 11:15 AM when the MTM loss
//  hit 85% of available cash. SEBI peak margin norms are cited.
//  Volatility index was up 12%. Client was driving.
//  Sara offers to pledge tier-1 bonds as collateral margin.
//  Sends WhatsApp instructions and stays on the line.
// ─────────────────────────────────────────────────────────────────
const section2Audio = [
  {
    stem: "What is the name of the brokerage firm where Sara works?",
    options: [
      "Finedge Securities",
      "Finit Securities",
      "Finance Edge Brokers",
      "First Edge Capital"
    ],
    correct: 1,
    explanation: "Sara answers the call with 'Finit Securities, Sara's speaking' — the firm is Finit Securities."
  },
  {
    stem: "How many shares of Reliance did Mr. Sharma claim were sold without his consent?",
    options: [
      "100 shares",
      "200 shares",
      "500 shares",
      "1,000 shares"
    ],
    correct: 2,
    explanation: "Mr. Sharma specifically mentions '500 shares of Reliance' when expressing his anger about the forced square-off."
  },
  {
    stem: "At what exact time were Mr. Sharma's shares squared off by the RMS team?",
    options: [
      "10:15 AM",
      "11:00 AM",
      "11:14 AM",
      "11:15 AM"
    ],
    correct: 3,
    explanation: "Sara states: 'Your position was squared off by a RMS team at 11:15 AM.'"
  },
  {
    stem: "What percentage of Mr. Sharma's available cash had the MTM loss reached at the time of the square-off?",
    options: [
      "75%",
      "80%",
      "85%",
      "90%"
    ],
    correct: 2,
    explanation: "Sara explains: 'At 11:14 AM your MTM loss hit 85% of your available cash' — triggering the SEBI-mandated square-off."
  },
  {
    stem: "Which regulatory rule did Sara cite as the reason the firm was required to square off Mr. Sharma's position?",
    options: [
      "RBI's liquidity risk framework",
      "SEBI's peak margin norms",
      "NSE's circuit breaker guidelines",
      "IRDAI's capital adequacy standards"
    ],
    correct: 1,
    explanation: "Sara explicitly states: 'Per SEBI's peak margin norms, if we don't square you off, the exchange fines both you and the firm heavily.'"
  },
  {
    stem: "By how much had the volatility index risen on the day of the call?",
    options: [
      "5%",
      "8%",
      "10%",
      "12%"
    ],
    correct: 3,
    explanation: "Sara mentions: 'Look at the volatility index today. It's up 12%.' — used to justify why immediate action was necessary."
  },
  {
    stem: "Why was Mr. Sharma unable to respond to the margin alert in time?",
    options: [
      "He was travelling abroad and had no internet access",
      "He was in an important client meeting",
      "He was driving and could not check his app",
      "His mobile phone had been switched off"
    ],
    correct: 2,
    explanation: "Mr. Sharma says: 'I was driving. I couldn't check my app.' — explaining his inability to top up the margin when the alert was triggered."
  },
  {
    stem: "What solution did Sara offer Mr. Sharma to prevent a similar forced square-off in the future?",
    options: [
      "Increase his cash balance by an immediate wire transfer",
      "Shift his portfolio to lower-risk investment products",
      "Pledge his tier-1 bonds from his DMAT as collateral margin",
      "Close all existing positions and restart with fresh capital"
    ],
    correct: 2,
    explanation: "Sara says: 'I can see you have some tier-1 bonds in your DMAT. If you pledge those bonds now, I can increase your collateral margin instantly.'"
  },
  {
    stem: "How did Sara send the step-by-step pledging instructions to Mr. Sharma?",
    options: [
      "By email to his registered address",
      "By SMS to his registered mobile number",
      "Through the client portal dashboard",
      "Via WhatsApp to his number"
    ],
    correct: 3,
    explanation: "Sara says: 'I am sending a step-by-step link to your WhatsApp right now. I'll stay on the line until you see it.'"
  },
  {
    stem: "Which of the following best describes Sara's overall approach to handling Mr. Sharma's complaint?",
    options: [
      "She immediately escalated the call to a senior manager",
      "She denied any responsibility and referred him to the compliance team",
      "She acknowledged his frustration, explained the regulatory reason, and offered a practical resolution",
      "She placed him on hold repeatedly until he calmed down on his own"
    ],
    correct: 2,
    explanation: "Sara validates Mr. Sharma's feelings, explains the SEBI regulation clearly, shares market data, and proactively offers a collateral solution — a model customer service approach."
  }
];

// ─────────────────────────────────────────────────────────────────
//  SECTION 3 — READING  (10 questions × 3 marks = 30 marks)
//  Based on: MTF (Margin Trading Facility) passage
// ─────────────────────────────────────────────────────────────────
const section3Reading = [
  {
    stem: "According to the passage, what does MTF stand for?",
    options: [
      "Multiple Trading Facility",
      "Margin Transfer Fund",
      "Margin Trading Facility",
      "Market Trading Framework"
    ],
    correct: 2,
    explanation: "The passage opens: 'Margin Trading Facility, commonly known as MTF, allows traders to buy stocks by paying only a portion of the total value.'"
  },
  {
    stem: "What is the primary benefit of MTF for a trader, as stated in the passage?",
    options: [
      "It eliminates all brokerage charges on the funded portion",
      "It allows traders to take larger positions than their available cash balance",
      "It guarantees a minimum return on the invested capital",
      "It provides insurance against market losses"
    ],
    correct: 1,
    explanation: "The passage states: 'This enables traders to take larger positions than their available cash balance.'"
  },
  {
    stem: "What is the initial margin requirement typically starting from when a trader uses MTF?",
    options: [
      "25% of the trade value",
      "30% of the trade value",
      "40% of the trade value",
      "50% of the trade value"
    ],
    correct: 3,
    explanation: "The passage states the initial margin is 'typically starting from around 50% of the trade value, depending on the stock.'"
  },
  {
    stem: "What is the approximate daily interest rate charged on the borrowed amount under MTF?",
    options: [
      "0.01% per day",
      "0.02% per day",
      "0.04% per day",
      "0.08% per day"
    ],
    correct: 2,
    explanation: "The passage clearly states: 'The interest rate for MTF will be approximately 0.04% per day.'"
  },
  {
    stem: "According to the passage, what is the approximate annual equivalent of the MTF daily interest rate?",
    options: [
      "5–7% annually",
      "10–12% annually",
      "14–15% annually",
      "18–20% annually"
    ],
    correct: 2,
    explanation: "The passage states the daily rate 'translates to around 14–15% annually.'"
  },
  {
    stem: "On which portion of the MTF transaction is interest charged?",
    options: [
      "The total trade value including both the trader's and broker's portions",
      "Only the initial margin amount paid by the trader",
      "The entire portfolio value in the trader's demat account",
      "Only the borrowed amount funded by the broker"
    ],
    correct: 3,
    explanation: "The passage specifies: 'This interest is charged only on the borrowed amount and is applicable for the duration the position is held.'"
  },
  {
    stem: "According to the passage, what happens to the stocks purchased under MTF?",
    options: [
      "They are transferred to a special custody account managed by the exchange",
      "They are held jointly in both the trader's and broker's names",
      "They are automatically pledged as collateral in favour of the broker",
      "They are converted into bonds until the loan amount is fully repaid"
    ],
    correct: 2,
    explanation: "The passage states: 'The purchased stocks are automatically pledged as collateral in favor of the broker.'"
  },
  {
    stem: "Under what condition does a trader face a margin call under MTF?",
    options: [
      "When the stock price rises above the target and the trader wants to book profits",
      "When the daily trade volume on that stock exceeds exchange limits",
      "When the stock price falls and the margin requirement is not maintained",
      "When the trader requests a partial withdrawal from the account"
    ],
    correct: 2,
    explanation: "The passage states: 'If the stock price falls and the margin requirement is not maintained, the trader may face a margin call.'"
  },
  {
    stem: "What options does a trader have when facing a margin call, as stated in the passage?",
    options: [
      "Request a temporary extension or apply for a waiver from the broker",
      "Add funds or reduce positions to maintain the required margin levels",
      "Transfer the position to another broker or exchange it for bonds",
      "Convert the MTF position to a delivery-based position at no cost"
    ],
    correct: 1,
    explanation: "The passage states: 'The trader must either add funds or reduce positions to maintain the required margin levels.'"
  },
  {
    stem: "Under what market conditions can the broker liquidate the trader's position without prior notice?",
    options: [
      "Only during pre-market hours when the trader is unavailable",
      "When the stock hits its upper or lower circuit for three consecutive days",
      "In volatile market conditions when the margin requirement is not met",
      "Whenever the broker determines it is in the trader's best financial interest"
    ],
    correct: 2,
    explanation: "The passage states: 'This can happen without prior notice in volatile market conditions.' — referring to the broker's right to liquidate if margin is not maintained."
  }
];

// ─────────────────────────────────────────────────────────────────
//  Topics to insert
// ─────────────────────────────────────────────────────────────────
const topics = [
  {
    module: 'listening-assessment',
    title: 'Listening Set 1 — Section 1: Video (10 Questions)',
    description: 'Based on the video clip shared by your trainer. Answer all 10 questions. Each question carries 2 marks (20 marks total).',
    scenario: '', checklist: section1Video, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  },
  {
    module: 'listening-assessment',
    title: 'Listening Set 1 — Section 2: Audio (10 Questions)',
    description: 'Based on the audio clip shared by your trainer. Answer all 10 questions. Each question carries 5 marks (50 marks total).',
    scenario: '', checklist: section2Audio, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  },
  {
    module: 'listening-assessment',
    title: 'Listening Set 1 — Section 3: Reading (10 Questions)',
    description: 'Based on the reading passage shared by your trainer. Answer all 10 questions. Each question carries 3 marks (30 marks total).',
    scenario: '', checklist: section3Reading, bot_script: [], enabled: true,
    created_at: new Date().toISOString()
  }
];

async function seed() {
  console.log('🚀 Seeding Listening Assessment Set 1...\n');
  for (const topic of topics) {
    process.stdout.write(`  Inserting "${topic.title}" (${topic.checklist.length} questions)... `);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/topics`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(topic)
    });
    if (!res.ok) {
      console.error('❌ FAILED\n   ', await res.text());
    } else {
      const d = await res.json();
      console.log(`✅ Inserted (id: ${d[0]?.id ?? 'ok'})`);
    }
  }
  console.log('\n✅ Done! Listening Set 1 is in Supabase (10 + 10 + 10 = 30 questions, 100 marks).');
}

seed().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
