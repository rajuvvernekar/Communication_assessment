'use strict';

// ============================================================
//  CommAssess — Database Layer (Supabase)
//  Drop-in replacement for the old IndexedDB-based DB module.
//  The public API (init, get, getAll, put, del, getByIndex)
//  is identical so the rest of the app needs minimal changes.
// ============================================================

const DB = (() => {
  let _sb = null; // Supabase client instance

  // ---- camelCase ↔ snake_case field maps ----
  const SESSION_MAP = {
    traineeId:      'trainee_id',
    traineeName:    'trainee_name',
    traineeEmail:   'trainee_email',
    topicId:        'topic_id',
    topicTitle:     'topic_title',
    aiScores:       'ai_scores',
    adminScores:    'admin_scores',
    adminComment:   'admin_comment',
    timeTaken:      'time_taken',
    submittedAt:    'submitted_at',
    writtenText:    'written_text',
    recordingUrl:   'recording_url',
  };
  const TOPIC_MAP = {
    callerAudioUrl: 'caller_audio_url',
    botScript:      'bot_script',
    createdAt:      'created_at',
  };
  // Exact column names that exist in the 'topics' table.
  // ONLY these make it through to PostgREST — any other key (from stale cached JS etc.) is silently dropped.
  const TOPIC_COLUMNS = new Set(['id', 'module', 'title', 'description', 'scenario', 'checklist', 'bot_script', 'caller_audio_url', 'created_at', 'enabled']);
  const AI_AUDIT_MAP = {
    selfAssessmentScore: 'self_assessment_score',
    aiAuditScore:        'ai_audit_score',
    createdAt:           'created_at',
  };

  // Convert app camelCase → DB snake_case (for saves)
  function _toDB(store, data) {
    const map = store === 'sessions'        ? SESSION_MAP
              : store === 'topics'           ? TOPIC_MAP
              : store === 'ai_audit_scores' ? AI_AUDIT_MAP
              : {};
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      // Skip raw blobs — handled separately via Storage upload
      if (k === 'recordingBlob' || k === 'callerAudioBlob') continue;
      const col = map[k] || k;
      // For topics: whitelist-only — drop any key that isn't a known DB column.
      // This protects against stale cached JS sending unknown fields (e.g. botScriptAudio)
      // regardless of which version of admin.js the browser has loaded.
      if (store === 'topics' && !TOPIC_COLUMNS.has(col)) continue;
      out[col] = v;
    }
    return out;
  }

  // Convert DB snake_case → app camelCase (for reads)
  function _fromDB(store, row) {
    if (!row) return null;
    const reverseMap = store === 'sessions'
      ? Object.fromEntries(Object.entries(SESSION_MAP).map(([c, s]) => [s, c]))
      : store === 'topics'
        ? Object.fromEntries(Object.entries(TOPIC_MAP).map(([c, s]) => [s, c]))
        : store === 'ai_audit_scores'
          ? Object.fromEntries(Object.entries(AI_AUDIT_MAP).map(([c, s]) => [s, c]))
          : {};
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[reverseMap[k] || k] = v;
    }
    // Compatibility shims: old code checks .recordingBlob / .callerAudioBlob
    if (store === 'sessions') out.recordingBlob = null;
    if (store === 'topics')   out.callerAudioBlob = null;
    // Split bot_script: detect [{text,audioUrl}] (new) vs plain strings (old)
    if (store === 'topics' && Array.isArray(out.botScript)) {
      const items = out.botScript;
      if (items.length > 0 && items[0] !== null && typeof items[0] === 'object') {
        out.botScript      = items.map(s => (s && s.text)     ? s.text     : String(s));
        out.botScriptAudio = items.map(s => (s && s.audioUrl) ? s.audioUrl : null);
      } else {
        out.botScriptAudio = items.map(() => null);
      }
    } else if (store === 'topics') {
      out.botScriptAudio = [];
    }
    return out;
  }

  // ---- Upload a Blob to Supabase Storage → return public URL ----
  // `folder` is an optional subfolder prefix (e.g. 'caller-audio', 'recordings', 'bot-script')
  async function _upload(bucket, blob, folder) {
    // Determine best extension + content-type from blob.type
    const mimeType  = blob.type || 'audio/webm';
    const ext       = mimeType.includes('webm') ? 'webm'
                    : mimeType.includes('mp4')  ? 'mp4'
                    : mimeType.includes('ogg')  ? 'ogg'
                    : mimeType.includes('wav')  ? 'wav'
                    : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
                    : 'webm'; // always default to webm, never 'bin'
    const filename  = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path      = folder ? `${folder}/${filename}` : filename;
    const { error } = await _sb.storage.from(bucket).upload(path, blob, { contentType: mimeType });
    if (error) throw error;
    const { data } = _sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  // ---- Public: initialise Supabase client ----
  async function init() {
    _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    await _seedDefaults();
    await _seedManagerTopics();
  }

  // ---- Seed default topics on first run ----
  async function _seedDefaults() {
    try {
      const { count } = await _sb.from('topics').select('*', { count: 'exact', head: true });
      if (count > 0) return; // already seeded

      const defaults = [
        // Pick & Speak — General
        { module: 'pick-speak-general', title: 'Work from Home',              description: 'Discuss the advantages and challenges of working from home in today\'s corporate world.',                                       scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-general', title: 'Time Management',             description: 'How do you prioritize tasks and manage your time effectively at work? Share practical techniques.',                              scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-general', title: 'Leadership vs Management',    description: 'What is the difference between a leader and a manager? Can one person be both? Give examples.',                                 scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-general', title: 'Customer First Culture',      description: 'What does "putting the customer first" mean in practice? Share examples from your experience.',                                 scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-general', title: 'Effective Team Collaboration',description: 'Describe how effective team collaboration leads to better outcomes. What makes a great team?',                                   scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-general', title: 'Handling Workplace Conflicts',description: 'How do you handle disagreements or conflicts in a professional setting? Walk us through your approach.',                         scenario: '', checklist: [], enabled: true },
        // Pick & Speak — Stock Market
        { module: 'pick-speak-stock', title: 'Bull vs Bear Market',           description: 'Explain the difference between a bull and a bear market. How should an investor adjust their strategy in each phase?',          scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-stock', title: 'Importance of Diversification', description: 'Why is diversification considered a cornerstone of investing? Explain with examples of asset classes.',                         scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-stock', title: 'Index Funds vs Active Investing',description: 'Compare index fund investing with actively managed funds. What are the pros and cons of each approach?',                       scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-stock', title: 'How to Read a Stock Chart',     description: 'Walk through the basics of reading a stock chart — price trends, volume, and key indicators like moving averages.',             scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-stock', title: 'Managing Market Volatility',    description: 'How should a long-term investor think about and respond to short-term market volatility? Share your approach.',                  scenario: '', checklist: [], enabled: true },
        { module: 'pick-speak-stock', title: 'Fundamental vs Technical Analysis', description: 'What is the difference between fundamental and technical analysis? Which do you rely on more, and why?',                    scenario: '', checklist: [], enabled: true },
        // Mock Call
        { module: 'mock-call', title: 'Angry Customer – Double Billing',
          description: 'A customer calls furious about being charged twice for the same service.',
          scenario: 'You receive an inbound support call. The customer says: "I\'ve been charged TWICE this month and nobody is helping me! This is completely unacceptable — I want my money back NOW!"',
          checklist: ['Greet professionally and introduce yourself','Acknowledge the frustration with empathy','Verify the account details calmly','Offer a clear resolution or escalation path','Close the call warmly and professionally'] },
        { module: 'mock-call', title: 'Service Outage – Status Call',
          description: 'Customer has had a 2-day service outage and wants a status update and compensation.',
          scenario: 'Customer says: "My internet has been down for 2 days straight. I work from home — this is costing me real clients and money. What exactly are you doing about it, and what compensation am I getting?"',
          checklist: ['Show genuine empathy for the business impact','Provide an honest and accurate status update','Offer a practical interim workaround if possible','Set realistic expectations on resolution timeline','Make a clear follow-up commitment'] },
        // Role Play
        { module: 'role-play', title: 'Addressing a Consistently Late Team Member',
          description: 'You are a team lead. A team member consistently misses deadlines.',
          scenario: 'You\'ve called your team member for a private meeting. They\'re defensive and blaming their workload. Role-play your side of the conversation.',
          checklist: ['Stay calm and professional throughout','Use specific, recent examples of the behavior','Listen actively to their perspective','Agree on a concrete, measurable action plan','Offer support and schedule a follow-up'] },
        { module: 'role-play', title: 'Client Raises Pricing & Timeline Objections',
          description: 'You\'re presenting a proposal to a key client who raises objections about pricing and timeline.',
          scenario: 'Client says: "Your pricing is 30% above other vendors we\'ve spoken to, and your timeline feels too conservative. Why should we choose you over cheaper, faster alternatives?"',
          checklist: ['Acknowledge concerns without becoming defensive','Clearly explain the value behind the pricing','Differentiate from competitors with specifics','Offer flexible alternatives or compromises','Maintain a collaborative, relationship-first tone'] },
        // Group Discussion
        { module: 'group-discussion', title: 'AI in the Workplace',
          description: 'Is AI a threat to jobs or an opportunity for growth?',
          scenario: 'You are in a panel of senior managers discussing the company\'s AI strategy. Present your viewpoint clearly.',
          checklist: ['State your position clearly at the start','Support your argument with concrete examples or data','Acknowledge and engage with opposing viewpoints','Ask at least one meaningful question','Help the group move toward a conclusion'] },
        { module: 'group-discussion', title: 'Remote vs Office Work – Future Policy',
          description: 'Should companies mandate office attendance, allow full flexibility, or implement a structured hybrid model?',
          scenario: 'You are senior stakeholders deciding your company\'s 5-year work policy. Discuss and arrive at a recommendation.',
          checklist: ['Present data-backed, well-reasoned arguments','Consider both employee wellbeing and business impact','Engage constructively with opposing views','Show leadership in moving the discussion forward','Synthesize key points and help close the discussion'] },
        // Written Communication
        { module: 'written-comm', title: 'Project Delay Notification Email',
          description: 'Inform a client that a project will be delayed by 2 weeks due to unexpected technical issues.',
          scenario: 'To: Client (Sarah Mitchell, TechCorp)\nFrom: You\nSubject: [Write your own subject line]\n\nContext: The project was due this Friday. A critical API dependency failed late last week. The revised delivery date is 2 weeks from now.',
          checklist: ['Professional and honest subject line','Warm and professional greeting','Clear explanation without over-justifying','Revised timeline with a firm commitment','Apology that acknowledges impact on the client','Professional closing with next steps'] },
        { module: 'written-comm', title: 'Internal Escalation Memo',
          description: 'Write an internal memo escalating a recurring vendor delivery issue.',
          scenario: 'To: Your Manager (Rajesh Kumar, VP Operations)\nFrom: You\nSubject: [Write your own subject line]\n\nContext: Vendor X has missed 3 consecutive weekly deliveries. Each delay causes a 1-2 day productivity loss for your 5-person team.',
          checklist: ['Clear problem statement in the opening line','Quantified impact (time, people, cost if applicable)','Brief timeline of events and prior actions taken','Your recommendation or specific ask','Concise, professional tone throughout'] },
      ];
      await _sb.from('topics').insert(defaults.map(t => ({ ...t, created_at: new Date().toISOString() })));
    } catch (e) {
      console.warn('DB seed skipped:', e.message);
    }
  }

  // ---- Seed manager topics on first run ----
  async function _seedManagerTopics() {
    try {
      const { count } = await _sb.from('topics').select('*', { count: 'exact', head: true }).like('module', 'mgr-%');
      if (count > 0) return; // already seeded

      const mgrTopics = [
        // ── Situation Room (very difficult leadership scenarios)
        { module: 'mgr-situation-room', title: 'The Unexpected Resignation', enabled: true,
          description: 'A crisis scenario requiring immediate team leadership and strategic thinking.',
          scenario: 'Your top performer — handling 40% of team output — has resigned effective immediately citing burnout and poor management from you personally. The team already knows via WhatsApp. You have a leadership review call with your VP in 90 minutes.\n\nSpeak for 4-5 minutes: Your immediate 24-hour action plan, how you address the team\'s concerns directly (including the "poor management" claim), talent risk mitigation, and what you tell your VP.', checklist: [] },
        { module: 'mgr-situation-room', title: 'The Compliance Breach', enabled: true,
          description: 'A high-stakes compliance failure requiring immediate escalation and damage control.',
          scenario: 'Your two senior agents bypassed compliance protocols for 8 weeks, marking 23 customer complaints as resolved without documentation. Regulators have flagged 3 of these cases. Your CXO has been notified and wants a briefing in 2 hours.\n\nSpeak for 4-5 minutes: Your escalation approach, how you handle the agents, customer remediation plan, your accountability to senior leadership, and systemic prevention measures.', checklist: [] },
        { module: 'mgr-situation-room', title: 'The Recovery Plan Under Scrutiny', enabled: true,
          description: 'A performance recovery scenario with high leadership visibility.',
          scenario: 'Your team missed the quarterly target by 38%. Two team members have submitted transfer requests citing low morale. The Regional Director has asked you to present a recovery plan in 48 hours — in writing AND in a town hall with the full floor watching.\n\nSpeak for 4-5 minutes: Your root cause analysis (own your part), the 60-day recovery strategy, how you re-engage the team publicly, and what you need from leadership to succeed.', checklist: [] },
        { module: 'mgr-situation-room', title: 'The Whistleblower Allegation', enabled: true,
          description: 'An HR-sensitive scenario requiring careful legal, ethical and human navigation.',
          scenario: 'An anonymous complaint to HR alleges that you showed favoritism in performance ratings — specifically that you gave inflated scores to team members you are personally close with, and unfairly documented a lower-rated agent. HR has asked you to attend a meeting tomorrow. Two team members separately approach you today — one ally asking "what should I say?" and one asking to speak with HR independently.\n\nSpeak for 4-5 minutes: How you handle both conversations today, your approach to the HR meeting, what you would change about your rating process, and how you preserve team trust through the investigation.', checklist: [] },

        // ── Transcript Autopsy (long, realistic, multiple mistakes)
        { module: 'mgr-transcript-autopsy', title: 'SIP Debit With No Unit Allotment — 22 Min Call', enabled: true,
          description: 'Analyse a difficult inbound call with 8+ coaching opportunities across all key service competencies.',
          scenario: 'BACKGROUND: Preethi Mehta is calling Zerodha support for the third time. Her ₹10,000 monthly SIP was debited on the 2nd but units were never allotted. Ticket TKT-88244 (raised 3 weeks ago) was falsely marked resolved.\n\n─── CALL TRANSCRIPT ─────────────────────────\n\nAGENT: Hello, Zerodha support, how can I help?\n\nPREETHI: Hi, my name is Preethi Mehta. I have been calling for three weeks about my SIP. My ₹10,000 was debited but I have not received any units. Ticket TKT-88244 — nobody has contacted me. This money is for my daughter\'s education—\n\nAGENT: Can I have your account number please?\n\nPREETHI: XJ7743-21. As I was saying, this money is—\n\nAGENT: And your name?\n\nPREETHI: I just told you — Preethi Mehta.\n\nAGENT: One moment. [28-second silence] Okay. What is the issue exactly?\n\nPREETHI: SIP debited, no units received, ticket unresolved, three weeks.\n\nAGENT: Which fund?\n\nPREETHI: Axis Bluechip Fund — Direct Growth.\n\nAGENT: Amount?\n\nPREETHI: ₹10,000. Already stated.\n\nAGENT: Hold please. [Places on hold without asking — 3 min 12 sec]\n\nAGENT: Hello? Are you there?\n\nPREETHI: Yes, waiting. What did you find?\n\nAGENT: The debit went through on the 2nd. Units take 5 to 7 working days.\n\nPREETHI: It has been 21 days. That is not 5 to 7 working days.\n\nAGENT: Sometimes there are delays at the fund house.\n\nPREETHI: Can you confirm if units were actually allotted?\n\nAGENT: I am checking. [42-second silence] I need to check with back-end. Hold. [Second hold without asking — 4 min 48 sec]\n\nAGENT: Still there?\n\nPREETHI: Barely.\n\nAGENT: There was a NACH mandate rejection.\n\nPREETHI: What? Nobody told me this in three weeks! My money was still debited!\n\nAGENT: The automatic instruction was rejected but your bank released funds separately.\n\nPREETHI: Where is my ₹10,000 right now?\n\nAGENT: It should reverse to your bank account.\n\nPREETHI: Should? You are not certain?\n\nAGENT: It will come back. These things take time.\n\nPREETHI: How much time — specifically?\n\nAGENT: Around 7 to 10 days.\n\nPREETHI: From today or from the 2nd?\n\nAGENT: From when the reversal is processed. I cannot give an exact date.\n\nPREETHI: I want to escalate. Can I speak to a senior?\n\nAGENT: I will raise a new ticket. Cannot transfer directly.\n\nPREETHI: What happened to TKT-88244?\n\nAGENT: [23-sec silence] Marked resolved on the 9th.\n\nPREETHI: Resolved? Nobody called me! Nothing was resolved!\n\nAGENT: I cannot see who updated it. These things happen.\n\nPREETHI: I want a supervisor.\n\nAGENT: I will raise a high-priority ticket. Callback within 48 hours.\n\nPREETHI: 48 hours after three weeks?\n\nAGENT: Same-day resolution is not possible from my end.\n\nPREETHI: What can you actually guarantee?\n\nAGENT: I will mark it high priority.\n\nPREETHI: New ticket number?\n\nAGENT: [15-sec silence] TKT-99501.\n\nPREETHI: What are you documenting?\n\nAGENT: SIP debit, no unit allotment, callback requested.\n\nPREETHI: NACH rejection, three-week history, false resolution on previous ticket — is that noted?\n\nAGENT: Adding now. [38-sec silence] Done.\n\nPREETHI: Can I get an email confirmation?\n\nAGENT: We do not send email confirmations.\n\nPREETHI: Your name and employee ID?\n\nAGENT: I am Aryan. No employee ID to share.\n\nPREETHI: Is anything else possible right now?\n\nAGENT: No. We have to wait for back-end.\n\nPREETHI: [6-second silence]\n\nAGENT: Have a nice day. [Disconnects without checking if customer needs anything further]\n\n─── END OF TRANSCRIPT ─────────────────────\n\nYOUR TASK: Write a structured coaching report. Identify at minimum 6 coaching opportunities. For each: (a) cite the exact transcript moment, (b) explain the customer impact, (c) write the improved response. Also identify what (if anything) the agent did well, and provide a 3-priority development action plan. Minimum 250 words.',
          checklist: [] },
        { module: 'mgr-transcript-autopsy', title: 'Mutual Fund Redemption Blocked — 26 Min Call', enabled: true,
          description: 'A high-frustration escalation call with 9+ coaching opportunities across service quality dimensions.',
          scenario: 'BACKGROUND: Vikram Shetty has been waiting 45 days for ₹2,50,000 redemption to credit. He has called 4 times, received conflicting explanations, and has a medical emergency that forced him to borrow money from family.\n\n─── CALL TRANSCRIPT ─────────────────────────\n\nAGENT: Hi, support, tell me your problem.\n\nVIKRAM: Good morning. Vikram Shetty. Redemption request RED-20240813-7741 placed 45 days ago. ₹2,50,000 from liquid fund. Still not credited. This is for a medical emergency. I have called four times.\n\nAGENT: Account number?\n\nVIKRAM: ZC-4421-88. I also have three previous ticket numbers.\n\nAGENT: [1 min 34 sec silence — no update given]\n\nAGENT: Okay, I see it.\n\nVIKRAM: What is the status of RED-20240813-7741?\n\nAGENT: There might be a KYC issue.\n\nVIKRAM: KYC? I have invested on Zerodha for six years. KYC was verified when I opened the account.\n\nAGENT: Sometimes it needs re-verification.\n\nVIKRAM: Is it KYC or not — can you check specifically?\n\nAGENT: Checking. Actually hold on. [Places on hold without asking — 2 min 50 sec]\n\nAGENT: So actually it might be a bank mandate problem.\n\nVIKRAM: Bank? I have received dividends in this same account for years. Nothing changed.\n\nAGENT: Let me verify. [27-sec silence] Account ending 4821 — is that correct?\n\nVIKRAM: Yes. Same account I always use.\n\nAGENT: Then it is not a bank issue.\n\nVIKRAM: First KYC, then bank, now neither. What is the actual problem?\n\nAGENT: It may be a technical issue from the fund house.\n\nVIKRAM: What is being done?\n\nAGENT: I will raise a ticket.\n\nVIKRAM: There are already three tickets — TKT-11234, TKT-11509, TKT-11788. What happened?\n\nAGENT: I can see TKT-11234. I do not see the others.\n\nVIKRAM: Are tickets being deleted?\n\nAGENT: The system is slow today.\n\nVIKRAM: A previous agent said credit in 3-5 working days. That was six weeks ago.\n\nAGENT: I cannot speak to what my colleagues said.\n\nVIKRAM: When will my ₹2,50,000 be credited?\n\nAGENT: I cannot give a confirmed date.\n\nVIKRAM: My family has been borrowing money for 45 days. Can I speak to a supervisor?\n\nAGENT: Supervisors are not available for direct calls. They respond through tickets.\n\nVIKRAM: No supervisor in 45 days?\n\nAGENT: I understand this has been a long wait.\n\nVIKRAM: Is there a grievance process?\n\nAGENT: You can write to our grievance email.\n\nVIKRAM: What is that email?\n\nAGENT: [12-sec silence] I believe it is support@zerodha.com but I am not 100% certain.\n\nVIKRAM: You are not certain of your own company\'s grievance email?\n\nAGENT: Let me check. [22-sec silence] Yes, support@zerodha.com.\n\nVIKRAM: That is the general support email. Is there a specific grievance officer or a SEBI-level escalation path?\n\nAGENT: I will escalate to the senior team with highest priority. I am sorry for the trouble.\n\nVIKRAM: Your name?\n\nAGENT: Deepika.\n\nVIKRAM: Employee ID?\n\nAGENT: I am not supposed to share that.\n\nVIKRAM: Ticket for this call?\n\nAGENT: TKT-11901.\n\nVIKRAM: Please note: fifth call, three unresolved tickets, medical emergency, ₹2,50,000 outstanding 45 days.\n\nAGENT: I have noted it.\n\nVIKRAM: Is there anything that can be done TODAY?\n\nAGENT: The credit is handled by the fund house and banking system. We cannot manually push it.\n\nVIKRAM: That is your answer after 45 days?\n\nAGENT: I am sorry. Escalation will be the fastest path.\n\nVIKRAM: Fine. [Pause]\n\nAGENT: Is there anything else?\n\nVIKRAM: No.\n\nAGENT: Thank you for calling. Have a wonderful day. [Disconnects]\n\n─── END OF TRANSCRIPT ─────────────────────\n\nYOUR TASK: Identify minimum 8 coaching opportunities — at least one each from: Call Opening, Information Verification, Hold Procedure, Empathy & Acknowledgment, Problem Ownership, Knowledge Accuracy, Escalation Process, and Call Closing. For each: (a) cite the transcript, (b) name the violated standard, (c) write the improved response. End with a Development Priority Matrix: rate the agent 1-5 on five dimensions and identify top 2 training priorities. Minimum 300 words.',
          checklist: [] },

        // ── Mock Call (manager-level — very difficult)
        { module: 'mgr-mock-call', title: 'C-Suite Escalation — Contract at Final Risk', enabled: true,
          description: 'Handle a furious C-suite client call where the relationship is at final breaking point.',
          scenario: 'You are the Relationship Manager for Altus Capital, a ₹80 crore institutional client. The CFO, Priya Nair, is on the line. Three consecutive quarter-end reports were delivered late, two contained calculation errors, and one missed a regulatory deadline that caused the client a ₹12 lakh penalty. She says:\n\n"I have put forward a proposal to our board to terminate the contract. My CEO asked me to give you one final call. I am giving you exactly five minutes. Tell me why the board should reject my recommendation."\n\nHandle this call. You have 4-5 minutes. You must not be defensive, you must own the failures, and you must present a concrete recovery proposal with accountability milestones — not promises.', checklist: ['Acknowledge failures without deflection', 'Show specific corrective actions already taken', 'Propose concrete accountability milestones', 'Demonstrate understanding of client business impact', 'Make a credible commitment with a safety net offer'] },
        { module: 'mgr-mock-call', title: 'Regulatory Audit Call — Explain Your Team\'s Non-Compliance', enabled: true,
          description: 'Handle a call from a compliance auditor who has identified systematic non-compliance in your team.',
          scenario: 'You are on a call with Meera Krishnamurthy, the Internal Compliance Auditor. She has found that your team has been marking calls as "first-call resolved" when follow-up tickets were still open — inflating your FCR metric by ~18% over Q2 and Q3. This is a reportable audit finding.\n\nShe says: "I have documented 47 instances from your team over 6 months. Your team leads\' call logs show they knew. The question I need to answer in my report is: did you know, did you direct this, or did it happen without your knowledge — and what does each answer mean for our processes?"\n\nHandle this call. Be honest, professional, and solutions-focused. You have 4-5 minutes.', checklist: ['Be transparent without being evasive', 'Take appropriate ownership based on actual knowledge', 'Show immediate corrective actions', 'Do not throw team leads under the bus unfairly', 'Propose systemic fix with timeline'] },
        { module: 'mgr-mock-call', title: 'Skip-Level Performance Challenge', enabled: true,
          description: 'A skip-level call from your VP who has received complaints about your management style.',
          scenario: 'Your VP, Suresh Rao, calls you unexpectedly. He has received two anonymous feedback entries from your team members that reference: (1) your tendency to publicly call out mistakes in team meetings, (2) perceived unfairness in leave approvals, and (3) favouritism in assigning premium clients to certain agents.\n\nHe says: "I want to hear your side. But I also need to know — is there any basis to these concerns, and what does this tell you about how you are perceived as a manager?"\n\nHandle this conversation with maturity and self-awareness. You have 4-5 minutes.', checklist: ['Respond without being defensive', 'Show genuine self-awareness', 'Acknowledge any valid points', 'Present concrete changes you will make', 'Invite ongoing feedback'] },

        // ── Feedback (conversational AI — personas are hardcoded in manager-app.js)
        { module: 'mgr-feedback', title: 'The Burnout Star', enabled: true,
          description: 'Give structured feedback to a top performer whose engagement has suddenly dropped.',
          scenario: 'Rahul is your best performer — always exceeds targets. For the last 3 weeks he has been arriving late, missing standups, and being short and impatient with teammates. His output has dropped 20%.\n\nConduct a structured, empathetic feedback conversation. You must: open safely, give specific examples, explore the root cause, agree on a path forward, and maintain the relationship.', checklist: [] },
        { module: 'mgr-feedback', title: 'The Struggling New Hire', enabled: true,
          description: 'Give honest but supportive feedback to a new hire whose communication is damaging customer relationships.',
          scenario: 'Priya joined 8 weeks ago. She is technically capable but comes across as too blunt with customers. Two formal complaints have been filed. Three teammates are informally covering for her.\n\nDeliver honest feedback that protects the customer relationship AND keeps Priya engaged and developing. Avoid both being too soft (which fails the team) and too harsh (which loses her).', checklist: [] },
        { module: 'mgr-feedback', title: 'The Dismissive Senior', enabled: true,
          description: 'Challenge a high-performing but culturally toxic senior agent on behaviour that is undermining team culture.',
          scenario: 'Arjun has 5 years of experience and is technically your best agent. He dismisses new processes publicly, makes condescending comments to junior staff, and has a "I\'ve always done it this way" attitude. Two junior team members have told you privately they are considering leaving because of him.\n\nGive Arjun clear, specific, consequential feedback on the culture impact — without losing his technical contribution. This is not a soft conversation.', checklist: [] },

        // ── Emotional Intelligence (written — very difficult)
        { module: 'mgr-eq', title: 'The Breaking Point in a Team Meeting', enabled: true,
          description: 'Respond to a team member\'s public emotional breakdown with professional, human leadership.',
          scenario: 'During a Monday morning team meeting with 11 people present, your agent Sana suddenly says through tears: "I can\'t keep doing this. The pressure is impossible. I feel completely alone in this team and nobody actually helps anyone here."\n\nThere is a 5-second silence. Everyone is looking at you.\n\nWrite your response covering:\n1. What you say and do in the next 60 seconds (exact words matter)\n2. How you manage the rest of the team in that meeting and in the 24 hours after\n3. What you do privately with Sana — immediately, in 24 hours, in 7 days\n4. What this moment tells you about your team\'s health and what structural changes you will make\n5. How you prevent both over-reacting (making it bigger than it is) and under-reacting (dismissing it)\n\nMinimum 200 words. Demonstrate that you can lead with both emotional intelligence and professional composure.',
          checklist: [] },
        { module: 'mgr-eq', title: 'The Public Undermining by a Peer Manager', enabled: true,
          description: 'Respond to deliberate public undermining with professional self-regulation and strategic thinking.',
          scenario: 'In a cross-functional leadership review attended by 18 people — including your team, peer managers, and two Senior VPs — Nikhil (a peer manager you have had friction with) says:\n\n"I think we should be honest about the data. The improvement numbers from [your team] look good on paper, but the quality escalations from that floor tell a different story. Maybe the management approach is creating short-term metric performance but longer-term service issues. I\'m just raising it as a question for the room."\n\nYour team is watching you. Both SVPs look at you expectantly.\n\nWrite your response covering:\n1. What you say in that room RIGHT NOW (exact words)\n2. How you close the discussion professionally without being defensive or dismissive\n3. What you do with Nikhil privately — when, how, and what you say\n4. What you say to your team afterwards\n5. What you learn about your own emotional triggers from this situation and how you manage them\n\nMinimum 200 words. Show that you can protect your credibility without damaging relationships or escalating conflict.',
          checklist: [] },

        // ── Management Skills (written — very difficult, strategic)
        { module: 'mgr-management-skills', title: '30-60-90 Day Plan for a First-Time Team Lead', enabled: true,
          description: 'Design a rigorous, structured development plan for a newly promoted team lead.',
          scenario: 'You have just promoted Kiran, your highest-performing agent, to Team Lead. She is technically outstanding but has never managed people. She will inherit a team of 9 agents — including 2 senior agents who also applied for the role and were passed over.\n\nWrite a detailed 30-60-90 day development plan that must include:\n- Specific, measurable milestones for each phase (not vague goals)\n- How you will handle the 2 passed-over agents (name the risk explicitly)\n- Weekly check-in cadence and what you will cover in each\n- What "ready to operate independently" looks like at day 90\n- The 3 most likely failure modes for a first-time lead and how the plan prevents each\n- How you will know if she is not progressing and what you will do\n\nMinimum 250 words. This should be something you could actually hand to Kiran and your HR BP tomorrow.',
          checklist: [] },
        { module: 'mgr-management-skills', title: 'Change Management Brief — CRM Migration', enabled: true,
          description: 'Lead a high-stakes system migration after a previous failure that damaged team trust.',
          scenario: 'Your team of 14 agents will migrate to a new CRM system in 4 weeks. Context that makes this hard: (1) A similar migration 2 years ago caused 15% productivity drop for 2 months, (2) three team members were involved in that rollout and publicly blame the previous manager, (3) the vendor\'s training schedule is unrealistic (4-hour session for a complex system), and (4) two of your strongest agents have already said "last time was a disaster — I\'m not doing that again."\n\nWrite a change management brief that must include:\n- Your communication strategy (what you say, when, to whom, and in what format — be specific)\n- How you address the "last time was a disaster" sentiment directly (not just reassurance)\n- A revised training approach that actually works within your constraints\n- Your resistance handling strategy for the 2 resistant senior agents specifically\n- Productivity protection measures (what you will deprioritize during transition)\n- Success metrics with week-by-week targets\n- Your personal commitment and what you will be doing daily during the 4-week window\n\nMinimum 250 words. This should be a real brief, not a generic plan.',
          checklist: [] },

        // ── Listening & Tone (MCQ — 5 questions, auto-scored in manager-app.js)
        { module: 'mgr-listening-tone', title: 'Listening & Tone — Manager Email Analysis', enabled: true,
          description: 'Analyse the tone, subtext, and communication quality of a real manager email.',
          scenario: 'Read the email carefully and answer 5 analytical questions about tone, impact, and what is unsaid.',
          checklist: [] },
      ];

      await _sb.from('topics').insert(mgrTopics.map(t => ({ ...t, created_at: new Date().toISOString() })));
    } catch (e) {
      console.warn('Manager topic seed skipped:', e.message);
    }
  }

  // ---- put: insert or upsert a record ----
  async function put(store, data) {
    // Special case: settings table uses 'key' as PK, not 'id'
    if (store === 'settings') {
      const { error } = await _sb.from('settings')
        .upsert({ key: data.key, value: data.value }, { onConflict: 'key' });
      if (error) throw error;
      return data.key;
    }

    // Upload blobs to Storage and get public URLs
    // Failures are non-fatal: session still saves with transcript + AI scores, just no playback URL
    const processed = { ...data };
    // Hard-strip botScriptAudio — no matching DB column. _toDB whitelist is the real guard
    // but delete here too so the 'has audio' logic in the rest of put() is clean.
    if (store === 'topics') delete processed.botScriptAudio;
    if (store === 'sessions' && data.recordingBlob instanceof Blob) {
      try {
        processed.recordingUrl = await _upload('recordings', data.recordingBlob, 'recordings');
      } catch (e) {
        console.warn('Recording upload failed (no storage policy?), saving without URL:', e.message);
      }
    }
    if (store === 'topics' && data.callerAudioBlob instanceof Blob) {
      if (data.callerAudioBlob.size > 50 * 1024 * 1024) {
        console.warn('Caller audio blob exceeds 50 MB — skipping upload to stay within Supabase free-tier limit.');
      } else {
        try {
          // Upload into 'recordings' bucket (confirmed anon-insert policy) under 'caller-audio/' path
          processed.callerAudioUrl = await _upload('recordings', data.callerAudioBlob, 'caller-audio');
        } catch (e) {
          console.warn('Caller audio upload failed, saving topic without audio URL:', e.message, e);
        }
      }
    }

    const dbData = _toDB(store, processed);

    if (data.id) {
      // Upsert (handles both update and first-time insert with known ID e.g. trainees)
      const { data: r, error } = await _sb.from(store)
        .upsert(dbData, { onConflict: 'id' }).select('id').single();
      if (error) throw error;
      return r.id;
    } else {
      const { data: r, error } = await _sb.from(store).insert(dbData).select('id').single();
      if (error) throw error;
      return r.id;
    }
  }

  // ---- get: fetch a single record by id (or key for settings) ----
  async function get(store, id) {
    if (store === 'settings') {
      const { data } = await _sb.from('settings').select('*').eq('key', id).single();
      return data || null; // returns { key, value } matching old IndexedDB shape
    }
    const { data, error } = await _sb.from(store).select('*').eq('id', id).single();
    if (error) return null;
    return _fromDB(store, data);
  }

  // ---- getAll: fetch all records in a store ----
  async function getAll(store) {
    // sessions uses submitted_at; everything else uses created_at
    const orderCol = store === 'sessions' ? 'submitted_at' : 'created_at';
    const { data, error } = await _sb.from(store).select('*').order(orderCol, { ascending: true });
    if (error) throw error;
    return (data || []).map(r => _fromDB(store, r));
  }

  // ---- patch: partial update (only specified columns) ----
  async function patch(store, id, data) {
    const dbData = _toDB(store, data);
    const { error } = await _sb.from(store).update(dbData).eq('id', id);
    if (error) throw error;
  }

  // ---- del: delete a record by id ----
  async function del(store, id) {
    const { error } = await _sb.from(store).delete().eq('id', id);
    if (error) throw error;
  }

  // ---- getByIndex: filter records by a field value ----
  async function getByIndex(store, field, value) {
    // Map camelCase field names to DB column names
    const colMap = {
      sessions: { module: 'module', traineeId: 'trainee_id', status: 'status' },
      topics:   { module: 'module' },
      trainees: {},
    };
    const col = (colMap[store] || {})[field] || field;
    const { data, error } = await _sb.from(store).select('*').eq(col, value);
    if (error) throw error;
    return (data || []).map(r => _fromDB(store, r));
  }

  // ---- expose Supabase client (for Auth in auth.js) ----
  function getClient() { return _sb; }

  return { init, put, patch, get, getAll, del, getByIndex, getClient };
})();
