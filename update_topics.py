"""
Update IMPS, Physical Delivery Penalty, Short Delivery topics (add 3 questions each)
and create 5 new escalation stock-market mock-call topics.
"""
import requests, json, sys
from datetime import datetime

URL = "https://xnsmsrjbfjjzivuvicko.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=representation"}

# ── Updated bot scripts (existing 6 questions + 3 new) ─────────────────────

IMPS_SCRIPT = [
    "I transferred funds via IMPS at 9:10 AM — I have the bank transaction receipt right here showing the timestamp. Your platform only showed the money as available at 11:45 AM. That is over two and a half hours. IMPS is supposed to be instant — what exactly happened on your end?",
    "Because of that delay, I missed a trade that moved 15% intraday. I had the buy order ready and waiting — I just didn’t have the funds showing up on your platform. That is a direct financial loss caused entirely by your system’s failure to credit my account on time.",
    "I have used IMPS with three other brokers and the funds always show within minutes — not hours. This is clearly a failure specific to your platform or your payment gateway. Do not tell me this is normal because I know it is not.",
    "I want to know exactly where the delay happened. Was it your payment gateway? Did your risk team put a hold on my transfer? Did someone manually delay the credit? I want a specific answer, not a generic explanation about processing timelines.",
    "You keep saying you will check — I have been patient enough. Someone in your organisation made a decision or a system on your platform failed, and it cost me money. Who is accountable? Give me a name, a team, and a timeline for when I will get an answer.",
    "I want to know what your organisation is prepared to do about this. If you cannot compensate me for the missed trade, tell me the direct contact of your nodal officer and the SEBI SCORES complaint category for payment delays. I am prepared to file a formal complaint today.",
    # ── 3 new questions ──
    "I’ve been with Zerodha since 2017. In eight years, this is the first time I’ve been let down this badly. I’ve personally referred six people to your platform. I am telling you now — if this isn’t resolved satisfactorily today, I will call each one of them and ask them to move their accounts.",
    "You’ve mentioned the payment gateway twice now. If the failure is on their side, I want to know — does Zerodha have an SLA with your payment gateway partner, and when they fail, do you pass the cost on to the customer or absorb it internally? Because right now it feels like I am the one absorbing it.",
    "Last question — I don’t want a ticket number, I don’t want another callback, and I don’t want to repeat this conversation a fourth time. Tell me exactly what will be in my account by end of today — compensation, a formal written explanation, or both. Give me a specific answer right now.",
]

PHYSICAL_SCRIPT = [
    "I had absolutely no idea my options would go to physical delivery. Your platform never showed me a single warning before expiry. Why wasn’t I informed that I needed funds to take delivery of the actual shares?",
    "I clearly did not have the funds for physical delivery — your own system would have shown that. So why was the position allowed to expire instead of being squared off automatically before expiry? Other brokers do that as a standard risk measure.",
    "I’m looking at my account right now and there is a debit for a physical delivery penalty that I never authorised. Money has been taken from my account without my knowledge or consent. How is this even legal?",
    "I have been trading options on your platform for years. Nobody — not your app, not your support team, not any communication — ever told me that stock options carry a physical delivery obligation at expiry. Was this hidden deliberately in some fine print that nobody reads?",
    "You are telling me the exchange mandated this — fine. But your platform accepted my position, held it to expiry, did nothing to warn me, and now penalised me. At what point does your platform take any responsibility here?",
    "I want the full penalty amount reversed. If your platform failed to warn me and failed to auto square-off my position, the fault is yours, not mine. Tell me the name and contact of your nodal officer and the relevant SEBI SCORES category — I want that information ready.",
    # ── 3 new questions ──
    "I’ve now spoken to two other Zerodha clients who had the exact same issue last month. Both of them said they were not warned either. Both got the penalty. Your team gave them the exact same response you are giving me. Is this a documented pattern at Zerodha, or are you going to tell me it is a coincidence?",
    "The NSE has clear guidelines on what brokers must communicate to clients holding stock options into expiry. I want to know — did Zerodha comply with all NSE notification requirements in my case? If yes, show me the notification you claim was sent to me. If you cannot show it, then the fault is clearly yours.",
    "Last question — I want a clear, unambiguous answer with no qualifications. Will you reverse the penalty or not? If yes, give me a timeline and a reference number on this call. If no, give me the full name and contact of your Grievance Redressal Officer and I will file with SEBI SCORES before the market closes today.",
]

SHORT_SCRIPT = [
    "I sold shares that your platform allowed me to sell — the order went through, it showed as executed, and I got the confirmation. Now you are telling me there is an auction penalty because of short delivery? If those shares couldn’t be delivered, why on earth did your platform accept the order in the first place?",
    "I just received these shares through an IPO allotment. Nobody — not your app, not your support team, not a single notification — told me there was a settlement period before I could sell. If there is a lock-in or a restriction, shouldn’t your system block the sale automatically? Why is that the client’s responsibility to know?",
    "I am looking at my account right now and there is a significant debit for an auction penalty — money that was taken from my account without my knowledge or approval. Your system created this situation by accepting an order it could not fulfil, and now I am the one paying for it. How is that acceptable?",
    "I have seen other platforms block the sale of unsettled shares outright — they simply do not allow the order. Your platform let it go through and then penalised me for the result. Where exactly is your risk control in this entire process?",
    "I want the complete timeline from you — when was the IPO allotment credited to my account, when did I place the sell order, what was the settlement date, and when was the auction triggered. Walk me through the entire sequence so I understand exactly how your system failed me at each step.",
    "I want the full auction penalty reversed. Your platform accepted an order it should have blocked — that is a system failure and the responsibility is entirely yours. Tell me the name of your grievance officer, the SEBI SCORES complaint link, and the NSE or BSE investor grievance cell contact.",
    # ── 3 new questions ──
    "You said the auction happens T+2 days after the settlement date and the exchange takes another T+2 to credit. That is four working days from the short delivery date — plus the penalty is also charged on top. I end up waiting a week and also paying extra. Why should the innocent buyer suffer because your system let a bad order through?",
    "If your platform had simply blocked the sell order the way any responsible broker should — I would not be here. I would not have a penalty. I would not have lost any money. This entire situation was created by a single failure on your side. Does your tech team know about this loophole and have they fixed it for other clients, or am I one of many?",
    "Last question — I have been clear and factual throughout this call. I want one of two things: a full reversal of the auction penalty acknowledging your system error, OR a written confirmation that this was an IPO settlement restriction your platform failed to enforce. Which one can you give me today? I need an answer before I hang up.",
]

# ── IDs of the three topics to update ──────────────────────────────────────
UPDATES = [
    ("c2ac05ad-4166-4bfb-9e7f-f538e864b545", IMPS_SCRIPT),         # IMPS
    ("c762fe0d-8160-49dc-9c6e-ebc1b0ba9eaf", PHYSICAL_SCRIPT),      # Physical Delivery
    ("f3ce86d3-6eae-4ba9-9313-b0046106351d", SHORT_SCRIPT),          # Short Delivery
]

# ── 5 new escalation topics ────────────────────────────────────────────────
CHECKLIST_BASE = [
    "Acknowledge the grievance immediately with genuine empathy — no deflection",
    "Take ownership; avoid blaming systems, exchange, or previous agents",
    "De-escalate legal and media threats calmly with concrete action",
    "Offer a specific resolution path with a named owner and firm timeline",
    "Never use scripted corporate language when the customer challenges you directly",
    "Close with a clear follow-up commitment and a contact the customer can trust",
]

NEW_TOPICS = [
    {
        "module": "mock-call",
        "title": "Kite Platform Outage — F&O Loss of ₹1.2L on Expiry Day",
        "description": "Customer suffered a ₹1.2 lakh F&O loss when Kite was inaccessible during the last 15 minutes of expiry day. Three prior complaints were closed with copy-paste responses. Customer has NSE technical bulletin evidence and is threatening simultaneous SEBI SCORES filing and media.",
        "scenario": "I am calling for the fourth time. On 15th March — expiry day — your Kite platform was completely inaccessible from 3:10 PM to 3:25 PM. I had a short futures position I needed to exit before close. I couldn’t, because your platform was down. I lost ₹1,20,000. I have the NSE technical bulletin confirming downtime. I have screenshots of server errors on my Kite app. And I have three closed complaint tickets — all closed with identical copy-paste responses and zero accountability.",
        "checklist": CHECKLIST_BASE + ["Acknowledge that prior tickets being copy-pasted is unacceptable", "Do not repeat the standard ‘we’ll investigate’ response that was already used three times"],
        "bot_script": [
            "Three tickets. Ticket 4521889, 4578234, and 4601922. I copy-pasted your reply from Ticket 1 and compared it to Ticket 3 — they are word for word identical. Does anyone at Zerodha actually read these complaints, or are they auto-closed after 7 days?",
            "I have the NSE technical bulletin dated 15th March confirming platform disruption in that 15-minute window. Your own exchange confirms it. Why did Zerodha’s previous responses claim ‘no disruption was detected on our end’? Someone lied to me in an official written response. I want to know who authorised that reply.",
            "Your terms and conditions say you are not liable for losses due to technical failure. I’ve read it. But under the Consumer Protection Act 2019, Section 2(47), there is a clear definition of deficiency in service. A broker accepting active F&O positions while running infrastructure that failed on expiry day qualifies. Are you prepared to argue that case in front of a consumer court?",
            "I understand you may not have authority to approve compensation yourself. So tell me — who does? I want a name, a designation, and a direct way to reach them. I am done with anonymous ticket numbers that get closed without anyone reading them.",
            "I’ve been approached by a financial journalist covering retail investor complaints. She has found four other Zerodha clients who lost money in the same 15-minute window on 15th March. If my case is not resolved before tomorrow, I have agreed to be quoted on record. I’m not threatening you — I’m telling you what my next step looks like.",
            "Let me ask you something directly, as a person. Do you think it is fair that a customer loses ₹1.2 lakh because of a platform failure and then receives three identical responses and no resolution across four calls? What would you do if you were in my position?",
            "I’ve been extremely patient. I provided every document requested, responded to every follow-up, and stayed within your formal complaint process. At what point does Zerodha take moral responsibility, even if your legal team is advising you to avoid liability?",
            "Last question — I need a commitment today, not a callback promise. Will you escalate this to your Grievance Redressal Officer personally, give me their name and direct email address, and confirm a response within 48 hours? I want a yes or no, and if yes, I want those details before I hang up.",
        ],
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "module": "mock-call",
        "title": "IMPS Refund — ₹50,000 Stuck 15 Days, Zerodha & Bank Passing Blame",
        "description": "Customer transferred ₹50,000 via IMPS 15 days ago. Bank confirms debit. Zerodha account never credited. Both Zerodha and HDFC are blaming each other. Customer has filed 3 complaints, initiated RBI Ombudsman process, and is threatening public media exposure.",
        "scenario": "Fifteen days ago I did an IMPS transfer of ₹50,000 from HDFC Bank to my Zerodha trading account. My bank confirms the debit. Your system shows no receipt. I filed a complaint with you on Day 1, with HDFC on Day 3. Your team told me it’s the bank’s problem. HDFC told me it’s Zerodha’s problem. 15 days, ₹50,000, and two regulated organisations pointing fingers at each other while my money sits in a black hole.",
        "checklist": CHECKLIST_BASE + ["Never tell the customer to follow up with the bank — take ownership of the full resolution", "Acknowledge the RBI Ombudsman filing without becoming defensive"],
        "bot_script": [
            "I have the HDFC transaction reference. I’ve given this number to three Zerodha agents and two HDFC agents. Every single one has said it’s on the other side. In simple terms — which system received my ₹50,000, and which one did not? Because one of you is wrong, and the customer should not be the one figuring that out.",
            "Under RBI Payment and Settlement Systems circular, a failed IMPS transaction must be reversed or credited within 5 working days. It is Day 15. Both Zerodha and HDFC are RBI-regulated entities. Who bears the regulatory responsibility for this reversal — and why has neither party fulfilled it?",
            "I’ve already initiated an RBI Banking Ombudsman complaint. The reference number is with me. The Ombudsman’s office confirmed that both the remitting bank and the beneficiary institution can be held jointly responsible under the Banking Ombudsman Scheme. Are you aware that Zerodha is jointly exposed here?",
            "My ₹50,000 is not in my bank. It is not in my trading account. Logically, it has to be somewhere — your payment gateway, your reconciliation queue, or your internal float. I want you to check all three right now on this call and tell me exactly where my money is sitting.",
            "That ₹50,000 was working capital I had earmarked for a specific trade. The opportunity is gone. The direct and consequential loss now exceeds the principal amount. Is Zerodha going to compensate only for the principal, or are you prepared to address the full impact?",
            "I’ve spoken to a financial journalist who covers fintech failures. Her exact words were: ‘two regulated institutions passing blame while a customer loses ₹50,000 for 15 days is exactly the kind of story readers want to see.’ I would prefer to resolve this privately. What would Zerodha prefer?",
            "I’ve been told four times to wait for the investigation team. I want to know what is actually being investigated. Is there a pending entry in your payment gateway reconciliation? Is there a float amount sitting in transit? Give me the technical answer — not the customer service answer.",
            "Last question — I want this resolved today. If you cannot credit the money today, I need the following from you before I hang up: the name of the senior manager owning my case, their direct email address, and a written confirmation sent to my email within two hours stating the exact date and method by which ₹50,000 will be credited. Can you commit to that?",
        ],
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "module": "mock-call",
        "title": "Agent Misconduct — Unauthorised F&O Trade, ₹68,000 Loss",
        "description": "Zerodha Relationship Manager executed an unauthorised short straddle F&O position of ₹3.5L notional value on the customer’s account without consent. The trade resulted in a ₹68,000 loss. Customer has WhatsApp messages showing the RM was providing ongoing advisory — a clear SEBI violation.",
        "scenario": "Your Relationship Manager executed a short straddle position on my account on 4th February without asking me. I saw the unexpected trade while in a work meeting and called him immediately. He said he was helping me ‘optimise my margins.’ I never authorised this. The trade lost ₹68,000. I have his WhatsApp messages where he has been giving me stock-specific advice for two months. I want the loss refunded and I want him removed from my account right now.",
        "checklist": CHECKLIST_BASE + ["Never defend or minimise the RM’s conduct — even partially", "Address the SEBI IA regulation violation directly without admitting full legal liability", "Commit to suspending the RM’s account access as an immediate action"],
        "bot_script": [
            "I have the contract note from 4th February. The trade was executed at 10:23 AM. I was in a meeting with my phone face-down. No call was made to me before execution. I want you to check your system right now: does Zerodha log which device or IP address initiated each trade? Was this placed from the RM’s side or from mine?",
            "I have 14 WhatsApp messages from this RM over the past two months. He is clearly giving me specific advisory on which strikes to sell, which stocks to hold, what margins to maintain. SEBI explicitly prohibits stockbrokers from providing investment advice without an IA licence. Was this happening with other clients on his roster, or only with me?",
            "When I confronted him, he said I gave verbal approval on our last call. I never said that. Pull the call recording from our last conversation — it will be in your system. I want you to listen to it on this call and tell me whether I authorised a short straddle. If I did, I will accept the loss. If I didn’t, I want full compensation. It’s that simple.",
            "I already filed a complaint. It was closed in three days with the note ‘trade placed per standard procedures.’ That is not an investigation. No one checked the call recording. No one reviewed the WhatsApp messages I attached. Who reviewed that complaint, and what did they actually look at?",
            "This RM has full access to my account, my holdings, my entire portfolio. Until this matter is investigated, I want his access to my account revoked immediately — right now, on this call. Can you do that, or do I need to file a police complaint under Section 66 of the IT Act to make that happen?",
            "Zerodha’s entire brand promise is transparency and non-advisory. No human interference without client consent. This incident is a direct contradiction of that promise. What internal control failed to allow a relationship manager to place a trade on a client account without documented authorisation?",
            "I am a conservative investor. I have never traded F&O. This RM opened a high-risk short straddle in my name. The financial damage is ₹68,000. The emotional damage — the breach of trust from someone who was supposed to help me — is harder to quantify. How does Zerodha address both?",
            "Last question — I want three commitments before I hang up. First: the RM’s account access is suspended pending investigation. Second: a senior manager calls me within 24 hours with a formal case reference number. Third: Zerodha commits in writing that if the investigation confirms I did not authorise the trade, the ₹68,000 will be fully refunded. Can you give me all three?",
        ],
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "module": "mock-call",
        "title": "Wrong Advisory — Previous Agent’s Stock Tip Caused ₹1.8L Loss",
        "description": "Customer was called by a Zerodha executive as part of a ‘client check-in programme.’ The executive recommended Sun Pharma as safe to hold and add ahead of results. Customer invested ₹3.2 lakh additional. Post-results the stock fell 38%, causing a ₹1.8 lakh loss. Customer has the full call recording and is citing SEBI IA regulations.",
        "scenario": "Your executive called me on 28th January as part of what he described as a client engagement check-in. During that call, unprompted, he told me Sun Pharma looked strong ahead of results and was safe to hold and even add to. I added ₹3.2 lakh to my position. Results came out on 15th February. Stock fell 38%. I lost ₹1.8 lakh. Zerodha is not a registered investment advisor. Giving me that advice was illegal under SEBI regulations. And I have the full call recording.",
        "checklist": CHECKLIST_BASE + ["Never dismiss or challenge the recording — acknowledge it needs to be reviewed", "Avoid making the customer feel their financial loss is a normal market risk", "Commit to an internal investigation of the check-in programme, not just this one call"],
        "bot_script": [
            "Let me read you exactly what your executive said. He said: ‘Sun Pharma ke upcoming results strong dikhte hain, aap safely hold kar sakte ho, even add kar sakte ho at current levels.’ Those are his exact words from the recording. This is a specific, unsolicited stock recommendation made by a Zerodha employee. Under SEBI circular August 2021 on IA regulations, how is this not illegal?",
            "I want you to pull the call recording from 28th January at approximately 2:15 PM from your end. I know it exists because I have it on my phone. I want Zerodha to listen to it officially and tell me — after listening — whether that constitutes investment advice under SEBI’s definition. A yes or no answer, not a legal disclaimer.",
            "I am a retired school teacher. I have limited savings. I trusted Zerodha because you market yourselves as transparent and ethical. When your representative called me — he called me, I didn’t call him — I trusted his judgment because he represented this organisation. How do you assign a rupee value to that kind of trust being broken?",
            "Your compliance team needs to understand the scale of this. How many clients were called as part of this check-in programme in January? How many of them received stock-specific recommendations? Was this one rogue executive acting alone, or was this a Zerodha-endorsed practice? Because the answer to that question changes everything.",
            "I’ve spoken to a SEBI-registered financial advisor who reviewed the recording and my case. She says Zerodha is in clear violation of SEBI IA circular. She has offered to act as a formal witness if this escalates to SEBI. Are you still going to describe this as a routine client engagement call?",
            "Forget the legal angle for one moment. Answer me as a person. Your colleague called a retired teacher, gave specific stock advice, she followed it in good faith, and lost her savings. What does Zerodha do about that? What do you personally think the right outcome should be?",
            "I am giving Zerodha one final opportunity to resolve this internally and quietly. I have already drafted complaints for SEBI SCORES and two financial media outlets. My ask is straightforward: acknowledge the violation, compensate for the loss, and ensure this executive cannot do the same to another customer.",
            "Last question — answer me without corporate language. I have a recording. I have a ₹1.8 lakh loss. I have SEBI’s regulatory framework clearly on my side. What is Zerodha’s concrete offer to resolve this case, and who specifically will call me with that offer within the next 24 hours?",
        ],
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    },
    {
        "module": "mock-call",
        "title": "Wrong Margin Info — RMS Square-Off Caused ₹80,000 Loss",
        "description": "Customer called at 9:07 AM before market open to confirm F&O margin sufficiency. Agent confirmed ‘no action needed.’ RMS squared off the position at 11:02 AM — the intraday low — citing margin shortfall. Position fully recovered by 1:30 PM. The margin shortfall was only ₹18,500 which customer had available. Customer has the 14-minute call duration logged.",
        "scenario": "On Monday at 9:07 AM — before the market opened — I called your support line specifically to confirm my F&O margin. Your agent checked my account and told me clearly: your margin is sufficient, no action needed. At 11:02 AM your RMS team squared off my entire position citing a margin shortfall. The square-off happened at the day’s lowest point. By 1:30 PM the market had fully recovered to my entry price. I lost ₹80,000 on a forced square-off that happened entirely because your agent gave me wrong information.",
        "checklist": CHECKLIST_BASE + ["Commit to retrieving the 9:07 AM call recording — do not dismiss the claim as unverifiable", "Do not use market volatility as the primary explanation for a human information error", "Address the notification policy breach — no SMS or email was sent before the square-off"],
        "bot_script": [
            "Before anything else, I need you to confirm this. Do you have a record of an inbound call from my number on Monday at 9:07 AM lasting approximately 14 minutes? That recording exists in your system. If you can confirm that, we can have an honest conversation. If you cannot find it, tell me that right now — because that call is the foundation of my entire case.",
            "The margin shortfall that triggered the square-off was ₹18,500. I had that exact amount sitting in my savings account at 9:07 AM. If your agent had given me the correct margin requirement — which was the entire purpose of my call — I would have transferred ₹18,500 and protected an ₹80,000 F&O position. That is the direct and measurable cost of your agent’s mistake. Do you see the logic there?",
            "Your own policy documents state that Zerodha will attempt to notify clients via SMS and email before squaring off positions due to margin shortfall. I received no SMS, no email, and no call before the 11:02 AM square-off. I want you to check your system right now and confirm whether any notification was dispatched to me. Because if it wasn’t, Zerodha violated its own stated policy on top of the information error.",
            "Your RMS team squared off my position at 11:02 AM — the exact intraday low of the session. The position recovered to my original entry price by 1:30 PM — that is publicly verifiable from the NSE data. Was there any human judgment involved in the timing of that square-off, or is it fully automated? Because the timing looks like the worst possible moment to act.",
            "I manage a ₹25 lakh portfolio with Zerodha. This ₹80,000 loss has destroyed my trading strategy for the entire month. I am now extremely hesitant to trade on your platform again because I cannot trust that an agent giving me information at market open is actually accurate. Does Zerodha factor client retention into how it handles cases like this?",
            "I filed a formal complaint. It was closed in four days with the note: ‘the square-off was a valid risk management action.’ Nobody mentioned the call I made at 9:07 AM. Nobody checked the recording. That complaint was closed without any actual investigation. Who reviewed it, and what did they check?",
            "You keep coming back to margins fluctuating during market hours. I understand that completely. But at 9:07 AM — before the market opens at 9:15 AM — there is no intraday fluctuation. Your agent confirmed I was fine in a pre-market window. The fluctuating margins explanation does not apply to that specific 8-minute window. Please explain that gap.",
            "Last question — I am not asking for the full ₹80,000. I am asking for ₹18,500, the exact margin shortfall, which I would have transferred immediately if given correct information. That is the precise and direct cost of your agent’s error — nothing more. Will Zerodha credit ₹18,500 to my account as fair compensation? Yes or no? If no, tell me the escalation path.",
        ],
        "enabled": True,
        "created_at": datetime.utcnow().isoformat(),
    },
]

# ── Run updates ─────────────────────────────────────────────────────────────
print("=== Updating existing topics ===")
for topic_id, script in UPDATES:
    r = requests.patch(
        f"{URL}/rest/v1/topics?id=eq.{topic_id}",
        headers=H,
        json={"bot_script": script},
    )
    if r.status_code in (200, 204):
        print(f"  ✓ Updated {topic_id} ({len(script)} turns)")
    else:
        print(f"  ✗ FAILED {topic_id}: {r.status_code} {r.text}", file=sys.stderr)

print("\n=== Creating 5 new topics ===")
for t in NEW_TOPICS:
    r = requests.post(f"{URL}/rest/v1/topics", headers=H, json=t)
    if r.status_code in (200, 201):
        created = r.json()
        new_id = created[0]["id"] if isinstance(created, list) else created.get("id")
        print(f"  ✓ Created '{t['title']}' → {new_id}")
    else:
        print(f"  ✗ FAILED '{t['title']}': {r.status_code} {r.text}", file=sys.stderr)

print("\nDone.")
