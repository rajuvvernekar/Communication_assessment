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
      { id:'ta1', title:'Brokerage & Charges Dispute',
        scenario:`BACKGROUND: A high-value client disputes ~₹42,000 in brokerage and fees never explained at onboarding, escalating when offered a tariff-sheet PDF instead of an explanation.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

CLIENT: "I just reconciled my account statement for the last quarter and I've been charged nearly ₹42,000 more in brokerage and fees than what was quoted to me when I opened this account. This is unacceptable."

MANAGER: "Sir, brokerage charges are clearly mentioned in the account opening documents you signed. If you didn't read them carefully, that's not really something we can help with now."

CLIENT: "I did read them. I was quoted a flat rate, and I'm seeing multiple additional charges I was never told about — STT, exchange fees, stamp duty, and something called 'transaction charges' stacked on top."

MANAGER: "Those are statutory and exchange-level charges, sir, every broker charges them, it's not specific to us. I don't understand why this is a surprise to you at this point."

CLIENT: "It's a surprise because nobody explained the full cost breakdown to me when I signed up. I feel like I was misled into this account."

MANAGER: "We never mislead clients. All charges are disclosed in the tariff sheet on our website. You could have checked it any time in the last eight months."

CLIENT: "So you're telling me it's my fault for not double-checking your website after your own team quoted me a number?"

MANAGER: "I'm just saying the information was available, sir. I can send you the tariff sheet again if that helps."

CLIENT: "I don't want a PDF, I want someone to explain why what I was told at onboarding doesn't match what I'm being charged, and I want to know what you're going to do about the difference."

MANAGER: "There isn't really a 'difference' to correct, sir — the charges are accurate as per our published rates. I can raise a general feedback ticket about the onboarding conversation if you'd like."

CLIENT: "A feedback ticket? I'm talking about forty-two thousand rupees and eight months of being charged incorrectly by your team's own account, and you're offering a feedback ticket?"

MANAGER: "I understand you're upset, but without a recording of that original onboarding call, there's no way to verify what was actually said to you."

CLIENT: "So now you're saying I'm lying about what your representative told me."

MANAGER: "I'm not saying that, sir, I'm just saying we can't act on it without proof. I can escalate this to my senior if you want, but I don't think the outcome will be different."

CLIENT: "This is exactly why I'm moving my account elsewhere and posting a review about this exact conversation."` },
      { id:'ta2', title:'IPO Allotment Display Error',
        scenario:`BACKGROUND: A client's app briefly showed 400 IPO shares allotted, then zero — the manager insists it's someone else's problem at every turn.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

CLIENT: "Your app showed me IPO allotment confirmed on Tuesday morning — 400 shares. Now today it shows zero allotment. What happened?"

MANAGER: "Sir, that must have been a display glitch on your end. Our backend never confirms allotment before the registrar's official file is processed."

CLIENT: "It wasn't a glitch, I have a screenshot with a timestamp. It clearly said 'Allotted: 400 shares' with a congratulatory banner."

MANAGER: "Even if the app showed that, it's not something we can act on — allotment is decided by the registrar and the exchange, not us."

CLIENT: "I understand the registrar decides allotment, but your platform told me I got it, and I made plans — I told my family, I was counting on the listing gains you people market so heavily."

MANAGER: "We can't be responsible for plans you made based on an app screen, sir. These things happen sometimes with high demand IPOs."

CLIENT: "So a technical error on your platform is just something I have to absorb with no accountability from your side?"

MANAGER: "I mean, technically the error is on the display layer, not the actual allotment process, so there's no financial loss to compensate for."

CLIENT: "There's no financial loss because I never got the shares I was told I had — but there's real damage to my trust in this platform, and I want to know how this happened."

MANAGER: "I can log a technical complaint, but I can't promise you any explanation timeline. These backend sync issues are handled by a different team entirely."

CLIENT: "This is the third time I'm being told 'a different team handles that.' At some point someone in front of me has to actually own this."

MANAGER: "I understand your frustration, sir, but I genuinely don't have visibility into what caused the display error. I can only pass this along."

CLIENT: "Then pass it along with urgency, because I am seriously considering filing a complaint with the exchange about misleading allotment information."

MANAGER: "You're welcome to do that, sir, that's entirely your choice. I've noted your complaint on our end as well."

CLIENT: "This entire conversation has told me you have no real answers and no real ownership of your own platform's mistakes."` },
      { id:'ta3', title:'DP/Demat Block Before a Board Announcement',
        scenario:`BACKGROUND: A client's shares were blocked in demat right before a board announcement that later moved the stock 14%, and the manager cannot explain why or who is responsible.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

CLIENT: "I tried to sell my entire holding in [Company] yesterday morning before the board meeting outcome, and the sell order failed because my shares showed as 'blocked' in demat. Why?"

MANAGER: "Sometimes shares get blocked if there's a pending pledge or a previous instruction not yet processed, sir. It's a system-level thing."

CLIENT: "I never pledged these shares. I've held them for two years, untouched. Can you tell me exactly why they were blocked at that specific moment?"

MANAGER: "I'd have to check the DP logs for that, but honestly this kind of thing is common and usually resolves itself within a day or two."

CLIENT: "A day or two was too late — the board announcement came out and the stock dropped 14% right after. I lost the entire window because of your block."

MANAGER: "I understand that's frustrating, but demat blocks aren't something the trading desk controls, it's a depository-level issue, completely separate from us."

CLIENT: "You're the broker I trusted with this account. I don't care how many departments are involved internally — I need someone to explain what actually happened."

MANAGER: "I hear you, sir, but I genuinely can't speak to depository-side processing, that's outside what I can access from here."

CLIENT: "So who can? Because right now I've lost a significant amount of money and all I'm getting is 'not my department.'"

MANAGER: "I can raise a ticket to our demat operations team, but resolution and root cause usually takes several working days to come back."

CLIENT: "Several working days for an explanation of something that cost me money in a matter of hours. Do you understand how that sounds?"

MANAGER: "I do understand, sir, and I'm sorry you're going through this, but I can't speed up an internal investigation just because it's urgent for you."

CLIENT: "This isn't just urgent for me, it should be urgent for you — your operational failure potentially cost me lakhs."

MANAGER: "I've logged your concern, sir. Once operations reverts with the root cause, we'll let you know what corrective steps, if any, are appropriate."

CLIENT: "'If any' is exactly the problem. I want a commitment that this gets investigated properly, not passed around until I give up."` },
      { id:'ta4', title:'Algo/API Order Duplication Fault',
        scenario:`BACKGROUND: A client's automated trading script fired the same order 11 times after a delayed API acknowledgment — with logs proving the delay originated server-side.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

CLIENT: "Your API fired the same buy order eleven times in ninety seconds this morning. I ended up with eleven times the position I intended, and I had to unwind it all at a loss."

MANAGER: "API issues are usually on the client's script side, sir — did you check your own order logic for a retry loop?"

CLIENT: "I've run this exact script for six months with no issues. This morning your API acknowledgment response was delayed, which is what triggered my system's retry logic to fire again."

MANAGER: "If it's a delayed acknowledgment issue, that's still technically a network-level thing, could be your internet, could be ours, hard to say without a deep investigation."

CLIENT: "I have the request and response logs with timestamps showing the delay originated on your servers, not mine. I'm not asking you to guess — I'm asking you to look at the actual data."

MANAGER: "Sir, we get a lot of these claims and in most cases it turns out to be client-side. I'm not saying that's definitely the case here, but statistically that's usually how it goes."

CLIENT: "I'm not most cases. I'm telling you I have logs. This cost me close to nine lakh rupees in an unintended position I had to exit at a loss."

MANAGER: "I can forward the logs to our tech team for review, but I want to set expectations — even if it is confirmed as a server-side delay, compensation isn't guaranteed."

CLIENT: "I'm not even asking about compensation yet. I'm asking for someone to actually investigate before jumping to 'compensation isn't guaranteed.'"

MANAGER: "Understood, sir, I just wanted to be upfront so there's no misunderstanding later. I'll forward what you have."

CLIENT: "It would help if the first thing I heard from you was 'let's look into this properly' instead of managing my expectations downward before you've even seen the evidence."

MANAGER: "Fair point, sir. Send over the logs and I'll get the technical review started today."

CLIENT: "I sent them to your support email an hour before I called you. Nobody has acknowledged them yet."

MANAGER: "Let me check on that and make sure it's been picked up. I'll call you back by end of day with a status, not a resolution, just a status."

CLIENT: "That's the first useful thing I've heard in this entire call."` },
      { id:'ta5', title:'Senior Citizen Product-Suitability Complaint',
        scenario:`BACKGROUND: A 72-year-old pensioner was activated for leveraged F&O trading and lost ₹6 lakh — his son calls, and every answer deflects to 'a different team' or 'he signed a form.'

─── CALL TRANSCRIPT ─────────────────────────────────────────────

CALLER: "My father is 72 years old, retired, living on a fixed pension, and somehow your team sold him futures and options trading with leverage. He's lost almost ₹6 lakh of his retirement savings. How did this happen?"

MANAGER: "Sir, every client signs a risk disclosure document before F&O activation, so legally he consented to the risk involved."

CALLER: "He barely understands what F&O even stands for. Did anyone actually assess whether this was suitable for a 72-year-old pensioner before activating it?"

MANAGER: "There's a standard suitability questionnaire, but ultimately it's self-declared by the client, we can't force someone to answer honestly."

CALLER: "So you're saying it's his fault for not filling out a form correctly, when he didn't understand what the form was even asking?"

MANAGER: "I'm not blaming him, sir, I'm just explaining the process. If he had concerns he could have asked before trading."

CALLER: "He trusted whoever called him and told him this could 'boost his returns.' That's what he told me. Was he cold-called about this product?"

MANAGER: "I don't have visibility into individual sales calls, sir, that would be a different team's outreach."

CALLER: "This is my father's life savings we're discussing, and every answer I get is 'different team' or 'he signed a form.' I need someone to actually take this seriously."

MANAGER: "I do take it seriously, sir, but without evidence of specific misrepresentation, there isn't much action we can take beyond noting your concern."

CALLER: "The evidence is that a 72-year-old pensioner with zero trading history suddenly has an active F&O account and a six lakh rupee loss within two months. That pattern should be evidence enough."

MANAGER: "I understand it looks concerning, but I'm not in a position to make a suitability judgment call over the phone. I can log this as a complaint."

CALLER: "Log it as more than a complaint. I want to know if this is a broader pattern with elderly clients, because if it is, I am taking this to SEBI directly."

MANAGER: "You're free to do that, sir. I'll make sure the complaint is recorded accurately on our end."

CALLER: "'Recorded accurately' isn't what I came here for. I came here for someone to say this was wrong and commit to actually looking into it."` },
    ],
    'mgr-mock-call': [
      { id:'mc1', title:'Failed Stop-Loss During a Gap-Down',
        scenario:'The customer\'s stop-loss order on a large equity position failed to trigger during a sharp gap-down opening due to a liquidity gap at that price level, resulting in a much larger loss than the stop-loss was meant to protect against. The customer wants immediate compensation for the difference.\\n\\nThe customer opens the call by saying:\\n\\n"My stop-loss was supposed to protect me from exactly this. It didn\'t trigger, and now I\'m down four times what I should have lost. I want the difference compensated, today."\\n\\nEscalation beats the customer will raise if your handling doesn\'t already address them: (1) "A stop-loss is a promise, isn\'t it? Otherwise what\'s the point of offering it?" (2) "I don\'t care about liquidity gaps, that\'s your platform\'s problem to solve, not mine." (3) "If you can\'t compensate me, tell me exactly who can, right now."\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
      { id:'mc2', title:'Suspected Account Access Breach',
        scenario:'The customer noticed a login from an unrecognized device and location in their account activity log, alongside two small unfamiliar orders that were later reversed by risk monitoring before settlement. The customer is alarmed about a possible security breach and is considering going to the media.\\n\\nThe customer opens the call by saying:\\n\\n"Someone accessed my trading account from a device and city I\'ve never used. There were unauthorized orders. I want to know right now how secure my money actually is with you, or I\'m going to the press about this."\\n\\nEscalation beats the customer will raise if your handling doesn\'t already address them: (1) "How do I know this hasn\'t happened before without me noticing?" (2) "I want my account frozen and a full security audit, not a generic \'we take security seriously\' line." (3) "If this becomes public and your stock or reputation takes a hit, that\'s on you, not me."\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
      { id:'mc3', title:'Forced Liquidation of Pledged Shares',
        scenario:'The customer had pledged shares against a loan facility; a sudden fall in the pledged stock\'s value triggered a margin call that the customer missed (traveling internationally), leading to forced liquidation of the pledged shares at a steep loss. The customer says they never received adequate notice.\\n\\nThe customer opens the call by saying:\\n\\n"You sold my pledged shares while I was on a flight with no signal. I got one SMS and that was it. That\'s not a fair warning process for something this serious."\\n\\nEscalation beats the customer will raise if your handling doesn\'t already address them: (1) "One SMS is not \'reasonable notice\' for liquidating my holdings." (2) "Why wasn\'t there an email, a call, anything with more than one attempt?" (3) "I\'m not asking you to reverse it, I\'m asking why your notice process is this thin for something irreversible."\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
      { id:'mc4', title:'Wrong Brokerage Plan Applied',
        scenario:'The customer was onboarded onto a higher-cost brokerage plan due to an internal error, despite having requested and been verbally confirmed for a discount plan at account opening. This has been ongoing for five months, and the customer wants both a correction going forward and retroactive reimbursement.\\n\\nThe customer opens the call by saying:\\n\\n"I specifically asked for the discount brokerage plan when I opened this account, and I was told yes. Five months later I find out I\'ve been on the standard plan this whole time. I want this fixed and I want back what I overpaid."\\n\\nEscalation beats the customer will raise if your handling doesn\'t already address them: (1) "This isn\'t a small amount over five months, it adds up." (2) "I have no way to prove what was said on that call, but I remember it clearly — are you saying I\'m making it up?" (3) "If you can fix it going forward but not reimburse the past five months, explain to me why that\'s fair."\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
      { id:'mc5', title:'Loss on an Advisory-Recommended Stock',
        scenario:'The customer subscribed to the firm\'s premium advisory service and acted on a strong "buy" recommendation that subsequently fell sharply after adverse company-specific news. The customer feels the recommendation was reckless and wants both the advisory subscription fee refunded and accountability for the loss.\\n\\nThe customer opens the call by saying:\\n\\n"Your advisory team told me this stock was a strong buy with high conviction. I trusted that recommendation and put in a large amount. It\'s down thirty percent. I want my advisory fee refunded at the very least."\\n\\nEscalation beats the customer will raise if your handling doesn\'t already address them: (1) "What\'s the point of paying for advisory if the calls are this wrong?" (2) "Was this recommendation based on real research, or just pushed to hit some target?" (3) "I\'m not asking you to cover my trading loss, I\'m asking why I should keep paying for advice that did this to me."\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer\'s frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.' },
    ],
    'mgr-feedback': [
      { id:'fb1', title:'Mis-Selling Pattern Under Target Pressure',
        scenario:'Employee: Relationship Manager, 2.3 years tenure, consistently in the top quartile for new account activations.\\n\\nSituation: Call audits over the last month show a repeated pattern of pushing high-margin F&O and derivative products to clients with clearly conservative risk profiles, without adequately explaining the risk, in order to hit a quarterly activation target.',
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
        scenario:'Employee: Senior Dealer, 4 years tenure, generally strong performer.\\n\\nSituation: Random call monitoring found that in 6 of the last 20 sampled calls, the mandatory risk disclosure script for leveraged products was skipped or rushed through inaudibly before order confirmation — a direct compliance and regulatory exposure.',
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
        scenario:'Employee: Customer Service Executive, 1.5 years tenure.\\n\\nSituation: Client satisfaction scores for this employee have dropped from 4.3 to 2.8 over two months, with three specific written complaints about curt, dismissive tone during high-value client interactions.',
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
        scenario:'Employee: Support Team Lead, 3 years tenure, previously a strong performer.\\n\\nSituation: Callback SLA (client escalations to be returned within 4 business hours) has been breached in 40% of cases over the last six weeks, several involving time-sensitive trading issues where delay caused real client financial impact.',
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
        scenario:'Employee: Dealer, 5 years tenure, high trust and seniority on the floor.\\n\\nSituation: A recorded call shows a large trade executed based on an ambiguous client instruction, without the mandatory verbal reconfirmation of quantity and price before execution — a serious protocol and compliance breach, even though this particular trade did not result in client loss.',
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
        scenario:`Situation 1: The market gaps down 4% at the open. Five high-value clients are calling in simultaneously, all demanding personal intervention on RMS auto square-offs happening in real time, and your support queue is already jammed.\\n\\nSituation 2: While still handling that, your compliance officer calls: a surprise regulatory inspection team is arriving in 20 minutes and needs files you have not prepared.\\n\\nSituation 3: One of the clients from situation 1 calls back — this time on speakerphone with a journalist friend listening in — saying they intend to publish the recording of this call.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq2', title:'Cascade Set 2 — The System Failure Day',
        scenario:`Situation 1: The trading platform crashes fleet-wide for 15 minutes during F&O expiry, the highest-volume window of the month.\\n\\nSituation 2: Immediately after, a member of your team breaks down in visible distress at their desk, overwhelmed by the complaint volume, in front of the rest of the floor.\\n\\nSituation 3: Your regional head calls, demanding to know within the next 10 minutes why complaint numbers have spiked, ahead of a leadership review call.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq3', title:'Cascade Set 3 — The Personal Attack Day',
        scenario:`Situation 1: A client screams abusive language at you directly over the phone and threatens to "make sure you lose your job" over a trading loss.\\n\\nSituation 2: Minutes later, you learn a formal complaint naming you personally — not just the branch — has been filed, alleging negligence.\\n\\nSituation 3: A peer manager quietly mentions they've heard the complaint may come up in your upcoming promotion review.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq4', title:'Cascade Set 4 — The Compliance Crisis',
        scenario:`Situation 1: You discover evidence suggesting a member of your team may have front-run a large client order — a serious integrity and regulatory breach.\\n\\nSituation 2: Before you can act on it, the client involved calls in, unaware, casually praising that same team member's service.\\n\\nSituation 3: HR calls to inform you the team member has just submitted an immediate, effective-today resignation.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
      { id:'eq5', title:'Cascade Set 5 — The Public Pressure Day',
        scenario:`Situation 1: A negative post about your branch is trending on social media with hundreds of comments, referencing a client incident you have not yet been briefed on.\\n\\nSituation 2: Your manager calls, visibly stressed, demanding a response statement within 15 minutes.\\n\\nSituation 3: An unrelated client calls in, visibly anxious after seeing the post, asking whether their money is safe with the firm.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)` },
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
  // Shared across both call-shaped modules that offer it (Paper Trade /
  // mgr-mock-call and Red Pen / mgr-feedback) since only one such call ever
  // runs at a time. `kind` tracks which one is active so the shared finish
  // handler knows which scoring path and screen to use. Mirrors the pattern
  // already proven out on the trainee side (js/app.js's Voice AI (Beta)
  // Mock Call flow) — same GeminiLive module, same call shape.
  let _mgrLive = {
    kind: null,           // 'mock-call' | 'feedback'
    turns: [],            // [{ role: 'bot'|'trainee', text }]
    controller: null,     // { stop(), getRecording() } from GeminiLive.startCall()
    startTime: 0,
    finishing: false,
  };

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
  function _renderEvalCriteriaPanel(moduleKey, afterElId) {
    const anchor = $(afterElId);
    if (!anchor) return;
    const criteria = (typeof MGR_EVAL_CRITERIA !== 'undefined') ? MGR_EVAL_CRITERIA[moduleKey] : null;
    const panelId = afterElId + '-eval-panel';
    let panel = $(panelId);
    if (!criteria) { if (panel) panel.remove(); return; }

    const rows = criteria.parameters.map(p =>
      `<div style="display:flex;justify-content:space-between;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid rgba(0,0,0,0.06)">
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.85rem">${p.label}</div>
          <div style="font-size:0.78rem;color:var(--text-muted, #666);margin-top:0.15rem">${p.desc}</div>
        </div>
        <div style="flex-shrink:0;font-weight:700;font-size:0.85rem;color:#7c3aed;white-space:nowrap">${p.weight} pts</div>
      </div>`
    ).join('');

    const html = `
      <details id="${panelId}" style="margin-top:0.75rem;border:1px solid rgba(124,58,237,0.25);border-radius:8px;background:rgba(124,58,237,0.04);padding:0.6rem 0.85rem">
        <summary style="cursor:pointer;font-weight:700;font-size:0.85rem;color:#5b21b6">📊 How this is scored — ${criteria.label} (${criteria.maxMarks} marks)</summary>
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
    $('mgr-audio-scenario-text').textContent = _currentScenario.scenario;
    _renderEvalCriteriaPanel(_currentModule, 'mgr-audio-scenario-text');

    $('mgr-prep-phase').classList.remove('hidden');
    $('mgr-record-phase').classList.add('hidden');
    $('mgr-live-transcript').innerHTML = '<span class="placeholder">Your speech will appear here in real time...</span>';

    // Gemini Voice AI (Beta) — real-time speech-to-speech, offered as an
    // alternative to the normal recording flow for Paper Trade only (it's
    // the module built as a live customer call, so it's the natural fit —
    // see manager.html for the actual call screen this launches).
    const liveBtn = $('btn-mgr-audio-live-voice-start');
    if (liveBtn) {
      const showLiveBtn = _currentModule === 'mgr-mock-call'
        && typeof GeminiLive !== 'undefined' && GeminiLive.isAvailable();
      liveBtn.classList.toggle('hidden', !showLiveBtn);
      liveBtn.onclick = () => _startAudioLiveVoice();
    }

    showScreen('mgr-screen-audio');
    _startPrepTimer();
  }

  function _startPrepTimer() {
    let remaining = 60;
    $('mgr-prep-count').textContent = remaining;
    _clearPrepTimer();
    _prepTimer = setInterval(() => {
      remaining--;
      $('mgr-prep-count').textContent = remaining;
      if (remaining <= 0) { _clearPrepTimer(); startRecording(); }
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

  // ── Paper Trade — Gemini Live real-time voice call (Beta) ─
  // Same architecture as the trainee side's Voice AI (Beta) Mock Call flow
  // in js/app.js: one persistent WebSocket for the whole call via
  // GeminiLive, offered as an alternative to the record-then-transcribe
  // flow above. The scenario text already contains the customer's opening
  // line and escalation beats, so it doubles directly as the roleplay brief.
  function _startAudioLiveVoice() {
    _clearPrepTimer();
    const meta = MODULE_META[_currentModule];

    $('mgr-audio-live-module-title').textContent = `${meta.icon} ${meta.label} — Voice AI (Beta)`;
    $('mgr-audio-live-topic-title').textContent  = _currentScenario.title;
    $('mgr-audio-live-scenario-text').textContent = _currentScenario.scenario;
    _renderEvalCriteriaPanel(_currentModule, 'mgr-audio-live-scenario-text');
    $('mgr-audio-live-thread').innerHTML = '';
    $('btn-mgr-audio-live-end').disabled = false;

    _mgrLive = { kind: 'mock-call', turns: [], controller: null, startTime: Date.now(), finishing: false };

    const stateEl = $('mgr-audio-live-state');
    const STATE_LABELS = {
      connecting: '🔌 Connecting…',
      listening:  '🎙️ Listening — go ahead and speak',
      speaking:   '🔊 Customer is speaking…',
      error:      '⚠️ Connection problem — try Cancel and use the normal recording flow',
      ended:      '📴 Call ended',
      'time-limit': '⏱️ 9-minute limit reached — wrapping up and submitting…',
    };

    const systemInstruction = `You are roleplaying, BY VOICE, as a customer of the brokerage on a call with a customer support manager. You are the CUSTOMER, not an agent and not the manager — you are the one asking questions, and the manager is the one answering them.

TOPIC / SITUATION CONTEXT (use this as the subject matter for your questions): ${_currentScenario.scenario}

HOW TO RUN THIS CALL:
- You are a genuinely curious, slightly concerned customer trying to understand this topic properly — you are not filing a complaint or demanding compensation, you are asking the manager to explain things to you.
- Ask ONE conceptual question at a time, then stop and actually listen to the manager's full answer before asking anything else.
- Every question you ask must be a complete, natural spoken question of at least 10-15 words — never a bare one- or two-word follow-up like "why?" or "how so?". Phrase it the way a real customer would voice a genuine concern, in full sentences.
- Base your FIRST question directly on the topic/situation context above, adapted into natural spoken language.
- For every question after the first, build it directly from what the manager just said: pick up on a specific term, number, or claim in their answer and ask them to go deeper on it, clarify it, or explain what it means for you specifically — never ask a generic or scripted question that ignores their actual answer.
- Speak naturally, the way a real person sounds on a phone call — short, conversational sentences, not a written essay or a script read verbatim.
- Open the call yourself with your first question as soon as the call connects — do not wait for the manager to speak first.
- Keep the call to roughly 5-6 minutes of back-and-forth questions and answers, then let it wind down naturally once you feel your questions have genuinely been answered — you don't have to explicitly announce the call is ending.
- Never mention that you are an AI, a script, grading, evaluation criteria, or that this is a training exercise.`;

    $('btn-mgr-audio-live-end').onclick = () => _finishAudioLiveVoice();
    $('btn-mgr-audio-live-cancel').onclick = () => {
      if (_mgrLive.controller) { _mgrLive.controller.stop(); _mgrLive.controller = null; }
      _launchAudio();
    };

    showScreen('mgr-screen-audio-live');

    _mgrLive.controller = GeminiLive.startCall({
      systemInstruction,
      onStateChange: (state) => {
        if (stateEl) stateEl.textContent = STATE_LABELS[state] || state;
        if (state === 'time-limit') {
          toast('⏱️ Reached the 9-minute call limit — submitting what was covered so far.', '');
          _finishAudioLiveVoice();
        }
      },
      onTurn: ({ role, text }) => {
        _mgrLive.turns.push({ role, text });
        const bubble = document.createElement('div');
        bubble.className = `mc-bubble ${role === 'bot' ? 'bot' : 'trainee'}`;
        bubble.textContent = text;
        $('mgr-audio-live-thread').appendChild(bubble);
        $('mgr-audio-live-thread').scrollTop = $('mgr-audio-live-thread').scrollHeight;
      },
      onError: (err) => {
        console.error('GeminiLive error (Paper Trade):', err);
        toast('⚠ Voice AI error: ' + (err.message || err) + ' — you can cancel and use the normal recording flow instead.', 'error');
      },
    });
  }

  async function _finishAudioLiveVoice() {
    if (_mgrLive.finishing) return;
    if (!_mgrLive.controller && _mgrLive.turns.length === 0) return;
    _mgrLive.finishing = true;
    $('btn-mgr-audio-live-end').disabled = true;

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
        console.warn('Paper Trade live-call content eval failed:', e.message);
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
      console.error('_finishAudioLiveVoice error:', e);
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
    $('sr-scenario-text-a').textContent = _currentScenario.scenario;
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
    $('mgr-fb-sc-text').textContent  = _currentScenario.scenario;
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
    $('mgr-fb-live-sc-text').textContent  = _currentScenario.scenario;
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
    $('mgr-written-scenario-text').textContent = _currentScenario.scenario;
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
    const btnSkipPrep = $('btn-mgr-skip-prep');
    if (btnSkipPrep) btnSkipPrep.addEventListener('click', startRecording);
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
