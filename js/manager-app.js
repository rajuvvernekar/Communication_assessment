'use strict';
// ============================================================
//  CommAssess — Manager Portal App  v2
//  v2: Feedback module → conversational AI (employee bot)
//      Fix: Recorder.startTimer countUp bug (auto-stop now works)
// ============================================================

const MgrApp = (() => {

  // ── Hardcoded scenarios ──────────────────────────────────
  const SCENARIOS = {
    'mgr-situation-room': [
      { id:'sr1', title:'The Unexpected Resignation',
        scenario:'Your top performer — who handles 40% of your team\'s output — has just resigned with two weeks\' notice during your peak season. The team already knows. You have a team standup in 20 minutes.\n\nSpeak for 4-5 minutes: What are your immediate actions in the next 24 hours? How do you address the team, manage the transition, and maintain morale?' },
      { id:'sr2', title:'The Compliance Breach',
        scenario:'You have just been informed that two senior team members bypassed compliance protocols for the past 6 weeks to meet their targets, resulting in 12 customer escalations that were marked as resolved without proper documentation.\n\nSpeak for 4-5 minutes: How do you escalate this, contain the damage, address the team members, and prevent recurrence?' },
      { id:'sr3', title:'The Recovery Plan',
        scenario:'Your team has missed the quarterly target by 35%. The regional director has called an urgent review tomorrow. You have one evening to prepare.\n\nSpeak for 4-5 minutes: What is your root cause analysis? How do you present this to leadership and what is your 60-day recovery strategy?' },
    ],
    'mgr-transcript-autopsy': [
      { id:'ta1', title:'Agent-Customer Call Analysis',
        scenario:'Read the following call transcript and write your coaching notes. Identify at least 3 specific coaching opportunities and provide actionable guidance for each.\n\n---\nAGENT: "Hello, this is service. How can I help?"\nCUSTOMER: "I have been waiting 3 weeks for my refund and nobody is calling me back!"\nAGENT: "Okay, can I get your order number?"\nCUSTOMER: "It\'s 7743-8821. I am really frustrated, this is not acceptable."\nAGENT: "Let me check... okay I can see it here. The refund was processed on the 12th."\nCUSTOMER: "The 12th? That was 10 days ago! Where is it?"\nAGENT: "It can take 7-10 business days. You should receive it soon."\nCUSTOMER: "That\'s what they said last time! Can you escalate this?"\nAGENT: "I can raise a ticket. Is there anything else?"\nCUSTOMER: "No, that\'s it."\n---\n\nYour coaching notes (min 150 words):' },
      { id:'ta2', title:'Team Meeting Coaching Review',
        scenario:'You observed the following team meeting led by a new team lead. Write a structured feedback report covering: what went well, what could be improved, and specific coaching actions for this team lead.\n\n---\nTEAM LEAD: "Okay everyone, quarterly numbers — we did okay but not great. Sales hit 87% of target. Customer satisfaction dropped 4 points. Any thoughts?"\n[Silence for 10 seconds]\nTEAM LEAD: "No? Okay. Next month\'s targets are on the board. Same targets as last quarter. Any questions?"\nAGENT A: "Why did satisfaction drop?"\nTEAM LEAD: "Not sure, probably call handling. Anyway, let\'s go. That\'s the standup."\n---\n\nYour feedback report (min 150 words):' },
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
    'mgr-situation-room':    { label: 'The Situation Room',    type: 'audio',       icon: '🎯' },
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
  function startModule(moduleKey) {
    const meta = MODULE_META[moduleKey];
    if (!meta) return;

    _currentModule   = moduleKey;
    _recordingBlob   = null;
    _transcript      = '';
    _mcqAnswers      = new Array(LISTENING_QUESTIONS.length).fill(null);

    if (meta.type === 'mcq') {
      _currentScenario = { id: 'lt1', title: 'Listening & Tone MCQ', scenario: LISTENING_TONE_SCENARIO };
      _launchMCQ();
    } else if (meta.type === 'feedback-ai') {
      _launchFeedbackAI();
    } else {
      const pool = SCENARIOS[moduleKey];
      if (!pool || !pool.length) { toast('No scenarios available for this module.', 'error'); return; }
      _currentScenario = pickRandom(pool);
      if (meta.type === 'audio')   _launchAudio();
      else if (meta.type === 'written') _launchWritten();
    }
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

      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       _currentModule,
        topicId:      _currentScenario.id,
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

    // Score manager's combined speech
    const mgrText = _fb.history.map(ex => ex.mgr || '').join(' ').trim();
    const durationSecs = _fb.history.length * 60;

    let aiScores;
    try {
      if (mgrText) {
        const analysis = SpeechEngine.analyze(mgrText, Math.max(durationSecs, 1));
        aiScores = SpeechEngine.scoreSpeech(analysis, Math.max(durationSecs, 1));
      } else {
        aiScores = { overall: null };
      }
    } catch(e) {
      aiScores = { overall: null };
    }
    aiScores._method  = 'mgr-feedback-ai';
    aiScores._module  = 'mgr-feedback';
    aiScores._turns   = _fb.history.length;

    try {
      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       'mgr-feedback',
        topicId:      _currentScenario.id,
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
    try {
      const aiScores = scoreWrittenResponse(text, _currentModule);
      await DB.put('sessions', {
        traineeId:    Auth.getId(),
        traineeName:  Auth.getName(),
        traineeEmail: Auth.getEmail(),
        module:       _currentModule,
        topicId:      _currentScenario.id,
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

    try {
      await DB.put('sessions', {
        traineeId: Auth.getId(), traineeName: Auth.getName(), traineeEmail: Auth.getEmail(),
        module: _currentModule, topicId: _currentScenario.id, topicTitle: _currentScenario.title,
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
      $('mgr-result-subtitle').textContent = `${meta.label} — written response evaluated`;
      $('mgr-result-score').textContent = `${aiScores.overall}%`;
      $('mgr-score-grid').innerHTML = `
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
      const rows = [
        ['Fluency',        aiScores.fluency],
        ['Vocabulary',     aiScores.vocabulary],
        ['Confidence',     aiScores.confidence],
        ['Clarity',        aiScores.clarity],
        ['Professionalism',aiScores.professionalism],
        ['Exchanges',      _fb.history.length + ' turns'],
      ].filter(([, v]) => v !== undefined && v !== null);
      $('mgr-score-grid').innerHTML = rows.map(([label, val]) =>
        `<div class="mgr-score-item"><div class="label">${label}</div><div class="val">${typeof val === 'number' ? val+'/5' : val}</div></div>`
      ).join('');
    } else {
      // audio (Situation Room, Mock Call)
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
  };

})();

document.addEventListener('DOMContentLoaded', () => MgrApp.init());
