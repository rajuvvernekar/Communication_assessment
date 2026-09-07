import re
import os

new_sr_topics = """,
      {
        id: 'sr5',
        title: 'The HNW Portfolio Delay Crisis',
        scenario: `Your High-Net-Worth (HNW) client, Mr. Rakesh Kapoor, had initiated a ₹75 Lakh portfolio transfer to a new PMS structure. Due to a documentation backlog in your operations team, the transfer took 10 working days instead of 2. During this window, the market rallied 4.5%, resulting in an estimated ₹3.5 Lakh opportunity loss for the client.\n\nMr. Kapoor has just called your cell phone. He is furious, threatening to initiate legal proceedings and file a complaint with SEBI. He demands a face-to-face meeting in your office in 30 minutes.`,
        sectionAPrompt: 'Write the EXACT words you say to open this meeting with Mr. Kapoor — your opening 60–90 seconds. How do you address the financial impact, demonstrate ownership, and de-escalate without making unauthorized promises?',
        wrongResponse: `"Mr. Kapoor, thank you for coming in. Look, I understand you're upset about the 10-day timeline, but as I tried explaining on the phone, the delay was entirely at the clearing house and depository participant level — our internal team processed your documents within 24 hours. The market rally was unpredictable, so calling it a ₹3.5 Lakh loss isn't entirely accurate. We cannot reimburse market opportunity losses, but I can ask our compliance team if we can waive next quarter's advisory fees as a goodwill gesture."`
      },
      {
        id: 'sr6',
        title: 'The Multi-Team Outage Conflict',
        scenario: `During morning market opening hours, a system glitch caused 45 high-priority trade orders to fail silently. Your Operations lead and IT Infrastructure lead are in a heated argument in the hallway in front of 20 team members. Operations blames IT for server misconfiguration; IT blames Operations for uploading corrupted batch files.\n\nYou have called both leads into a conference room immediately. The rest of the floor is tense and watching.`,
        sectionAPrompt: 'Write your EXACT opening words in the next 60 seconds to reset the meeting, stop the blame game, and pivot both leads toward root-cause resolution.',
        wrongResponse: `"Alright, shut the door. What was that embarrassing display out on the floor? You two are senior leads acting like trainees. I don't care who started it — if this isn't resolved in the next 20 minutes, I am issuing formal written warnings to both of you. Operations, stop blaming IT. IT, fix the batch script right now. We'll figure out who screwed up during the post-mortem."`
      }"""

new_ta_topics = """,
      { id:'ta3', title:'NRI PIS Account & Currency Conversion Delay — 18 Min Call',
        scenario:`BACKGROUND: Sunita Rao (NRI based in Dubai) called Zerodha support regarding her NRE PIS account opening delay. She submitted documents 3 weeks ago but her account remains pending, causing her to miss a major public infrastructure bond issue. The agent makes 8 critical errors during the call.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hello, Zerodha support.

SUNITA: Hello, my name is Sunita Rao. I applied for an NRE PIS account 3 weeks ago. Application number PIS-88219. I was assured it would take 3-5 business days. The infrastructure bond issue I wanted to invest in closes tomorrow, and my account is still not active!

AGENT: Can I have your Client ID?

SUNITA: It's SR-9941.

AGENT: Hold on. [40-second silence with no hold request]

AGENT: The documents were rejected by the partner bank.

SUNITA: What? Rejected? Why was I not informed? I haven't received an email or SMS!

AGENT: The bank rejected it due to signature mismatch on the PIS permission letter.

SUNITA: I attested those documents at the Indian Consulate in Dubai! How could there be a signature mismatch? And why did nobody inform me for 3 weeks?

AGENT: The bank handles the PIS permission, not us. We just forward the physical copy.

SUNITA: But I paid Zerodha for the service! You are my broker. If there was a rejection, shouldn't your team have notified me immediately?

AGENT: Our team updates the status on the portal. You should have checked the portal status.

SUNITA: The portal status showed "Under Processing by Bank" until this morning!

AGENT: Well, the bank sent the rejection list yesterday evening.

SUNITA: So what do I do now? The bond issue closes tomorrow at 4 PM!

AGENT: You will have to re-sign the PIS letter and courier physical copies to our Bangalore office again.

SUNITA: Courier physical copies from Dubai? That will take at least 4 days! Is there no digital or email verification option?

AGENT: No. PIS is RBI regulated. Physical signature is mandatory.

SUNITA: Can I speak to your manager or PIS department head?

AGENT: Manager is in a meeting. And PIS team doesn't take direct calls.

SUNITA: This is completely unacceptable! I have lost an investment opportunity because of your lack of communication.

AGENT: Ma'am, RBI guidelines are strict. We cannot bypass regulations.

SUNITA: I am not asking to bypass regulations! I am asking why you didn't notify me 2 weeks ago when the bank rejected it!

AGENT: I understand, but there's nothing I can do about past delays. Do you want me to email you the fresh PIS form?

SUNITA: Yes, email it. But I want an official explanation for why the rejection notification was delayed by 3 weeks.

AGENT: I will raise a internal query. Anything else?

SUNITA: What is the query reference number?

AGENT: Q-4410. You will get reply in 3-4 working days.

SUNITA: Okay. Good-bye.

AGENT: Bye. [Disconnects instantly]

─── END OF TRANSCRIPT ──────────────────────────────────────────

YOUR TASK: Provide a detailed transcript autopsy covering:
1. Identify all 8 communication & process errors committed by the agent.
2. Pinpoint the exact turning point where the call turned hostile.
3. Write the exact revised response for the agent to de-escalate Sunita and offer constructive solutions.
Minimum 200 words.` }"""

new_mc_topics = """,
      { id:'mc4', title:'Margin Call Penalty Dispute',
        scenario:'A high-volume corporate trader calls in a rage after receiving a ₹1.8 Lakh margin penalty. They claim the automated risk management system closed their position prematurely without sending a margin call alert. They threaten to move their ₹12 Crore portfolio to a competing broker unless the penalty is refunded today. Handle this 4-minute call.' },
      { id:'mc5', title:'Cross-Border Regulatory Freeze',
        scenario:'An NRI client based in London has their Demat account suddenly frozen due to pending FATCA re-declaration. They are currently travelling and unable to access their registered Indian mobile number for OTP verification. They need to liquidate ₹15 Lakhs for an emergency medical payment today. Handle this call.' }"""

new_fb_topics = """,
      { id:'fb4', title:'The Defiant Team Lead',
        scenario:'Vikram is a senior Team Lead who has refused to adopt the new automated audit workflow, calling it "bureaucratic micro-management." His team\'s audit compliance has dropped to 60%. Conduct a 1-on-1 feedback session — address his resistance directly while maintaining professional rapport.' },
      { id:'fb5', title:'The Over-Promising Manager',
        scenario:'Ananya, an Enterprise Relationship Manager, has been promising clients 2-hour SLA turnarounds when standard operations take 24 hours. This has resulted in 12 client escalations and severe stress for the backend operations team. Deliver direct, structured feedback on setting realistic client expectations.' }"""

new_eq_topics = """,
      { id:'eq3', title:'Multi-Front Operational Crisis',
        scenario:'It is 9:15 AM on a Monday. The primary order routing server crashes, 3 of your key team leads are absent due to food poisoning, and the Executive VP has called an unscheduled review in 15 minutes to ask about Q3 performance. Detail your emotional self-regulation strategy, immediate 15-minute action plan, and communication plan. (Min 150 words)' },
      { id:'eq4', title:'Public Peer Challenge',
        scenario:'During a monthly strategy meeting with senior leadership, a peer manager interrupts your presentation and says: "Honestly, your team\'s operational metrics look inflated. Ground reality is very different." Describe your immediate response, how you manage your physiological response, and your post-meeting resolution strategy. (Min 150 words)' }"""

css_files = [
    "/Users/girisha/Communication_assessment/js/manager-app.js",
    "/Users/girisha/Communication_assessment/clean_repository/js/manager-app.js",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/manager-app.js"
]

for target in css_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            code = f.read()

        # Inject into SCENARIOS
        if "id: 'sr4'" in code and "id: 'sr5'" not in code:
            code = code.replace("wrongResponse: `\"Kavya, hey — it's okay.", new_sr_topics + "\n      }\n    ],\n    'mgr-transcript-autopsy': [")
            # Clean duplicate bracket if needed
            code = re.sub(r" wrongResponse: `\"Kavya, hey — it's okay\.[^`]+`[ \t]*\n\s*\},?\n\s*\},\n\s*'mgr-transcript-autopsy'", " wrongResponse: `\"Kavya, hey — it's okay...\"`\n      }" + new_sr_topics + "\n    ],\n    'mgr-transcript-autopsy'", code)

        if "id:'ta2'" in code and "id:'ta3'" not in code:
            code = code.replace("Minimum 300 words.` }", "Minimum 300 words.` }" + new_ta_topics)

        if "id:'mc3'" in code and "id:'mc4'" not in code:
            code = code.replace("You have 4-5 minutes.' }", "You have 4-5 minutes.' }" + new_mc_topics)

        if "id:'fb3'" in code and "id:'fb4'" not in code:
            code = code.replace("approach.\"` }", "approach.\"` }" + new_fb_topics)

        if "id:'eq2'" in code and "id:'eq3'" not in code:
            code = code.replace("(Min 150 words)' }", "(Min 150 words)' }" + new_eq_topics)

        with open(target, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"Added manager topics to {target}")

