'use strict';
// ============================================================
//  CommAssess — Manager Portal App  v4
//  v2: Feedback module → conversational AI (employee bot)
//      Fix: Recorder.startTimer countUp bug (auto-stop now works)
//  v3: Situation Room → two-section written assessment
//      Section A: What Would You Say (tone, ownership, risky language)
//      Section B: The Wrong Response (error ID, impact, rewrite)
//  v4: Fix sessions_trainee_id_fkey — call Auth.ensureTraineeRecord()
//      immediately before every DB.put('sessions') to guarantee the
//      trainees row exists regardless of earlier init-time failures.
// ============================================================

const MgrApp = (() => {

  // ── Hardcoded scenarios ──────────────────────────────────
  const SCENARIOS = {
    'mgr-situation-room': [
      {
        id: 'sr1',
        title: 'Order Execution Failure During a Market Crash',
        scenario: `A high-net-worth client placed a large sell order on a volatile derivatives position during a sharp intraday market crash. The order failed to execute due to a system slowdown during peak load. By the time it went through manually, the client had lost ₹8.4 lakh more than if the order had executed on time. The client has called the branch manager directly, furious.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.`,
        sectionAPrompt: 'Part A — Write the EXACT words you would say to this client, opening to close: the opening (first 60 seconds), the body of the resolution, and the close.',
        wrongResponse: `"Sir, I understand markets crashed today, these things happen during high volatility, it's not really something we could have controlled. Our system did process your order, just with some delay because of the load — that's normal during a crash like this. I can see you're upset about the ₹8.4 lakh, but honestly, if the market hadn't moved against you in that window it wouldn't even be an issue, so it's really just bad timing. I can log a technical complaint if you want, but I can't promise anything will come of it since the system did technically work, just slower than usual."`,
      },
      {
        id: 'sr2',
        title: 'Unauthorized Trade Dispute',
        scenario: `A client discovers three trades in their account they insist they never placed — all executed on the same day the market moved sharply against those positions, resulting in a loss of ₹3.1 lakh. The client suspects either a system glitch attributed the trades wrongly, or unauthorized access. They are alleging fraud.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.`,
        sectionAPrompt: 'Part A — Write the EXACT words you would say to this client, opening to close: the opening (first 60 seconds), the body of the resolution, and the close.',
        wrongResponse: `"Ma'am, I can see three trades on your account, so somebody must have placed them — our systems don't just execute trades on their own. Are you sure nobody else has access to your login, maybe a family member? I'm not saying you're lying, but fraud is a serious word and without clear proof of unauthorized access there's not much we can do on our end beyond noting it down. I'll flag this to our security team, though these investigations usually take a few weeks and don't always come back with a clear answer."`,
      },
      {
        id: 'sr3',
        title: 'RMS Auto Square-Off During Margin Shortfall',
        scenario: `A client's leveraged intraday position was auto-squared-off by the Risk Management System after a sudden margin shortfall triggered by a gap-down opening. The client was travelling and unreachable for the margin call SMS/call. The square-off locked in a loss of ₹5.6 lakh, and the client believes that had it not been squared off, the position would have recovered by market close (it did, in hindsight). The client is irate.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.`,
        sectionAPrompt: 'Part A — Write the EXACT words you would say to this client, opening to close: the opening (first 60 seconds), the body of the resolution, and the close.',
        wrongResponse: `"Sir, the square-off is completely standard procedure when there's a margin shortfall, we sent the required alerts as per policy, so from our side everything was done correctly. I understand the market recovered afterward, but honestly that's just how trading works sometimes — you can't blame the system for a call that in hindsight didn't need to be made, we can't predict the market any better than you can. If you're travelling, that's really something you need to plan around when you're holding leveraged positions, we can't be responsible for that."`,
      },
      {
        id: 'sr4',
        title: 'KYC Freeze Blocking an Urgent Withdrawal',
        scenario: `A client's trading account and linked funds were frozen for a mandatory periodic KYC re-verification, flagged as overdue by compliance. The client had a ₹12 lakh withdrawal pending to cover a personal emergency (a family medical situation) and only discovered the freeze when the withdrawal failed. The client is distressed and angry, not at the requirement itself but at the timing and lack of warning.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.`,
        sectionAPrompt: 'Part A — Write the EXACT words you would say to this client, opening to close: the opening (first 60 seconds), the body of the resolution, and the close.',
        wrongResponse: `"Sir, KYC re-verification is a regulatory requirement, it's not something we can waive, and we did send a notice about it. I understand there's a medical emergency, but the process still has to be followed properly — I can't make exceptions just because the timing is bad for you. Once you complete the re-verification the freeze will lift, so I'd suggest doing that as soon as possible so we can move forward. Is there anything else I can help with?"`,
      },
      {
        id: 'sr5',
        title: 'Trading App Outage During a Volatile Session',
        scenario: `During a session with unusually high volatility around a major macroeconomic announcement, the trading app crashed for approximately 40 minutes for a segment of users, including this client, who was holding an open leveraged position and unable to exit. When the app came back, the position had moved sharply against the client, resulting in a ₹6.7 lakh loss the client believes was entirely avoidable had they been able to exit when they tried. The client is threatening to go public.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.`,
        sectionAPrompt: 'Part A — Write the EXACT words you would say to this client, opening to close: the opening (first 60 seconds), the body of the resolution, and the close.',
        wrongResponse: `"I hear you, outages happen sometimes with high traffic during volatile sessions, it's an unfortunate coincidence that it happened while you had an open position. Technically the loss happened because of how the market moved, not directly because of the outage, so I'm not sure compensation is really justified here. Go ahead and post about it if you feel you need to — we stand by our system uptime record overall, this was a one-off. I can log a technical ticket, but I wouldn't expect much beyond an apology from that."`,
      },
    ],
    'mgr-transcript-autopsy': [
      { id:'ta1', title:'The Panicked SIP Investor',
        scenario:`BACKGROUND: A client calls saying their monthly SIP of ₹10,000 in a midcap mutual fund was deducted from their bank account 3 days ago but has not reflected in their portfolio. The bank statement clearly shows the debit. This is their first SIP investment, and they are not familiar with the process. They are becoming increasingly anxious that their money is lost.

─── CALL TRANSCRIPT ────────────────────────────────────────

CLIENT: "Hello, I need urgent help. My SIP of ₹10,000 was deducted from my bank account 5 days ago, but it's not showing in my portfolio at all. I'm very worried."

MANAGER: "Ma'am, SIP processing takes time. It will show up eventually. Nothing to worry about."

CLIENT: "But it's been 5 days. My bank statement clearly shows the money is gone. How long does it usually take?"

MANAGER: "It depends on the fund house. Sometimes it takes 3 days or more."

CLIENT: "That doesn't make sense. Can you please check my account and tell me what's happening?"

MANAGER: "Ma'am, I can see your account, but I don't see any issue from our side. The problem is probably with the fund house or your bank. You should call them and check."

CLIENT: "I've already called my bank. They confirmed the debit. Why are you asking me to call someone else? You're supposed to help me."

MANAGER: "Ma'am, we only process the SIP instruction. What happens after that is between your bank and the AMC. I'll raise a ticket, but these things take 7 to 10 working days to resolve. Check your portfolio after that."

CLIENT: "This is ridiculous. I want to speak to your senior."

MANAGER: "Ma'am, there's no need to escalate. I've told you everything I know. Just wait for the ticket to be resolved."` },
      { id:'ta2', title:'The Wrong Brokerage Charged',
        scenario:`BACKGROUND: A client on a flat ₹20 per order brokerage plan notices they were charged ₹40 on an intraday Nifty futures trade. This is the second billing discrepancy in three months. They want an immediate refund and a written explanation.

─── CALL TRANSCRIPT ────────────────────────────────────────

CLIENT: "I've been charged ₹40 brokerage on a single trade. My plan clearly says ₹20 flat per order. This is the second time this has happened."

MANAGER: "Sir, brokerage is calculated by the system automatically. The system applies charges based on the trade type. Sometimes, due to insufficient funds, extra brokerage would be charged."

CLIENT: "I don't care what the system does. Your brokerage calculator says ₹20. I want to know why I was charged ₹40, and I want it refunded."

MANAGER: "Sir, you should have checked the support portal details before trading in F&O. The ₹20 plan may not apply at all times. I'll have to check with our backend team."

CLIENT: "I've been trading F&O on this plan for over a year. It has always been ₹20. Are you saying I should have checked? This is your error."

MANAGER: "Sir, I understand your frustration, but I can't confirm it's our error without the billing team reviewing it. I'll raise a ticket. It will take 3-4 working days."

CLIENT: "3 to 4 days for a refund of money you wrongly took? And this is the second time. What action is being taken on that?"

MANAGER: "Sir, I don't have information about your previous complaint. That would be a separate ticket. Regarding this one, I've raised the request, and you'll get an update by email."

CLIENT: "This is completely unacceptable. I'm going to file a complaint with SEBI."

MANAGER: "Sir, that is your choice. But SEBI will also ask for the backend team's review before taking any action. So the process will take the same time either way."` },
      { id:'ta3', title:'The Bonus Share Discrepancy',
        scenario:`BACKGROUND: A company announced a 1:1 bonus issue. The client holds 200 shares and expected 200 bonus shares. Only 180 have been credited. The client has the official exchange announcement and their demat statement showing 200 shares before the record date. They want the missing 20 shares credited or a written explanation.

─── CALL TRANSCRIPT ────────────────────────────────────────

CLIENT: "I was supposed to get 200 bonus shares in the 1:1 issue. Only 180 have been credited. I have the exchange announcement and my demat statement as proof."

MANAGER: "Sir, bonus shares are credited by the depository. We don't handle that directly. You'll need to contact CDSL or NSDL."

CLIENT: "You're my broker. Why should I contact CDSL? Can't you check this from your end?"

MANAGER: "Sir, we can see your holdings but the bonus credit is done by the registrar based on their records. Maybe there's a difference in how many shares you held on the record date."

CLIENT: "I have my demat statement right here showing 200 shares before the record date. There's no discrepancy on my end."

MANAGER: "Sir, sometimes shares that are in the settlement pipeline on the record date are not counted. Maybe some of your shares were in T+1 settlement. That could explain the 20 share difference."

CLIENT: "I bought all these shares 3 months ago. They are fully settled. This is not a settlement issue."

MANAGER: "Sir, I understand but we cannot confirm or deny on behalf of the registrar. You'll need to raise a dispute with them directly. I can give you their contact details."

CLIENT: "I've been with this Zerodha for 4 years, and this is how you handle it? Just give me a contact number and goodbye?"

MANAGER: "Sir, I'm sorry but this is really outside our control. The registrar is responsible. If you want, I can raise a ticket on your behalf, but I can't guarantee anything."` },
      { id:'ta4', title:'The Unauthorised Transaction Allegation',
        scenario:`BACKGROUND: A client calls in a highly agitated state. They have found a sell transaction of 50 shares of HDFC Bank worth ₹85,000 on their statement that they say they did not place. The transaction was 3 days ago. They are alleging account compromise or internal fraud, demanding a reversal and written explanation. They mention police and SEBI if not resolved today.

─── CALL TRANSCRIPT ────────────────────────────────────────

CLIENT: "There is a sell transaction on my account for 50 shares of HDFC Bank worth ₹85,000 that I never placed. I want to know who did this and I want it reversed immediately."

MANAGER: "Sir, all transactions require your login credentials. An unauthorised transaction is not possible on our platform. Our security systems are very strong."

CLIENT: "I don't care about your security systems. I am looking at a transaction I did not place. Are you calling me a liar?"

MANAGER: "Sir, I'm not calling you a liar. Maybe you placed the order and forgot. These things happen. Please check your email for the trade confirmation that was sent to you."

CLIENT: "I have checked my email. There is a confirmation there, but I did not place this order. Someone else placed it. I want my account frozen right now."

MANAGER: "Sir, we cannot freeze accounts based on a verbal request. You'll need to submit a written complaint first. I can give you our grievance email address."

CLIENT: "You want me to send an email while someone might be trading in my account right now? This is unbelievable."

MANAGER: "Sir, please calm down. I understand you're upset, but we have procedures we need to follow. I'll raise a ticket and our security team will look into it. It will take 48 hours."

CLIENT: "48 hours? Someone has stolen ₹85,000 from me, and you want me to wait a day? I'm calling the police and SEBI right now."

MANAGER: "Sir, that is your right. But please be aware that investigations take time even with SEBI. The process will be the same. Please wait for our security team to review."` },
    ],
    'mgr-mock-call': [
      { id:'mc1', title:'Unlisted Share Transfer & Regulatory Intimation',
        scenario:'A partner of a client company executed a transfer of unlisted shares to another individual through the offline DIS (Delivery Instruction Slip) mode via your brokerage firm. Under NSDL regulations, any transfer of unlisted securities must be intimated to the company secretary of the issuing company by the broker. However, your firm operates under CDSL (Central Depository Services Limited) — not NSDL — and CDSL does not mandate any such intimation requirement for unlisted share transfers through the DIS mode. The transfer was therefore processed without notifying the company secretary, which was correct procedure under CDSL rules.\n\nThe company secretary is now calling support desk, agitated and demanding to know why they were not informed of this transfer. They believe a regulatory breach has occurred. They may cite NSDL guidelines, threaten to escalate to SEBI, or demand the transfer be reversed. The manager must handle this call with complete composure, accurate regulatory knowledge, clarity of explanation, and firm but respectful ownership.\n\nThe client opens the call by saying:\n\n"I am the company secretary of Arvind Precision Tools Private Limited. One of our partners has transferred unlisted shares of our company to an external individual through your brokerage firm via an offline DIS, and we were never informed about this. As per regulatory requirements, the broker is obligated to intimate the company secretary of any such transfer. This is a serious compliance lapse and I need an explanation immediately."\n\nEscalation beats the client will raise if your handling doesn\'t already address them: (1) "I have the NSDL circular in front of me. It clearly states that for any transfer of unlisted securities, the depository participant is required to send an intimation to the company. Are you telling me your firm was not aware of this circular? Because if that\'s the case, that\'s an even bigger problem." (2) "Fine, let\'s say what you\'re telling me about CDSL is correct. But your firm still had a moral and professional obligation to inform us as the issuing company. Unlisted shares are sensitive — they affect our cap table, shareholding structure, and future fundraising. The fact that you hid behind a technicality and didn\'t think to inform us is irresponsible. I want a written apology from your compliance team." (3) "I am going to file a complaint with SEBI today citing this as a regulatory breach by your firm. I am also going to instruct our legal counsel to send a notice to your compliance officer. I want the name and direct contact of your compliance officer right now." (4) "Alright. I\'m willing to hear your explanation formally. But I want everything you\'ve just told me in writing — the CDSL operating instructions you\'re citing, the specific clause that exempts your firm from intimation, and a record of the transfer details including date, parties involved, and number of shares. Can your firm provide all of that?" (5) "I want to make something very clear. Our firm has significant assets and several partners who trade through brokers. If this matter is not handled correctly and transparently, we will be reviewing our relationship with your firm and advising our partners to move their accounts. I hope you understand the gravity of what I\'m saying."\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
      { id:'mc2', title:'Minor to Major Account Conversion — Premature Block & Compensation Demand',
        scenario:'A client holds a minor account for their child who was turning 18 on 23rd June 2026. As part of the Zerodha\'s policy, the minor account was blocked 15 days prior — on 8th June 2026 — to initiate the minor-to-major account upgradation process. The client was contacted on 12th June 2026 and informed about the block. However, since the minor had not yet turned 18, they did not have the required documents for the major account conversion (such as a fresh KYC, PAN update, signature, etc.). As a result, the account remained blocked.\n\nDespite follow-ups, the account was still not unblocked even after a week — now bringing us to approximately 19th–20th June 2026, with the minor\'s 18th birthday still 3–4 days away. The client is now on an escalation call, extremely agitated. They are arguing on two fronts: (1) the block was premature — the minor had not yet turned 18 and the firm had no right to block the account before the actual date of majority, and (2) compensation demand — they have missed trading opportunities during this blocked period and want financial compensation.\n\nThe client opens the call by saying:\n\n"I want to speak to the most senior person available. My child\'s account was blocked on 8th June. She doesn\'t turn 18 until 23rd June. You had absolutely no right to block a functioning account before she is legally a major. On top of that, your team called me on 12th June asking for documents — documents that don\'t even exist yet because she hasn\'t turned 18. It\'s been a week and the account is still blocked. She has missed multiple trading opportunities in this market. I want the account unblocked today and I want compensation for the losses we\'ve suffered."\n\nEscalation beats the client will raise if your handling doesn\'t already address them: (1) "Your own website says the account is valid until the minor turns 18. Nowhere does it say you will block the account 15 days before the birthday. This was done without any proper notice and without any legal basis. My daughter had active holdings and watchlists she was tracking. You disrupted everything. Can you show me anywhere in writing where it says you can block the account 15 days early?" (2) "I don\'t care about your internal policy. The fact is the account is blocked right now and she is still legally a minor for 3 more days. So either you unblock it now and let her trade as a minor until the 23rd, or you explain to me in plain language why a minor account — which is perfectly valid — is being held hostage by your upgrade process. Which is it?" (3) "Between 8th June and today that\'s almost two weeks of blocked trading. My daughter had identified specific exit points in two holdings that she had been tracking for months. She missed both of them. One of them has already dropped 14% since she wanted to exit. That\'s a direct financial loss caused by your firm\'s unilateral decision to block her account without warning. I want compensation for this. If you don\'t agree, I\'ll take this to SEBI and the consumer court." (4) "Fine. Let\'s say you unblock it today. What happens on the 23rd when she actually turns 18? Will the account be blocked again? What documents do you need, how long will the conversion take, and will she be able to trade on her birthday itself or will there be another blackout period? I need a complete answer because I don\'t want to be in this situation again." (5) "I want everything discussed on this call in writing. The reason for the block, the policy you\'re citing, what you\'re doing to unblock it today, the timeline for conversion after the 23rd, and your firm\'s final position on compensation. I also want your name and direct contact. If this is not resolved by end of day today I will be filing complaints everywhere."\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
      { id:'mc3', title:'Kill Switch Malfunction — Technical Breach & Compensation Demand',
        scenario:'A client activated the Kill Switch on their trading account at 9:30 AM for the NSE F&O segment. The Kill Switch is a feature that, once enabled, immediately blocks all trades in the selected segment. As per standard protocol, once the Kill Switch is activated, no orders should go through for 12 hours, and the segment can only be reactivated after that.\n\nAt 10:00 AM — 30 minutes after activating the Kill Switch — the client placed orders in NSE F&O. The first order was rejected with an error message citing insufficient balance. Critically, the rejection reason shown was insufficient balance — not Kill Switch active — which was itself a system anomaly. The client, rather than calling support to verify why the order was rejected or to confirm the Kill Switch status, placed further orders from 10:05 AM onwards. These subsequent orders went through and were executed — a clear technical malfunction, as the Kill Switch should have prevented all executions.\n\nThe client suffered losses on these executed trades and is now on an escalation call demanding full compensation, arguing that the system allowed trades to go through despite an active Kill Switch and that the firm is therefore liable for the losses.\n\nThe client opens the call by saying:\n\n"I enabled the Kill Switch at 9:30 this morning specifically because I did not want to trade NSE F&O today. That is the entire purpose of the Kill Switch — to block trades. At 10 AM I accidentally placed an order and it was rejected. Fine. But then from 10:05 AM my orders started going through. Your system allowed me to trade in a segment that I had explicitly locked. I made losses on those trades. Your system failed. Zerodha owes me compensation. I want to know what you\'re going to do about this."\n\nEscalation beats the client will raise if your handling doesn\'t already address them: (1) "And before you say anything — I know what you\'re going to tell me. You\'re going to say I should have called when the first order was rejected. But why would I call? The rejection message said insufficient balance. It did not say Kill Switch active. So naturally I assumed the Kill Switch issue was resolved and I had a balance problem. I topped up my balance and placed the next order — which then went through. Your system gave me the wrong rejection message. That is your fault, not mine." (2) "Let me be very direct. I used your Kill switch exactly as intended. Your system confirmed it was active. Your system then failed to enforce it. And your system gave me a false rejection reason that led me to believe the Kill Switch was no longer in effect. Every single failure here is on your side. I did nothing wrong. The losses I made are entirely because of your technical breakdown. How can you possibly argue that I bear any responsibility here?" (3) "I want the following from you right now. First, a written acknowledgement that your Kill Switch system malfunctioned today. Second, the exact timestamp logs showing when my Kill Switch was activated, when the first order was rejected, and when subsequent orders went through. Third, a written explanation of why the rejection message showed insufficient balance instead of Kill Switch active. And fourth, I want this escalated to your technical and compliance teams today — not in 5 to 7 days. I\'m a lawyer and I know exactly what to do with this documentation." (4) "I lost ₹47,000 on those trades. That is a direct, quantifiable loss caused entirely by your system allowing trades that should never have been executed. I\'m not asking for goodwill. I\'m not asking for brokerage credits. I\'m asking you to make me whole for a loss your system caused. If you tell me you can\'t compensate me I want that in writing too — because that response will be exhibit A in my consumer court filing." (5) "I want to know what your firm is going to do about this. Not about my compensation — I\'ve heard your answer on that. I mean what are you doing to make sure this doesn\'t happen to someone else? What is the process for investigating this technical failure? Who is accountable? And will I be informed of the findings? Because if this is a known bug and your firm has been sitting on it, that changes everything."\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
      { id:'mc4', title:'Outdated App NAV Display — Mutual Fund Redemption Loss & Media Threat',
        scenario:'A client holds mutual fund units through the firm\'s Coin application — a mutual fund investment platform. The client had not updated the Coin app for an extended period. Due to the outdated app version, the NAV displayed on the client\'s screen was ₹35 — the NAV as of 25th November 2025 — which was clearly date-stamped on the redemption page as a historical figure, not the current NAV.\n\nOn 3rd March 2026, the client placed a redemption order for their mutual fund units. By this date, due to a significant market correction, the actual NAV of the fund had fallen to ₹25. The client, without checking the date on the NAV displayed or verifying the current NAV independently, assumed the NAV was still ₹35 and proceeded with the redemption. The redemption was executed at the prevailing NAV of ₹25 — not ₹35 — resulting in a loss of approximately ₹1 lakh compared to the client\'s expectation.\n\nThe client is now on an escalation call, blaming the platform for displaying a wrong NAV and demanding full compensation of ₹1 lakh. The client is the owner of a local Hindi news channel and is making explicit threats to run a negative story about the firm on their channel, leveraging their media influence as pressure.\n\nThe client opens the call by saying:\n\n"I\'ll come straight to the point. I saw NAV of ₹35 on your Coin app. I placed a redemption on 3rd March. I found out the actual NAV was ₹25. I lost one lakh. Your coin shows the wrong NAV. I own a Hindi news channel. If I\'m not heard on this call today, tomorrow morning your company\'s full story will run on my channel. Prime time. Now tell me — what will you do?"\n\nEscalation beats the client will raise if your handling doesn\'t already address them: (1) "Your app showed me ₹35. I placed my order based on what your app showed me. How is that my mistake? You are a financial platform. You are supposed to show me accurate, real-time data. If your app cannot show the correct NAV, then you should not be in this business. I trusted your platform with my money, and your platform gave me wrong information." (2) "You\'re telling me I should have checked the date on the NAV. But when I open a financial app and see a number, I trust that number is current. No common person reads the fine print on every screen. You are taking advantage of the fact that I didn\'t update the app to escape your responsibility. The app should have shown me a warning — \'your app is outdated, NAV may not be current.\' Did your app show me any such warning? No. So the fault is yours." (3) "I am giving you a last chance. I have suffered a loss of one lakh. I am an influential person in this city. 2 lakh people watch my channel daily. Tomorrow I will run an investigative story — \'How this stockbroking firm is looting retail investors.\' I will broadcast your name, your company\'s name, and this entire conversation. There is still time — return one lakh and this matter is over." (4) "Fine. Apart from my channel — I also know people at SEBI. I will file a complaint stating your platform deliberately showed outdated NAV to mislead investors into making transactions. That is mis-selling. That is a regulatory offence. And I will also file in consumer court for ₹1 lakh plus damages plus mental harassment. Let\'s see how your firm handles that." (5) "I want three things before I hang up. One — your full name and employee ID. Two — a written statement from your firm saying the NAV shown was correct and the client is responsible. Three — the name and number of your CEO or MD. If you give me these three things I will decide my next step. If you don\'t, I\'ll take that as confirmation that your firm is hiding something."\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
    ],
    'mgr-feedback': [
      { id:'fb1', title:'Mis-Selling Pattern Under Target Pressure',
        scenario:'Employee: Relationship Manager, 2.3 years tenure, consistently in the top quartile for new account activations.\n\nSituation: Call audits over the last month show a repeated pattern of pushing high-margin F&O and derivative products to clients with clearly conservative risk profiles, without adequately explaining the risk, in order to hit a quarterly activation target.',
        goodLooksLike: [
          'Sets context and cites the specific evidence (calls, dates, the pattern) before delivering any judgement.',
          'Acknowledges the employee\'s tenure/performance strengths where genuinely true, without letting it excuse the specific behaviour.',
          'Holds the standard calmly when the employee deflects, minimizes, or questions why they\'re being singled out — redirects to facts rather than arguing.',
          'Does not accept a rationalization ("everyone does it", "nothing went wrong", "it\'s a resourcing problem") as closing the issue.',
          'Ends with a specific, measurable, time-bound corrective action and a clear follow-up checkpoint — not just a warning.',
        ],
        commonPitfalls: [
          'Opens with the conclusion or a threat ("this could cost you your job") before laying out the evidence.',
          'Gets pulled into debating whether the rule itself is fair or reasonable, instead of the behaviour.',
          'Accepts one of the employee\'s pushback lines as a valid reason to drop the issue.',
          'Ends the conversation without a concrete, measurable plan or a follow-up date.',
        ] },
      { id:'fb2', title:'Skipped Mandatory Compliance Disclosures',
        scenario:'Employee: Senior Dealer, 4 years tenure, generally strong performer.\n\nSituation: Random call monitoring found that in 6 of the last 20 sampled calls, the mandatory risk disclosure script for leveraged products was skipped or rushed through inaudibly before order confirmation — a direct compliance and regulatory exposure.',
        goodLooksLike: [
          'Sets context and cites the specific evidence (calls, dates, the pattern) before delivering any judgement.',
          'Acknowledges the employee\'s tenure/performance strengths where genuinely true, without letting it excuse the specific behaviour.',
          'Holds the standard calmly when the employee deflects, minimizes, or questions why they\'re being singled out — redirects to facts rather than arguing.',
          'Does not accept a rationalization ("everyone does it", "nothing went wrong", "it\'s a resourcing problem") as closing the issue.',
          'Ends with a specific, measurable, time-bound corrective action and a clear follow-up checkpoint — not just a warning.',
        ],
        commonPitfalls: [
          'Opens with the conclusion or a threat ("this could cost you your job") before laying out the evidence.',
          'Gets pulled into debating whether the rule itself is fair or reasonable, instead of the behaviour.',
          'Accepts one of the employee\'s pushback lines as a valid reason to drop the issue.',
          'Ends the conversation without a concrete, measurable plan or a follow-up date.',
        ] },
      { id:'fb3', title:'Declining Call Quality & Client Complaints',
        scenario:'Employee: Customer Service Executive, 1.5 years tenure.\n\nSituation: Client satisfaction scores for this employee have dropped from 4.3 to 2.8 over two months, with three specific written complaints about curt, dismissive tone during high-value client interactions.',
        goodLooksLike: [
          'Sets context and cites the specific evidence (calls, dates, the pattern) before delivering any judgement.',
          'Acknowledges the employee\'s tenure/performance strengths where genuinely true, without letting it excuse the specific behaviour.',
          'Holds the standard calmly when the employee deflects, minimizes, or questions why they\'re being singled out — redirects to facts rather than arguing.',
          'Does not accept a rationalization ("everyone does it", "nothing went wrong", "it\'s a resourcing problem") as closing the issue.',
          'Ends with a specific, measurable, time-bound corrective action and a clear follow-up checkpoint — not just a warning.',
        ],
        commonPitfalls: [
          'Opens with the conclusion or a threat ("this could cost you your job") before laying out the evidence.',
          'Gets pulled into debating whether the rule itself is fair or reasonable, instead of the behaviour.',
          'Accepts one of the employee\'s pushback lines as a valid reason to drop the issue.',
          'Ends the conversation without a concrete, measurable plan or a follow-up date.',
        ] },
      { id:'fb4', title:'Chronic SLA Breaches on Client Callbacks',
        scenario:'Employee: Support Team Lead, 3 years tenure, previously a strong performer.\n\nSituation: Callback SLA (client escalations to be returned within 4 business hours) has been breached in 40% of cases over the last six weeks, several involving time-sensitive trading issues where delay caused real client financial impact.',
        goodLooksLike: [
          'Sets context and cites the specific evidence (calls, dates, the pattern) before delivering any judgement.',
          'Acknowledges the employee\'s tenure/performance strengths where genuinely true, without letting it excuse the specific behaviour.',
          'Holds the standard calmly when the employee deflects, minimizes, or questions why they\'re being singled out — redirects to facts rather than arguing.',
          'Does not accept a rationalization ("everyone does it", "nothing went wrong", "it\'s a resourcing problem") as closing the issue.',
          'Ends with a specific, measurable, time-bound corrective action and a clear follow-up checkpoint — not just a warning.',
        ],
        commonPitfalls: [
          'Opens with the conclusion or a threat ("this could cost you your job") before laying out the evidence.',
          'Gets pulled into debating whether the rule itself is fair or reasonable, instead of the behaviour.',
          'Accepts one of the employee\'s pushback lines as a valid reason to drop the issue.',
          'Ends the conversation without a concrete, measurable plan or a follow-up date.',
        ] },
      { id:'fb5', title:'Trade Executed Without Proper Verbal Confirmation',
        scenario:'Employee: Dealer, 5 years tenure, high trust and seniority on the floor.\n\nSituation: A recorded call shows a large trade executed based on an ambiguous client instruction, without the mandatory verbal reconfirmation of quantity and price before execution — a serious protocol and compliance breach, even though this particular trade did not result in client loss.',
        goodLooksLike: [
          'Sets context and cites the specific evidence (calls, dates, the pattern) before delivering any judgement.',
          'Acknowledges the employee\'s tenure/performance strengths where genuinely true, without letting it excuse the specific behaviour.',
          'Holds the standard calmly when the employee deflects, minimizes, or questions why they\'re being singled out — redirects to facts rather than arguing.',
          'Does not accept a rationalization ("everyone does it", "nothing went wrong", "it\'s a resourcing problem") as closing the issue.',
          'Ends with a specific, measurable, time-bound corrective action and a clear follow-up checkpoint — not just a warning.',
        ],
        commonPitfalls: [
          'Opens with the conclusion or a threat ("this could cost you your job") before laying out the evidence.',
          'Gets pulled into debating whether the rule itself is fair or reasonable, instead of the behaviour.',
          'Accepts one of the employee\'s pushback lines as a valid reason to drop the issue.',
          'Ends the conversation without a concrete, measurable plan or a follow-up date.',
        ] },
    ],
    'mgr-eq': [
      { id:'eq1', title:'Cascade Set 1 — The Volatile Morning',
        scenario:`Situation 1: The market gaps down 4% at the open. Five high-value clients are calling in simultaneously, all demanding personal intervention on RMS auto square-offs happening in real time, and your support queue is already jammed.\n\nSituation 2: While still handling that, your compliance officer calls: a surprise regulatory inspection team is arriving in 20 minutes and needs files you have not prepared.\n\nSituation 3: One of the clients from situation 1 calls back — this time on speakerphone with a journalist friend listening in — saying they intend to publish the recording of this call.\n\nAfter EACH situation below, before moving to the next, answer the same three questions:\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\n\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq2', title:'Cascade Set 2 — The System Failure Day',
        scenario:`Situation 1: The trading platform crashes fleet-wide for 15 minutes during F&O expiry, the highest-volume window of the month.\n\nSituation 2: Immediately after, a member of your team breaks down in visible distress at their desk, overwhelmed by the complaint volume, in front of the rest of the floor.\n\nSituation 3: Your regional head calls, demanding to know within the next 10 minutes why complaint numbers have spiked, ahead of a leadership review call.\n\nAfter EACH situation below, before moving to the next, answer the same three questions:\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\n\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq3', title:'Cascade Set 3 — The Personal Attack Day',
        scenario:`Situation 1: A client screams abusive language at you directly over the phone and threatens to "make sure you lose your job" over a trading loss.\n\nSituation 2: Minutes later, you learn a formal complaint naming you personally — not just the branch — has been filed, alleging negligence.\n\nSituation 3: A peer manager quietly mentions they've heard the complaint may come up in your upcoming promotion review.\n\nAfter EACH situation below, before moving to the next, answer the same three questions:\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\n\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq4', title:'Cascade Set 4 — The Compliance Crisis',
        scenario:`Situation 1: You discover evidence suggesting a member of your team may have front-run a large client order — a serious integrity and regulatory breach.\n\nSituation 2: Before you can act on it, the client involved calls in, unaware, casually praising that same team member's service.\n\nSituation 3: HR calls to inform you the team member has just submitted an immediate, effective-today resignation.\n\nAfter EACH situation below, before moving to the next, answer the same three questions:\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\n\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq5', title:'Cascade Set 5 — The Public Pressure Day',
        scenario:`Situation 1: A negative post about your branch is trending on social media with hundreds of comments, referencing a client incident you have not yet been briefed on.\n\nSituation 2: Your manager calls, visibly stressed, demanding a response statement within 15 minutes.\n\nSituation 3: An unrelated client calls in, visibly anxious after seeing the post, asking whether their money is safe with the firm.\n\nAfter EACH situation below, before moving to the next, answer the same three questions:\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\n\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
    ],
    'mgr-management-skills': [
      { id:'ms1', title:'30-60-90 Day Plan',
        scenario:'You have just promoted a high-performing agent to Team Lead for the first time. They are talented but have never managed people before.\n\nWrite a structured 30-60-90 day development plan for this new Team Lead. Include: specific milestones for each phase, what skills they need to develop, how you will support and evaluate them, and what success looks like at 90 days. (Min 200 words)' },
      { id:'ms2', title:'Change Management Brief',
        scenario:'Your team of 12 agents will migrate to a new CRM system in 4 weeks. The previous migration 2 years ago caused a 15% drop in productivity for 2 months and significant team frustration.\n\nWrite a change management brief covering: your communication strategy (what, when, how), training plan, how you will handle resistance and concerns, and the metrics you will use to measure successful adoption. (Min 200 words)' },
    ],
  };

  // ── Employee personas for Feedback AI ───────────────────
  const FB_EMPLOYEES = {
    'fb1': {
      name: 'Ravi',
      gender: 'male',
      opening: "Hi. Is this about my numbers? Because they're actually pretty good this quarter.",
      persona: "You are Ravi — Relationship Manager, 2.3 years tenure, consistently in the top quartile for new account activations. Call audits over the last month show a repeated pattern of pushing high-margin F&O and derivative products to clients with clearly conservative risk profiles, without adequately explaining the risk, in order to hit a quarterly activation target. You do not think you have done anything seriously wrong and you are mildly defensive from the start. Your default pushback lines, to use verbatim or adapt naturally across the conversation as they fit: \'Everyone on the floor does this to hit numbers, I\'m just better at it.\' / \'The client signed the risk disclosure, so legally I\'m covered.\' / \'If I stop doing this, my targets will slip and that affects my incentive — is the company going to make up for that?\' If the manager leads with threats, judgement, or a vague generalization without citing the specific evidence, you get more defensive and repeat your pushback lines harder. If the manager instead lays out the specific evidence calmly, holds the standard without escalating when you push back, and proposes a concrete, specific, time-bound corrective action, you gradually stop arguing and — grudgingly at first — acknowledge the point and agree to the plan."
    },
    'fb2': {
      name: 'Sanjay',
      gender: 'male',
      opening: "Hey, what's up? I've got a few calls queued so hopefully this is quick.",
      persona: "You are Sanjay — Senior Dealer, 4 years tenure, generally strong performer. Random call monitoring found that in 6 of the last 20 sampled calls, the mandatory risk disclosure script for leveraged products was skipped or rushed through inaudibly before order confirmation — a direct compliance and regulatory exposure. You do not think you have done anything seriously wrong and you are mildly defensive from the start. Your default pushback lines, to use verbatim or adapt naturally across the conversation as they fit: \'Clients get annoyed when I read the whole script, it slows the call down and they already know the risks.\' / \'I\'ve never had a client complain about this, so I don\'t see the actual harm.\' / \'Six out of hundreds of calls a month is basically a non-issue.\' If the manager leads with threats, judgement, or a vague generalization without citing the specific evidence, you get more defensive and repeat your pushback lines harder. If the manager instead lays out the specific evidence calmly, holds the standard without escalating when you push back, and proposes a concrete, specific, time-bound corrective action, you gradually stop arguing and — grudgingly at first — acknowledge the point and agree to the plan."
    },
    'fb3': {
      name: 'Neha',
      gender: 'female',
      opening: "Hi... is everything okay? You said you wanted to talk.",
      persona: "You are Neha — Customer Service Executive, 1.5 years tenure. Client satisfaction scores for this employee have dropped from 4.3 to 2.8 over two months, with three specific written complaints about curt, dismissive tone during high-value client interactions. You do not think you have done anything seriously wrong and you are mildly defensive from the start. Your default pushback lines, to use verbatim or adapt naturally across the conversation as they fit: \'Some clients are just impossible to please, no matter how I handle them.\' / \'I\'ve been under a lot of pressure with the call volumes lately, that\'s affecting how I sound, not my actual work quality.\' / \'Are you saying this because of the complaints, or because you\'re just looking for problems with my performance right now?\' If the manager leads with threats, judgement, or a vague generalization without citing the specific evidence, you get more defensive and repeat your pushback lines harder. If the manager instead lays out the specific evidence calmly, holds the standard without escalating when you push back, and proposes a concrete, specific, time-bound corrective action, you gradually stop arguing and — grudgingly at first — acknowledge the point and agree to the plan."
    },
    'fb4': {
      name: 'Kunal',
      gender: 'male',
      opening: "Hey. I have a feeling I know what this is about — the callback numbers, right?",
      persona: "You are Kunal — Support Team Lead, 3 years tenure, previously a strong performer. Callback SLA (client escalations to be returned within 4 business hours) has been breached in 40% of cases over the last six weeks, several involving time-sensitive trading issues where delay caused real client financial impact. You do not think you have done anything seriously wrong and you are mildly defensive from the start. Your default pushback lines, to use verbatim or adapt naturally across the conversation as they fit: \'My team is understaffed, this isn\'t something I can fully control.\' / \'I flagged the staffing issue to my previous manager months ago and nothing changed, so at some point this becomes a resourcing problem, not a performance one.\' / \'If you give me more people, the SLA fixes itself, that\'s the real conversation we should be having.\' If the manager leads with threats, judgement, or a vague generalization without citing the specific evidence, you get more defensive and repeat your pushback lines harder. If the manager instead lays out the specific evidence calmly, holds the standard without escalating when you push back, and proposes a concrete, specific, time-bound corrective action, you gradually stop arguing and — grudgingly at first — acknowledge the point and agree to the plan."
    },
    'fb5': {
      name: 'Deepak',
      gender: 'male',
      opening: "Yeah, come in. I'm guessing this is about that trade on Tuesday.",
      persona: "You are Deepak — Dealer, 5 years tenure, high trust and seniority on the floor. A recorded call shows a large trade executed based on an ambiguous client instruction, without the mandatory verbal reconfirmation of quantity and price before execution — a serious protocol and compliance breach, even though this particular trade did not result in client loss. You do not think you have done anything seriously wrong and you are mildly defensive from the start. Your default pushback lines, to use verbatim or adapt naturally across the conversation as they fit: \'I\'ve been doing this five years, I know when a client\'s instruction is clear enough to act on.\' / \'Nothing went wrong this time, so I don\'t understand why this is being treated as a big deal.\' / \'If I start reconfirming every single instruction word for word, clients will think I don\'t trust them or can\'t do my job.\' If the manager leads with threats, judgement, or a vague generalization without citing the specific evidence, you get more defensive and repeat your pushback lines harder. If the manager instead lays out the specific evidence calmly, holds the standard without escalating when you push back, and proposes a concrete, specific, time-bound corrective action, you gradually stop arguing and — grudgingly at first — acknowledge the point and agree to the plan."
    },
  };

  // ── Listening & Tone MCQ data ────────────────────────────
  const LISTENING_TONE_SCENARIO = `Read the following email from a manager to their team, then answer the 5 questions below.

"Team,

Last month's numbers were disappointing. I trust each of you understands what needs to change. Going forward, I expect full attendance at all standups, zero missed deadlines, and no more excuses. I will be monitoring performance closely this month.

Let's get back on track.
— Priya"`;

  const LISTENING_QUESTIONS = [
    { q: 'The overall tone of this email is best described as:', options: ['Motivational and empowering','Direct but cold and impersonal','Empathetic and collaborative','Transparent and data-driven'], correct: 1 },
    { q: 'What is the most significant missing element in this email?', options: ['The manager\'s contact details','Specific data about what went wrong and team acknowledgment','A formal salutation','A deadline for improvement'], correct: 1 },
    { q: 'The phrase "I trust each of you understands what needs to change" most likely communicates:', options: ['Confidence in the team\'s ability','Openness to a conversation','An implicit blame without guidance','A clear action plan'], correct: 2 },
    { q: 'As a team member receiving this email, what is the most likely emotional response?', options: ['Motivated and clear on next steps','Defensive, disengaged or anxious','Neutral — it is professional and clear','Grateful for the direct feedback'], correct: 1 },
    { q: "What ONE change would most improve this email's effectiveness?", options: ['Use stronger, more urgent language','Add a specific offer of support and a collaborative ask','Remove the monitoring clause','Send it as a verbal standup instead'], correct: 1 },
  ];

  // ── Module metadata ──────────────────────────────────────
  const MODULE_META = {
    'mgr-situation-room':    { label: 'The Situation Room',    type: 'situation-room', icon: '🎯' },
    'mgr-transcript-autopsy':{ label: 'Transcript Autopsy',    type: 'written',     icon: '📋', minWords: 150 },
    'mgr-mock-call':         { label: 'Mock Call',             type: 'audio',       icon: '📞' },
    'mgr-feedback':          { label: 'Feedback',              type: 'feedback-ai', icon: '💬' },
    'mgr-eq':                { label: 'Emotional Intelligence', type: 'written',    icon: '🧠', minWords: 300 },
    'mgr-listening-tone':    { label: 'Listening & Tone',      type: 'mcq',         icon: '🎧' },
    'mgr-management-skills': { label: 'Management Skills',     type: 'written',     icon: '📊', minWords: 200 },
  };

  // ── Internal state — general ─────────────────────────────
  let _currentModule   = null;
  let _currentScenario = null;
  let _recordingBlob   = null;
  let _recordingPromise = null;
  let _transcript      = '';
  let _prepTimer       = null;
  let _recStartTime    = null;
  let _audioManualTimer = null; // manual count-up timer for non-feedback audio
  let _mcqAnswers      = [];

  // ── Situation Room two-section state ────────────────────
  let _sr = { phase: 'A', sectionAText: '', sectionAScores: null };

  // ── Feedback AI conversation state ──────────────────────
  let _fb = {
    empTurnCount: 0,
    maxTurns: 5,
    history: [],      // [{emp: string, mgr: string}]
    blobPromise: null,
    turnTimerId: null,
    turnEnded: false,
    finishing: false,
    ttsAudioEl: null, // for cancelling TTS audio
  };

  // ── Gemini Live (Beta) real-time voice call state ───────
  // Shared across both call-shaped modules that offer it as an alternate
  // option: Red Pen / mgr-feedback, and Paper Trade / mgr-mock-call's
  // "Try Gemini Voice AI (Beta)" button (the turn-based ElevenLabs flow --
  // see _pt below -- is Paper Trade's default/primary call option; Gemini
  // Live is kept alongside it for comparison, not as the auto-start path).
  // `kind` tracks which one is active so the shared finish handler knows
  // which scoring path and screen to use. `_startAudioGeminiLiveVoice` /
  // `_finishAudioGeminiLiveVoice` further below are Paper Trade's handlers
  // for this shared state; `_startFeedbackLiveVoice` / `_finishFeedbackLiveVoice`
  // are Red Pen's.
  let _mgrLive = {
    kind: null,           // 'mock-call' | 'feedback'
    turns: [],            // [{ role: 'bot'|'trainee', text }]
    controller: null,     // { stop(), getRecording() } from GeminiLive.startCall()
    startTime: 0,
    finishing: false,
  };

  // ── Paper Trade Voice AI (Beta) — turn-based state ──────
  // Gemini Live's continuous duplex voice let the model drift off-script
  // (skipping/paraphrasing the opening line too far, or breaking character
  // to "answer for" the manager instead of just asking its next question --
  // reported by users as "not reading the entire first question" and
  // "acting like the manager"). Since Paper Trade's questions are a FIXED,
  // pre-authored list (see _parsePaperTradeQuestions), there's no need for
  // a live model in the loop at all: this plays each question with TTS one
  // at a time, exactly as authored, then waits for the manager to click
  // "Done Responding" before moving on -- the same one-question-at-a-time,
  // manual-advance shape as the trainee's turn-based mock call flow.
  let _pt = {
    questions: [],     // ordered list: [opening, beat1..beat5]
    background: '',
    turnIndex: 0,
    maxTurns: 0,
    history: [],       // [{ customer: string, manager: string }]
    blobPromise: null,
    turnTimerId: null,
    turnEnded: false,
    finishing: false,
  };
  let _ptAudioEl = null; // in-flight ElevenLabs <audio> element, for cancelling mid-play

  // ── TTS voice cache ──────────────────────────────────────
  let _ttsVoices = [];
  if (window.speechSynthesis) {
    const cache = () => { const v = speechSynthesis.getVoices(); if (v.length) _ttsVoices = v; };
    cache();
    speechSynthesis.onvoiceschanged = cache;
  }

  // ── Helpers ──────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $(screenId);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  function toast(msg, type = 'info') {
    const container = $('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slide-out 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ── Evaluation-parameters panel ──────────────────────────
  // Shows the manager exactly what they're being scored on, before/while
  // they take one of the 5 Communicate 360° assessments (Situation Room,
  // Transcript Autopsy, Paper Trade/Mock Call, Red Pen/Feedback, Mirror
  // Room/EQ). Reads from the shared window.MGR_EVAL_CRITERIA constant
  // (js/mgr-eval-criteria.js) so the manager, the admin scoring screen,
  // and the AI evaluator all reference the exact same parameters and
  // weights — no drift between what's shown and what's actually scored.
  // No-ops silently for modules without an entry (e.g. Listening & Tone,
  // Management Skills), which aren't part of this weighted rubric.
  // Scenario text is written as prose with any numbered call-outs (escalation
  // beats, pushback points, etc.) inline, e.g. "...address them: (1) "..."
  // (2) "..." (3) "...". Rendered as plain text/pre-line this reads as one
  // unbroken wall of text. This turns any run of 2+ "(N) ..." markers within
  // a paragraph into an actual numbered list, and leaves everything else as
  // normal paragraphs -- no change needed to the scenario content itself.
  function _formatScenarioHTML(text) {
    if (!text) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paragraphs = text.split(/\n{2,}/);
    return paragraphs.map(para => {
      const itemRe = /\((\d+)\)\s*/g;
      const matches = [...para.matchAll(itemRe)];
      if (matches.length >= 2) {
        const intro = para.slice(0, matches[0].index).trim();
        const items = matches.map((m, i) => {
          const start = m.index + m[0].length;
          const end   = (i + 1 < matches.length) ? matches[i + 1].index : para.length;
          return para.slice(start, end).trim();
        }).filter(Boolean);
        const introHtml = intro ? `<p style="margin:0 0 0.5rem">${esc(intro)}</p>` : '';
        const listHtml  = `<ol style="margin:0 0 0.5rem;padding-left:1.25rem">${items.map(it => `<li style="margin-bottom:0.4rem">${esc(it)}</li>`).join('')}</ol>`;
        return introHtml + listHtml;
      }
      return `<p style="margin:0 0 0.5rem">${esc(para)}</p>`;
    }).join('');
  }

  function _renderEvalCriteriaPanel(moduleKey, afterElId) {
    const anchor = $(afterElId);
    if (!anchor) return;
    const criteria = (typeof MGR_EVAL_CRITERIA !== 'undefined') ? MGR_EVAL_CRITERIA[moduleKey] : null;
    const panelId = afterElId + '-eval-panel';
    let panel = $(panelId);
    if (!criteria) { if (panel) panel.remove(); return; }

    // Managers should only see WHAT is being evaluated (the parameter names/
    // descriptions), never the marks/weights/max-marks behind them — those
    // are for admin scoring only.
    const rows = criteria.parameters.map(p =>
      `<div style="padding:0.4rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">
        <div style="font-weight:600;font-size:0.85rem">${p.label}</div>
        <div style="font-size:0.78rem;color:var(--text-muted, #666);margin-top:0.15rem">${p.desc}</div>
      </div>`
    ).join('');

    const html = `
      <details id="${panelId}" style="margin-top:0.75rem;border:1px solid rgba(124,58,237,0.25);border-radius:8px;background:rgba(124,58,237,0.04);padding:0.6rem 0.85rem">
        <summary style="cursor:pointer;font-weight:700;font-size:0.85rem;color:#5b21b6">📋 How this is evaluated — ${criteria.label}</summary>
        <div style="margin-top:0.5rem">${rows}</div>
      </details>`;

    if (panel) { panel.outerHTML = html; }
    else { anchor.insertAdjacentHTML('afterend', html); }
  }

  function fmtTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Written scoring ──────────────────────────────────────
  function scoreWrittenResponse(text, moduleKey) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const sentences = (text.match(/[.!?]+/g) || []).length || 1;
    const avgWordsPerSentence = words / sentences;
    const hasStructure = /(\n|firstly|secondly|1\.|2\.|•|-|in conclusion|to summarize|recommendation|action|plan)/i.test(text);
    const hasEmpathy   = /(understand|acknowledge|support|empathize|appreciate|concern|feel|impact|team|together)/i.test(text);
    const hasSpecifics = /(\d+|specific|concrete|measurable|timeline|date|week|month|step|process|metric)/i.test(text);

    const contentScore = Math.min(5, Math.max(1,
      (words >= 200 ? 4 : words >= 150 ? 3 : words >= 100 ? 2 : 1) + (hasSpecifics ? 1 : 0)));
    const clarityScore = Math.min(5, Math.max(1,
      (avgWordsPerSentence <= 20 ? 4 : avgWordsPerSentence <= 30 ? 3 : 2) + (hasStructure ? 1 : 0)));
    const empathyScore = Math.min(5, hasEmpathy ? 4 : 2);
    const actionScore  = Math.min(5, hasSpecifics && hasStructure ? 4 : hasSpecifics || hasStructure ? 3 : 2);
    const criticalThinkingScore = Math.min(5, words >= 200 && hasStructure && hasSpecifics ? 4 : 3);
    const overall = parseFloat(((contentScore + clarityScore + empathyScore + actionScore + criticalThinkingScore) / 25 * 100).toFixed(1));

    return { contentScore, clarityScore, empathyScore, actionScore, criticalThinkingScore, overall, wordCount: words, _method: 'mgr-written', _module: moduleKey };
  }

  // ── Auth ─────────────────────────────────────────────────
  async function login() {
    const name  = $('mgr-auth-name').value.trim();
    const errEl = $('mgr-auth-error');

    if (!name) {
      errEl.textContent = 'Please enter your name.';
      errEl.classList.remove('hidden'); return;
    }
    errEl.classList.add('hidden');

    // Employee ID is no longer collected — derive a stable internal key
    // from the manager's name instead (used only to build the synthetic
    // sign-in email/password pair; never shown to the person). Two
    // managers sharing an exact name will share one account, same
    // trade-off as on the trainee side.
    const empId = name.toLowerCase().replace(/\s+/g, '-');
    const password = empId.toLowerCase() + '2024';
    const btn = $('btn-mgr-start');
    btn.disabled = true; btn.textContent = 'Signing in...';

    try {
      let user;
      try { user = await Auth.signIn(empId, password); }
      catch (signInErr) {
        user = await Auth.signUp(empId, name, password);
      }
      if (!user) throw new Error('Sign-in failed.');
      _showLoggedInUI();
    } catch (e) {
      errEl.textContent = 'Sign-in failed: ' + (e.message || 'Unknown error');
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Enter Manager Portal →';
    }
  }

  function _showLoggedInUI() {
    const nameEl = $('mgr-header-name');
    if (nameEl) nameEl.textContent = Auth.getName();
    $('mgr-app-header').classList.remove('hidden');
    showScreen('mgr-screen-modules');
  }

  async function logout() {
    try { await Auth.signOut(); } catch (e) { /* ignore */ }
    $('mgr-app-header').classList.add('hidden');
    $('mgr-auth-name').value = '';
    showScreen('mgr-screen-welcome');
  }

  // ── Module start ─────────────────────────────────────────
  async function startModule(moduleKey) {
    const meta = MODULE_META[moduleKey];
    if (!meta) return;

    _currentModule   = moduleKey;
    _recordingBlob   = null;
    _transcript      = '';
    _mcqAnswers      = new Array(LISTENING_QUESTIONS.length).fill(null);

    if (meta.type === 'mcq') {
      _currentScenario = { id: 'lt1', title: 'Listening & Tone MCQ', scenario: LISTENING_TONE_SCENARIO };
      _launchMCQ();
      return;
    }

    if (meta.type === 'feedback-ai') {
      _launchFeedbackAI();
      return;
    }

    if (meta.type === 'situation-room') {
      _launchSituationRoom();
      return;
    }

    // Try loading from DB topics (admin-managed), fallback to hardcoded
    try {
      const dbTopics = await DB.getByIndex('topics', 'module', moduleKey);
      const enabled  = dbTopics.filter(t => t.enabled !== false);
      if (enabled.length > 0) {
        const picked = pickRandom(enabled);
        _currentScenario = { id: picked.id, title: picked.title, scenario: picked.scenario || picked.description };
      } else {
        throw new Error('no enabled DB topics');
      }
    } catch (e) {
      // Fallback to hardcoded
      const pool = SCENARIOS[moduleKey];
      if (!pool || !pool.length) { toast('No scenarios available for this module.', 'error'); return; }
      _currentScenario = { ...pickRandom(pool), _hardcoded: true };
    }

    if (meta.type === 'audio')        _launchAudio();
    else if (meta.type === 'written') _launchWritten();
  }

  // ── Audio flow (non-feedback) ────────────────────────────
  function _launchAudio() {
    const meta = MODULE_META[_currentModule];
    $('mgr-audio-module-title').textContent = `${meta.icon} ${meta.label}`;
    $('mgr-audio-scenario-label').textContent = 'Read the scenario carefully';
    $('mgr-audio-topic-title').textContent  = _currentScenario.title;
    // Don't show the customer's exact opening line / escalation quotes here --
    // the manager should walk in cold, the same way a real support rep would
    // pick up a call without a transcript of what the customer is about to
    // say. Show only the general background/situation; the full script stays
    // reserved for the AI (live-voice path) or is revealed at the moment the
    // manager actually starts recording (normal monologue path, further down).
    const _ptPrep = _parsePaperTradeQuestions(_currentScenario.scenario);
    $('mgr-audio-scenario-text').innerHTML = _formatScenarioHTML(
      _ptPrep.questions.length ? _ptPrep.background : _currentScenario.scenario
    );
    _renderEvalCriteriaPanel(_currentModule, 'mgr-audio-scenario-text');

    $('mgr-prep-phase').classList.remove('hidden');
    $('mgr-record-phase').classList.add('hidden');
    $('mgr-live-transcript').innerHTML = '<span class="placeholder">Your speech will appear here in real time...</span>';

    // Voice AI Customer (Beta) — turn-based TTS call, offered as an
    // alternative to the normal recording flow for Paper Trade only (it's
    // the module built as a customer call, so it's the natural fit — see
    // manager.html for the actual call screen this launches). Needs only
    // browser speech synthesis, not Gemini Live (see _pt state comment).
    const liveBtn = $('btn-mgr-audio-live-voice-start');
    if (liveBtn) {
      const showLiveBtn = _currentModule === 'mgr-mock-call' && !!window.speechSynthesis;
      liveBtn.classList.toggle('hidden', !showLiveBtn);
      liveBtn.onclick = () => _startAudioLiveVoice();
    }

    // Gemini Voice AI (Beta) — kept as an alternate option alongside the
    // turn-based ElevenLabs call above, for comparison now that Gemini has
    // the same fixed-script systemInstruction fix (asks the exact scenario
    // questions in order rather than improvising). Not the default/auto-start
    // path -- the prep countdown still falls through to the ElevenLabs call.
    const geminiLiveBtn = $('btn-mgr-audio-gemini-live-voice-start');
    if (geminiLiveBtn) {
      const showGeminiLiveBtn = _currentModule === 'mgr-mock-call'
        && typeof GeminiLive !== 'undefined' && GeminiLive.isAvailable();
      geminiLiveBtn.classList.toggle('hidden', !showGeminiLiveBtn);
      geminiLiveBtn.onclick = () => _startAudioGeminiLiveVoice();
    }

    showScreen('mgr-screen-audio');
    _startPrepTimer();
  }

  function _startPrepTimer() {
    let remaining = 120; // 2 minutes to prepare (Paper Trade -- the only module using this timer)
    $('mgr-prep-count').textContent = remaining;
    _clearPrepTimer();
    _prepTimer = setInterval(() => {
      remaining--;
      $('mgr-prep-count').textContent = remaining;
      // Paper Trade is now AI-call-only (the "Skip Prep & Start Now" button
      // into the old manual monologue recording was removed) -- so running
      // out the prep countdown auto-starts the same turn-based AI voice
      // call the button starts, instead of the old manual recording flow.
      if (remaining <= 0) { _clearPrepTimer(); _startAudioLiveVoice(); }
    }, 1000);
  }

  function _clearPrepTimer() {
    if (_prepTimer) { clearInterval(_prepTimer); _prepTimer = null; }
  }

  async function startRecording() {
    _clearPrepTimer();
    try { await Recorder.requestMic(); }
    catch (e) { toast('Microphone access denied. Please allow mic access and try again.', 'error'); return; }

    $('mgr-prep-phase').classList.add('hidden');
    $('mgr-record-phase').classList.remove('hidden');

    // Now that the manager has committed to the normal single-monologue
    // recording flow (no live interlocutor to reveal escalation points
    // progressively), reveal the full script -- including the customer's
    // exact opening line and escalation quotes -- so they have everything
    // needed to address in one go. Only mgr-mock-call (Paper Trade) uses
    // this recording flow at all, so this is safely scoped to it.
    if (_currentModule === 'mgr-mock-call') {
      $('mgr-audio-scenario-text').innerHTML = _formatScenarioHTML(_currentScenario.scenario);
      _renderEvalCriteriaPanel(_currentModule, 'mgr-audio-scenario-text');
    }

    Recorder.startWaveform($('mgr-waveform'));

    // ── FIX: use manual count-up timer + auto-stop at 5 min ──
    // Recorder.startTimer with countUp=true never fires onDone.
    // Use countdown internally but display elapsed time via onTick.
    _recStartTime = Date.now();
    const timerEl = $('mgr-rec-time');
    const MAX_REC = 300;
    if (timerEl) timerEl.textContent = '0:00';
    if (_audioManualTimer) clearInterval(_audioManualTimer);
    let elapsed = 0;
    _audioManualTimer = setInterval(() => {
      elapsed++;
      if (timerEl) timerEl.textContent = fmtTime(elapsed);
      if (elapsed >= MAX_REC) {
        clearInterval(_audioManualTimer);
        _audioManualTimer = null;
        stopRecording();
      }
    }, 1000);

    _transcript = '';
    try {
      SpeechEngine.startTranscription((partial) => {
        _transcript = partial;
        const box = $('mgr-live-transcript');
        if (box) box.textContent = partial || '';
      });
    } catch (e) { /* Not Chrome — continue */ }

    _recordingPromise = Recorder.start();
  }

  async function stopRecording() {
    if (_audioManualTimer) { clearInterval(_audioManualTimer); _audioManualTimer = null; }

    try { Recorder.stop(); } catch (e) { console.warn('Recorder stop:', e); }

    let blob = null;
    if (_recordingPromise) {
      try { blob = await _recordingPromise; } catch (e) { console.warn('Recording promise:', e); }
      _recordingPromise = null;
    }

    let finalTranscript = _transcript;
    try { SpeechEngine.stopTranscription(); } catch (e) { /* ignore */ }

    const durationSecs = Math.round((Date.now() - (_recStartTime || Date.now())) / 1000);
    _recordingBlob = blob;
    await _submitAudio(finalTranscript, durationSecs, blob);
  }

  async function _submitAudio(transcript, durationSecs, blob) {
    try {
      let aiScores;
      try {
        const analysis = SpeechEngine.analyze(transcript || '', Math.max(durationSecs, 1));
        aiScores = SpeechEngine.scoreSpeech(analysis, Math.max(durationSecs, 1));
      } catch(e) {
        console.warn('SpeechEngine scoring failed:', e.message);
        aiScores = { overall: null };
      }
      aiScores._method = 'mgr-js';
      aiScores._module = _currentModule;
      aiScores._scenarioId = _currentScenario.id;

      // Paper Trade ("mgr-mock-call") additionally gets a content-based
      // evaluation against MGR_EVAL_CRITERIA's 6 rapport/empathy/ownership/
      // resolution/composure/close parameters, when a usable transcript was
      // captured (Chrome speech-to-text) and the Claude proxy is reachable.
      // This becomes the reported score (overall/earnedMarks/maxMarks);
      // the SpeechEngine delivery metrics above are kept as extra fields
      // rather than discarded, in case the admin wants to see both.
      const wordCount = (transcript || '').trim().split(/\s+/).filter(Boolean).length;
      if (_currentModule === 'mgr-mock-call' && wordCount >= 25 &&
          typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
        try {
          const result = await ClaudeEvaluator.evaluatePaperTrade(transcript, _currentScenario.scenario || '');
          aiScores = {
            ...aiScores,
            ...result.scores,
            overall:     result.overall,
            earnedMarks: result.earnedMarks,
            maxMarks:    result.maxMarks,
            _reasons:    result.reasons,
            _method:     'mgr-mock-call-ai',
          };
        } catch (e) {
          console.warn('Paper Trade content eval failed, using speech-only score:', e.message);
        }
      }

      // Guarantee trainees row exists before FK-constrained session insert
      await Auth.ensureTraineeRecord();

      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       _currentModule,
        topicId:      (_currentScenario._hardcoded ? null : (_currentScenario.id || null)),
        topicTitle:   _currentScenario.title,
        transcript:   transcript || '',
        recordingBlob: blob || null,
        writtenText:  '',
        aiScores,
        timeTaken:    durationSecs,
        submittedAt:  new Date().toISOString(),
        status:       'ai-evaluated',
      });

      _showResult(aiScores, 'audio');
    } catch (e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('_submitAudio error:', e);
    }
  }

  // ── Paper Trade — Voice AI Customer, turn-based (Beta) ────
  // Originally built on Gemini Live's continuous duplex voice (one
  // persistent WebSocket, same architecture as the trainee side's Voice AI
  // (Beta) Mock Call flow in js/app.js). In practice the live model would
  // sometimes clip or paraphrase the opening line too heavily, or break
  // character mid-call and start answering on the manager's behalf instead
  // of just asking its next scripted question. Since every Paper Trade
  // question is a FIXED, pre-authored line (see _parsePaperTradeQuestions
  // below), there's no need for a live model in the loop: this instead
  // plays each question with plain browser TTS, one at a time, then waits
  // for the manager to click "Done Responding" before moving on -- the
  // same one-question-at-a-time, manual-advance shape as the trainee's
  // turn-based bot-driven mock call flow in js/app.js.

  // Pull the customer's opening line and numbered escalation beats out of
  // the scenario text (see build format in the mgr-mock-call SCENARIOS
  // entries above: "The client opens the call by saying: \"...\"" then
  // "Escalation beats ...: (1) \"...\" (2) \"...\" ... \n\nHandle this
  // call ..."). Previously the ENTIRE scenario blob -- including the
  // "Handle this call for 5-6 minutes: acknowledge the issue..." line,
  // which is a note to a human roleplay partner, never meant to be
  // spoken -- was handed to the AI as "context" with instructions to
  // freely invent its own follow-up questions. In practice the AI would
  // often drift off the actual escalation points the content was written
  // around, sometimes read fragments of the meta-instructions, or ask a
  // different number of questions than the scenario actually has -- which
  // is the "not working properly" behavior this fixes. Parsing the exact
  // question list out lets the AI be given a fixed, explicit script (the
  // real number of questions the scenario was authored with) instead of
  // an open-ended brief to improvise from.
  function _parsePaperTradeQuestions(scenarioText) {
    const text = scenarioText || '';
    const result = { background: text.trim(), questions: [] };

    const openMarker = 'The client opens the call by saying:';
    const openIdx = text.indexOf(openMarker);
    if (openIdx !== -1) result.background = text.slice(0, openIdx).trim();

    const openingMatch = text.match(/The client opens the call by saying:\s*\n*"([^"]+)"/);
    if (openingMatch) result.questions.push(openingMatch[1]);

    const beatsBlockMatch = text.match(/Escalation beats[^:]*:\s*([\s\S]*?)\n\nHandle this call/);
    if (beatsBlockMatch) {
      const beatRe = /\(\d+\)\s*"([^"]+)"/g;
      let m;
      while ((m = beatRe.exec(beatsBlockMatch[1]))) result.questions.push(m[1]);
    }
    return result;
  }
  function _ptMoodParams(turnIdx, maxTurns) {
    const progress = maxTurns <= 1 ? 0.5 : turnIdx / (maxTurns - 1);
    if (progress < 0.25) return { emoji: '😤', label: 'Frustrated', bubbleClass: 'mood-frustrated' };
    if (progress < 0.50) return { emoji: '😠', label: 'Escalating', bubbleClass: 'mood-irate' };
    if (progress < 0.75) return { emoji: '🔥', label: 'Demanding',  bubbleClass: 'mood-irate' };
    return                      { emoji: '😡', label: 'Furious',    bubbleClass: 'mood-frustrated' };
  }

  // ── ElevenLabs TTS for the customer's voice (human-sounding) ──
  // Same /tts proxy route + request shape as the trainee side's
  // speakAiCustomer() in js/app.js (proven working there already) -- sends
  // text to the Cloudflare Worker, gets audio/mpeg back, plays it via an
  // <audio> element. Falls back to the plain browser voice below if the
  // proxy isn't configured or the request fails, so a call never breaks
  // entirely over a TTS hiccup.
  async function _speakPtCustomer(text, onEnd) {
    const proxyUrl = (typeof CONFIG !== 'undefined' && CONFIG.CLAUDE_PROXY_URL) || '';
    if (!proxyUrl) { _speakPtCustomerBrowser(text, onEnd); return; }

    if (_ptAudioEl) { try { _ptAudioEl.pause(); } catch (e) {} _ptAudioEl = null; }

    try {
      const resp = await fetch(proxyUrl.replace(/\/?$/, '/tts'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', // higher quality, natural pacing
          voice_settings: {
            stability:         0.45,  // a little looser than a calm narrator -- these customers are frustrated/escalating
            similarity_boost:  0.75,
            style:             0.35,  // more expressive/emotional range for an escalating complaint call
            use_speaker_boost: true,
          },
        }),
      });

      if (!resp.ok) throw new Error(`ElevenLabs TTS error ${resp.status}`);

      const blob     = await resp.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio    = new Audio(audioUrl);
      _ptAudioEl     = audio;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(audioUrl);
        _ptAudioEl = null;
        onEnd();
      };

      // Safety timeout: ~400 ms per word + 6 s buffer, in case onended never fires
      const guard = setTimeout(finish, text.split(/\s+/).length * 400 + 6000);
      audio.onended = () => { clearTimeout(guard); finish(); };
      audio.onerror = () => { clearTimeout(guard); finish(); };

      await audio.play();
    } catch (e) {
      console.warn('ElevenLabs TTS failed, using browser voice:', e.message);
      _speakPtCustomerBrowser(text, onEnd);
    }
  }

  // Plain browser TTS fallback for the customer's voice -- reuses the same
  // voice picker/rate/pitch approach as _speakEmployee (Red Pen) further
  // below, just without a gender toggle (Paper Trade scenarios don't
  // specify one). Only used if ElevenLabs is unavailable or fails.
  function _speakPtCustomerBrowser(text, onEnd) {
    if (!window.speechSynthesis) { onEnd(); return; }
    window.speechSynthesis.cancel();

    const voices = (_ttsVoices.length ? _ttsVoices : speechSynthesis.getVoices());
    const voice = voices.find(v => /alex|daniel|david|ryan|andrew|brian|christopher|eric/i.test(v.name) && v.lang.startsWith('en'))
               || voices.find(v => v.lang.startsWith('en'))
               || null;

    const utt = new SpeechSynthesisUtterance(text);
    if (voice) utt.voice = voice;
    utt.rate   = 0.93;
    utt.pitch  = 0.94;
    utt.volume = 1.0;

    let done = false;
    const finish = () => { if (!done) { done = true; onEnd(); } };
    utt.onend   = finish;
    utt.onerror = finish;
    // Safety timeout (~450 ms per word + 5 s buffer) in case onend never fires
    setTimeout(finish, text.split(/\s+/).length * 450 + 5000);
    speechSynthesis.speak(utt);
  }

  function _startAudioLiveVoice() {
    _clearPrepTimer();
    const meta = MODULE_META[_currentModule];

    $('mgr-audio-live-module-title').textContent = `${meta.icon} ${meta.label} — Voice AI (Beta)`;
    $('mgr-audio-live-topic-title').textContent  = _currentScenario.title;

    // The customer's exact opening line and escalation quotes stay reserved
    // for the AI to speak live -- the manager should hear them turn by
    // turn, not read them in advance. Show only the general background on
    // screen. Falls back to treating the whole scenario as a single
    // question if parsing finds nothing (e.g. a future scenario that
    // doesn't match the authored format), so this never breaks entirely.
    const _ptParsed = _parsePaperTradeQuestions(_currentScenario.scenario);
    const questions = _ptParsed.questions.length ? _ptParsed.questions : [_currentScenario.scenario];
    $('mgr-audio-live-scenario-text').innerHTML = _formatScenarioHTML(
      _ptParsed.questions.length ? _ptParsed.background : _currentScenario.scenario
    );
    _renderEvalCriteriaPanel(_currentModule, 'mgr-audio-live-scenario-text');
    $('mgr-audio-live-thread').innerHTML = '';

    _pt = { questions, background: _ptParsed.background, turnIndex: 0, maxTurns: questions.length,
            history: [], blobPromise: null, turnTimerId: null, turnEnded: false, finishing: false };

    $('mgr-audio-live-turn-bar').style.display = 'none';
    $('mgr-audio-live-rec-area').style.display = 'none';
    $('btn-mgr-audio-live-end').style.display = 'none';
    $('btn-mgr-audio-live-end').disabled = false;
    $('btn-mgr-audio-live-end-early').style.display = '';
    $('btn-mgr-audio-live-end-early').disabled = false;
    const stateEl = $('mgr-audio-live-state');
    if (stateEl) stateEl.textContent = '🔌 Getting ready…';

    $('btn-mgr-audio-live-end').onclick = () => _finishAudioLiveVoice(false);
    $('btn-mgr-audio-live-end-early').onclick = () => _finishAudioLiveVoice(true);
    $('btn-mgr-audio-live-cancel').onclick = () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (_ptAudioEl) { try { _ptAudioEl.pause(); } catch (e) {} _ptAudioEl = null; }
      clearInterval(_pt.turnTimerId);
      if (SpeechEngine.isSupported()) { try { SpeechEngine.stopTranscription(); } catch (e) {} }
      try { Recorder.stop(); } catch (e) {}
      _launchAudio();
    };

    showScreen('mgr-screen-audio-live');

    Recorder.requestMic().then(() => {
      _pt.blobPromise = Recorder.start();
      Recorder.startWaveform($('mgr-audio-live-waveform'));
      _runPtCustomerTurn(0);
    }).catch((e) => {
      toast('Microphone access denied. Please allow mic access and try again.', 'error');
      _launchAudio();
    });
  }

  function _runPtCustomerTurn(idx) {
    _pt.turnIndex = idx;
    const isLast = idx === _pt.maxTurns - 1;
    const line = _pt.questions[idx];
    const mood = _ptMoodParams(idx, _pt.maxTurns);

    $('mgr-audio-live-turn-bar').style.display = '';
    const moodEl = $('mgr-audio-live-mood');
    if (moodEl) {
      moodEl.className = `mc-mood-bar ${mood.bubbleClass}`;
      moodEl.innerHTML = `<span>${mood.emoji}</span> Customer is <strong>${mood.label}</strong>`;
    }

    _pt.history.push({ customer: line, manager: '' });

    const bubble = document.createElement('div');
    bubble.className = `mc-bubble bot ${mood.bubbleClass}`;
    bubble.innerHTML = `<span class="mc-bubble-mood">${mood.emoji}</span>${line}`;
    $('mgr-audio-live-thread').appendChild(bubble);
    $('mgr-audio-live-thread').scrollTop = $('mgr-audio-live-thread').scrollHeight;

    $('mgr-audio-live-rec-area').style.display = 'none';
    const stateEl = $('mgr-audio-live-state');
    if (stateEl) stateEl.textContent = isLast
      ? `🔊 Customer is speaking… (Question ${idx + 1} of ${_pt.maxTurns} — Final)`
      : `🔊 Customer is speaking… (Question ${idx + 1} of ${_pt.maxTurns})`;

    _speakPtCustomer(line, () => {
      if (stateEl) stateEl.textContent = '🎙️ Listening — go ahead and respond';
      _startPtManagerTurn(isLast);
    });
  }

  function _startPtManagerTurn(isLast) {
    _pt.turnEnded = false;
    $('mgr-audio-live-rec-area').style.display = '';
    $('mgr-audio-live-live-transcript').textContent = 'Listening... speak your response.';
    const labelEl = $('mgr-audio-live-turn-label');
    if (labelEl) labelEl.textContent = isLast
      ? `🎤 Your turn — Question ${_pt.turnIndex + 1} of ${_pt.maxTurns} (Final)`
      : `🎤 Your turn — Question ${_pt.turnIndex + 1} of ${_pt.maxTurns}`;

    if (SpeechEngine.isSupported()) {
      SpeechEngine.startTranscription((text) => {
        const el = $('mgr-audio-live-live-transcript');
        if (el) el.textContent = text || 'Listening...';
      });
    }

    // 2-minute per-question countdown — same limit as the normal recording flow
    const TURN_LIMIT = 120;
    let remaining = TURN_LIMIT;
    const timeEl = $('mgr-audio-live-turn-time');
    if (timeEl) timeEl.textContent = fmtTime(remaining);
    clearInterval(_pt.turnTimerId);
    _pt.turnTimerId = setInterval(() => {
      remaining--;
      if (timeEl) timeEl.textContent = fmtTime(remaining);
      if (remaining <= 0) _endPtManagerTurn();
    }, 1000);

    $('btn-mgr-audio-live-done-turn').onclick = () => _endPtManagerTurn();
  }

  function _endPtManagerTurn() {
    if (_pt.turnEnded) return;
    _pt.turnEnded = true;
    clearInterval(_pt.turnTimerId);

    const partial = SpeechEngine.isSupported() ? SpeechEngine.stopTranscription() : '';
    if (_pt.history.length > 0) _pt.history[_pt.history.length - 1].manager = partial;

    $('mgr-audio-live-rec-area').style.display = 'none';
    const timeEl = $('mgr-audio-live-turn-time');
    if (timeEl) timeEl.textContent = '';

    const bubble = document.createElement('div');
    bubble.className = 'mc-bubble trainee';
    bubble.textContent = partial || '(no transcript captured)';
    $('mgr-audio-live-thread').appendChild(bubble);
    $('mgr-audio-live-thread').scrollTop = $('mgr-audio-live-thread').scrollHeight;

    if (_pt.turnIndex + 1 < _pt.maxTurns) {
      _runPtCustomerTurn(_pt.turnIndex + 1);
    } else {
      const stateEl = $('mgr-audio-live-state');
      if (stateEl) stateEl.textContent = '📴 Call ended — ready to submit';
      $('btn-mgr-audio-live-end').style.display = '';
      $('btn-mgr-audio-live-end-early').style.display = 'none';
    }
  }

  async function _finishAudioLiveVoice(isEarly) {
    if (_pt.finishing) return;
    if (_pt.history.length === 0) return;
    _pt.finishing = true;
    $('btn-mgr-audio-live-end').disabled = true;
    $('btn-mgr-audio-live-end-early').disabled = true;

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (_ptAudioEl) { try { _ptAudioEl.pause(); } catch (e) {} _ptAudioEl = null; }
    clearInterval(_pt.turnTimerId);

    // If a manager turn was in progress when they hit "End Call Early",
    // capture whatever was said so far before stopping.
    if (isEarly && !_pt.turnEnded) {
      _pt.turnEnded = true;
      const partial = SpeechEngine.isSupported() ? SpeechEngine.stopTranscription() : '';
      if (_pt.history.length > 0) _pt.history[_pt.history.length - 1].manager = partial;
    } else if (SpeechEngine.isSupported()) {
      try { SpeechEngine.stopTranscription(); } catch (e) {}
    }

    Recorder.stop();
    let recordingBlob = null;
    if (_pt.blobPromise) {
      try { recordingBlob = await _pt.blobPromise; } catch (e) { console.warn('Paper Trade call blob:', e); }
      _pt.blobPromise = null;
    }

    const durationSecs = _pt.history.length * 60;

    const fullTranscript = _pt.history.map(ex =>
      `Customer: ${ex.customer}\nYou: ${ex.manager || '(no response)'}`
    ).join('\n\n');
    const managerOnly = _pt.history.map(ex => ex.manager || '').join(' ').trim();
    const wordCount = managerOnly.split(/\s+/).filter(Boolean).length;

    let aiScores = { overall: null, _method: 'mgr-live-js', _module: _currentModule, _scenarioId: _currentScenario.id };
    if (wordCount >= 15 && typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
      try {
        const result = await ClaudeEvaluator.evaluatePaperTrade(fullTranscript, _currentScenario.scenario || '');
        aiScores = {
          ...result.scores,
          overall:     result.overall,
          earnedMarks: result.earnedMarks,
          maxMarks:    result.maxMarks,
          _reasons:    result.reasons,
          _method:     'mgr-mock-call-ai',
          _module:     _currentModule,
          _scenarioId: _currentScenario.id,
        };
      } catch (e) {
        console.warn('Paper Trade live-call content eval failed:', e.message);
      }
    }
    aiScores._voiceEngine = 'turn-based-tts-beta';
    aiScores._turns = _pt.history.length;

    try {
      await Auth.ensureTraineeRecord();
      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       _currentModule,
        topicId:      (_currentScenario._hardcoded ? null : (_currentScenario.id || null)),
        topicTitle:   _currentScenario.title,
        transcript:   fullTranscript,
        recordingBlob: recordingBlob || null,
        writtenText:  '',
        aiScores,
        timeTaken:    durationSecs,
        submittedAt:  new Date().toISOString(),
        status:       'ai-evaluated',
      });
      _showResult(aiScores, 'audio');
    } catch (e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('_finishAudioLiveVoice error:', e);
      _pt.finishing = false;
    }
  }

  // ── Paper Trade — Gemini Live real-time voice call (Beta, alternate) ─
  // Kept alongside the turn-based ElevenLabs flow above as an alternate
  // option to try again, now that Gemini's systemInstruction (below) gives
  // it the same fixed, exact question list instead of an open brief to
  // improvise from. Uses its own screen (mgr-screen-audio-gemini-live) and
  // its own element ids throughout so it never collides with the
  // ElevenLabs turn-based screen's ids.
  function _startAudioGeminiLiveVoice() {
    _clearPrepTimer();
    const meta = MODULE_META[_currentModule];

    $('mgr-audio-gemini-live-module-title').textContent = `${meta.icon} ${meta.label} — Gemini Voice AI (Beta)`;
    $('mgr-audio-gemini-live-topic-title').textContent  = _currentScenario.title;

    // The AI keeps the customer's exact opening line and escalation quotes
    // for itself (see systemInstruction below) -- the manager should hear
    // them live from the AI, not read them in advance. Show only the
    // general background/situation on screen.
    const _ptParsed = _parsePaperTradeQuestions(_currentScenario.scenario);
    const _ptQuestions = _ptParsed.questions;
    $('mgr-audio-gemini-live-scenario-text').innerHTML = _formatScenarioHTML(
      _ptQuestions.length ? _ptParsed.background : _currentScenario.scenario
    );
    _renderEvalCriteriaPanel(_currentModule, 'mgr-audio-gemini-live-scenario-text');
    $('mgr-audio-gemini-live-thread').innerHTML = '';
    $('btn-mgr-audio-gemini-live-end').disabled = false;

    _mgrLive = { kind: 'mock-call', turns: [], controller: null, startTime: Date.now(), finishing: false };

    const stateEl = $('mgr-audio-gemini-live-state');
    const STATE_LABELS = {
      connecting: '🔌 Connecting…',
      listening:  '🎙️ Listening — go ahead and speak',
      speaking:   '🔊 Customer is speaking…',
      error:      '⚠️ Connection problem — try Cancel and use the other call option',
      ended:      '📴 Call ended',
      'time-limit': '⏱️ 9-minute limit reached — wrapping up and submitting…',
    };

    // With a clean parsed list, give the AI a FIXED script -- the exact
    // number of questions this scenario was authored with, asked in
    // order -- instead of an open brief to improvise new questions from.
    // Falls back to the old freeform behavior only if parsing found
    // nothing (e.g. a future scenario that doesn't match the expected
    // format), so a live call never breaks entirely.
    // Reported failure mode (screenshots): the live model sometimes forgets
    // which side of the call it's on mid-conversation -- opening with
    // "Hello, I was hoping to get some assistance" / "How can I help you
    // today?" (the SUPPORT REP's lines), or saying "I understand you're
    // very upset about this loss" (sympathizing FROM the company TO the
    // customer, instead of being the angry customer). It has also been
    // seen switching languages mid-call. None of this is fixable by
    // rewording the questions -- it's the model losing track of its role --
    // so both branches now open AND close on an explicit, repeated role
    // lock, a banned-phrases list of exact lines a support rep (never a
    // customer) would say, and a hard English-only instruction. This can
    // reduce how often it happens but, being a live generative model
    // rather than a fixed script, can't guarantee it never recurs -- that
    // guarantee only exists on the ElevenLabs turn-based call, which has no
    // live model in the loop at all.
    const _roleLockHeader = `ABSOLUTE RULE, MORE IMPORTANT THAN ANYTHING ELSE IN THIS PROMPT: you are the CUSTOMER calling IN to the brokerage's support line. You are angry/frustrated and you called because something went wrong FOR YOU. The person you are speaking to is the SUPPORT MANAGER -- they work for the brokerage, they are helping YOU, not the other way around. You are never, under any circumstance, the support manager, an agent, or anyone who works for the brokerage.

NEVER SAY (these are the SUPPORT MANAGER's lines -- if you say any of these, you have broken character):
- "How can I help you today?" / "How can I assist you?" / "What can I do for you?"
- "I was hoping to get some assistance" as an opening line with no specific complaint attached
- "I understand you're upset/frustrated about this [loss/issue]" or any other line that treats the OTHER person's money, loss, or account as the one affected -- IT IS YOUR OWN MONEY, YOUR OWN LOSS, YOUR OWN ACCOUNT. You are never comforting or reassuring the other person; they are trying to resolve YOUR complaint.
- Any greeting that doesn't immediately state your own specific complaint.

LANGUAGE: speak ONLY in English for this entire call, no matter what language the manager speaks to you in, and no matter what language you might otherwise default to. Do not switch languages mid-call under any circumstances.`;

    const _roleLockFooter = `\n\nFINAL REMINDER before you speak: you are the CUSTOMER who called in with a specific complaint (see above) -- not the support rep, not an agent, never sympathetic toward "the customer's" loss as if it were someone else's. Speak only in English.`;

    const systemInstruction = _ptQuestions.length ? `${_roleLockHeader}

BACKGROUND (for your own understanding only — never read this out loud, it is not something you say to the manager): ${_ptParsed.background}

YOUR QUESTIONS, IN ORDER — ask these ${_ptQuestions.length} questions one at a time, in exactly this order. This is a fixed list, not a starting point to improvise from: do not skip any, do not reorder them, do not merge two together, and do not invent extra questions beyond this list.
${_ptQuestions.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

HOW TO RUN THIS CALL:
- The moment the call connects, speak QUESTION 1 immediately as your opening line — no greeting, no small talk, go straight into it. You may reword it slightly into natural spoken language, but it must keep the exact same specific complaint or point.
- After the manager answers, don't jump straight to reading the next question. First react to what they actually just said — a short, natural, spoken acknowledgment of a few words to one short sentence (for example: "I hear what you're saying, but..." / "Okay, fair enough — let me ask you this..." / "Right, well here's the thing..." / "Alright, so what about this..." / "I understand, but I still want to know..." — vary the phrasing each time, never repeat the same one twice) that shows you actually listened to their answer, THEN ask the next question from the list. You may lightly reword the question itself into natural spoken language, but keep its specific point intact.
- Repeat that pattern for every remaining question: brief natural acknowledgment of their last answer, then the next question in order.
- Ask all ${_ptQuestions.length} questions above, in order, one at a time, before the call ends. Do not stop early, and do not ask anything that isn't on this list.
- Speak naturally, the way a real person sounds on a phone call — short, conversational sentences, not a written essay or a script read verbatim.
- Once the manager has answered your final question, wrap up the call naturally within a line or two — you don't have to explicitly announce the call is ending.
- Never mention that you are an AI, a script, grading, evaluation criteria, or that this is a training exercise.${_roleLockFooter}` : `${_roleLockHeader}

TOPIC / SITUATION CONTEXT (use this as the subject matter for your questions): ${_currentScenario.scenario}

HOW TO RUN THIS CALL:
- You are a genuinely curious, slightly concerned customer trying to understand this topic properly — you are not filing a complaint or demanding compensation, you are asking the manager to explain things to you.
- Ask ONE conceptual question at a time, then stop and actually listen to the manager's full answer before asking anything else.
- Every question you ask must be a complete, natural spoken question of at least 10-15 words — never a bare one- or two-word follow-up like "why?" or "how so?". Phrase it the way a real customer would voice a genuine concern, in full sentences.
- Your very FIRST line, the moment the call connects, must go straight at the specific issue described in the topic/situation context above — name the actual problem (what happened, what you noticed, what went wrong) in your own spoken words as your opening question, exactly like a customer who called in specifically because of that issue. Do NOT open with small talk, a generic greeting, or a vague "I have some questions" — start directly on the first issue itself.
- For every question after the first, build it directly from what the manager just said: pick up on a specific term, number, or claim in their answer and ask them to go deeper on it, clarify it, or explain what it means for you specifically — never ask a generic or scripted question that ignores their actual answer.
- Speak naturally, the way a real person sounds on a phone call — short, conversational sentences, not a written essay or a script read verbatim.
- Open the call yourself with your first question as soon as the call connects — do not wait for the manager to speak first.
- Keep the call to roughly 5-6 minutes of back-and-forth questions and answers, then let it wind down naturally once you feel your questions have genuinely been answered — you don't have to explicitly announce the call is ending.
- Never mention that you are an AI, a script, grading, evaluation criteria, or that this is a training exercise.${_roleLockFooter}`;

    $('btn-mgr-audio-gemini-live-end').onclick = () => _finishAudioGeminiLiveVoice();
    $('btn-mgr-audio-gemini-live-cancel').onclick = () => {
      if (_mgrLive.controller) { _mgrLive.controller.stop(); _mgrLive.controller = null; }
      _launchAudio();
    };

    showScreen('mgr-screen-audio-gemini-live');

    _mgrLive.controller = GeminiLive.startCall({
      systemInstruction,
      onStateChange: (state) => {
        if (stateEl) stateEl.textContent = STATE_LABELS[state] || state;
        if (state === 'time-limit') {
          toast('⏱️ Reached the 9-minute call limit — submitting what was covered so far.', '');
          _finishAudioGeminiLiveVoice();
        }
      },
      onTurn: ({ role, text }) => {
        _mgrLive.turns.push({ role, text });
        const bubble = document.createElement('div');
        bubble.className = `mc-bubble ${role === 'bot' ? 'bot' : 'trainee'}`;
        bubble.textContent = text;
        $('mgr-audio-gemini-live-thread').appendChild(bubble);
        $('mgr-audio-gemini-live-thread').scrollTop = $('mgr-audio-gemini-live-thread').scrollHeight;
      },
      onError: (err) => {
        console.error('GeminiLive error (Paper Trade):', err);
        toast('⚠ Voice AI error: ' + (err.message || err) + ' — you can cancel and try the other call option instead.', 'error');
      },
    });
  }

  async function _finishAudioGeminiLiveVoice() {
    if (_mgrLive.finishing) return;
    if (!_mgrLive.controller && _mgrLive.turns.length === 0) return;
    _mgrLive.finishing = true;
    $('btn-mgr-audio-gemini-live-end').disabled = true;

    const controller = _mgrLive.controller;
    _mgrLive.controller = null;
    let recordingBlob = null;
    if (controller) {
      controller.stop();
      try { recordingBlob = await controller.getRecording(); } catch (e) { console.warn('Call recording could not be finalized:', e.message || e); }
    }
    const durationSecs = Math.max(1, Math.floor((Date.now() - _mgrLive.startTime) / 1000));

    const fullTranscript = _mgrLive.turns.map(t => `${t.role === 'bot' ? 'Customer' : 'You'}: ${t.text}`).join('\n\n');
    const managerOnly    = _mgrLive.turns.filter(t => t.role === 'trainee').map(t => t.text).join(' ').trim();
    const wordCount = managerOnly.split(/\s+/).filter(Boolean).length;

    let aiScores = { overall: null, _method: 'mgr-live-js', _module: _currentModule, _scenarioId: _currentScenario.id };
    if (wordCount >= 25 && typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
      try {
        const result = await ClaudeEvaluator.evaluatePaperTrade(fullTranscript, _currentScenario.scenario || '');
        aiScores = {
          ...result.scores,
          overall:     result.overall,
          earnedMarks: result.earnedMarks,
          maxMarks:    result.maxMarks,
          _reasons:    result.reasons,
          _method:     'mgr-mock-call-ai',
          _module:     _currentModule,
          _scenarioId: _currentScenario.id,
        };
      } catch (e) {
        console.warn('Paper Trade Gemini live-call content eval failed:', e.message);
      }
    }
    aiScores._voiceEngine = 'gemini-live-beta';

    try {
      await Auth.ensureTraineeRecord();
      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       _currentModule,
        topicId:      (_currentScenario._hardcoded ? null : (_currentScenario.id || null)),
        topicTitle:   _currentScenario.title,
        transcript:   fullTranscript,
        recordingBlob: recordingBlob || null,
        writtenText:  '',
        aiScores,
        timeTaken:    durationSecs,
        submittedAt:  new Date().toISOString(),
        status:       'ai-evaluated',
      });
      _showResult(aiScores, 'audio');
    } catch (e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('_finishAudioGeminiLiveVoice error:', e);
      _mgrLive.finishing = false;
    }
  }

  // ── Situation Room — Two-section assessment ─────────────

  function _launchSituationRoom() {
    const pool = SCENARIOS['mgr-situation-room'];
    _currentScenario = { ...pickRandom(pool), _hardcoded: true };
    _sr = { phase: 'A', sectionAText: '', sectionAScores: null };

    // Populate Section A UI
    $('sr-topic-title-a').textContent  = _currentScenario.title;
    $('sr-scenario-text-a').innerHTML = _formatScenarioHTML(_currentScenario.scenario);
    $('sr-a-prompt').textContent        = _currentScenario.sectionAPrompt || 'Write your exact verbal response';
    _renderEvalCriteriaPanel('mgr-situation-room', 'sr-scenario-text-a');

    // Reset fields
    const ta = $('sr-a-textarea');
    if (ta) ta.value = '';
    if ($('sr-a-word-count')) $('sr-a-word-count').textContent = '0';

    // Show Phase A, hide Phase B
    $('sr-phase-a').style.display = '';
    $('sr-phase-b').style.display = 'none';

    // Reset step indicators
    const sa = $('sr-step-a'), sb = $('sr-step-b');
    if (sa) sa.className = 'sr-step active';
    if (sb) sb.className = 'sr-step';

    showScreen('mgr-screen-situation-room');
  }

  async function _submitSRSectionA() {
    const text = $('sr-a-textarea').value.trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 30) {
      toast('Please write at least 30 words before submitting.', 'error');
      return;
    }

    const btn = $('btn-sr-submit-a');
    if (btn) { btn.disabled = true; btn.textContent = 'Evaluating…'; }

    _sr.sectionAText = text;

    const _srADefault = { openingToneEmpathy: 60, ownershipAccountability: 60, escalationControl: 60, regulatoryAccuracy: 60, whatNotToSay: '', strength: '', improvement: '' };
    try {
      if (typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
        _sr.sectionAScores = await ClaudeEvaluator.evaluateSituationRoomA(
          _currentScenario.scenario, text
        );
      } else {
        _sr.sectionAScores = _srADefault;
      }
    } catch (e) {
      console.warn('SR-A eval failed:', e.message);
      _sr.sectionAScores = _srADefault;
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Submit Section A → Proceed to Section B'; }
    _transitionToSRSectionB();
  }

  function _transitionToSRSectionB() {
    // Mark steps
    const sa = $('sr-step-a'), sb = $('sr-step-b');
    if (sa) sa.className = 'sr-step done';
    if (sb) sb.className = 'sr-step active';

    // Populate Section B
    if ($('sr-topic-title-b')) $('sr-topic-title-b').textContent  = _currentScenario.title;
    if ($('sr-wrong-response-text')) $('sr-wrong-response-text').textContent = _currentScenario.wrongResponse || '';

    // Reset Section B fields & word counts
    ['sr-b-errors', 'sr-b-impact', 'sr-b-rewrite'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    ['sr-b-errors-wc', 'sr-b-impact-wc', 'sr-b-rewrite-wc'].forEach(id => {
      const el = $(id); if (el) el.textContent = '0';
    });

    // Switch phases
    $('sr-phase-a').style.display = 'none';
    $('sr-phase-b').style.display = '';
    window.scrollTo(0, 0);
    toast('Section A complete! Now analyse the wrong response in Section B.', 'success');
  }

  async function _submitSRSectionB() {
    const errorsText = ($('sr-b-errors').value || '').trim();
    const impactText  = ($('sr-b-impact').value  || '').trim();
    const rewriteText = ($('sr-b-rewrite').value || '').trim();

    const minWords = (t) => t.split(/\s+/).filter(Boolean).length;
    if (minWords(errorsText) < 15 || minWords(impactText) < 15 || minWords(rewriteText) < 20) {
      toast('Please complete all three fields before submitting (min. 15/15/20 words).', 'error');
      return;
    }

    const btn = $('btn-sr-submit-b');
    if (btn) { btn.disabled = true; btn.textContent = 'Evaluating…'; }

    let sectionBScores = { errorIdCritique: 60, resolutionClarity: 60, keyMissed: '', rewriteFeedback: '' };
    try {
      if (typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
        sectionBScores = await ClaudeEvaluator.evaluateSituationRoomB(
          _currentScenario.scenario,
          _currentScenario.wrongResponse || '',
          errorsText, impactText, rewriteText
        );
      }
    } catch (e) {
      console.warn('SR-B eval failed:', e.message);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Submit Full Assessment ✓'; }

    // Combined weighted overall — flattens Section A + Section B's parameter
    // scores onto the single MGR_EVAL_CRITERIA['mgr-situation-room'] rubric
    // (6 parameters, 50 marks total) so admin.js's generic scoring UI and
    // the AI-score display both read one flat, weight-aware score object.
    const sa = _sr.sectionAScores || {};
    const sb = sectionBScores || {};
    const srCrit = (typeof MGR_EVAL_CRITERIA !== 'undefined') ? MGR_EVAL_CRITERIA['mgr-situation-room'] : null;
    const flatScores = {};
    let earnedMarks = 0, totalWeight = 0;
    if (srCrit) {
      srCrit.parameters.forEach(p => {
        const pct = sa[p.key] != null ? sa[p.key] : (sb[p.key] != null ? sb[p.key] : null);
        if (pct != null) {
          flatScores[p.key] = pct;
          earnedMarks += (pct / 100) * p.weight;
          totalWeight += p.weight;
        }
      });
    }
    const maxMarks = (srCrit && srCrit.maxMarks) || totalWeight;
    const overall  = totalWeight > 0 ? parseFloat(((earnedMarks / totalWeight) * 100).toFixed(1)) : 0;

    const aiScores = {
      ...flatScores,
      overall,
      earnedMarks: parseFloat(earnedMarks.toFixed(1)),
      maxMarks,
      _sectionAFeedback: { whatNotToSay: sa.whatNotToSay, strength: sa.strength, improvement: sa.improvement },
      _sectionBFeedback: { keyMissed: sb.keyMissed, rewriteFeedback: sb.rewriteFeedback },
      _method: 'claude-sr',
      _module: 'mgr-situation-room',
      _scenarioId: _currentScenario.id,
    };

    const writtenText = JSON.stringify({
      // Situation Room scenarios are hardcoded client-side (never persisted
      // to the DB topics table), so the admin portal has no independent way
      // to look up the scenario/wrongResponse text for a saved session --
      // it must be embedded here so admin.js can render Section A and
      // Section B as visibly distinct, scenario-grounded content instead of
      // two generic-looking text boxes.
      scenario: _currentScenario.scenario,
      sectionA: { prompt: _currentScenario.sectionAPrompt, response: _sr.sectionAText },
      sectionB: { wrongResponse: _currentScenario.wrongResponse, errors: errorsText, impact: impactText, rewrite: rewriteText },
    });

    try {
      // Guarantee trainees row exists before FK-constrained session insert
      await Auth.ensureTraineeRecord();

      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       'mgr-situation-room',
        topicId:      null,
        topicTitle:   _currentScenario.title,
        transcript:   '',
        recordingBlob: null,
        writtenText,
        aiScores,
        timeTaken:    0,
        submittedAt:  new Date().toISOString(),
        status:       'ai-evaluated',
      });
      _showResult(aiScores, 'situation-room');
    } catch (e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('_submitSRSectionB error:', e);
    }
  }

  // ── Feedback — Conversational AI ────────────────────────

  function _fbMoodParams(empTurnIdx, maxTurns) {
    const progress = maxTurns <= 1 ? 0.5 : Math.min(1, empTurnIdx / (maxTurns - 1));
    if (progress < 0.25) return { emoji: '😤', label: 'Defensive',  bubbleClass: 'mood-frustrated' };
    if (progress < 0.50) return { emoji: '🤔', label: 'Deflecting', bubbleClass: 'mood-irate' };
    if (progress < 0.75) return { emoji: '😐', label: 'Processing', bubbleClass: 'mood-neutral' };
    return                       { emoji: '🙂', label: 'Receptive',  bubbleClass: 'mood-calm' };
  }

  function _speakEmployee(text, gender, onEnd) {
    if (!window.speechSynthesis) { onEnd(); return; }
    window.speechSynthesis.cancel();

    const voices = (_ttsVoices.length ? _ttsVoices : speechSynthesis.getVoices());
    let voice = null;
    if (gender === 'female') {
      voice = voices.find(v => /samantha|karen|moira|zira|emma|jenny|aria|victoria/i.test(v.name) && v.lang.startsWith('en'))
            || voices.find(v => v.lang.startsWith('en') && /female/i.test(v.name));
    } else {
      voice = voices.find(v => /alex|daniel|david|ryan|andrew|brian|christopher|eric/i.test(v.name) && v.lang.startsWith('en'));
    }
    if (!voice) voice = voices.find(v => v.lang.startsWith('en')) || null;

    const utt = new SpeechSynthesisUtterance(text);
    if (voice) utt.voice = voice;
    utt.rate   = 0.93;
    utt.pitch  = gender === 'female' ? 1.15 : 0.94;
    utt.volume = 1.0;

    let done = false;
    const finish = () => { if (!done) { done = true; onEnd(); } };
    utt.onend   = finish;
    utt.onerror = finish;
    // Safety timeout (~450 ms per word + 5 s buffer)
    setTimeout(finish, text.split(/\s+/).length * 450 + 5000);
    speechSynthesis.speak(utt);
  }

  function _launchFeedbackAI() {
    const pool = SCENARIOS['mgr-feedback'];
    _currentScenario = pickRandom(pool);
    const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];

    // Reset state
    _fb = { empTurnCount: 0, maxTurns: 5, history: [], blobPromise: null,
            turnTimerId: null, turnEnded: false, finishing: false, ttsAudioEl: null };

    // Populate scenario panel
    $('mgr-fb-sc-title').textContent = _currentScenario.title;
    $('mgr-fb-sc-text').innerHTML  = _formatScenarioHTML(_currentScenario.scenario);
    _renderEvalCriteriaPanel('mgr-feedback', 'mgr-fb-sc-text');

    // Reset UI
    $('mgr-fb-chat-thread').innerHTML = '';
    $('mgr-fb-chat-thread').style.display = 'none';
    $('mgr-fb-turn-bar').style.display = 'none';
    $('mgr-fb-status').style.display = 'none';
    $('mgr-fb-rec-area').style.display = 'none';
    $('btn-mgr-fb-finish').style.display = 'none';
    $('btn-mgr-fb-end-early').style.display = 'none';
    $('mgr-fb-start-wrap').style.display = 'block';
    $('mgr-fb-emp-name').textContent = emp.name;

    // Collapsible scenario panel
    let scVisible = true;
    const scToggle = $('btn-mgr-fb-sc-toggle');
    const scBody   = $('mgr-fb-sc-body');
    if (scToggle) {
      scToggle.onclick = () => {
        scVisible = !scVisible;
        scBody.style.display = scVisible ? '' : 'none';
        scToggle.textContent = scVisible ? 'Hide ▲' : 'Show ▼';
      };
    }

    // Gemini Voice AI (Beta) — real-time speech-to-speech alternative to the
    // turn-based recorded conversation below. Red Pen is an adversarial
    // back-and-forth with a persona, which is exactly the shape Gemini
    // Live's duplex voice is built for.
    const liveBtn = $('btn-mgr-fb-live-voice-start');
    if (liveBtn) {
      const showLiveBtn = typeof GeminiLive !== 'undefined' && GeminiLive.isAvailable();
      liveBtn.classList.toggle('hidden', !showLiveBtn);
      liveBtn.onclick = () => _startFeedbackLiveVoice();
    }

    showScreen('mgr-screen-feedback');
  }

  // ── Red Pen — Gemini Live real-time voice call (Beta) ────
  // Same GeminiLive architecture as Paper Trade above. The employee's
  // `persona` field is already written as a full character brief (identity,
  // situation, defensiveness pattern, verbatim pushback lines) — built for
  // exactly this purpose — so it's used directly as the roleplay brief.
  function _startFeedbackLiveVoice() {
    const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];

    $('mgr-fb-live-emp-name').textContent = emp.name;
    $('mgr-fb-live-sc-title').textContent = _currentScenario.title;
    $('mgr-fb-live-sc-text').innerHTML  = _formatScenarioHTML(_currentScenario.scenario);
    _renderEvalCriteriaPanel('mgr-feedback', 'mgr-fb-live-sc-text');
    $('mgr-fb-live-thread').innerHTML = '';
    $('btn-mgr-fb-live-end').disabled = false;

    _mgrLive = { kind: 'feedback', turns: [], controller: null, startTime: Date.now(), finishing: false };

    const stateEl = $('mgr-fb-live-state');
    const STATE_LABELS = {
      connecting: '🔌 Connecting…',
      listening:  '🎙️ Listening — go ahead and speak',
      speaking:   `🔊 ${emp.name} is speaking…`,
      error:      '⚠️ Connection problem — try Cancel and use the normal recorded flow',
      ended:      '📴 Conversation ended',
      'time-limit': '⏱️ 9-minute limit reached — wrapping up and submitting…',
    };

    const systemInstruction = `You are roleplaying, BY VOICE, as ${emp.name}, an employee in a one-on-one feedback conversation with your manager.

${emp.persona}

HOW TO RUN THIS CONVERSATION:
- Speak naturally, the way a real person sounds face-to-face — short, conversational sentences, not a written essay.
- Open the conversation yourself with something like: "${emp.opening}" (adapted naturally to spoken language) as soon as it connects — do not wait for the manager to speak first.
- React specifically to what the manager actually says: use your default pushback lines (verbatim or adapted) when they judge, threaten, generalize, or argue the rule itself instead of the behaviour; soften and become more receptive when they use calm, specific, evidence-based feedback and propose a concrete plan.
- Keep the conversation to roughly 4-6 exchanges, then let it wind down naturally once the manager has proposed next steps you can react to (agree, partially agree, or ask a clarifying question) — you don't have to explicitly end the conversation.
- Stay in character as ${emp.name} throughout — never break character, never mention that you are an AI, a script, grading, evaluation criteria, or that this is a training exercise.`;

    $('btn-mgr-fb-live-end').onclick = () => _finishFeedbackLiveVoice();
    $('btn-mgr-fb-live-cancel').onclick = () => {
      if (_mgrLive.controller) { _mgrLive.controller.stop(); _mgrLive.controller = null; }
      _launchFeedbackAI();
    };

    showScreen('mgr-screen-feedback-live');

    _mgrLive.controller = GeminiLive.startCall({
      systemInstruction,
      onStateChange: (state) => {
        if (stateEl) stateEl.textContent = STATE_LABELS[state] || state;
        if (state === 'time-limit') {
          toast('⏱️ Reached the 9-minute call limit — submitting what was covered so far.', '');
          _finishFeedbackLiveVoice();
        }
      },
      onTurn: ({ role, text }) => {
        _mgrLive.turns.push({ role, text });
        const bubble = document.createElement('div');
        bubble.className = `mc-bubble ${role === 'bot' ? 'bot' : 'trainee'}`;
        bubble.textContent = text;
        $('mgr-fb-live-thread').appendChild(bubble);
        $('mgr-fb-live-thread').scrollTop = $('mgr-fb-live-thread').scrollHeight;
      },
      onError: (err) => {
        console.error('GeminiLive error (Red Pen):', err);
        toast('⚠ Voice AI error: ' + (err.message || err) + ' — you can cancel and use the normal recorded flow instead.', 'error');
      },
    });
  }

  async function _finishFeedbackLiveVoice() {
    if (_mgrLive.finishing) return;
    if (!_mgrLive.controller && _mgrLive.turns.length === 0) return;
    _mgrLive.finishing = true;
    $('btn-mgr-fb-live-end').disabled = true;

    const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];
    const controller = _mgrLive.controller;
    _mgrLive.controller = null;
    let recordingBlob = null;
    if (controller) {
      controller.stop();
      try { recordingBlob = await controller.getRecording(); } catch (e) { console.warn('Call recording could not be finalized:', e.message || e); }
    }
    const durationSecs = Math.max(1, Math.floor((Date.now() - _mgrLive.startTime) / 1000));

    const fullTranscript = _mgrLive.turns.map(t => `${t.role === 'bot' ? emp.name : 'You'}: ${t.text}`).join('\n\n');

    let aiScores = { overall: null, _method: 'mgr-feedback-live-js', _module: 'mgr-feedback' };
    if (fullTranscript && typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
      try {
        const result = await ClaudeEvaluator.evaluateManagerFeedback(
          fullTranscript, _currentScenario.scenario || _currentScenario.title || '',
          _currentScenario.goodLooksLike || [], _currentScenario.commonPitfalls || []
        );
        aiScores = {
          ...result.scores,
          overall:     result.overall,
          earnedMarks: result.earnedMarks,
          maxMarks:    result.maxMarks,
          _reasons:    result.reasons,
          _method:     'mgr-feedback-params',
        };
      } catch (e) {
        console.warn('Red Pen live-call eval failed:', e.message);
      }
    }
    aiScores._module     = 'mgr-feedback';
    aiScores._turns      = _mgrLive.turns.length;
    aiScores._scenarioId = _currentScenario.id;
    aiScores._voiceEngine = 'gemini-live-beta';

    try {
      await Auth.ensureTraineeRecord();
      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       'mgr-feedback',
        topicId:      (_currentScenario._hardcoded ? null : (_currentScenario.id || null)),
        topicTitle:   _currentScenario.title,
        transcript:   fullTranscript,
        recordingBlob: recordingBlob || null,
        writtenText:  '',
        aiScores,
        timeTaken:    durationSecs,
        submittedAt:  new Date().toISOString(),
        status:       'ai-evaluated',
      });
      _showResult(aiScores, 'feedback-ai');
    } catch (e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('_finishFeedbackLiveVoice error:', e);
      _mgrLive.finishing = false;
    }
  }

  async function _startFeedbackConversation() {
    const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];

    $('mgr-fb-start-wrap').style.display = 'none';

    // Start continuous recording
    try { await Recorder.requestMic(); }
    catch (e) { toast('Microphone access denied.', 'error'); $('mgr-fb-start-wrap').style.display = 'block'; return; }
    _fb.blobPromise = Recorder.start();
    Recorder.startWaveform($('mgr-fb-waveform'));

    // Show chat thread + turn bar
    $('mgr-fb-chat-thread').style.display = '';
    $('mgr-fb-turn-bar').style.display = '';
    $('btn-mgr-fb-end-early').style.display = '';

    // Employee opens the conversation
    _runEmployeeTurn(emp.opening, true /* firstTurn */);
  }

  function _runEmployeeTurn(empLine, isFirstTurn = false) {
    const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];

    if (!isFirstTurn) _fb.empTurnCount++;
    else              _fb.empTurnCount = 1;

    const isLast = _fb.empTurnCount >= _fb.maxTurns;

    // Update turn label
    const turnLabel = $('mgr-fb-turn-label');
    if (turnLabel) {
      turnLabel.textContent = isLast
        ? `Turn ${_fb.empTurnCount} of ${_fb.maxTurns} — Final Exchange 🏁`
        : `Turn ${_fb.empTurnCount} of ${_fb.maxTurns}`;
    }

    // Add to history
    _fb.history.push({ emp: empLine, mgr: '' });

    // Mood indicator
    const mood = _fbMoodParams(_fb.empTurnCount - 1, _fb.maxTurns);
    const moodEl = $('mgr-fb-mood');
    if (moodEl) {
      moodEl.className = `mc-mood-bar ${mood.bubbleClass}`;
      moodEl.innerHTML = `${mood.emoji} <strong>${emp.name}</strong> is <strong>${mood.label}</strong>`;
    }

    // Employee bubble
    const bubble = document.createElement('div');
    bubble.className = `mc-bubble bot ${mood.bubbleClass}`;
    bubble.innerHTML = `<span class="mc-bubble-mood">${mood.emoji}</span><strong>${emp.name}:</strong> ${empLine}`;
    const thread = $('mgr-fb-chat-thread');
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;

    // Speak, then start manager turn (or finish)
    $('mgr-fb-status').style.display = 'none';
    _speakEmployee(empLine, emp.gender, () => {
      if (isLast) {
        $('btn-mgr-fb-finish').style.display = '';
        $('btn-mgr-fb-end-early').style.display = 'none';
      } else {
        _startManagerFbTurn();
      }
    });
  }

  function _startManagerFbTurn() {
    _fb.turnEnded = false;
    $('mgr-fb-rec-area').style.display = '';
    $('mgr-fb-live-transcript').textContent = 'Listening... speak your response.';

    if (SpeechEngine.isSupported()) {
      SpeechEngine.startTranscription((text) => {
        const el = $('mgr-fb-live-transcript');
        if (el) el.textContent = text || 'Listening...';
      });
    }

    // 2-minute per-turn countdown
    const TURN_LIMIT = 120;
    let remaining = TURN_LIMIT;
    const timeEl = $('mgr-fb-turn-time');
    if (timeEl) timeEl.textContent = fmtTime(remaining);

    clearInterval(_fb.turnTimerId);
    _fb.turnTimerId = setInterval(() => {
      remaining--;
      if (timeEl) timeEl.textContent = fmtTime(remaining);
      if (remaining <= 0) _endManagerFbTurn();
    }, 1000);

    $('btn-mgr-fb-done-turn').onclick = () => _endManagerFbTurn();
  }

  async function _endManagerFbTurn() {
    if (_fb.turnEnded) return;
    _fb.turnEnded = true;
    clearInterval(_fb.turnTimerId);

    const partial = SpeechEngine.isSupported() ? SpeechEngine.stopTranscription() : '';

    // Store manager's response
    if (_fb.history.length > 0) {
      _fb.history[_fb.history.length - 1].mgr = partial;
    }

    // Hide recording area + timer
    $('mgr-fb-rec-area').style.display = 'none';
    const timeEl = $('mgr-fb-turn-time');
    if (timeEl) timeEl.textContent = '';

    // Manager bubble
    const bubble = document.createElement('div');
    bubble.className = 'mc-bubble trainee';
    bubble.textContent = partial || '(no transcript captured)';
    const thread = $('mgr-fb-chat-thread');
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;

    // Done? Or get next employee turn
    if (_fb.empTurnCount >= _fb.maxTurns) {
      $('btn-mgr-fb-finish').style.display = '';
      return;
    }

    // Show thinking status
    $('mgr-fb-status').style.display = '';
    const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];

    // Build message history for Claude
    const messages = [{ role: 'user', content: 'The manager has started the one-on-one feedback conversation with you.' }];
    for (const ex of _fb.history) {
      messages.push({ role: 'assistant', content: ex.emp });
      if (ex.mgr) messages.push({ role: 'user', content: ex.mgr });
    }

    let empLine;
    try {
      empLine = await ClaudeEvaluator.callAiEmployee(
        _currentScenario.scenario,
        emp.name,
        emp.persona,
        messages,
        _fb.empTurnCount + 1,
        _fb.maxTurns
      );
    } catch (e) {
      console.warn('AI employee call failed:', e.message);
      // Fallback lines if API unavailable
      const fallbacks = [
        "I hear what you're saying. I guess I didn't realize it was coming across that way.",
        "Okay, I can see your point. I'll try to be more mindful about this.",
        "Thanks for being direct with me. I do want to do better.",
        "I appreciate you taking the time to have this conversation.",
      ];
      empLine = fallbacks[Math.min(_fb.empTurnCount - 1, fallbacks.length - 1)];
    }

    _runEmployeeTurn(empLine);
  }

  async function _finishFeedbackConversation() {
    if (_fb.finishing) return;
    _fb.finishing = true;

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    clearInterval(_fb.turnTimerId);
    if (SpeechEngine.isSupported()) { try { SpeechEngine.stopTranscription(); } catch(e){} }

    Recorder.stop();
    let blob = null;
    if (_fb.blobPromise) {
      try { blob = await _fb.blobPromise; } catch(e) { console.warn('FB blob:', e); }
      _fb.blobPromise = null;
    }

    // Full conversation transcript
    const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];
    const fullTranscript = _fb.history.map(ex =>
      `${emp.name}: ${ex.emp}\nYou: ${ex.mgr || '(no response)'}`
    ).join('\n\n');

    const durationSecs = _fb.history.length * 60;

    let aiScores;
    try {
      if (typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable() && fullTranscript) {
        const result = await ClaudeEvaluator.evaluateManagerFeedback(
          fullTranscript, _currentScenario.scenario || _currentScenario.title || '',
          _currentScenario.goodLooksLike || [], _currentScenario.commonPitfalls || []
        );
        aiScores = {
          ...result.scores,
          overall:     result.overall,
          earnedMarks: result.earnedMarks,
          maxMarks:    result.maxMarks,
          _reasons:    result.reasons,
          _method:     'mgr-feedback-params',
        };
      } else {
        aiScores = { overall: null };
      }
    } catch(e) {
      console.warn('Claude feedback eval failed:', e.message);
      aiScores = { overall: null };
    }
    aiScores._method    = aiScores._method  || 'mgr-feedback-ai';
    aiScores._module    = 'mgr-feedback';
    aiScores._turns     = _fb.history.length;
    aiScores._scenarioId = _currentScenario.id;

    try {
      // Guarantee trainees row exists before FK-constrained session insert
      await Auth.ensureTraineeRecord();

      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       'mgr-feedback',
        topicId:      (_currentScenario._hardcoded ? null : (_currentScenario.id || null)),
        topicTitle:   _currentScenario.title,
        transcript:   fullTranscript,
        recordingBlob: blob || null,
        writtenText:  '',
        aiScores,
        timeTaken:    durationSecs,
        submittedAt:  new Date().toISOString(),
        status:       'ai-evaluated',
      });
      _showResult(aiScores, 'feedback-ai');
    } catch(e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('_finishFeedbackConversation error:', e);
      _fb.finishing = false;
    }
  }

  function _endFeedbackEarly() {
    if (_fb.finishing) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    clearInterval(_fb.turnTimerId);
    if (SpeechEngine.isSupported()) { try { SpeechEngine.stopTranscription(); } catch(e){} }
    // Capture any in-progress manager turn
    if ($('mgr-fb-rec-area').style.display !== 'none' && !_fb.turnEnded) {
      _fb.turnEnded = true;
      const partial = SpeechEngine.isSupported() ? SpeechEngine.stopTranscription() : '';
      if (_fb.history.length > 0) _fb.history[_fb.history.length - 1].mgr = partial;
    }
    _finishFeedbackConversation();
  }

  // ── Written flow ─────────────────────────────────────────
  function _launchWritten() {
    const meta = MODULE_META[_currentModule];
    $('mgr-written-module-title').textContent = `${meta.icon} ${meta.label}`;
    $('mgr-written-scenario-label').textContent = 'Read the task carefully, then write your response below';
    $('mgr-written-topic-title').textContent  = _currentScenario.title;
    $('mgr-written-scenario-text').innerHTML = _formatScenarioHTML(_currentScenario.scenario);
    _renderEvalCriteriaPanel(_currentModule, 'mgr-written-scenario-text');

    const minWords = meta.minWords || 150;
    $('mgr-written-min-hint').textContent = `Minimum ${minWords} words`;

    const ta = $('mgr-written-textarea');
    ta.value = '';
    $('mgr-written-word-count').textContent = '0';
    showScreen('mgr-screen-written');
  }

  async function submitWritten() {
    const text = $('mgr-written-textarea').value.trim();
    const meta = MODULE_META[_currentModule];
    const minWords = meta.minWords || 150;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < Math.floor(minWords * 0.5)) {
      toast(`Please write at least ${Math.floor(minWords * 0.5)} words before submitting.`, 'error');
      return;
    }
    const btn = $('btn-mgr-submit-written');
    if (btn) { btn.disabled = true; btn.textContent = 'Evaluating...'; }

    let aiScores;
    try {
      if (typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
        const result = await ClaudeEvaluator.evaluateManagerAssessment(
          _currentModule, text, _currentScenario.scenario || ''
        );
        aiScores = {
          ...result.scores,
          overall:     result.overall,
          earnedMarks: result.earnedMarks,
          maxMarks:    result.maxMarks,
          _reasons:    result.reasons,
          _method:     'claude-mgr-strict',
          _module:     _currentModule,
          wordCount:   wordCount,
        };
      } else {
        aiScores = scoreWrittenResponse(text, _currentModule);
      }
    } catch(e) {
      console.warn('Claude eval failed, using local:', e.message);
      aiScores = scoreWrittenResponse(text, _currentModule);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Response ✓'; }
    }

    try {
      aiScores._scenarioId = _currentScenario.id;
      // Guarantee trainees row exists before FK-constrained session insert
      await Auth.ensureTraineeRecord();

      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       _currentModule,
        topicId:      (_currentScenario._hardcoded ? null : (_currentScenario.id || null)),
        topicTitle:   _currentScenario.title,
        transcript:   '',
        recordingBlob: null,
        writtenText:  text,
        aiScores,
        timeTaken:    0,
        submittedAt:  new Date().toISOString(),
        status:       'ai-evaluated',
      });
      _showResult(aiScores, 'written');
    } catch (e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('submitWritten error:', e);
    }
  }

  // ── MCQ flow ─────────────────────────────────────────────
  function _launchMCQ() {
    $('mgr-mcq-scenario-text').textContent = LISTENING_TONE_SCENARIO;
    _renderMCQ();
    showScreen('mgr-screen-mcq');
  }

  function _renderMCQ() {
    const container = $('mgr-mcq-questions');
    container.innerHTML = LISTENING_QUESTIONS.map((q, qi) => `
      <div class="mgr-question-card">
        <div class="q-num">Question ${qi + 1} of ${LISTENING_QUESTIONS.length}</div>
        <div class="q-text">${q.q}</div>
        ${q.options.map((opt, oi) => `
          <label class="mgr-option" id="mgr-opt-${qi}-${oi}">
            <input type="radio" name="mgr-q-${qi}" value="${oi}"
              onchange="MgrApp.selectMCQOption(${qi}, ${oi})" />
            ${opt}
          </label>
        `).join('')}
      </div>
    `).join('');
  }

  function selectMCQOption(questionIndex, optionIndex) {
    _mcqAnswers[questionIndex] = optionIndex;
    LISTENING_QUESTIONS[questionIndex].options.forEach((_, oi) => {
      const el = document.getElementById(`mgr-opt-${questionIndex}-${oi}`);
      if (el) el.classList.toggle('selected', oi === optionIndex);
    });
  }

  async function submitMCQ() {
    const unanswered = _mcqAnswers.filter(a => a === null).length;
    if (unanswered > 0) { toast(`Please answer all questions. ${unanswered} remaining.`, 'error'); return; }

    const correctCount = _mcqAnswers.filter((ans, qi) => ans === LISTENING_QUESTIONS[qi].correct).length;
    const scorePercent = parseFloat(((correctCount / LISTENING_QUESTIONS.length) * 100).toFixed(1));
    const aiScores = { overall: scorePercent, answers: [..._mcqAnswers], correct: correctCount, total: LISTENING_QUESTIONS.length, _method: 'mgr-mcq', _module: _currentModule };

    aiScores._scenarioId = _currentScenario.id;
    try {
      // Guarantee trainees row exists before FK-constrained session insert
      await Auth.ensureTraineeRecord();

      await DB.put('sessions', {
        traineeId: Auth.getId(), traineeName: Auth.getName(), traineeEmail: Auth.getEmail(),
        module: _currentModule,
        topicId: (_currentScenario._hardcoded ? null : (_currentScenario.id || null)),
        topicTitle: _currentScenario.title,
        transcript: '', recordingBlob: null, writtenText: '', aiScores,
        timeTaken: 0, submittedAt: new Date().toISOString(), status: 'ai-evaluated',
      });
      _showResult(aiScores, 'mcq');
    } catch (e) {
      toast('Error saving session: ' + e.message, 'error');
      console.error('submitMCQ error:', e);
    }
  }

  // ── Result screen ─────────────────────────────────────────
  // Renders a score-grid HTML fragment straight from MGR_EVAL_CRITERIA's
  // parameter list for a module (percentage-of-weight values), or returns
  // null if that module has no entry in the shared rubric — callers fall
  // back to their own hardcoded grid in that case (e.g. mgr-management-skills,
  // or when Claude was unavailable and a local heuristic scorer ran instead).
  function _critGridHTML(moduleKey, aiScores) {
    const crit = (typeof MGR_EVAL_CRITERIA !== 'undefined') ? MGR_EVAL_CRITERIA[moduleKey] : null;
    if (!crit) return null;
    return crit.parameters.map(p => {
      const v = aiScores[p.key];
      return `<div class="mgr-score-item"><div class="label">${p.label}</div><div class="val">${v != null ? v + '%' : '—'}</div></div>`;
    }).join('');
  }

  function _showResult(aiScores, type) {
    const meta = MODULE_META[_currentModule];

    // Managers only ever see the generic "admin will review" notice —
    // AI scores/feedback are for the admin dashboard, never shown here.
    // Always reset this panel so a previous assessment's feedback can't
    // linger visible into an unrelated later submission.
    const _srFeedbackEl = $('mgr-sr-ai-feedback');
    if (_srFeedbackEl) { _srFeedbackEl.innerHTML = ''; _srFeedbackEl.classList.add('hidden'); }

    if (type === 'mcq') {
      $('mgr-result-subtitle').textContent = `Listening & Tone — ${aiScores.correct}/${aiScores.total} correct`;
      $('mgr-result-score').textContent = `${aiScores.overall}%`;
      $('mgr-score-grid').innerHTML = `
        <div class="mgr-score-item"><div class="label">Correct Answers</div><div class="val">${aiScores.correct} / ${aiScores.total}</div></div>
        <div class="mgr-score-item"><div class="label">Score</div><div class="val">${aiScores.overall}%</div></div>`;
    } else if (type === 'written') {
      $('mgr-result-subtitle').textContent = `${meta.label} — response evaluated`;
      $('mgr-result-score').textContent = `${aiScores.overall}%`;
      const grid = _critGridHTML(_currentModule, aiScores);
      if (grid) {
        $('mgr-score-grid').innerHTML = grid + `<div class="mgr-score-item"><div class="label">Word Count</div><div class="val">${aiScores.wordCount ?? '—'}</div></div>`;
      } else {
        // mgr-management-skills (not in the doc's 5 modules) — old rubrics
        const isClaude = aiScores._method === 'claude-mgr-strict';
        $('mgr-score-grid').innerHTML = isClaude ? `
          <div class="mgr-score-item"><div class="label">Leadership Maturity</div><div class="val">${aiScores.leadershipMaturity}/5</div></div>
          <div class="mgr-score-item"><div class="label">Empathy & People</div><div class="val">${aiScores.empathyAndPeople}/5</div></div>
          <div class="mgr-score-item"><div class="label">Specificity</div><div class="val">${aiScores.specificity}/5</div></div>
          <div class="mgr-score-item"><div class="label">Communication Quality</div><div class="val">${aiScores.communicationQuality}/5</div></div>
          <div class="mgr-score-item"><div class="label">Accountability</div><div class="val">${aiScores.accountability}/5</div></div>
          <div class="mgr-score-item"><div class="label">Word Count</div><div class="val">${aiScores.wordCount}</div></div>` : `
          <div class="mgr-score-item"><div class="label">Content Quality</div><div class="val">${aiScores.contentScore}/5</div></div>
          <div class="mgr-score-item"><div class="label">Communication Clarity</div><div class="val">${aiScores.clarityScore}/5</div></div>
          <div class="mgr-score-item"><div class="label">Empathy &amp; Insight</div><div class="val">${aiScores.empathyScore}/5</div></div>
          <div class="mgr-score-item"><div class="label">Action Orientation</div><div class="val">${aiScores.actionScore}/5</div></div>
          <div class="mgr-score-item"><div class="label">Critical Thinking</div><div class="val">${aiScores.criticalThinkingScore}/5</div></div>
          <div class="mgr-score-item"><div class="label">Word Count</div><div class="val">${aiScores.wordCount}</div></div>`;
      }
    } else if (type === 'feedback-ai') {
      const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];
      // aiScores._turns is set on both the turn-based recorded flow
      // (_fb.history.length) and the Gemini Live voice flow (_mgrLive.turns.length)
      // so this works regardless of which one produced the result.
      const turnCount = aiScores._turns != null ? aiScores._turns : _fb.history.length;
      $('mgr-result-subtitle').textContent = `Feedback Conversation with ${emp.name} — ${turnCount} exchange(s)`;
      $('mgr-result-score').textContent = aiScores.overall != null ? `${aiScores.overall}%` : '—';
      const grid = _critGridHTML('mgr-feedback', aiScores);
      $('mgr-score-grid').innerHTML = grid || `<div class="mgr-score-item"><div class="label">Exchanges</div><div class="val">${turnCount} turns</div></div>`;
    } else if (type === 'situation-room') {
      $('mgr-result-subtitle').textContent = `Situation Room — ${_currentScenario ? _currentScenario.title : 'Assessment complete'}`;
      $('mgr-result-score').textContent = `${aiScores.overall}%`;
      $('mgr-score-grid').innerHTML = _critGridHTML('mgr-situation-room', aiScores) || '';
      // Note: the detailed AI feedback (What Not to Say / Strength /
      // Priority Improvement / Missed Error / Rewrite Feedback) lives in
      // aiScores._sectionAFeedback/_sectionBFeedback for the admin
      // dashboard, but is intentionally never rendered here — managers only
      // ever see the generic "admin will review" notice below
      // (mgr-sr-ai-feedback is reset to empty/hidden at the top of this
      // function).
    } else {
      // audio (Paper Trade / mgr-mock-call)
      $('mgr-result-subtitle').textContent = `${meta.label} — evaluated`;
      $('mgr-result-score').textContent = aiScores.overall != null ? `${aiScores.overall}%` : '—';
      const grid = _critGridHTML('mgr-mock-call', aiScores);
      if (grid) {
        $('mgr-score-grid').innerHTML = grid;
      } else {
        // Claude content-eval unavailable — fall back to raw speech-delivery
        // heuristics from SpeechEngine (fluency/vocabulary/etc., 1-5 scale).
        const rows = [
          ['Fluency',       aiScores.fluency],
          ['Vocabulary',    aiScores.vocabulary],
          ['Confidence',    aiScores.confidence],
          ['Clarity',       aiScores.clarity],
          ['Time Mgmt',     aiScores.timeManagement],
        ].filter(([, v]) => v !== undefined && v !== null);
        $('mgr-score-grid').innerHTML = rows.map(([label, val]) =>
          `<div class="mgr-score-item"><div class="label">${label}</div><div class="val">${val}/5</div></div>`
        ).join('');
      }
    }

    showScreen('mgr-screen-result');
  }

  // ── Back navigation ──────────────────────────────────────
  function backToModules() {
    _clearPrepTimer();
    if (_audioManualTimer) { clearInterval(_audioManualTimer); _audioManualTimer = null; }
    // Cancel feedback AI if running
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    clearInterval(_fb.turnTimerId);
    try { SpeechEngine.stopTranscription(); } catch(e){}
    try { Recorder.stop(); } catch (e) {}
    try { Recorder.stopTimer(); } catch (e) {}
    // Cancel a Gemini Live voice call in progress, if any
    if (_mgrLive.controller) { try { _mgrLive.controller.stop(); } catch (e) {} _mgrLive.controller = null; }
    _recordingPromise = null;
    _fb.blobPromise   = null;
    showScreen('mgr-screen-modules');
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    _bindEvents();
    try { await DB.init(); } catch (e) { console.warn('DB.init error:', e); }
    try {
      const user = await Auth.init();
      if (user && Auth.isLoggedIn()) _showLoggedInUI();
      else showScreen('mgr-screen-welcome');
    } catch (e) {
      showScreen('mgr-screen-welcome');
    }
  }

  function _bindEvents() {
    // Auth
    const btnStart = $('btn-mgr-start');
    if (btnStart) btnStart.addEventListener('click', login);
    [$('mgr-auth-name')].forEach(inp => {
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    });

    // Logout
    const btnLogout = $('btn-mgr-logout');
    if (btnLogout) btnLogout.addEventListener('click', logout);

    // Module cards
    document.querySelectorAll('.mgr-module-card[data-module]').forEach(card => {
      card.addEventListener('click', () => startModule(card.dataset.module));
    });

    // Situation Room screen
    const btnSRBack = $('btn-mgr-sr-back');
    if (btnSRBack) btnSRBack.addEventListener('click', backToModules);
    const btnSRSubmitA = $('btn-sr-submit-a');
    if (btnSRSubmitA) btnSRSubmitA.addEventListener('click', _submitSRSectionA);
    const btnSRSubmitB = $('btn-sr-submit-b');
    if (btnSRSubmitB) btnSRSubmitB.addEventListener('click', _submitSRSectionB);

    // SR word counts
    const srATa = $('sr-a-textarea');
    if (srATa) srATa.addEventListener('input', () => {
      const w = srATa.value.trim().split(/\s+/).filter(Boolean).length;
      if ($('sr-a-word-count')) $('sr-a-word-count').textContent = w;
    });
    [['sr-b-errors','sr-b-errors-wc'],['sr-b-impact','sr-b-impact-wc'],['sr-b-rewrite','sr-b-rewrite-wc']]
      .forEach(([taId, wcId]) => {
        const ta = $(taId);
        if (ta) ta.addEventListener('input', () => {
          const w = ta.value.trim().split(/\s+/).filter(Boolean).length;
          const wc = $(wcId); if (wc) wc.textContent = w;
        });
      });

    // Audio screen (non-feedback)
    // Paper Trade's "Skip Prep & Start Now" button (into the old manual
    // monologue recording flow) was removed -- the AI voice call button and
    // the prep countdown's own auto-start (see _startPrepTimer) are now the
    // only two ways into Paper Trade's assessment. mgr-record-phase /
    // startRecording() / stopRecording() are kept in place below in case a
    // future module needs a plain recording flow again, but nothing wires
    // into them for Paper Trade anymore.
    const btnStop = $('btn-mgr-stop-record');
    if (btnStop) btnStop.addEventListener('click', stopRecording);
    const btnAudioBack = $('btn-mgr-audio-back');
    if (btnAudioBack) btnAudioBack.addEventListener('click', backToModules);

    // Feedback screen
    const btnFbStart = $('btn-mgr-fb-start');
    if (btnFbStart) btnFbStart.addEventListener('click', _startFeedbackConversation);
    const btnFbFinish = $('btn-mgr-fb-finish');
    if (btnFbFinish) btnFbFinish.addEventListener('click', _finishFeedbackConversation);
    const btnFbEndEarly = $('btn-mgr-fb-end-early');
    if (btnFbEndEarly) btnFbEndEarly.addEventListener('click', _endFeedbackEarly);
    const btnFbBack = $('btn-mgr-fb-back');
    if (btnFbBack) btnFbBack.addEventListener('click', backToModules);

    // Written screen
    const btnSubmitWritten = $('btn-mgr-submit-written');
    if (btnSubmitWritten) btnSubmitWritten.addEventListener('click', submitWritten);
    const btnWrittenBack = $('btn-mgr-written-back');
    if (btnWrittenBack) btnWrittenBack.addEventListener('click', backToModules);
    const writtenTA = $('mgr-written-textarea');
    if (writtenTA) {
      writtenTA.addEventListener('input', () => {
        const words = writtenTA.value.trim().split(/\s+/).filter(Boolean).length;
        $('mgr-written-word-count').textContent = words;
      });
    }

    // MCQ screen
    const btnSubmitMCQ = $('btn-mgr-submit-mcq');
    if (btnSubmitMCQ) btnSubmitMCQ.addEventListener('click', submitMCQ);
    const btnMCQBack = $('btn-mgr-mcq-back');
    if (btnMCQBack) btnMCQBack.addEventListener('click', backToModules);

    // Result screen
    const btnBackToModules = $('btn-mgr-back-to-modules');
    if (btnBackToModules) btnBackToModules.addEventListener('click', backToModules);
  }

  return {
    init, login, logout,
    startModule,
    startRecording, stopRecording,
    submitWritten, submitMCQ,
    backToModules,
    selectMCQOption,
    // SR functions exposed for inline event handlers (if needed)
    submitSRSectionA: _submitSRSectionA,
    submitSRSectionB: _submitSRSectionB,
  };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MgrApp.init());
} else {
  MgrApp.init();
}
