/**
 * Seed — NRI Basics of Stock Market MCQ (54 Questions)
 * Run: node seed-stock-market-nri.js
 */
const SUPABASE_URL = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const questions = [
  {
    stem: "In which year and city was Zerodha founded?",
    options: ["2005, Mumbai", "2008, Hyderabad", "2010, Bengaluru", "2012, Delhi"],
    correct: 2,
    explanation: "Zerodha was founded in 2010 in Bengaluru by Nithin Kamath and Nikhil Kamath."
  },
  {
    stem: "Who are the founders of Zerodha?",
    options: [
      "Radhakishan Damani and Rakesh Jhunjhunwala",
      "Nithin Kamath and Nikhil Kamath",
      "Vijay Shekhar Sharma and Deepinder Goyal",
      "Uday Kotak and Nandan Nilekani"
    ],
    correct: 1,
    explanation: "Zerodha was founded by brothers Nithin Kamath and Nikhil Kamath."
  },
  {
    stem: "Zerodha was the first to introduce which revolutionary brokerage model in India?",
    options: [
      "Full-service broking with relationship managers",
      "Discount broking — a flat fee of Rs. 20 per trade regardless of order size",
      "Free broking with no charges at all",
      "Subscription-based broking model"
    ],
    correct: 1,
    explanation: "Zerodha pioneered the discount broking model in India — a flat Rs. 20 per trade regardless of order size."
  },
  {
    stem: "What was the major technological breakthrough that set Zerodha apart from traditional brokers?",
    options: [
      "Launching India's first mutual fund platform",
      "Introducing phone-based trading",
      "Launching Kite — a modern, fast, and lightweight trading platform",
      "Launching a dedicated commodity exchange"
    ],
    correct: 2,
    explanation: "Zerodha's Kite platform is widely regarded as a game-changer — fast, modern, and built in-house."
  },
  {
    stem: "Zerodha grew entirely without external funding. This means it is a:",
    options: [
      "Government-owned enterprise",
      "Venture capital-backed startup",
      "Bootstrapped company — funded only by the founders and internal profits",
      "Listed public company on NSE"
    ],
    correct: 2,
    explanation: "Zerodha is bootstrapped — it has never raised external venture capital and is entirely self-funded."
  },
  {
    stem: "Which stock exchange was established in 1875 and is Asia's oldest exchange?",
    options: ["NSE", "MCX", "BSE", "NCDEX"],
    correct: 2,
    explanation: "BSE (Bombay Stock Exchange), established in 1875, is Asia's oldest stock exchange."
  },
  {
    stem: "What is the benchmark index of the NSE (National Stock Exchange)?",
    options: ["S&P BSE Sensex", "Nifty 50", "Nifty Bank", "BSE 500"],
    correct: 1,
    explanation: "The Nifty 50 is the flagship index of the NSE, tracking the top 50 companies."
  },
  {
    stem: "The S&P BSE Sensex tracks how many stocks?",
    options: ["50", "100", "30", "200"],
    correct: 2,
    explanation: "The BSE Sensex tracks 30 of the largest and most actively traded stocks on the BSE."
  },
  {
    stem: "NSE was established in which year and pioneered which capability?",
    options: [
      "1985, screen-based trading",
      "1992, automated trading",
      "1994, online trading",
      "2000, algorithmic trading"
    ],
    correct: 1,
    explanation: "NSE was established in 1992 and pioneered automated electronic trading in India."
  },
  {
    stem: "In the IPO process, who is appointed as the lead manager?",
    options: ["SEBI", "Stock Broker", "Merchant Banker", "Clearing Corporation"],
    correct: 2,
    explanation: "A Merchant Banker is appointed as the lead manager to manage the IPO process end-to-end."
  },
  {
    stem: "What does DRHP stand for in the context of an IPO?",
    options: [
      "Direct Registered Holding Prospectus",
      "Draft Red Herring Prospectus",
      "Demat Registration and Holding Paper",
      "Direct Rights and Holdings Proposal"
    ],
    correct: 1,
    explanation: "DRHP stands for Draft Red Herring Prospectus — the preliminary IPO document filed with SEBI."
  },
  {
    stem: "SEBI's role during its review of the DRHP is best described as:",
    options: [
      "Setting the IPO price",
      "Vetting the financials of the company",
      "Checking for full and fair disclosure only",
      "Allocating shares to investors"
    ],
    correct: 2,
    explanation: "SEBI checks that the DRHP provides full and fair disclosure — it does not verify financial accuracy."
  },
  {
    stem: "The final document filed with the exchange that includes the price band is called:",
    options: ["DRHP", "Prospectus Summary", "Red Herring Prospectus (RHP)", "Allotment Letter"],
    correct: 2,
    explanation: "The Red Herring Prospectus (RHP) is the final version of the IPO document, including the price band."
  },
  {
    stem: "During the IPO live bidding phase, which mechanism blocks funds in an investor's bank account?",
    options: ["DDPI", "eDIS", "UPI-linked ASBA", "TPIN"],
    correct: 2,
    explanation: "UPI-linked ASBA (Application Supported by Blocked Amount) blocks funds during IPO bidding."
  },
  {
    stem: "For retail investors in an IPO, the allotment process is done via:",
    options: ["First come, first served", "Proportional allotment", "Lottery", "Auction bidding"],
    correct: 2,
    explanation: "Retail IPO allotment is done via lottery when oversubscribed, ensuring fairness."
  },
  {
    stem: "In the Secondary Market, when shares are traded between two investors, the company:",
    options: [
      "Receives a transaction fee",
      "Issues new shares each time",
      "Gets no money — only investors exchange ownership",
      "Must approve each transaction"
    ],
    correct: 2,
    explanation: "In the secondary market, only ownership transfers between investors — the company receives nothing."
  },
  {
    stem: "What drives share price changes in the secondary market on a second-by-second basis?",
    options: [
      "SEBI directives",
      "Company announcements only",
      "Supply and demand — more buyers raises price, more sellers lowers price",
      "Fixed periodic auctions"
    ],
    correct: 2,
    explanation: "Share prices are driven purely by supply and demand dynamics in the secondary market."
  },
  {
    stem: "SEBI stands for:",
    options: [
      "Stock Exchange Board of India",
      "Securities and Exchange Board of India",
      "Securities and Equity Bureau of India",
      "Stock Equity and Brokerage Institution"
    ],
    correct: 1,
    explanation: "SEBI — Securities and Exchange Board of India — is the regulator of the Indian securities market."
  },
  {
    stem: "Which exchanges fall under SEBI's purview for Equities and Derivatives in India?",
    options: ["MCX and NCDEX", "NSE and BSE", "BSE and MCX", "NSE and NCDEX"],
    correct: 1,
    explanation: "NSE and BSE are the two main exchanges for equities and derivatives, both regulated by SEBI."
  },
  {
    stem: "MCX and NCDEX are specialized exchanges dealing in which market segment?",
    options: ["Equities", "Government bonds", "Commodities", "Currency derivatives"],
    correct: 2,
    explanation: "MCX and NCDEX are commodity exchanges dealing in metals, energy, and agricultural products."
  },
  {
    stem: "Stock Brokers are described as which Pillar of financial intermediaries?",
    options: [
      "Pillar 1 – The Gateway",
      "Pillar 2 – The Record Keepers",
      "Pillar 3 – The Guarantors",
      "Pillar 4 – The Regulators"
    ],
    correct: 0,
    explanation: "Stock Brokers are Pillar 1 — The Gateway — as they are the entry point for investors to the market."
  },
  {
    stem: "Depositories (NSDL and CDSL) are described as:",
    options: [
      "Clearing Corporations",
      "Secure digital vaults holding your electronic shares",
      "Tax collection authorities",
      "Broker subsidiaries"
    ],
    correct: 1,
    explanation: "Depositories like NSDL and CDSL act as digital vaults, holding shares in dematerialised form."
  },
  {
    stem: "Clearing Corporations ensure trades settle with zero defaults. They are:",
    options: [
      "Regulated directly by the Government of India",
      "Wholly owned subsidiaries of exchanges",
      "Private equity firms",
      "Part of SEBI"
    ],
    correct: 1,
    explanation: "Clearing Corporations (e.g., NSCCL) are wholly owned subsidiaries of their respective exchanges."
  },
  {
    stem: "Brokers act as Depository Participants (DPs) to connect investors to:",
    options: ["SEBI", "NSE and BSE", "NSDL and CDSL", "Clearing Corporations"],
    correct: 2,
    explanation: "As DPs, brokers like Zerodha connect investors to NSDL and CDSL for Demat services."
  },
  {
    stem: "Buying equity in a company means you own:",
    options: [
      "A loan given to the company",
      "A micro-fraction of that business",
      "The right to vote only",
      "A fixed return bond"
    ],
    correct: 1,
    explanation: "Buying equity (shares) means you own a proportional fraction of the company as a shareholder."
  },
  {
    stem: "Which correctly distinguishes Stocks from Shares?",
    options: [
      "They are exactly the same thing",
      "Stock is general ownership; Shares are the specific units (e.g., 10 shares of Infosys)",
      "Stocks are only for large companies; Shares for small",
      "Stocks are traded on BSE; Shares on NSE"
    ],
    correct: 1,
    explanation: "'Stock' refers to general ownership; 'shares' are the specific numbered units of that stock."
  },
  {
    stem: "Derivatives are financial contracts whose value is:",
    options: [
      "Fixed by SEBI",
      "Equal to the face value of the underlying stock",
      "Derived from an underlying asset rather than owning it directly",
      "Based on inflation rates"
    ],
    correct: 2,
    explanation: "Derivatives derive their value from an underlying asset (stock, index, commodity, currency) without direct ownership."
  },
  {
    stem: "The Spot Market is where shares are bought and delivered:",
    options: [
      "After 30 days",
      "Immediately or within the standard settlement cycle",
      "Only during special sessions",
      "Through futures contracts"
    ],
    correct: 1,
    explanation: "The Spot (Cash) Market involves immediate buying/selling with settlement in the standard T+1 cycle."
  },
  {
    stem: "The Golden Rule for new investors as per the presentation is:",
    options: [
      "Always diversify across 10 asset classes",
      "Never trade complex instruments you do not fully understand — master the Spot Market first",
      "Buy on dips and sell on highs",
      "Always use a stop loss"
    ],
    correct: 1,
    explanation: "The golden rule: master the Spot Market first before venturing into complex derivatives or F&O."
  },
  {
    stem: "A Market Order executes at which price?",
    options: [
      "A price you specify in advance",
      "The best available price at the moment of execution",
      "The closing price of the previous day",
      "The IPO price"
    ],
    correct: 1,
    explanation: "A Market Order executes immediately at the best available market price — execution is guaranteed, price is not."
  },
  {
    stem: "Which order type guarantees price but not execution?",
    options: ["Market Order", "Stop Loss Market Order", "Limit Order", "Bracket Order"],
    correct: 2,
    explanation: "A Limit Order sets a specific price — it executes only if the market reaches that price, so execution is not guaranteed."
  },
  {
    stem: "A Stop Loss order is primarily used to:",
    options: [
      "Guarantee profit booking",
      "Limit potential losses by triggering a sell at a defined price",
      "Buy more shares when the price drops",
      "Execute trades at opening bell only"
    ],
    correct: 1,
    explanation: "A Stop Loss order automatically exits a position at a defined price to cap downside risk."
  },
  {
    stem: "The first step in the Zerodha account opening process is:",
    options: [
      "Physical visit to a Zerodha branch",
      "Submission of paper KYC forms",
      "Digital Onboarding (E-KYC) using Aadhaar-linked mobile number",
      "Calling the Zerodha helpline"
    ],
    correct: 2,
    explanation: "Zerodha's process starts with E-KYC using your Aadhaar-linked mobile for Aadhaar OTP verification."
  },
  {
    stem: "In-Person Verification (IPV) during Zerodha account opening is completed via:",
    options: [
      "A Zerodha executive visiting your home",
      "A quick webcam video to confirm your presence — no physical visit required",
      "Submission of a notarised document",
      "Aadhaar OTP only"
    ],
    correct: 1,
    explanation: "IPV at Zerodha is done digitally via a webcam video — no physical branch visit is required."
  },
  {
    stem: "E-Sign with Aadhaar during account opening involves:",
    options: [
      "Wet signature on printed forms",
      "Physical stamp paper",
      "Digitally signing forms using an OTP sent to your Aadhaar-linked mobile",
      "Biometric fingerprint scan at a CDSL branch"
    ],
    correct: 2,
    explanation: "E-Sign uses an OTP sent to your Aadhaar-linked mobile to digitally authenticate and sign documents."
  },
  {
    stem: "DDPI stands for:",
    options: [
      "Demat Debit and Pledge Instruction",
      "Digital Delivery and Purchase Instruction",
      "Demat Deposit and Proxy Instrument",
      "Direct Debit and Pledge Index"
    ],
    correct: 0,
    explanation: "DDPI stands for Demat Debit and Pledge Instruction — it replaces the older Power of Attorney (POA)."
  },
  {
    stem: "DDPI allows the broker to access shares:",
    options: [
      "For any transaction the broker deems necessary",
      "Only for specific, investor-initiated trades",
      "For pledging shares without investor knowledge",
      "Across all linked family accounts"
    ],
    correct: 1,
    explanation: "DDPI is investor-initiated — it only allows the broker to debit shares for trades specifically placed by the investor."
  },
  {
    stem: "If DDPI is not active, how must an investor authorize every sell transaction?",
    options: [
      "By calling the broker",
      "Through the old Power of Attorney (POA)",
      "Via eDIS — using a CDSL TPIN and OTP",
      "By visiting the CDSL office"
    ],
    correct: 2,
    explanation: "Without DDPI, investors must use eDIS (electronic Delivery Instruction Slip) with CDSL TPIN and OTP for each sell."
  },
  {
    stem: "Under T+1 settlement, when do shares reach your Demat vault after a buy trade?",
    options: [
      "Same day (T)",
      "One trading day after the trade (T+1)",
      "Two trading days after the trade (T+2)",
      "Three trading days after the trade (T+3)"
    ],
    correct: 1,
    explanation: "India moved to T+1 settlement — shares are credited to your Demat account one trading day after the buy trade."
  },
  {
    stem: "CMR (Client Master Report) is best described as:",
    options: [
      "A monthly brokerage statement",
      "A tax filing document",
      "The identity card for your Demat account detailing all core verified information",
      "A report issued by SEBI"
    ],
    correct: 2,
    explanation: "The CMR is the official identity document for your Demat account, containing all KYC-verified details."
  },
  {
    stem: "Adding a nominee to your Demat account is:",
    options: [
      "Optional but recommended",
      "An absolute regulatory requirement to ensure wealth transfers to heirs",
      "Only required for accounts with more than Rs. 10 lakh",
      "Applicable only for joint accounts"
    ],
    correct: 1,
    explanation: "SEBI mandates nomination for all Demat accounts — it ensures shares pass to heirs without legal complications."
  },
  {
    stem: "Short delivery occurs when a seller:",
    options: [
      "Sells at a price below the market",
      "Sells shares but fails to deliver them to the exchange by the T+1 settlement deadline",
      "Places a sell order after market hours",
      "Sells more than 5% of their holding"
    ],
    correct: 1,
    explanation: "Short delivery happens when a seller cannot deliver shares by the T+1 deadline — creating a settlement default."
  },
  {
    stem: "When short delivery happens, what action does the Clearing Corporation take?",
    options: [
      "The trade is cancelled and reversed",
      "The buyer automatically gets cash",
      "A live auction is conducted to buy the missing shares on behalf of the defaulting seller",
      "The exchange suspends the stock"
    ],
    correct: 2,
    explanation: "The Clearing Corporation conducts an auction to procure the missing shares, charging the defaulting seller."
  },
  {
    stem: "The penalty charged to the defaulting seller in a short delivery case can be up to:",
    options: ["5% of share value", "10% of share value", "20% of share value", "50% of share value"],
    correct: 2,
    explanation: "The penalty for short delivery can be up to 20% of the share value, acting as a strong deterrent."
  },
  {
    stem: "If the auction for short-delivered shares is successful, when are the shares credited to the buyer?",
    options: ["T+1", "T+2 (visible in Kite from T+3)", "T+3", "T+5"],
    correct: 1,
    explanation: "After a successful auction, shares reach the buyer at T+2 (reflected in Kite from T+3)."
  },
  {
    stem: "If the auction completely fails, what happens to the buyer?",
    options: [
      "The buyer gets shares from the exchange inventory",
      "The trade is reversed with no compensation",
      "Cash is credited to the buyer trading account at the exchange close-out price",
      "The buyer must wait for the next auction"
    ],
    correct: 2,
    explanation: "If the auction fails, the Clearing Corporation credits cash to the buyer at the exchange close-out price."
  },
  {
    stem: "How much short delivery margin does Zerodha block on T day?",
    options: ["50%", "80%", "100%", "120% of the security value"],
    correct: 3,
    explanation: "Zerodha blocks 120% of the security value as short delivery margin on T day to cover potential auction penalties."
  },
  {
    stem: "In Zerodha, the Gift Transfer feature is accessible via:",
    options: [
      "Kite mobile app only",
      "Console > Portfolio > Holdings",
      "The Zerodha branch office",
      "CDSL directly"
    ],
    correct: 1,
    explanation: "Gift Transfers are done through Console (console.zerodha.com) under Portfolio > Holdings."
  },
  {
    stem: "What is the charge for gifting shares in Zerodha?",
    options: [
      "Free of charge",
      "Rs. 10 per security + GST",
      "Rs. 25 per security per transaction + 18% GST",
      "0.1% of transaction value"
    ],
    correct: 2,
    explanation: "Zerodha charges Rs. 25 per security per gift transaction plus 18% GST."
  },
  {
    stem: "For the sender, what is the tax implication of gifting shares?",
    options: [
      "10% long-term capital gains tax applies",
      "No tax implication for the sender",
      "Short-term capital gains tax applies",
      "Gift tax of 5% is levied"
    ],
    correct: 1,
    explanation: "Gifting shares has no tax implication for the sender — the tax obligation falls on the recipient."
  },
  {
    stem: "If the total value of gifted shares received exceeds Rs. 50,000 in a year, it is:",
    options: [
      "Exempt from tax entirely",
      "Taxed at 10% flat rate",
      "Taxable as income in the recipient's hands",
      "Subject to wealth tax only"
    ],
    correct: 2,
    explanation: "Gifts exceeding Rs. 50,000 in a financial year are taxable as 'Income from Other Sources' in the recipient's hands."
  },
  {
    stem: "FIFO stands for:",
    options: [
      "First In, Fixed Out",
      "Full Investment For Options",
      "First In, First Out",
      "Fixed Income, Fixed Output"
    ],
    correct: 2,
    explanation: "FIFO — First In, First Out — means the oldest shares bought are considered sold first."
  },
  {
    stem: "The FIFO method for calculating buy average is mandated by:",
    options: [
      "SEBI",
      "Zerodha internal policy",
      "The Income Tax Department of India",
      "Stock exchange circular"
    ],
    correct: 2,
    explanation: "The Income Tax Department mandates FIFO for computing capital gains on share sales."
  },
  {
    stem: "Using FIFO, when you sell shares, the system treats which shares as sold first?",
    options: [
      "The most recently purchased shares",
      "The highest-priced shares you hold",
      "The shares you bought the earliest",
      "The shares closest to the current market price"
    ],
    correct: 2,
    explanation: "FIFO: the earliest-purchased (first in) shares are treated as sold first, affecting capital gains calculations."
  }
];

const topic = {
  module: 'stock-market-mcq',
  title: 'NRI Basics of Stock Market — 54 Questions',
  description: 'MCQ assessment covering Zerodha, stock exchanges, SEBI, IPO, order types, account opening, settlement, short delivery, gift transfers, and FIFO. 1 mark per question.',
  scenario: '',
  checklist: questions,
  bot_script: [],
  enabled: true,
  created_at: new Date().toISOString()
};

async function seed() {
  console.log('🚀 Seeding NRI Basics of Stock Market (54 MCQ questions)...\n');
  process.stdout.write(`  Inserting "${topic.title}" (${topic.checklist.length} questions)... `);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(topic)
  });
  if (!res.ok) {
    const err = await res.text();
    console.log(`❌ FAILED — ${res.status}: ${err}`);
    process.exit(1);
  }
  const rows = await res.json();
  console.log(`✅  id=${rows[0]?.id}`);
  console.log('\n✅  Done! NRI Basics of Stock Market assessment is now live.\n');
}

seed().catch(e => { console.error(e); process.exit(1); });
