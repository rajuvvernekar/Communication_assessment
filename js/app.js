'use strict';

const App = (() => {
  // ---- State ----
  let _trainee = null; // { id, name }
  let _currentTopic = null;
  let _recordingPromise = null;
  let _psRecordingStartTime = null; // for duration tracking
  let _psSkipUsed = false;          // only one topic skip allowed per session
  let _psCategory = null;           // 'pick-speak-stock' | 'pick-speak-general'
  let _psTopicsPool = [];           // all fetched topics for current category
  let _wcStartTime = null;
  let _wcTimerInterval = null;

  // ── Grammar Assessment state ──
  let _gaSections       = [];   // [{id, title, questions}] all sections sorted A → C
  let _gaCurrentSection = 0;    // 0-based index into _gaSections
  let _gaSectionResults = [];   // [{title, answerRecord, correct, total, pct}] accumulated
  let _gaQuestions      = [];   // current section's question array
  let _gaCurrentIdx     = 0;    // current question index within section
  let _gaUserAnswers    = [];   // -1 = unanswered, 0-3 = chosen option index

  // ── Bot-call turn state ──
  let _mcTurns         = [];    // botScript lines for current call
  let _mcTurnIndex     = 0;     // 0-based current turn
  let _mcTranscripts   = [];    // per-turn trainee transcript
  let _mcBlobPromise   = null;  // single continuous recording (start → finish)
  let _mcTurnTimerId   = null;  // per-turn 90s countdown setInterval
  let _mcTurnEnded     = false; // guard: prevent double-call of endTraineeTurn()
  let _mcCallFinishing = false; // guard: prevent double-call of finishBotCall()

  // ── TTS voice cache — Chrome loads voices async; pre-cache on first event ──
  let _ttsVoices = [];
  if (window.speechSynthesis) {
    const _cacheVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length) _ttsVoices = v;
    };
    _cacheVoices(); // populate immediately if already available (Firefox, Safari)
    speechSynthesis.onvoiceschanged = _cacheVoices; // fires in Chrome after async load
  }

  // Ranked list of high-quality voices, best first.
  // The first match found on the device wins.
  const TTS_VOICE_PRIORITY = [
    'Google US English',                  // Chrome – natural, widely available
    'Microsoft Aria Online (Natural)',    // Edge – neural, excellent
    'Microsoft Jenny Online (Natural)',   // Edge – neural female
    'Microsoft Guy Online (Natural)',     // Edge – neural male
    'Microsoft Aria',                     // Edge (older)
    'Samantha',                           // macOS / iOS – clear female
    'Alex',                               // macOS – natural male
    'Karen',                              // macOS / iOS – clear female
    'Moira',                              // macOS – Irish, clear
    'Zira',                               // Windows – female
    'David',                              // Windows – male
  ];

  // ---- Score Bands (overall scores are out of 100) ----
  const SCORE_BANDS = {
    'pick-speak': [
      { maxPct: 40,       label: 'Needs Significant Improvement', cls: 'band-poor',      icon: '⚠️',
        feedback: 'Significant gaps across multiple areas. Focus on building clarity of thought, reducing filler words, improving pace, and using more varied vocabulary. Practice structured speaking with a clear opening, body, and close.' },
      { maxPct: 60,       label: 'Acceptable / Meets Expectations', cls: 'band-fair',    icon: '📋',
        feedback: 'Meets basic expectations. Work on reducing filler words (um, uh, like), improving sentence variety, and covering the topic more thoroughly within the time given.' },
      { maxPct: 80,       label: 'Good / Above Average',           cls: 'band-good',     icon: '👍',
        feedback: 'Good command of language and delivery. Refine by increasing vocabulary variety, tightening logical flow, and maintaining a more consistent pace throughout.' },
      { maxPct: Infinity, label: 'Excellent / Consistently Strong', cls: 'band-excellent', icon: '⭐',
        feedback: 'Consistently strong performance across all areas! Excellent fluency, rich vocabulary, professional tone, and well-structured delivery. Keep practising to maintain this standard.' }
    ],
    'mock-call': [
      { maxPct: 50,       label: 'Needs Significant Improvement', cls: 'band-poor',      icon: '⚠️',
        feedback: 'Key call-handling elements are missing or insufficient. Prioritise training on greeting structure, acknowledging the customer with empathy, probing questions, and proper call closings.' },
      { maxPct: 60,       label: 'Acceptable / Meets Expectations', cls: 'band-fair',    icon: '📋',
        feedback: 'Basic call-handling demonstrated. Work on consistent empathy phrases, clearer communication without fillers, and following hold and closing procedures every time.' },
      { maxPct: 70,       label: 'Good / Above Average',           cls: 'band-good',     icon: '👍',
        feedback: 'Good customer service skills shown. Minor refinements needed — ensure the extra mile is offered and all hold/closing steps are followed precisely.' },
      { maxPct: Infinity, label: 'Excellent / Consistently Strong', cls: 'band-excellent', icon: '⭐',
        feedback: 'Consistently strong call quality! Excellent adherence to protocol, genuine empathy throughout, and professional communication from opening to closing.' }
    ]
  };

  function getBand(module, overallScore) {
    // overallScore is 0-100
    const bands = SCORE_BANDS[module];
    if (!bands || overallScore === null || overallScore === undefined) return null;
    return bands.find(b => overallScore < b.maxPct) || bands[bands.length - 1];
  }

  function renderBandCard(containerId, module, overallScore) {
    const el = $(containerId);
    if (!el) return;
    const band = getBand(module, overallScore);
    if (!band) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="band-card ${band.cls}">
        <div class="band-header">
          <span class="band-icon">${band.icon}</span>
          <div class="band-info">
            <div class="band-label">${band.label}</div>
            <div class="band-score">${overallScore}/100</div>
          </div>
        </div>
        <div class="band-feedback">${band.feedback}</div>
      </div>`;
  }

  // ---- Helpers ----
  function $(id) { return document.getElementById(id); }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $(`screen-${id}`);
    if (el) {
      el.classList.add('active');
      if (document.activeElement?.blur) document.activeElement.blur();
      // Defer scroll until after the browser has painted the new layout
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    }
  }

  // Only return topics that are enabled (or have no enabled field = legacy = treat as enabled)
  function enabledTopics(topics) {
    return topics.filter(t => t.enabled !== false);
  }

  function showStep(modulePrefix, stepId) {
    // Hide all direct step children of the module screen
    const screen = $(`screen-${modulePrefix}`);
    if (screen) {
      Array.from(screen.children).forEach(child => {
        if (child.id && child.id.startsWith(modulePrefix.replace('-', '-'))) {
          child.classList.add('hidden');
        } else if (child.classList.contains('step-container') || child.classList.contains('module-header')) {
          if (child.id) child.classList.add('hidden');
        }
      });
      // Hide all elements with step-like IDs within the screen
      screen.querySelectorAll('[id^="ps-step"],[id^="mc-step"],[id^="rp-step"],[id^="gd-step"],[id^="wc-step"],[id^="ga-step"]')
        .forEach(el => el.classList.add('hidden'));
    }
    const el = $(stepId);
    if (el) { el.classList.remove('hidden'); window.scrollTo(0, 0); }
  }

  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slide-out 0.25s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  function renderAIScores(containerId, scores, labels) {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = '';
    Object.entries(scores).forEach(([key, val]) => {
      if (key === 'overall') return;
      const label = labels[key] || key;
      const pct = ((val / 5) * 100).toFixed(0);
      const stars = '★'.repeat(Math.round(val)) + '☆'.repeat(5 - Math.round(val));
      el.innerHTML += `
        <div class="ai-score-row">
          <span class="score-label">${label}</span>
          <div class="score-bar"><div class="score-bar-fill" style="width:${pct}%"></div></div>
          <span class="score-stars">${stars}</span>
          <span class="score-val">${val}/5</span>
        </div>`;
    });
    if (scores.overall !== undefined) {
      // overall is out of 100
      el.innerHTML += `
        <div class="ai-score-row" style="background:#eff6ff;border:1px solid #dbeafe">
          <span class="score-label" style="font-weight:800">Overall AI Score</span>
          <div class="score-bar"><div class="score-bar-fill" style="width:${scores.overall.toFixed(0)}%;background:#3b82f6"></div></div>
          <span class="score-val" style="color:#3b82f6;font-weight:700">${scores.overall}/100</span>
        </div>`;
    }
  }

  function renderAnalysisPills(containerId, analysis, durationSeconds) {
    const el = $(containerId);
    if (!el || !analysis) return;
    const pills = [
      { label: `${analysis.wordCount} words`, cls: 'info' },
      { label: `~${analysis.wpm} WPM`, cls: analysis.wpm >= 100 && analysis.wpm <= 170 ? 'good' : 'warn' },
      { label: `${analysis.sentenceCount} sentences`, cls: 'info' },
      { label: `${Math.round(analysis.uniqueWordRatio * 100)}% unique vocab`, cls: analysis.uniqueWordRatio > 0.6 ? 'good' : 'warn' },
    ];
    if (analysis.fillerCount > 0) {
      pills.push({ label: `${analysis.fillerCount} filler words`, cls: analysis.fillerCount > 5 ? 'warn' : 'info' });
    }
    el.innerHTML = pills.map(p => `<span class="pill ${p.cls}">${p.label}</span>`).join('');
  }

  function getModuleLabel(module) {
    const map = {
      'pick-speak': 'Pick & Speak',
      'mock-call': 'Mock Call',
      'role-play': 'Role Play',
      'group-discussion': 'Group Discussion',
      'written-comm': 'Written Communication',
      'grammar-assessment': 'Grammar Assessment'
    };
    return map[module] || module;
  }

  // ---- Navigation (back buttons, module cards) ----
  function bindNavigation() {
    document.addEventListener('click', (e) => {
      const back = e.target.closest('[data-back]');
      if (back) {
        Recorder.stopTimer();
        Recorder.stopWaveform();
        showScreen(back.dataset.back);
        return;
      }

      const card = e.target.closest('.module-card');
      if (card) {
        const module = card.dataset.module;
        openModule(module);
      }
    });
  }

  // ---- Auth Screen ----
  function initAuth() {
    // Restore trainee from previous session (same browser/device)
    const cached = localStorage.getItem('commassess_trainee');
    if (cached) {
      try {
        _trainee = JSON.parse(cached);
        activateTrainee();
        return;
      } catch (_) {
        localStorage.removeItem('commassess_trainee');
      }
    }

    const doStart = async () => {
      const name       = $('auth-name').value.trim();
      const employeeId = $('auth-empid').value.trim();
      const errorEl    = $('auth-error');
      if (!name || !employeeId) {
        errorEl.textContent = 'Please enter your name and Employee ID.';
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');
      $('btn-start').disabled    = true;
      $('btn-start').textContent = 'Starting…';
      try {
        // Look up existing trainee by employee_id or create a new one
        const rows = await DB.getByIndex('trainees', 'employee_id', employeeId);
        let traineeId;
        if (rows.length > 0) {
          traineeId = rows[0].id;
          await DB.put('trainees', { id: traineeId, name, employee_id: employeeId });
        } else {
          traineeId = crypto.randomUUID();
          await DB.put('trainees', { id: traineeId, name, employee_id: employeeId });
        }
        _trainee = { id: traineeId, name, employeeId };
        localStorage.setItem('commassess_trainee', JSON.stringify(_trainee));
        activateTrainee();
      } catch (e) {
        errorEl.textContent = e.message || 'Something went wrong. Please try again.';
        errorEl.classList.remove('hidden');
      } finally {
        $('btn-start').disabled    = false;
        $('btn-start').textContent = 'Start Assessment →';
      }
    };

    $('btn-start').addEventListener('click', doStart);
    $('auth-name').addEventListener('keydown',  (e) => { if (e.key === 'Enter') doStart(); });
    $('auth-empid').addEventListener('keydown', (e) => { if (e.key === 'Enter') doStart(); });
  }

  function activateTrainee() {
    $('header-trainee-name').textContent = _trainee.name;
    $('app-header').classList.remove('hidden');
    $('btn-change-trainee').onclick = () => {
      _trainee = null;
      localStorage.removeItem('commassess_trainee');
      $('app-header').classList.add('hidden');
      if ($('auth-name'))  $('auth-name').value  = '';
      if ($('auth-empid')) $('auth-empid').value = '';
      if ($('auth-error')) $('auth-error').classList.add('hidden');
      showScreen('welcome');
    };
    showScreen('modules');
  }

  // ---- Module Dispatch ----
  async function openModule(module) {
    if (module === 'pick-speak') {
      showScreen('pick-speak');
      initPickSpeakCategory();
      return;
    }

    if (module === 'grammar-assessment') {
      await initGrammarAssessment();
      return;
    }

    const topics = enabledTopics(await DB.getByIndex('topics', 'module', module));
    if (!topics.length) {
      toast('No topics available for this module. Ask your admin to add some.', 'error');
      return;
    }

    _currentTopic = topics[Math.floor(Math.random() * topics.length)];
    showScreen(module);

    if (module === 'mock-call') initMockCall();
    else if (module === 'role-play') initRolePlay();
    else if (module === 'group-discussion') initGroupDiscussion();
    else if (module === 'written-comm') initWrittenComm();
  }

  // ================================================================
  //  PICK & SPEAK
  // ================================================================
  function initPickSpeakCategory() {
    _psSkipUsed   = false;
    _psCategory   = null;
    _psTopicsPool = [];
    showStep('pick-speak', 'ps-step-category');

    $('btn-ps-cat-stock').onclick   = () => selectPsCategory('pick-speak-stock');
    $('btn-ps-cat-general').onclick = () => selectPsCategory('pick-speak-general');
  }

  async function selectPsCategory(category) {
    let topics = enabledTopics(await DB.getByIndex('topics', 'module', category));
    // Backward-compat: if no general topics exist yet, fall back to legacy 'pick-speak' module
    if (!topics.length && category === 'pick-speak-general') {
      topics = enabledTopics(await DB.getByIndex('topics', 'module', 'pick-speak'));
    }
    if (!topics.length) {
      toast('No topics available for this category. Ask your admin to add some.', 'error');
      return;
    }
    _psCategory   = category;
    _psTopicsPool = topics;
    _currentTopic = topics[Math.floor(Math.random() * topics.length)];
    initPickSpeak(false);
  }

  function initPickSpeak(isSkip = false) {
    if (!isSkip) _psSkipUsed = false;

    showStep('pick-speak', 'ps-step-topic');

    const revealEl  = $('ps-topic-reveal');
    const skipBtn   = $('btn-ps-skip-topic');
    const skipBadge = $('ps-skip-badge');

    // Always start in un-revealed state
    revealEl.classList.remove('revealed');
    $('ps-topic-title').textContent = 'Click to reveal your topic';
    $('ps-topic-desc').textContent  = 'Your topic will be revealed and the 2-minute prep timer will start immediately.';
    $('btn-ps-ready').classList.add('hidden');
    $('btn-ps-reveal').style.display = '';

    // Skip button hidden until topic is revealed
    skipBtn.style.display = 'none';

    $('btn-ps-reveal').onclick = async () => {
      revealEl.classList.add('revealed');
      $('ps-topic-title').textContent = _currentTopic.title;
      $('ps-topic-desc').textContent  = _currentTopic.description || '';
      $('btn-ps-reveal').style.display = 'none';

      // Show skip button briefly (only if skip hasn't been used AND not Stock Market)
      if (!_psSkipUsed && _psCategory !== 'pick-speak-stock') {
        skipBadge.textContent  = '(1 skip available)';
        skipBtn.style.display  = '';
        skipBtn.disabled       = false;
      }

      // Auto-start prep — if mic denied, show "I'm Ready" as fallback retry
      const ok = await startPickSpeakPrep();
      if (!ok) {
        $('btn-ps-ready').textContent = '🎤 Allow Mic & Start Prep';
        $('btn-ps-ready').classList.remove('hidden');
      }
    };

    // Skip: pick new topic from the same pool — update state so startPickSpeakPrep
    // (which may still be awaiting mic) picks up the new topic
    skipBtn.onclick = () => {
      if (_psSkipUsed) return;
      _psSkipUsed = true;
      skipBtn.style.display = 'none';

      const pool = _psTopicsPool;
      if (!pool.length) return;
      let next = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 1) {
        while (next.id === _currentTopic.id) {
          next = pool[Math.floor(Math.random() * pool.length)];
        }
      }
      _currentTopic = next;
      $('ps-topic-title').textContent = _currentTopic.title;
      $('ps-topic-desc').textContent  = _currentTopic.description || '';
    };

    $('btn-ps-ready').onclick = () => startPickSpeakPrep();
    $('btn-ps-again').onclick = () => initPickSpeakCategory();
  }

  async function startPickSpeakPrep() {
    // Request mic here — called directly from user click, so browser allows the prompt.
    const micOk = await Recorder.requestMic();
    if (!micOk) {
      toast('⚠ Microphone access denied. Please allow mic access in your browser and try again.', 'error');
      return false;
    }

    showStep('pick-speak', 'ps-step-prep');
    $('ps-prep-title').textContent = _currentTopic.title;
    $('ps-prep-desc').textContent = _currentTopic.description || '';

    const PREP = 120;
    const ring = $('ps-prep-ring');
    const circumference = 339.3;

    Recorder.startTimer($('ps-prep-time'), PREP, (secs) => {
      const progress = secs / PREP;
      ring.style.strokeDashoffset = circumference * (1 - progress);
    }, () => {
      startPickSpeakRecording();
    });

    $('btn-ps-skip-prep').onclick = () => {
      Recorder.stopTimer();
      startPickSpeakRecording();
    };
    return true;
  }

  function startPickSpeakRecording() {
    // Mic was already granted in startPickSpeakPrep (user gesture context).
    showStep('pick-speak', 'ps-step-record');
    $('ps-rec-title').textContent = _currentTopic.title;
    $('ps-final-transcript').textContent = '';

    const speechSupported = SpeechEngine.isSupported();
    if (!speechSupported) {
      $('ps-no-speech-note').classList.remove('hidden');
    }

    let transcriptText = '';
    SpeechEngine.startTranscription((text) => {
      transcriptText = text;
      const el = $('ps-live-transcript');
      el.innerHTML = text || '<span class="transcript-placeholder">Listening...</span>';
    });

    const blobPromise = Recorder.start();
    const waveCanvas = $('ps-waveform');
    Recorder.startWaveform(waveCanvas);
    _psRecordingStartTime = Date.now();

    const REC_DURATION = 300;

    Recorder.startTimer($('ps-rec-time'), REC_DURATION, null, () => {
      stopPickSpeakRecording(blobPromise, transcriptText);
    });

    $('btn-ps-stop').onclick = () => {
      Recorder.stopTimer();
      stopPickSpeakRecording(blobPromise, transcriptText);
    };
  }

  async function stopPickSpeakRecording(blobPromise, transcriptText) {
    $('btn-ps-stop').disabled = true;
    const finalTranscript = SpeechEngine.stopTranscription() || transcriptText;
    Recorder.stop();

    let blob = null;
    try { blob = await blobPromise; } catch (e) { console.warn('Recording error:', e); }

    // Compute actual recording duration
    const duration = _psRecordingStartTime
      ? Math.floor((Date.now() - _psRecordingStartTime) / 1000)
      : 300;

    const MIN_SCORE_DURATION = 120; // must speak for at least 2 minutes to get AI scored
    const scoreable = duration >= MIN_SCORE_DURATION && !!finalTranscript;

    let analysis = null;
    let aiScores = null;
    if (scoreable) {
      analysis = SpeechEngine.analyze(finalTranscript, duration);
      aiScores  = SpeechEngine.scoreSpeech(analysis, duration);
      aiScores._summary = SpeechEngine.generateCoachingSummary('pick-speak', aiScores);
    }

    const sessionData = {
      traineeId: _trainee.id,
      traineeName: _trainee.name,
      module: 'pick-speak',
      topicId: _currentTopic.id,
      topicTitle: _currentTopic.title,
      recordingBlob: blob,
      transcript: finalTranscript,
      aiScores,
      adminScores: null,
      adminComment: '',
      status: scoreable ? 'ai-evaluated' : 'pending',
      submittedAt: new Date().toISOString(),
      timeTaken: Math.max(duration, 1),
      analysis
    };

    try {
      await DB.put('sessions', sessionData);
    } catch (e) {
      console.error('Session save failed:', e.message);
      toast('⚠ Could not save session: ' + e.message, 'error');
    }
    showPickSpeakResults(aiScores, finalTranscript, analysis, duration);
  }

  function showPickSpeakResults(scores, transcript, analysis, duration) {
    showStep('pick-speak', 'ps-step-results');

    // Scores are for admin only — clear any previously rendered content
    $('ps-band-display').innerHTML  = '';
    $('ps-ai-scores').innerHTML     = '';
    $('ps-analysis-pills').innerHTML = '';

    $('ps-final-transcript').textContent = transcript || 'No transcript captured. Your recording has been saved for admin review.';
    $('btn-ps-stop').disabled = false;

    const summaryEl = $('ps-coaching-summary');
    if (summaryEl) {
      if (scores && scores._summary) {
        summaryEl.textContent = scores._summary;
        summaryEl.classList.remove('hidden');
      } else {
        summaryEl.classList.add('hidden');
      }
    }

    toast('Assessment submitted!', 'success');
  }

  // ================================================================
  //  MOCK CALL
  // ================================================================

  // ── TTS helper: speaks text, calls onEnd when done (or on error / timeout) ──
  function speakBot(text, onEnd) {
    if (!window.speechSynthesis) { onEnd(); return; }
    window.speechSynthesis.cancel();

    // Use cached voices; fall back to a live call if the cache is still empty
    const voices = _ttsVoices.length ? _ttsVoices : speechSynthesis.getVoices();

    // Walk the priority list — pick the first voice available on this device
    let chosenVoice = null;
    for (const name of TTS_VOICE_PRIORITY) {
      chosenVoice = voices.find(v => v.name === name);
      if (chosenVoice) break;
    }
    // Final fallback: any en-US voice, then any English voice
    if (!chosenVoice) {
      chosenVoice = voices.find(v => v.lang === 'en-US')
                 || voices.find(v => v.lang.startsWith('en'));
    }

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang  = 'en-US';
    utt.rate  = 0.92;
    utt.pitch = 1.0;
    if (chosenVoice) utt.voice = chosenVoice;

    // Safety guard — iOS sometimes never fires onend; advance after 20 s
    let fired = false;
    const guard = setTimeout(() => { if (!fired) { fired = true; onEnd(); } }, 20000);
    utt.onend  = () => { if (!fired) { fired = true; clearTimeout(guard); onEnd(); } };
    utt.onerror = () => { if (!fired) { fired = true; clearTimeout(guard); onEnd(); } };
    speechSynthesis.speak(utt);
  }

  function initMockCallTopicSelect(allTopics) {
    // Randomly pick up to 2 topics from the pool
    const pool = [...allTopics];
    const selected = [];
    while (selected.length < 2 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(idx, 1)[0]);
    }

    showStep('mock-call', 'mc-step-topic-select');

    const container = $('mc-topic-cards');
    container.innerHTML = selected.map((t, i) => `
      <button class="mc-topic-card" data-idx="${i}">
        <h4>${t.title}</h4>
        <p>${t.description || ''}</p>
      </button>
    `).join('');

    container.querySelectorAll('.mc-topic-card').forEach((btn, i) => {
      btn.onclick = () => {
        _currentTopic = selected[i];
        initMockCall();
      };
    });
  }

  function initMockCall() {
    showStep('mock-call', 'mc-step-scenario');
    $('mc-title').textContent = _currentTopic.title;
    $('mc-desc').textContent = _currentTopic.description || '';
    $('mc-scenario-text').textContent = _currentTopic.scenario || '';

    // Checklist
    const ul = $('mc-checklist');
    ul.innerHTML = '';
    (_currentTopic.checklist || []).forEach(item => {
      ul.innerHTML += `<li>${item}</li>`;
    });

    // Caller audio — support both Storage URL (new) and legacy Blob (old)
    const audioSection = $('mc-caller-audio-section');
    const callerUrl = _currentTopic.callerAudioUrl
      || (_currentTopic.callerAudioBlob ? URL.createObjectURL(_currentTopic.callerAudioBlob) : null);
    if (callerUrl) {
      $('mc-caller-audio').src = callerUrl;
      audioSection.classList.remove('hidden');
    } else {
      audioSection.classList.add('hidden');
    }

    $('btn-mc-ready').onclick = async () => {
      const micOk = await Recorder.requestMic();
      if (!micOk) {
        toast('⚠ Microphone access denied. Please allow mic access in your browser and try again.', 'error');
        return;
      }
      const script = _currentTopic.botScript || _currentTopic.bot_script || [];
      if (script.length > 0) {
        startBotCall(script);   // turn-based bot conversation
      } else {
        startMockCallRecording(); // legacy single-recording fallback
      }
    };
  }

  function startMockCallRecording() {
    showStep('mock-call', 'mc-step-record');
    $('mc-rec-mini').textContent = _currentTopic.title;

    // Show customer questions panel if topic has bot script lines
    const questions = _currentTopic.botScript || _currentTopic.bot_script || [];
    const panel = $('mc-questions-panel');
    const list  = $('mc-questions-list');
    if (questions.length > 0) {
      list.innerHTML = questions.map(q => `<li>${q}</li>`).join('');
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }

    const blobPromise = Recorder.start();
    Recorder.startWaveform($('mc-waveform'));
    Recorder.startTimer($('mc-rec-time'), 0, null, null, true); // count up

    // Start live transcription if browser supports it
    const transcriptBox = $('mc-live-transcript-box');
    const transcriptEl  = $('mc-live-transcript');
    if (SpeechEngine.isSupported()) {
      if (transcriptBox) transcriptBox.classList.remove('hidden');
      SpeechEngine.startTranscription((text) => {
        if (transcriptEl) transcriptEl.textContent = text || 'Listening...';
      });
    }

    $('btn-mc-stop').onclick = async () => {
      $('btn-mc-stop').disabled = true;
      Recorder.stopTimer();
      Recorder.stopWaveform();
      Recorder.stop();
      const elapsed = Recorder.getElapsed();

      // Stop transcription
      const finalTranscript = SpeechEngine.isSupported() ? SpeechEngine.stopTranscription() : '';
      if (transcriptBox) transcriptBox.classList.add('hidden');

      let blob = null;
      try { blob = await blobPromise; } catch (e) {}

      // Show processing state in done step
      showStep('mock-call', 'mc-step-done');
      const scoringStatusEl = $('mc-ai-scoring-status');
      if (scoringStatusEl) {
        scoringStatusEl.textContent = '⏳ Analyzing your call...';
        scoringStatusEl.classList.remove('hidden');
      }

      // Score: Claude API → JS fallback (always produces a score)
      let aiScores = null;
      let scoringMethod = 'js';

      if (finalTranscript && typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
        try {
          if (scoringStatusEl) scoringStatusEl.textContent = '🤖 Claude AI is scoring your call...';
          const claudeResult = await ClaudeEvaluator.evaluate(
            'mock-call', finalTranscript, _currentTopic.title, _currentTopic.scenario || ''
          );
          if (claudeResult && claudeResult.overall !== null) {
            aiScores = { ...claudeResult.scores, overall: claudeResult.overall, _reasons: claudeResult.reasons, _method: 'claude' };
            scoringMethod = 'claude';
          }
        } catch (e) {
          console.warn('Claude scoring failed, falling back to JS:', e.message);
        }
      }
      // Always fall back to JS scorer (handles empty transcript gracefully)
      if (!aiScores) {
        aiScores = SpeechEngine.scoreMockCall(finalTranscript);
        aiScores._method = 'js';
      }
      aiScores._summary = SpeechEngine.generateCoachingSummary('mock-call', aiScores);

      if (scoringStatusEl) scoringStatusEl.classList.add('hidden');

      // Persist session
      try {
        await DB.put('sessions', {
          traineeId: _trainee.id,
          traineeName: _trainee.name,
          module: 'mock-call',
          topicId: _currentTopic.id,
          topicTitle: _currentTopic.title,
          recordingBlob: blob,
          transcript: finalTranscript,
          aiScores,
          adminScores: null,
          adminComment: '',
          status: 'ai-evaluated',
          submittedAt: new Date().toISOString(),
          timeTaken: Math.max(elapsed, 1)
        });
        toast('Mock call submitted!', 'success');
      } catch (e) {
        console.error('Session save failed:', e.message);
        toast('⚠ Could not save session: ' + e.message, 'error');
      }

      showMockCallResults(aiScores, finalTranscript, scoringMethod);
      $('btn-mc-stop').disabled = false;
    };
  }

  // ================================================================
  //  MOCK CALL — BOT-DRIVEN TURN-BASED FLOW
  // ================================================================

  // Entry point: called when topic has a non-empty botScript
  async function startBotCall(script) {
    _mcTurns         = script;
    _mcTurnIndex     = 0;
    _mcTranscripts   = [];
    _mcCallFinishing = false;

    showStep('mock-call', 'mc-step-bot-call');
    $('mc-chat-thread').innerHTML = '';

    // Populate the full scenario panel
    $('mc-bot-sc-title').textContent = _currentTopic.title || '';
    $('mc-bot-sc-desc').textContent  = _currentTopic.description || '';
    $('mc-bot-sc-text').textContent  = _currentTopic.scenario || '';
    const clEl = $('mc-bot-sc-checklist');
    clEl.innerHTML = '';
    (_currentTopic.checklist || []).forEach(item => { clEl.innerHTML += `<li>${item}</li>`; });

    // Collapse / expand scenario toggle
    const scBody   = $('mc-bot-sc-body');
    const scToggle = $('btn-mc-sc-toggle');
    let scVisible  = true;
    scToggle.onclick = () => {
      scVisible = !scVisible;
      scBody.classList.toggle('mc-bot-sc-collapsed', !scVisible);
      scToggle.textContent = scVisible ? 'Hide ▲' : 'Show ▼';
    };

    // Start ONE continuous recording for the entire call
    _mcBlobPromise = Recorder.start();
    Recorder.startWaveform($('mc-bot-waveform'));
    // Start a count-up timer (no display element) so Recorder.getElapsed() is accurate
    Recorder.startTimer(null, 0, null, null, true);

    // "End Call Early" — always visible; cancels TTS + timer, submits whatever was captured
    $('btn-mc-end-call').onclick = endBotCallEarly;

    runBotTurn();
  }

  // Called when trainee clicks "End Call Early": cancel TTS, flush any
  // in-progress trainee turn, then hand off to finishBotCall()
  function endBotCallEarly() {
    if (_mcCallFinishing) return; // already finishing — ignore duplicate clicks
    // Cancel any ongoing TTS
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    // If currently in a trainee turn, capture whatever has been spoken so far
    const recArea = $('mc-rec-area');
    if (recArea && recArea.style.display !== 'none' && !_mcTurnEnded) {
      _mcTurnEnded = true; // prevent endTraineeTurn() from firing via timer
      clearInterval(_mcTurnTimerId);
      const partial = SpeechEngine.isSupported() ? SpeechEngine.stopTranscription() : '';
      _mcTranscripts.push(partial);
    } else {
      // Bot was speaking — just clear the timer guard
      clearInterval(_mcTurnTimerId);
      if (SpeechEngine.isSupported()) SpeechEngine.stopTranscription();
    }

    finishBotCall();
  }

  // Render the bot's current turn as a chat bubble, then speak via TTS
  function runBotTurn() {
    const line = _mcTurns[_mcTurnIndex];
    $('mc-turn-label').textContent = `Turn ${_mcTurnIndex + 1} of ${_mcTurns.length}`;

    const bubble = document.createElement('div');
    bubble.className = 'mc-bubble bot';
    bubble.textContent = line;
    $('mc-chat-thread').appendChild(bubble);
    $('mc-chat-thread').scrollTop = $('mc-chat-thread').scrollHeight;

    $('mc-bot-status').style.display = '';
    $('mc-rec-area').style.display   = 'none';
    $('btn-mc-finish').style.display = 'none';

    speakBot(line, startTraineeTurn);
  }

  // After TTS ends: show recording area, wait for agent to click Done
  function startTraineeTurn() {
    _mcTurnEnded = false;
    $('mc-bot-status').style.display = 'none';
    $('mc-rec-area').style.display   = '';

    // Live transcription (SpeechEngine resets _transcript on each call)
    if (SpeechEngine.isSupported()) {
      $('mc-bot-live-transcript-box').style.display = '';
      $('mc-bot-live-transcript').textContent = 'Listening...';
      SpeechEngine.startTranscription((text) => {
        $('mc-bot-live-transcript').textContent = text || 'Listening...';
      });
    }

    // Per-turn 2-minute countdown — auto-advances on timeout
    const TURN_LIMIT = 120;
    let remaining = TURN_LIMIT;
    function fmtTime(s) {
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    const timeEl = $('mc-turn-time');
    if (timeEl) timeEl.textContent = fmtTime(remaining);
    clearInterval(_mcTurnTimerId);
    _mcTurnTimerId = setInterval(() => {
      remaining--;
      if (timeEl) timeEl.textContent = fmtTime(remaining);
      if (remaining <= 0) endTraineeTurn();
    }, 1000);

    $('btn-mc-done-turn').onclick = () => endTraineeTurn();
  }

  // Capture this turn's transcript, advance to next bot turn (or finish)
  function endTraineeTurn() {
    if (_mcTurnEnded) return; // guard double-call (timer + button race)
    _mcTurnEnded = true;

    clearInterval(_mcTurnTimerId);

    const partial = SpeechEngine.isSupported() ? SpeechEngine.stopTranscription() : '';
    _mcTranscripts.push(partial);

    $('mc-bot-live-transcript-box').style.display = 'none';
    $('mc-bot-live-transcript').textContent = 'Listening...';
    $('mc-rec-area').style.display = 'none';

    // Add trainee response bubble
    const bubble = document.createElement('div');
    bubble.className = 'mc-bubble trainee';
    bubble.textContent = partial || '(no transcript captured)';
    $('mc-chat-thread').appendChild(bubble);
    $('mc-chat-thread').scrollTop = $('mc-chat-thread').scrollHeight;

    _mcTurnIndex++;
    if (_mcTurnIndex < _mcTurns.length) {
      runBotTurn();
    } else {
      $('btn-mc-finish').style.display = '';
      $('btn-mc-finish').onclick = finishBotCall;
    }
  }

  // Stop recording, score trainee transcript, save session, show results
  async function finishBotCall() {
    if (_mcCallFinishing) return; // prevent double-submission
    _mcCallFinishing = true;
    $('btn-mc-finish').disabled = true;

    // Stop the single continuous recording
    Recorder.stop(); // also calls stopWaveform() + stopTimer() internally
    const elapsed = Recorder.getElapsed(); // works because startTimer(countUp) was called in startBotCall

    let blob = null;
    try { blob = await _mcBlobPromise; } catch (e) {}

    // Full transcript for storage (Customer/You labels — readable by admin)
    const fullTranscript = _mcTurns.map((line, i) =>
      `Customer: ${line}\nYou: ${_mcTranscripts[i] || '(no response)'}`
    ).join('\n\n');

    // Trainee-only text for AI scoring
    const traineeOnly = _mcTranscripts.join(' ').trim();

    showStep('mock-call', 'mc-step-done');
    const statusEl = $('mc-ai-scoring-status');
    if (statusEl) { statusEl.textContent = '⏳ Analyzing your call...'; statusEl.classList.remove('hidden'); }

    let aiScores = null;
    if (traineeOnly && typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
      try {
        if (statusEl) statusEl.textContent = '🤖 Claude AI is scoring your call...';
        const result = await ClaudeEvaluator.evaluate(
          'mock-call', traineeOnly, _currentTopic.title, _currentTopic.scenario || ''
        );
        if (result && result.overall !== null) {
          aiScores = { ...result.scores, overall: result.overall, _reasons: result.reasons, _method: 'claude' };
        }
      } catch (e) { console.warn('Claude scoring failed:', e.message); }
    }
    if (!aiScores) {
      aiScores = SpeechEngine.scoreMockCall(traineeOnly);
      aiScores._method = 'js';
    }
    aiScores._summary = SpeechEngine.generateCoachingSummary('mock-call', aiScores);

    if (statusEl) statusEl.classList.add('hidden');

    try {
      await DB.put('sessions', {
        traineeId:     _trainee.id,
        traineeName:   _trainee.name,
        module:        'mock-call',
        topicId:       _currentTopic.id,
        topicTitle:    _currentTopic.title,
        recordingBlob: blob,
        transcript:    fullTranscript,
        aiScores,
        adminScores:   null,
        adminComment:  '',
        status:        'ai-evaluated',
        submittedAt:   new Date().toISOString(),
        timeTaken:     Math.max(elapsed, 1),
      });
      toast('Mock call submitted!', 'success');
    } catch (e) {
      console.error('Session save failed:', e.message);
      toast('⚠ Could not save session: ' + e.message, 'error');
    }

    showMockCallResults(aiScores, fullTranscript, aiScores._method);
    $('btn-mc-finish').disabled = false;
  }

  function showMockCallResults(aiScores, transcript, method) {
    // Trainee sees ONLY the thank-you message — no scores, no transcript, no summary
    const statusEl = $('mc-ai-scoring-status');
    if (statusEl) statusEl.classList.add('hidden');
    const scoresEl = $('mc-result-scores');
    if (scoresEl) scoresEl.classList.add('hidden');
    const transcriptBox = $('mc-result-transcript-box');
    if (transcriptBox) transcriptBox.classList.add('hidden');

    $('mc-band-display').innerHTML = `
      <div style="text-align:center;padding:1.5rem 1rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:1rem">
        <div style="font-size:2.5rem;margin-bottom:0.5rem">🎉</div>
        <h3 style="color:#15803d;font-size:1.15rem;margin-bottom:0.4rem">Thank you for submitting the call.</h3>
        <p style="color:#166534;font-size:0.88rem">Your recording has been sent to the Training Team for evaluation. You will receive feedback soon.</p>
      </div>`;
    $('mc-result-method').innerHTML = '';
  }

  // ================================================================
  //  ROLE PLAY
  // ================================================================
  function initRolePlay() {
    showStep('role-play', 'rp-step-scenario');
    $('rp-title').textContent = _currentTopic.title;
    $('rp-desc').textContent = _currentTopic.description || '';
    $('rp-scenario-text').textContent = _currentTopic.scenario || '';

    const ul = $('rp-checklist');
    ul.innerHTML = '';
    (_currentTopic.checklist || []).forEach(item => {
      ul.innerHTML += `<li>${item}</li>`;
    });

    $('btn-rp-ready').onclick = () => startRolePlayRecording();
  }

  async function startRolePlayRecording() {
    showStep('role-play', 'rp-step-record');

    const blobPromise = Recorder.start();
    Recorder.startWaveform($('rp-waveform'));
    Recorder.startTimer($('rp-rec-time'), 0, null, null, true);

    $('btn-rp-stop').onclick = async () => {
      $('btn-rp-stop').disabled = true;
      Recorder.stop();
      const elapsed = Recorder.getElapsed();
      let blob = null;
      try { blob = await blobPromise; } catch (e) {}

      try {
        await DB.put('sessions', {
          traineeId: _trainee.id,
          traineeName: _trainee.name,
          module: 'role-play',
          topicId: _currentTopic.id,
          topicTitle: _currentTopic.title,
          recordingBlob: blob,
          transcript: '',
          aiScores: null,
          adminScores: null,
          adminComment: '',
          status: 'pending',
          submittedAt: new Date().toISOString(),
          timeTaken: elapsed
        });
        toast('Role play submitted!', 'success');
      } catch (e) {
        console.error('Session save failed:', e.message);
        toast('⚠ Could not save session: ' + e.message, 'error');
      }

      showStep('role-play', 'rp-step-done');
      $('btn-rp-stop').disabled = false;
    };
  }

  // ================================================================
  //  GROUP DISCUSSION
  // ================================================================
  function initGroupDiscussion() {
    showStep('group-discussion', 'gd-step-topic');
    $('gd-title').textContent = _currentTopic.title;
    $('gd-desc').textContent = _currentTopic.description || '';
    $('gd-scenario-text').textContent = _currentTopic.scenario || '';

    const ul = $('gd-checklist');
    ul.innerHTML = '';
    (_currentTopic.checklist || []).forEach(item => {
      ul.innerHTML += `<li>${item}</li>`;
    });

    $('btn-gd-ready').onclick = () => startGroupDiscussionRecording();
  }

  async function startGroupDiscussionRecording() {
    showStep('group-discussion', 'gd-step-record');

    const blobPromise = Recorder.start();
    Recorder.startWaveform($('gd-waveform'));
    Recorder.startTimer($('gd-rec-time'), 0, null, null, true);

    $('btn-gd-stop').onclick = async () => {
      $('btn-gd-stop').disabled = true;
      Recorder.stop();
      const elapsed = Recorder.getElapsed();
      let blob = null;
      try { blob = await blobPromise; } catch (e) {}

      try {
       await DB.put('sessions', {
        traineeId: _trainee.id,
        traineeName: _trainee.name,
        module: 'group-discussion',
        topicId: _currentTopic.id,
        topicTitle: _currentTopic.title,
        recordingBlob: blob,
        transcript: '',
        aiScores: null,
        adminScores: null,
        adminComment: '',
        status: 'pending',
        submittedAt: new Date().toISOString(),
        timeTaken: elapsed
      });

        toast('Contribution submitted!', 'success');
      } catch (e) {
        console.error('Session save failed:', e.message);
        toast('⚠ Could not save session: ' + e.message, 'error');
      }

      showStep('group-discussion', 'gd-step-done');
      $('btn-gd-stop').disabled = false;
    };
  }

  // ================================================================
  //  WRITTEN COMMUNICATION
  // ================================================================
  function initWrittenComm() {
    showStep('written-comm', 'wc-step-task');
    $('wc-title').textContent = _currentTopic.title;
    $('wc-desc').textContent = _currentTopic.description || '';
    $('wc-scenario-text').textContent = _currentTopic.scenario || '';

    const ul = $('wc-checklist');
    ul.innerHTML = '';
    (_currentTopic.checklist || []).forEach(item => {
      ul.innerHTML += `<li>${item}</li>`;
    });

    $('btn-wc-start').onclick = () => startWrittenCommEditor();
  }

  function startWrittenCommEditor() {
    showStep('written-comm', 'wc-step-write');
    $('wc-write-title').textContent = _currentTopic.title;
    $('wc-write-scenario').textContent = _currentTopic.scenario || '';

    const checklistUl = $('wc-write-checklist');
    if (checklistUl) {
      checklistUl.innerHTML = '';
      (_currentTopic.checklist || []).forEach(item => {
        checklistUl.innerHTML += `<li>${item}</li>`;
      });
    }

    const editor = $('wc-editor');
    editor.value = '';
    $('wc-word-count').textContent = '0';
    $('wc-time-elapsed').textContent = '0:00';

    _wcStartTime = Date.now();
    if (_wcTimerInterval) clearInterval(_wcTimerInterval);
    _wcTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - _wcStartTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      $('wc-time-elapsed').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);

    editor.oninput = () => {
      const words = editor.value.trim().split(/\s+/).filter(w => w);
      $('wc-word-count').textContent = editor.value.trim() ? words.length : 0;
    };

    $('btn-wc-submit').onclick = () => submitWrittenComm();
  }

  async function submitWrittenComm() {
    const text = $('wc-editor').value.trim();
    if (!text) {
      toast('Please write something before submitting.', 'error');
      return;
    }

    clearInterval(_wcTimerInterval);
    const duration = Math.floor((Date.now() - _wcStartTime) / 1000);
    const analysis = SpeechEngine.analyze(text, duration);
    const aiScores = SpeechEngine.scoreWriting(text, duration);
    aiScores._summary = SpeechEngine.generateCoachingSummary('written-comm', aiScores);

    try {
      await DB.put('sessions', {
        traineeId: _trainee.id,
        traineeName: _trainee.name,
        module: 'written-comm',
        topicId: _currentTopic.id,
        topicTitle: _currentTopic.title,
        recordingBlob: null,
        writtenText: text,
        transcript: text,
        aiScores,
        adminScores: null,
        adminComment: '',
        status: 'ai-evaluated',
        submittedAt: new Date().toISOString(),
        timeTaken: duration,
        analysis
      });
    } catch (e) {
      console.error('Session save failed:', e.message);
      toast('⚠ Could not save session: ' + e.message, 'error');
    }

    showWrittenCommResults(aiScores, text, analysis, duration);
  }

  function showWrittenCommResults(scores, text, analysis, duration) {
    showStep('written-comm', 'wc-step-results');

    const labels = { clarity: 'Clarity', structure: 'Structure', tone: 'Tone' };
    renderAIScores('wc-ai-scores', scores, labels);

    // Pills for writing
    const el = $('wc-analysis-pills');
    if (el && analysis) {
      const words = text.trim().split(/\s+/).filter(w => w).length;
      const m = Math.floor(duration / 60), s = duration % 60;
      el.innerHTML = [
        `<span class="pill info">${words} words</span>`,
        `<span class="pill ${words >= 80 ? 'good' : 'warn'}">${words >= 80 ? 'Good length' : 'Could be longer'}</span>`,
        `<span class="pill info">Time: ${m}:${s.toString().padStart(2, '0')}</span>`,
        `<span class="pill ${analysis.sentenceCount >= 4 ? 'good' : 'warn'}">${analysis.sentenceCount} sentences</span>`
      ].join('');
    }

    $('wc-submitted-text').textContent = text;

    const summaryEl = $('wc-coaching-summary');
    if (summaryEl) {
      if (scores && scores._summary) {
        summaryEl.textContent = scores._summary;
        summaryEl.classList.remove('hidden');
      } else {
        summaryEl.classList.add('hidden');
      }
    }

    toast('Writing submitted!', 'success');
  }

  // ================================================================
  //  GRAMMAR ASSESSMENT (MCQ) — all sections in one session
  // ================================================================

  async function initGrammarAssessment() {
    const allTopics = enabledTopics(await DB.getByIndex('topics', 'module', 'grammar-assessment'));
    if (!allTopics.length) {
      toast('No grammar tests available. Ask your admin to add questions.', 'error');
      return;
    }

    // Sort by title so Section A → B → C always loads in order
    allTopics.sort((a, b) => a.title.localeCompare(b.title));

    _gaSections = allTopics
      .map(t => ({
        id:        t.id,
        title:     t.title,
        questions: (t.checklist || []).filter(q => q && typeof q === 'object' && q.stem)
      }))
      .filter(s => s.questions.length > 0);

    if (!_gaSections.length) {
      toast('No grammar questions found. Ask your admin to add questions.', 'error');
      return;
    }

    _gaCurrentSection = 0;
    _gaSectionResults = [];

    const totalQ = _gaSections.reduce((sum, s) => sum + s.questions.length, 0);

    showScreen('grammar-assessment');
    showStep('grammar-assessment', 'ga-step-intro');

    $('ga-intro-title').textContent    = 'Grammar Assessment — Full Test';
    $('ga-intro-desc').textContent     = 'Complete all sections in one sitting. Your trainer will review and share your results.';
    $('ga-intro-sections').textContent = `${_gaSections.length} Sections`;
    $('ga-intro-count').textContent    = `${totalQ} questions total`;
    $('btn-ga-start').onclick          = () => loadGrammarSection(0);
  }

  function loadGrammarSection(idx) {
    _gaCurrentSection = idx;
    const section     = _gaSections[idx];
    _gaQuestions      = section.questions;
    _gaCurrentIdx     = 0;
    _gaUserAnswers    = new Array(section.questions.length).fill(-1);

    showStep('grammar-assessment', 'ga-step-quiz');
    renderGrammarQuestion();
  }

  function renderGrammarQuestion() {
    const q     = _gaQuestions[_gaCurrentIdx];
    const total = _gaQuestions.length;
    const cur   = _gaCurrentIdx + 1;
    const secLetter = String.fromCharCode(65 + _gaCurrentSection); // A, B, C

    // Section label + overall progress
    $('ga-section-label').textContent    = `Section ${secLetter}`;
    $('ga-section-progress').textContent = `Section ${_gaCurrentSection + 1} of ${_gaSections.length}`;

    // Progress bar within this section
    $('ga-progress-bar').style.width = `${((cur - 1) / total) * 100}%`;
    $('ga-q-num').textContent        = `Question ${cur} of ${total}`;
    $('ga-q-stem').textContent       = q.stem;

    // Answer options
    const LABELS    = ['A', 'B', 'C', 'D'];
    const container = $('ga-options-container');
    container.innerHTML = '';
    (q.options || []).forEach((opt, idx) => {
      const btn       = document.createElement('button');
      btn.className   = 'ga-option-btn' + (_gaUserAnswers[_gaCurrentIdx] === idx ? ' selected' : '');
      btn.innerHTML   = `<span class="ga-option-label">${LABELS[idx]}</span> <span>${opt}</span>`;
      btn.onclick     = () => selectGrammarOption(idx);
      container.appendChild(btn);
    });

    // Previous button (only within a section)
    const prevBtn         = $('btn-ga-prev');
    prevBtn.style.display = _gaCurrentIdx > 0 ? '' : 'none';
    prevBtn.onclick       = () => prevGrammarQuestion();

    // Next / Complete-Section / Submit button
    const nextBtn         = $('btn-ga-next');
    const isLastQ         = _gaCurrentIdx === total - 1;
    const isLastSection   = _gaCurrentSection === _gaSections.length - 1;

    if (!isLastQ) {
      nextBtn.textContent = 'Next →';
      nextBtn.onclick     = nextGrammarQuestion;
    } else if (!isLastSection) {
      nextBtn.textContent = `Complete Section ${secLetter} →`;
      nextBtn.onclick     = completeGrammarSection;
    } else {
      nextBtn.textContent = 'Submit Full Test ✓';
      nextBtn.onclick     = completeGrammarSection;
    }
  }

  function selectGrammarOption(idx) {
    _gaUserAnswers[_gaCurrentIdx] = idx;
    document.querySelectorAll('#ga-options-container .ga-option-btn').forEach((btn, i) => {
      btn.classList.toggle('selected', i === idx);
    });
  }

  function nextGrammarQuestion() {
    if (_gaUserAnswers[_gaCurrentIdx] === -1) {
      toast('Please select an answer before continuing.', 'error');
      return;
    }
    _gaCurrentIdx++;
    renderGrammarQuestion();
  }

  function prevGrammarQuestion() {
    if (_gaCurrentIdx > 0) {
      _gaCurrentIdx--;
      renderGrammarQuestion();
    }
  }

  function completeGrammarSection() {
    if (_gaUserAnswers[_gaCurrentIdx] === -1) {
      toast('Please select an answer before continuing.', 'error');
      return;
    }

    // Marks per question: Section A (index 0) = 1 mark, Section B & C (index 1,2) = 2 marks
    const marksPerQ = _gaCurrentSection === 0 ? 1 : 2;

    // Score this section
    let correct = 0;
    const answerRecord = _gaQuestions.map((q, idx) => {
      const isOk = _gaUserAnswers[idx] === q.correct;
      if (isOk) correct++;
      return {
        stem:        q.stem,
        options:     q.options,
        correct:     q.correct,
        userAnswer:  _gaUserAnswers[idx],
        isCorrect:   isOk,
        explanation: q.explanation || ''
      };
    });

    const marksObtained = correct * marksPerQ;
    const maxMarks      = _gaQuestions.length * marksPerQ;

    _gaSectionResults.push({
      title:        _gaSections[_gaCurrentSection].title,
      answerRecord,
      correct,
      total:        _gaQuestions.length,
      marksPerQ,
      marksObtained,
      maxMarks
    });

    const isLastSection = _gaCurrentSection === _gaSections.length - 1;
    if (isLastSection) {
      submitGrammarAssessment();
    } else {
      const nextIdx       = _gaCurrentSection + 1;
      const currentLetter = String.fromCharCode(65 + _gaCurrentSection);
      const nextLetter    = String.fromCharCode(65 + nextIdx);
      showStep('grammar-assessment', 'ga-step-transition');
      $('ga-transition-msg').textContent  = `Section ${currentLetter} complete! Get ready for Section ${nextLetter}.`;
      $('ga-transition-next').textContent = `Start Section ${nextLetter} →`;
      $('ga-transition-next').onclick     = () => loadGrammarSection(nextIdx);
    }
  }

  async function submitGrammarAssessment() {
    // Total marks: Section A max=40 (40×1), Section B max=26 (13×2), Section C max=34 (17×2) = 100
    const totalMarksObtained = _gaSectionResults.reduce((s, r) => s + r.marksObtained, 0);
    const totalMaxMarks      = _gaSectionResults.reduce((s, r) => s + r.maxMarks, 0); // 100
    const totalCorrect       = _gaSectionResults.reduce((s, r) => s + r.correct, 0);
    const totalQuestions     = _gaSectionResults.reduce((s, r) => s + r.total, 0);
    // Score is directly out of 100 since totalMaxMarks == 100
    const scoreOutOf100      = totalMaxMarks > 0 ? Math.round((totalMarksObtained / totalMaxMarks) * 100) : 0;

    const sessionData = {
      sections: _gaSectionResults.map(r => ({
        title:         r.title,
        answerRecord:  r.answerRecord,
        correct:       r.correct,
        total:         r.total,
        marksPerQ:     r.marksPerQ,
        marksObtained: r.marksObtained,
        maxMarks:      r.maxMarks
      })),
      totalCorrect,
      totalQuestions,
      totalMarksObtained,
      totalMaxMarks,
      scoreOutOf100
    };

    try {
      await DB.put('sessions', {
        traineeId:    _trainee.id,
        traineeName:  _trainee.name,
        module:       'grammar-assessment',
        topicId:      _gaSections[0].id,
        topicTitle:   'Grammar Assessment — Full Test (Sections A + B + C)',
        recordingBlob: null,
        transcript:   '',
        writtenText:  JSON.stringify(sessionData),
        aiScores:     { overall: scoreOutOf100, marksObtained: totalMarksObtained, totalMarks: totalMaxMarks, correctAnswers: totalCorrect, totalQuestions },
        adminScores:  null,
        adminComment: '',
        status:       'ai-evaluated',
        submittedAt:  new Date().toISOString(),
        timeTaken:    0
      });
      toast('Grammar test submitted!', 'success');
    } catch (e) {
      console.error('Session save failed:', e.message);
      toast('⚠ Could not save session: ' + e.message, 'error');
    }

    // Show confirmation — no scores visible to trainee
    showStep('grammar-assessment', 'ga-step-results');
  }

  // ---- Init ----
  async function init() {
    await DB.init();
    initAuth();
    bindNavigation();

    // Draw idle waveforms on load
    ['ps', 'mc', 'rp', 'gd'].forEach(prefix => {
      const canvas = $(`${prefix}-waveform`);
      if (canvas) Recorder.drawIdleWaveform(canvas);
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
