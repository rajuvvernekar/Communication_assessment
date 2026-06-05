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
        title: 'The Unexpected Resignation',
        scenario: `Your top performer, Vikram, has just walked into your office and quietly resigned — effective in 2 weeks. He handles 40% of your team's output. Peak season starts in 4 days. The rest of the team doesn't know yet. Your standup is in 20 minutes.\n\nVikram is sitting across from you, resignation letter on the desk. He looks uncomfortable but resolved. He's been with the team for 3 years and has always delivered.`,
        sectionAPrompt: 'Write the EXACT words you say to Vikram in the next 2–3 minutes — your immediate verbal response to him. Do not describe actions. Write what you actually say, word for word.',
        wrongResponse: `"Vikram, honestly I'm shocked. The timing couldn't be worse — we're literally going into peak season in 4 days and you're leaving us in an extremely difficult position. You know how much the team relies on you. Everyone is going to struggle. I need you to give me at least 4 weeks instead of 2 — is there any way you can do that? And can you tell me what we did wrong? Is it the salary? Because I may be able to do something about that if that's the issue."`,
      },
      {
        id: 'sr2',
        title: 'The Compliance Breach',
        scenario: `Your compliance lead has just informed you that two of your senior agents — Priya (3 years on the team) and Ravi (4 years) — bypassed the mandatory documentation protocol for 6 consecutive weeks to hit their monthly targets. This has caused 14 customer escalations that were falsely marked as resolved.\n\nYou've called them both into the meeting room. They don't know what it's about. They're both seated, looking at you.`,
        sectionAPrompt: 'Write the EXACT words you say to open this conversation. The next 60 seconds will determine whether this becomes a productive accountability conversation or a defensive standoff.',
        wrongResponse: `"Okay, I'll get straight to the point. What you two have done is a serious compliance violation and I am extremely disappointed in both of you. I honestly cannot believe that senior people on this team would do this. Compliance is already involved and so is HR — this could be a termination-level issue. I want both of you to tell me right now why you thought bypassing protocols for six weeks was acceptable. And I want the real reason, not excuses."`,
      },
      {
        id: 'sr3',
        title: 'The Public Recovery Presentation',
        scenario: `Your team missed Q3 target by 35% — the only team in the region to miss by double digits. Your Regional Director has called an unscheduled all-hands. There are 15 people in the room: 3 other team managers, their leads, and your own team members.\n\nThe Regional Director has just said directly to you: "Your team is the only one that missed by double digits this quarter. Walk us through what happened and what you plan to do about it."\n\nAll eyes are on you. You have 90 seconds.`,
        sectionAPrompt: 'Write the EXACT words of your response — what you say in the next 60–90 seconds in front of the room.',
        wrongResponse: `"The targets this quarter were honestly set above realistic market benchmarks — I've been raising this concern since July. My team also faced significant headwinds: the product changes in August disrupted our workflow for nearly 3 weeks, and we didn't receive the resource support that was committed to us. I take responsibility in the sense that I should have escalated more aggressively earlier. But the structural issues here are systemic and beyond any individual team's control. I do have a 60-day recovery plan ready to present."`,
      },
      {
        id: 'sr4',
        title: 'The Breakdown in the Team Meeting',
        scenario: `You are running the weekly team standup — 12 people on a video call. Mid-meeting, Kavya — a reliable, mid-level team member — suddenly says:\n\n"I'm sorry. I just can't. I can't do this anymore. I am completely overwhelmed and I feel like nothing I do is ever enough."\n\nShe looks close to tears. Everyone else has gone silent. There is a 5-second pause. The whole team is watching you.`,
        sectionAPrompt: 'Write the EXACT words you say in the next 30 seconds — with the full team watching. What you say here determines both Kavya\'s trust in you and how safe every other team member feels.',
        wrongResponse: `"Kavya, hey — it's okay. I think we can all relate to feeling a bit overwhelmed sometimes, it's been a tough quarter for everyone. Why don't we take a quick 5-minute break and come back? And Kavya, maybe we can connect after the call and have a chat about what's going on — I'm sure it'll look a lot better once you've had a bit of a rest. Alright team, 5-minute break, and then we'll pick up from slide 7."`,
      },
    ],
    'mgr-transcript-autopsy': [
      { id:'ta1', title:'SIP Debit With No Unit Allotment — 22 Min Call',
        scenario:`BACKGROUND: Preethi Mehta is calling Zerodha support for the third time about her SIP not being processed. The ₹10,000 monthly SIP was debited from her bank on the 2nd but units were never allotted. She raised ticket TKT-88244 three weeks ago — it was marked "resolved" without any resolution. This is a critical coaching opportunity with 8+ identifiable mistakes.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hello, Zerodha support, how can I help?

PREETHI: Hi, my name is Preethi Mehta. I have been calling for three weeks about my SIP. My ₹10,000 was debited on the 2nd of this month but I haven't received any units. I also raised a ticket — TKT-88244 — and nobody has contacted me. This money is—

AGENT: Can I have your account number please?

PREETHI: It's XJ7743-21. As I was saying, this money is meant for my daughter's education fund and—

AGENT: And your name?

PREETHI: I just said — Preethi Mehta. I also gave you the ticket number. Can someone please—

AGENT: One moment. [28-second silence with no explanation] Okay. What is the issue exactly?

PREETHI: I just explained. My SIP was debited but I have no units. Ticket TKT-88244. It has been three weeks.

AGENT: Okay. Which fund?

PREETHI: Axis Bluechip Fund — Direct Growth.

AGENT: And the amount?

PREETHI: ₹10,000. I said that already.

AGENT: Hold please. [Puts customer on hold without asking — silence for 3 min 12 sec]

AGENT: Hello? Are you there?

PREETHI: Yes, I have been waiting. What did you find?

AGENT: So the debit went through on the 2nd. The units take 5 to 7 working days to be allotted.

PREETHI: It has been twenty-one days. That is not 5 to 7 working days by any calculation.

AGENT: Sometimes there are delays at the fund house end.

PREETHI: Can you confirm whether units have actually been allotted or not?

AGENT: I am checking. [42-second silence] I need to check with the back-end team. Please hold. [Second hold without asking — 4 min 48 sec]

AGENT: Hello? Still there?

PREETHI: Barely. What is happening?

AGENT: So there was a NACH mandate rejection.

PREETHI: What is that? Why was I never told this? And my money was still debited!

AGENT: It means the automatic payment instruction was rejected. But your bank released the funds separately.

PREETHI: So where is my ₹10,000 right now?

AGENT: It should get reversed to your bank account.

PREETHI: Should? You are not sure? This is money for my daughter's education. If it is sitting somewhere in limbo—

AGENT: It will come back. These things take some time.

PREETHI: How much time? I need a specific answer.

AGENT: Around 7 to 10 days.

PREETHI: From today or from the 2nd?

AGENT: From when the reversal is processed. I cannot tell you the exact date.

PREETHI: Can I speak to a senior? I want this escalated.

AGENT: I will need to raise a new ticket. I cannot transfer you directly to a supervisor.

PREETHI: What happened to TKT-88244?

AGENT: Let me check. [23-second silence] It was marked resolved on the 9th.

PREETHI: Resolved? Nobody called me! Nothing was resolved! Who marked it resolved?

AGENT: I am not able to see who updated it. These things happen sometimes.

PREETHI: That is not acceptable. This is the third call I am making. I want a supervisor.

AGENT: I understand your frustration. I will raise a high-priority ticket and someone will call back within 48 hours.

PREETHI: 48 hours? I have been waiting three weeks. I need this resolved today.

AGENT: I am sorry, same-day resolution is not possible from my end.

PREETHI: What can you actually guarantee me right now?

AGENT: I will mark it high priority.

PREETHI: What is the new ticket number?

AGENT: [15-second silence] TKT-99501.

PREETHI: What exactly are you documenting in this ticket?

AGENT: SIP debit with no unit allotment, customer requesting callback.

PREETHI: Have you noted the NACH rejection? The three-week history? The fact that the previous ticket was falsely marked resolved?

AGENT: I can add that. [38-second silence] Done.

PREETHI: I would also like written confirmation of this call — can I get an email?

AGENT: We do not send email confirmations from calls.

PREETHI: The last ticket showed as resolved in the app and nothing was done. How do I verify anything?

AGENT: The callback will happen within 48 hours. That is the process.

PREETHI: Can I at least have your employee ID and your name so I can reference this call?

AGENT: My name is Aryan. I do not have an employee ID to share.

PREETHI: A call reference number?

AGENT: TKT-99501 is your reference.

PREETHI: Is there anything else that can actually be done right now?

AGENT: No. We have to wait for the back-end team.

PREETHI: Alright. [6-second silence — customer waits for agent to formally close the call]

AGENT: Have a nice day. [Disconnects without checking if customer has anything else]

─── END OF TRANSCRIPT ──────────────────────────────────────────

YOUR TASK: Write a structured coaching report for this call. Identify a minimum of 6 specific coaching opportunities. For each:
(a) Quote the exact moment from the transcript
(b) Explain the impact it had on the customer experience
(c) Write a specific improved response or action the agent should have taken

Also provide: one "what the agent did well" observation (if any), and a 3-priority action plan for this agent's development.

Minimum 250 words.` },
      { id:'ta2', title:'Mutual Fund Redemption Blocked — 26 Min Call',
        scenario:`BACKGROUND: Vikram Shetty called to redeem ₹2,50,000 from his liquid fund after an emergency medical need. The redemption request was placed 45 days ago and has still not been credited. He has called 4 times and received different explanations each time. This transcript contains 9+ coaching opportunities across multiple skill areas.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hi, support, tell me your problem.

VIKRAM: Good morning. My name is Vikram Shetty. I placed a redemption request 45 days ago for ₹2,50,000 from my Zerodha Coin liquid fund. The money has still not hit my bank account. This is extremely urgent — I needed this for a medical emergency and I have been borrowing from relatives in the meantime.

AGENT: What is your account?

VIKRAM: ZC-4421-88. The redemption request number is RED-20240813-7741. I have called four times already. Each time I get a different explanation.

AGENT: Let me pull up your account. [1 min 34 sec silence — no explanation given to customer]

AGENT: Okay I see it.

VIKRAM: Great. What is the status of RED-20240813-7741?

AGENT: It looks like there might be a KYC issue.

VIKRAM: A KYC issue? I have been investing on Zerodha for six years. My KYC was verified when I opened the account. Why would it be an issue now?

AGENT: Sometimes the KYC needs to be re-verified.

VIKRAM: Is it a KYC issue or not? Can you check specifically?

AGENT: I am checking. Actually, hold on. [Puts on hold without informing — 2 min 50 sec]

AGENT: So actually the issue might be a bank mandate problem. Your bank details may not be updated.

VIKRAM: My bank details? I have been receiving dividends in this same account for years. The IFSC is the same. Nothing has changed.

AGENT: Let me verify. [27-second silence] Yes, the bank account on record ends in 4821. Is that correct?

VIKRAM: Yes. That is my SBI savings account. The same account I have always used.

AGENT: Then it is not a bank issue.

VIKRAM: Then what is it? First you said KYC, then bank mandate. Now neither?

AGENT: It may be a technical issue from the fund house side.

VIKRAM: Okay. What is being done about it?

AGENT: I will raise a ticket.

VIKRAM: There are already three tickets raised. TKT-11234, TKT-11509, and TKT-11788. What happened to those?

AGENT: I can see TKT-11234. [Silence] I don't see the others.

VIKRAM: How can you not see them? They were raised by your colleagues on previous calls. Are tickets being deleted?

AGENT: I am sure they are there somewhere. The system is slow today.

VIKRAM: In one of my previous calls I was told the money would be credited in 3 to 5 working days. That was six weeks ago.

AGENT: I understand that is frustrating but I cannot speak to what my colleagues said.

VIKRAM: What can you tell me? When will my ₹2,50,000 reach my bank account?

AGENT: I honestly cannot give you a confirmed date.

VIKRAM: Honestly? My family has been borrowing money for 45 days because of this. Is there any escalation option?

AGENT: I can mark this as urgent and escalate to the senior team.

VIKRAM: When will they respond?

AGENT: Usually 24 to 48 working hours.

VIKRAM: You mean 24 to 48 hours or 24 to 48 working hours? Those are very different.

AGENT: [Pause] Working hours.

VIKRAM: So potentially 6 business days more?

AGENT: Hopefully less.

VIKRAM: Hopefully. Can I speak to a supervisor right now?

AGENT: Supervisors are not available to take calls directly. They respond through tickets.

VIKRAM: In 45 days, not a single supervisor could call me back?

AGENT: I understand this has been a long wait.

VIKRAM: What is the escalation I can file? Is there a grievance process?

AGENT: You can write to our grievance email.

VIKRAM: What is that email?

AGENT: [12-second silence] I believe it is support@zerodha.com but I am not 100% certain.

VIKRAM: You are not certain of your own company's grievance email?

AGENT: Let me check. [22-second silence] Yes, support@zerodha.com.

VIKRAM: That is the same general support email. Is there a specific grievance officer?

AGENT: I can note your concern.

VIKRAM: I have been noting concerns for 45 days. I want a name, a designation, a direct contact for someone who will take ownership of this.

AGENT: I will escalate this to the senior team with highest priority. I am really sorry for the trouble.

VIKRAM: What is your name?

AGENT: Deepika.

VIKRAM: Employee ID?

AGENT: I am not supposed to share that.

VIKRAM: Ticket number for this call?

AGENT: TKT-11901.

VIKRAM: And what is written in the ticket?

AGENT: Customer facing delay in redemption credit. High priority escalation requested.

VIKRAM: Please also note: this is the fifth call, three previous tickets unresolved, customer has a medical emergency, and the amount is ₹2,50,000 outstanding for 45 days.

AGENT: I have noted that.

VIKRAM: Is there anything — anything at all — that can be done today?

AGENT: Unfortunately the actual credit is handled by the fund house and the banking system. We cannot manually push the transaction.

VIKRAM: That is your answer after 45 days?

AGENT: I am sorry. The escalation will be the fastest path forward.

VIKRAM: Fine. [Silence]

AGENT: Is there anything else I can help you with?

VIKRAM: No.

AGENT: Thank you for calling Zerodha. Have a wonderful day. [Disconnects]

─── END OF TRANSCRIPT ──────────────────────────────────────────

YOUR TASK: Write a full coaching analysis for this 26-minute call. Identify a minimum of 8 coaching opportunities — including at least one each from: Call Opening, Information Verification, Hold Procedure, Empathy, Problem Ownership, Escalation Process, and Call Closing. For each opportunity:
(a) Cite the exact transcript moment
(b) Identify which communication/service standard was violated
(c) Write the improved response the agent should have delivered

End with a "Development Priority Matrix" — rate the agent on 5 dimensions from 1 (critical gap) to 5 (competent), and identify the top 2 immediate training priorities.

Minimum 300 words.` },
    ],
    'mgr-mock-call': [
      { id:'mc1', title:'C-Suite Escalation',
        scenario:'You are on a call with the VP Operations of your biggest client. Three major deliverables were missed this quarter due to internal resourcing issues. The VP is furious and says:\n\n"I have been patient enough. We pay premium rates for a premium service and we are getting junior-level delivery. I am reviewing this contract tomorrow. Give me ONE reason why we should continue with you."\n\nHandle this call professionally. You have 4-5 minutes.' },
      { id:'mc2', title:'Contract at Risk',
        scenario:'A key enterprise client worth ₹45 crores annually is on the line. Their procurement head says:\n\n"We have been getting better proposals from two other vendors. Our leadership is already leaning towards switching. Your team has been reactive, not proactive. I\'m giving you this call as a courtesy — convince me why we should stay."\n\nHandle this retention conversation. You have 4-5 minutes.' },
      { id:'mc3', title:'Performance Review Call',
        scenario:'You are conducting a formal performance review call with a team member who has missed targets for 2 consecutive months. They begin defensively:\n\n"I know the numbers don\'t look good but these targets are unrealistic. The leads I\'m getting are poor quality and the product team keeps changing things without warning us. I\'m not the problem here."\n\nConduct a structured, empathetic but direct performance conversation. You have 4-5 minutes.' },
    ],
    'mgr-feedback': [
      { id:'fb1', title:'The Burnout Star',
        scenario:'Rahul is your best performer — always exceeds targets. For the last 3 weeks he has been arriving late, missing standups, and giving short, impatient responses to teammates. His output has dropped 20%.\n\nYou have called him in for a one-on-one. Conduct a structured feedback conversation — be empathetic but clear about the impact of his behaviour.' },
      { id:'fb2', title:'The Struggling New Hire',
        scenario:'Priya joined 8 weeks ago. She is technically capable but struggles with customer-facing communication — often comes across as too blunt. Two customers have complained. Her teammates are starting to pick up her slack.\n\nConduct a supportive performance conversation — be honest about the impact while keeping her engaged and confident.' },
      { id:'fb3', title:'The Dismissive Senior',
        scenario:'Arjun has 5 years of experience and is technically your best agent. However, he consistently dismisses new processes, is condescending to newer team members in public, and says "we\'ve always done it this way."\n\nGive Arjun clear, direct feedback on his behaviour and its impact on team culture.' },
    ],
    'mgr-eq': [
      { id:'eq1', title:'In-the-Moment Crisis',
        scenario:'During a team meeting, a team member suddenly becomes visibly distressed and says: "I\'m sorry, I can\'t do this anymore. I am completely overwhelmed. Everything is falling apart."\n\nThe rest of the team is watching.\n\nWrite your response: What do you say and do in the next 5 minutes? What actions do you take in the 24 hours after? How do you handle the rest of the team? (Min 150 words)' },
      { id:'eq2', title:'The Public Undermining',
        scenario:'In a leadership review meeting attended by 15 people including your team, a peer manager says: "I think the numbers from [your team] are a bit misleading — they\'re hitting targets but the quality issues tell a different story. Maybe the management style needs a rethink."\n\nWrite your response: How do you handle this in the moment without escalating? What do you do afterwards with the peer, your team, and leadership? What does this situation tell you about your own emotional regulation? (Min 150 words)' },
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
      name: 'Rahul',
      gender: 'male',
      opening: "You wanted to see me? I do have a client follow-up in about 20 minutes, so hopefully we can keep this quick.",
      persona: "You are Rahul — a high-performing sales agent whose engagement has recently dropped. You've been coming in late, missing standups, and being short with teammates, though your numbers are still okay. You're initially defensive and downplay the issues, feeling that results are what matter. If the manager is empathetic and asks open questions, you gradually reveal you're burnt out and dealing with a personal matter at home. If they push hard without empathy, you shut down further. You genuinely respect the manager if they handle this with care."
    },
    'fb2': {
      name: 'Priya',
      gender: 'female',
      opening: "Hi... is everything okay? I got a bit worried when you asked to meet privately. Am I in trouble?",
      persona: "You are Priya — a new hire (8 weeks in) who is eager but unknowingly comes across as too blunt with customers. You're nervous and genuinely want to do well. You don't fully understand what you're doing wrong yet — you think being direct is professional. If the manager gives specific examples, you have an 'aha' moment and become receptive. You ask clarifying questions and apologize sincerely when you understand the impact. You're a fast learner who just needs the right framing."
    },
    'fb3': {
      name: 'Arjun',
      gender: 'male',
      opening: "Sure. If this is about the new CRM rollout — I've already told the team it's not built for the volume we handle. Just being upfront.",
      persona: "You are Arjun — a 5-year senior agent who is technically excellent but dismissive of change and condescending toward junior staff. You believe your seniority earns you flexibility. You're confident, direct, and initially resistant — you'll push back with logic ('but results are still good'). If the manager is firm, specific about the impact on team culture and gives you concrete examples, you'll reluctantly respect it and shift. If they're vague or soft, you'll dismiss them entirely and feel validated in your approach."
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
    'mgr-eq':                { label: 'Emotional Intelligence', type: 'written',    icon: '🧠', minWords: 150 },
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
    const empId = $('mgr-auth-empid').value.trim();
    const errEl = $('mgr-auth-error');

    if (!name || !empId) {
      errEl.textContent = 'Please enter your name and Employee ID.';
      errEl.classList.remove('hidden'); return;
    }
    errEl.classList.add('hidden');

    const password = empId.toLowerCase() + '2024';
    const btn = $('btn-mgr-start');
    btn.disabled = true; btn.textContent = 'Signing in...';

    try {
      let user;
      try { user = await Auth.signIn(empId, password); }
      catch (signInErr) {
        const result = await Auth.signUp(empId, name, password);
        if (result && result.needsConfirmation) {
          errEl.textContent = 'Please disable email confirmation in Supabase Auth settings.';
          errEl.classList.remove('hidden'); return;
        }
        user = result;
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
    $('mgr-auth-name').value = ''; $('mgr-auth-empid').value = '';
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

    $('mgr-prep-phase').classList.remove('hidden');
    $('mgr-record-phase').classList.add('hidden');
    $('mgr-live-transcript').innerHTML = '<span class="placeholder">Your speech will appear here in real time...</span>';

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

  // ── Situation Room — Two-section assessment ─────────────

  function _launchSituationRoom() {
    const pool = SCENARIOS['mgr-situation-room'];
    _currentScenario = { ...pickRandom(pool), _hardcoded: true };
    _sr = { phase: 'A', sectionAText: '', sectionAScores: null };

    // Populate Section A UI
    $('sr-topic-title-a').textContent  = _currentScenario.title;
    $('sr-scenario-text-a').textContent = _currentScenario.scenario;
    $('sr-a-prompt').textContent        = _currentScenario.sectionAPrompt || 'Write your exact verbal response';

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

    try {
      if (typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
        _sr.sectionAScores = await ClaudeEvaluator.evaluateSituationRoomA(
          _currentScenario.scenario, text
        );
      } else {
        _sr.sectionAScores = { toneEmpathy: 3, ownershipLanguage: 3, avoidedRiskyLanguage: 3, whatNotToSay: '', strength: '', improvement: '' };
      }
    } catch (e) {
      console.warn('SR-A eval failed:', e.message);
      _sr.sectionAScores = { toneEmpathy: 3, ownershipLanguage: 3, avoidedRiskyLanguage: 3, whatNotToSay: '', strength: '', improvement: '' };
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

    let sectionBScores = { errorIdentification: 3, impactExplanation: 3, rewriteQuality: 3, keyMissed: '', rewriteFeedback: '' };
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

    // Combined overall
    const sa = _sr.sectionAScores || { toneEmpathy: 3, ownershipLanguage: 3, avoidedRiskyLanguage: 3 };
    const allVals = [sa.toneEmpathy, sa.ownershipLanguage, sa.avoidedRiskyLanguage,
                     sectionBScores.errorIdentification, sectionBScores.impactExplanation, sectionBScores.rewriteQuality]
                   .filter(v => v != null);
    const overall = allVals.length
      ? parseFloat(((allVals.reduce((a, b) => a + b, 0) / (allVals.length * 5)) * 100).toFixed(1))
      : 0;

    const aiScores = {
      overall,
      sectionA: sa,
      sectionB: sectionBScores,
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

    showScreen('mgr-screen-feedback');
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
          fullTranscript, _currentScenario.scenario || _currentScenario.title || ''
        );
        aiScores = {
          ...result.scores,
          overall:   result.overall,
          _reasons:  result.reasons,
          _method:   'mgr-feedback-params',
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
          overall: result.overall,
          _reasons: result.reasons,
          _method: 'claude-mgr-strict',
          _module: _currentModule,
          wordCount: wordCount,
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
  function _showResult(aiScores, type) {
    const meta = MODULE_META[_currentModule];

    if (type === 'mcq') {
      $('mgr-result-subtitle').textContent = `Listening & Tone — ${aiScores.correct}/${aiScores.total} correct`;
      $('mgr-result-score').textContent = `${aiScores.overall}%`;
      $('mgr-score-grid').innerHTML = `
        <div class="mgr-score-item"><div class="label">Correct Answers</div><div class="val">${aiScores.correct} / ${aiScores.total}</div></div>
        <div class="mgr-score-item"><div class="label">Score</div><div class="val">${aiScores.overall}%</div></div>`;
    } else if (type === 'written') {
      $('mgr-result-subtitle').textContent = `${meta.label} — response evaluated`;
      $('mgr-result-score').textContent = `${aiScores.overall}%`;
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
    } else if (type === 'feedback-ai') {
      const emp = FB_EMPLOYEES[_currentScenario.id] || FB_EMPLOYEES['fb1'];
      $('mgr-result-subtitle').textContent = `Feedback Conversation with ${emp.name} — ${_fb.history.length} exchange(s)`;
      $('mgr-result-score').textContent = aiScores.overall != null ? `${aiScores.overall}%` : '—';
      const isParams = aiScores._method === 'mgr-feedback-params';
      if (isParams) {
        const paramRows = [
          ['Emotional Control',   aiScores.emotionalControl],
          ['Empathy',             aiScores.empathy],
          ['Listening',           aiScores.listening],
          ['Coaching Style',      aiScores.coachingStyle],
          ['Conflict Handling',   aiScores.conflictHandling],
          ['Leadership Presence', aiScores.leadershipPresence],
          ['Team Support',        aiScores.teamSupport],
          ['Communication',       aiScores.communication],
        ];
        $('mgr-score-grid').innerHTML = paramRows.map(([label, val]) =>
          `<div class="mgr-score-item"><div class="label">${label}</div><div class="val">${val != null ? val + '/5' : '—'}</div></div>`
        ).join('');
      } else {
        $('mgr-score-grid').innerHTML = `<div class="mgr-score-item"><div class="label">Exchanges</div><div class="val">${_fb.history.length} turns</div></div>`;
      }
    } else if (type === 'situation-room') {
      const sa = aiScores.sectionA || {};
      const sb = aiScores.sectionB || {};
      $('mgr-result-subtitle').textContent = `Situation Room — ${_currentScenario ? _currentScenario.title : 'Assessment complete'}`;
      $('mgr-result-score').textContent = `${aiScores.overall}%`;
      $('mgr-score-grid').innerHTML = `
        <div class="mgr-score-item sr-section-a-item"><div class="label">A — Tone &amp; Empathy</div><div class="val">${sa.toneEmpathy ?? '—'}/5</div></div>
        <div class="mgr-score-item sr-section-a-item"><div class="label">A — Ownership Language</div><div class="val">${sa.ownershipLanguage ?? '—'}/5</div></div>
        <div class="mgr-score-item sr-section-a-item"><div class="label">A — Avoided Risky Language</div><div class="val">${sa.avoidedRiskyLanguage ?? '—'}/5</div></div>
        <div class="mgr-score-item sr-section-b-item"><div class="label">B — Error Identification</div><div class="val">${sb.errorIdentification ?? '—'}/5</div></div>
        <div class="mgr-score-item sr-section-b-item"><div class="label">B — Impact Explanation</div><div class="val">${sb.impactExplanation ?? '—'}/5</div></div>
        <div class="mgr-score-item sr-section-b-item"><div class="label">B — Rewrite Quality</div><div class="val">${sb.rewriteQuality ?? '—'}/5</div></div>`;

      // AI feedback panel
      const feedbackEl = $('mgr-sr-ai-feedback');
      if (feedbackEl) {
        const items = [];
        if (sa.whatNotToSay && !/clean/i.test(sa.whatNotToSay)) {
          items.push(`<div class="sr-fb-item sr-fb-warn"><strong>⚠ What Not to Say (A):</strong> ${sa.whatNotToSay}</div>`);
        }
        if (sa.strength) {
          items.push(`<div class="sr-fb-item sr-fb-good"><strong>✓ Strength (A):</strong> ${sa.strength}</div>`);
        }
        if (sa.improvement) {
          items.push(`<div class="sr-fb-item sr-fb-info"><strong>💡 Priority Improvement (A):</strong> ${sa.improvement}</div>`);
        }
        if (sb.keyMissed && !/all key/i.test(sb.keyMissed)) {
          items.push(`<div class="sr-fb-item sr-fb-warn"><strong>📝 Missed Error (B):</strong> ${sb.keyMissed}</div>`);
        }
        if (sb.rewriteFeedback && !/strong/i.test(sb.rewriteFeedback)) {
          items.push(`<div class="sr-fb-item sr-fb-info"><strong>✍ Rewrite Feedback (B):</strong> ${sb.rewriteFeedback}</div>`);
        }
        feedbackEl.innerHTML = items.join('');
        feedbackEl.classList.toggle('hidden', items.length === 0);
      }
    } else {
      // audio (Mock Call only now — Situation Room moved to written)
      $('mgr-result-subtitle').textContent = `${meta.label} — speech evaluated`;
      $('mgr-result-score').textContent = aiScores.overall != null ? `${aiScores.overall}%` : '—';
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
    _recordingPromise = null;
    _fb.blobPromise   = null;
    showScreen('mgr-screen-modules');
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    await DB.init();
    const user = await Auth.init();
    if (user && Auth.isLoggedIn()) _showLoggedInUI();
    else showScreen('mgr-screen-welcome');
    _bindEvents();
  }

  function _bindEvents() {
    // Auth
    const btnStart = $('btn-mgr-start');
    if (btnStart) btnStart.addEventListener('click', login);
    [$('mgr-auth-name'), $('mgr-auth-empid')].forEach(inp => {
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

document.addEventListener('DOMContentLoaded', () => MgrApp.init());
