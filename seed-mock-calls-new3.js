// Seed script — 3 new irate Mock Call topics
// Run with: node seed-mock-calls-new3.js

const SUPABASE_URL = 'https://xnsmsrjbfjjzivuvicko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc';

const STANDARD_FIRST = "Open the call with a greeting and empathize with the client. If you need to hold the call, explain the situation to them, and make sure to wrap up the call correctly at the end.";
const STANDARD_LAST  = "Carefully listen to the client, provide a clear resolution using accessible language, and acknowledge them throughout the call";

const topics = [

  // ── Topic 8 ──────────────────────────────────────────────────
  {
    module: 'mock-call',
    title: 'Physical Delivery Penalty – ITM Stock Options Expired Without Funds',
    description: 'When an in-the-money (ITM) stock option is held to expiry, it is subject to physical delivery under exchange rules — meaning the buyer must pay the full contract value to take delivery of the underlying shares, and the seller must deliver them. If a client holds such an option at expiry without adequate funds or shares in their account, the position goes into compulsory physical delivery, resulting in auction penalties, margin shortfall charges, and possible financial loss. The client was not aware of this obligation and had assumed the position would simply expire or be cash-settled.',
    scenario: "You receive an inbound call. The client is furious about an unexpected penalty debited from their account after their ITM stock options expired without sufficient funds for physical delivery. They are demanding a full refund, claiming they were never informed about the physical delivery obligation.",
    checklist: [
      STANDARD_FIRST,
      "Empathize with the client's shock and acknowledge the financial impact of the unexpected penalty",
      "Clearly explain the physical delivery obligation for ITM stock options at expiry and that this is an exchange-mandated rule, not a broker policy",
      "Explain why the auto square-off may not have been triggered — ITM positions within the do-not-exercise range are not squared off automatically; only deep-in-the-money positions above the threshold are settled in cash",
      "Walk the client through the penalty structure — what amount was charged, why it was applied, and which exchange circular governs it",
      "Escalate to the Risk or Compliance team and check whether any waiver or partial adjustment is possible as a goodwill gesture, while setting honest expectations",
      STANDARD_LAST
    ],
    bot_script: [
      "I had absolutely no idea my options would go to physical delivery. Your platform never showed me a single warning before expiry. Why wasn't I informed that I needed funds to take delivery of the actual shares?",
      "I clearly did not have the funds for physical delivery — your own system would have shown that. So why was the position allowed to expire instead of being squared off automatically before expiry? Other brokers do that as a standard risk measure.",
      "I'm looking at my account right now and there is a debit for a physical delivery penalty that I never authorised. Money has been taken from my account without my knowledge or consent. How is this even legal?",
      "I have been trading options on your platform for years. Nobody — not your app, not your support team, not any communication — ever told me that stock options carry a physical delivery obligation at expiry. Was this hidden deliberately in some fine print that nobody reads?",
      "You are telling me the exchange mandated this — fine. But your platform accepted my position, held it to expiry, did nothing to warn me, and now penalised me. At what point does your platform take any responsibility here?",
      "Last question — I want the full penalty amount reversed. If your platform failed to warn me and failed to auto square-off my position, the fault is yours, not mine. If you are not able to reverse it, give me the name and contact of your nodal officer and the relevant SEBI SCORES category — I will file a formal complaint today before the market closes."
    ]
  },

  // ── Topic 9 ──────────────────────────────────────────────────
  {
    module: 'mock-call',
    title: 'IMPS Credit Delay – Missed Intraday Trade and Loss of Opportunity',
    description: 'IMPS (Immediate Payment Service) transfers are designed to credit funds near-instantly, typically within minutes. However, broker-end fund availability depends on payment gateway processing, bank batch timings, and internal risk checks — which can sometimes cause a delay between the bank\'s confirmation timestamp and when the funds appear as tradeable balance on the platform. A client who transferred funds early in the morning before a significant market move experienced this delay, missing an intraday opportunity, and is now holding the broker directly responsible for the financial loss.',
    scenario: "You receive an inbound call. The client transferred funds via IMPS at 9:10 AM — before market open — and the money only reflected as tradeable balance at 11:45 AM. In the intervening time, a stock they intended to buy moved 15% intraday. The client is demanding compensation for the missed opportunity and is threatening to escalate formally.",
    checklist: [
      STANDARD_FIRST,
      "Acknowledge the client's frustration and the financial impact of the missed opportunity without deflecting or dismissing their concern",
      "Explain the IMPS fund credit process — while IMPS is near-instant at the bank level, broker-end tradeable balance availability depends on payment gateway batch processing, T+0 cut-off windows, and internal risk team validation",
      "Clarify the distinction between the bank's IMPS confirmation timestamp and the broker's fund availability timestamp — these are controlled by different systems and may not align",
      "Commit to investigating the specific delay with the payments and technology team, and to providing the client with a written explanation of what caused it",
      "Explain the limitations on opportunity-loss compensation clearly and empathetically — this is not covered under standard policy — while offering to escalate the complaint formally and share the outcome with the client",
      STANDARD_LAST
    ],
    bot_script: [
      "I transferred funds via IMPS at 9:10 AM — I have the bank transaction receipt right here showing the timestamp. Your platform only showed the money as available at 11:45 AM. That is over two and a half hours. IMPS is supposed to be instant — what exactly happened on your end?",
      "Because of that delay, I missed a trade that moved 15% intraday. I had the buy order ready and waiting — I just didn't have the funds showing up on your platform. That is a direct financial loss caused entirely by your system's failure to credit my account on time.",
      "I have used IMPS with three other brokers and the funds always show within minutes — not hours. This is clearly a failure specific to your platform or your payment gateway. Do not tell me this is normal because I know it is not.",
      "I want to know exactly where the delay happened. Was it your payment gateway? Did your risk team put a hold on my transfer? Did someone manually delay the credit? I want a specific answer, not a generic explanation about processing timelines.",
      "You keep saying you will check — I have been patient enough. Someone in your organisation made a decision or a system on your platform failed, and it cost me money. Who is accountable? Give me a name, a team, and a timeline for when I will get an answer.",
      "Last question — I want to know what your organisation is prepared to do about this. If you cannot compensate me for the missed trade, I want the direct contact of your nodal officer and the SEBI SCORES complaint category for payment delays. I will file the complaint before I hang up this call — so please give me that information right now."
    ]
  },

  // ── Topic 10 ─────────────────────────────────────────────────
  {
    module: 'mock-call',
    title: 'Short Delivery Auction Penalty – Client Sold Recently Allotted IPO Shares',
    description: 'When shares are allotted through an IPO, they follow a T+2 settlement cycle before they appear as freely tradeable in the demat account. If a client attempts to sell these shares before settlement is complete, the trade is accepted by the exchange but results in short delivery — because the shares cannot be delivered on settlement day. The exchange then runs an auction to source the undelivered shares, and the original seller is charged an auction penalty, which can be significantly higher than the market price. The client in this scenario was unaware of the settlement lock-in and is furious that the platform allowed the sell order to go through when delivery was not possible.',
    scenario: "You receive an inbound call. The client received IPO allotment shares and sold them the next day, believing they were freely tradeable. The sell order was accepted by the platform, but when delivery failed, the exchange ran an auction and debited a penalty from the client's account. The client is demanding a full reversal, arguing that the platform should have blocked an order it could not deliver.",
    checklist: [
      STANDARD_FIRST,
      "Empathize genuinely with the client's frustration and acknowledge the unexpected penalty debit without minimising the impact",
      "Explain the T+2 settlement cycle for IPO-allotted shares — shares are credited to the demat after allotment but are not in a deliverable state until the settlement cycle completes, typically 2 trading days after allotment",
      "Clarify that while the sell order being accepted on the exchange does not guarantee delivery capability — the exchange and broker systems operate in layers, and the order may pass through exchange acceptance before the delivery check fails at settlement",
      "Walk through the auction penalty mechanism clearly — when short delivery occurs, the exchange sources shares via an auction at the next day's closing price plus a penalty percentage; this is an exchange-mandated debit, not a broker charge",
      "Escalate to the Operations or Risk team for a formal review of whether the penalty can be waived or adjusted, given that the platform did not restrict an order that should have been blocked, and commit to a clear TAT for the outcome",
      STANDARD_LAST
    ],
    bot_script: [
      "I sold shares that your platform allowed me to sell — the order went through, it showed as executed, and I got the confirmation. Now you are telling me there is an auction penalty because of short delivery? If those shares couldn't be delivered, why on earth did your platform accept the order in the first place?",
      "I just received these shares through an IPO allotment. Nobody — not your app, not your support team, not a single notification — told me there was a settlement period before I could sell. If there is a lock-in or a restriction, shouldn't your system block the sale automatically? Why is that the client's responsibility to know?",
      "I am looking at my account right now and there is a significant debit for an auction penalty — money that was taken from my account without my knowledge or approval. Your system created this situation by accepting an order it could not fulfil, and now I am the one paying for it. How is that acceptable?",
      "I have seen other platforms block the sale of unsettled shares outright — they simply do not allow the order. Your platform let it go through and then penalised me for the result. Where exactly is your risk control in this entire process?",
      "I want the complete timeline from you — when was the IPO allotment credited to my account, when did I place the sell order, what was the settlement date, and when was the auction triggered. Walk me through the entire sequence so I understand exactly how your system failed me at each step.",
      "Last question — I want the full auction penalty reversed. Your platform accepted an order it should have blocked — that is a system failure and the responsibility is entirely yours. If you are not able to reverse it, I want the name of your grievance officer, the SEBI SCORES complaint link, and the NSE or BSE investor grievance cell contact — I will file with all three before the end of today."
    ]
  }

];

async function run() {
  for (const topic of topics) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/topics', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        module: topic.module,
        title: topic.title,
        description: topic.description,
        scenario: topic.scenario,
        checklist: topic.checklist,
        bot_script: topic.bot_script,
        enabled: true
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('FAILED:', topic.title, err);
    } else {
      const data = await res.json();
      console.log('✅ Inserted:', topic.title, '| id:', data[0]?.id);
    }
  }
}

run().catch(e => console.error('Fatal:', e));
