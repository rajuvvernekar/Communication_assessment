'use strict';

const App = (() => {
  // ---- State ----
  let _trainee = null; // { id, name }
  let _currentTopic = null;
  let _recordingPromise = null;
  let _psRecordingStartTime = null; // for duration tracking
  let _psSkipUsed = false;          // only one topic skip allowed per session
  let _wcStartTime = null;
  let _wcTimerInterval = null;

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
    if (el) { el.classList.add('active'); setTimeout(() => window.scrollTo(0, 0), 0); }
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
      screen.querySelectorAll('[id^="ps-step"],[id^="mc-step"],[id^="rp-step"],[id^="gd-step"],[id^="wc-step"]')
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
      'written-comm': 'Written Communication'
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
    const topics = await DB.getByIndex('topics', 'module', module);
    if (!topics.length) {
      toast('No topics available for this module. Ask your admin to add some.', 'error');
      return;
    }
    _currentTopic = topics[Math.floor(Math.random() * topics.length)];
    showScreen(module);

    if (module === 'pick-speak') initPickSpeak();
    else if (module === 'mock-call') initMockCall();
    else if (module === 'role-play') initRolePlay();
    else if (module === 'group-discussion') initGroupDiscussion();
    else if (module === 'written-comm') initWrittenComm();
  }

  // ================================================================
  //  PICK & SPEAK
  // ================================================================
  function initPickSpeak(isSkip = false) {
    if (!isSkip) _psSkipUsed = false;

    showStep('pick-speak', 'ps-step-topic');

    const revealEl  = $('ps-topic-reveal');
    const skipBtn   = $('btn-ps-skip-topic');
    const skipBadge = $('ps-skip-badge');

    // Always start in un-revealed state
    revealEl.classList.remove('revealed');
    $('ps-topic-title').textContent = 'Click to reveal your topic';
    $('ps-topic-desc').textContent  = 'You will have 2 minutes to prepare, then 2 minutes to speak.';
    $('btn-ps-ready').classList.add('hidden');
    $('btn-ps-reveal').style.display = '';

    // Skip button hidden until topic is revealed
    skipBtn.style.display = 'none';

    $('btn-ps-reveal').onclick = () => {
      revealEl.classList.add('revealed');
      $('ps-topic-title').textContent = _currentTopic.title;
      $('ps-topic-desc').textContent  = _currentTopic.description || '';
      $('btn-ps-ready').classList.remove('hidden');
      $('btn-ps-reveal').style.display = 'none';

      // Show skip button only if skip hasn't been used
      if (!_psSkipUsed) {
        skipBadge.textContent  = '(1 skip available)';
        skipBtn.style.display  = '';
        skipBtn.disabled       = false;
      }
    };

    // Skip: pick new topic and show it immediately (already revealed)
    skipBtn.onclick = () => {
      if (_psSkipUsed) return;
      _psSkipUsed = true;
      skipBtn.style.display = 'none';

      DB.getByIndex('topics', 'module', 'pick-speak').then(topics => {
        if (!topics.length) return;
        // Avoid repeating the same topic if possible
        let next = topics[Math.floor(Math.random() * topics.length)];
        if (topics.length > 1) {
          while (next.id === _currentTopic.id) {
            next = topics[Math.floor(Math.random() * topics.length)];
          }
        }
        _currentTopic = next;
        // Reveal the new topic inline — no need to click Reveal again
        revealEl.classList.add('revealed');
        $('ps-topic-title').textContent = _currentTopic.title;
        $('ps-topic-desc').textContent  = _currentTopic.description || '';
        $('btn-ps-ready').classList.remove('hidden');
        $('btn-ps-reveal').style.display = 'none';
      });
    };

    $('btn-ps-ready').onclick = () => startPickSpeakPrep();
    $('btn-ps-again').onclick = () => {
      DB.getByIndex('topics', 'module', 'pick-speak').then(topics => {
        if (topics.length) {
          _currentTopic = topics[Math.floor(Math.random() * topics.length)];
          initPickSpeak();
        }
      });
    };
  }

  async function startPickSpeakPrep() {
    // Request mic here — called directly from user click ("I'm Ready"),
    // so the browser allows the getUserMedia prompt.
    const micOk = await Recorder.requestMic();
    if (!micOk) {
      toast('⚠ Microphone access denied. Please allow mic access in your browser and try again.', 'error');
      return;
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

    const REC_DURATION = 120;

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
      : 120;
    const analysis = SpeechEngine.analyze(finalTranscript, Math.max(duration, 10));
    const aiScores = SpeechEngine.scoreSpeech(analysis, Math.max(duration, 10));

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
      status: finalTranscript ? 'ai-evaluated' : 'pending',
      submittedAt: new Date().toISOString(),
      timeTaken: Math.max(duration, 10),
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

    // Band card (overall performance classification)
    if (scores && scores.overall !== undefined) {
      renderBandCard('ps-band-display', 'pick-speak', scores.overall);
    }

    const labels = {
      clarity: 'Clarity of Thought', logicalFlow: 'Logical Flow', relevance: 'Relevance to Topic',
      grammar: 'Grammar Accuracy', vocabulary: 'Vocabulary', sentenceVariety: 'Sentence Variety',
      fluency: 'Fluency', pace: 'Pace of Speech', fillerControl: 'Filler Word Control',
      confidence: 'Confidence', professionalism: 'Tone & Professionalism', timeManagement: 'Time Management'
    };
    renderAIScores('ps-ai-scores', scores, labels);
    renderAnalysisPills('ps-analysis-pills', analysis, duration);

    $('ps-final-transcript').textContent = transcript || 'No transcript captured. Your recording has been saved for admin review.';
    $('btn-ps-stop').disabled = false;
    toast('Assessment submitted!', 'success');
  }

  // ================================================================
  //  MOCK CALL
  // ================================================================
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

    $('btn-mc-ready').onclick = () => startMockCallRecording();
  }

  async function startMockCallRecording() {
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

      // Score: Claude API → JS fallback
      let aiScores = null;
      let scoringMethod = 'none';

      if (finalTranscript) {
        if (typeof ClaudeEvaluator !== 'undefined' && ClaudeEvaluator.isAvailable()) {
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
        if (!aiScores) {
          aiScores = SpeechEngine.scoreMockCall(finalTranscript);
          aiScores._method = 'js';
          scoringMethod = 'js';
        }
      }

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
          status: finalTranscript ? 'ai-evaluated' : 'pending',
          submittedAt: new Date().toISOString(),
          timeTaken: elapsed
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

  function showMockCallResults(aiScores, transcript, method) {
    // Labels in display order matching Excel criteria
    const MC_LABELS = [
      { key: 'callOpening',          label: 'Call Opening' },
      { key: 'acknowledgment',       label: 'Acknowledgment' },
      { key: 'activeListening',      label: 'Active Listening & Probing' },
      { key: 'communicationClarity', label: 'Communication Clarity' },
      { key: 'callEssence',          label: 'Call Essence' },
      { key: 'holdProcedure',        label: 'Hold Procedure' },
      { key: 'extraMile',            label: 'Extra Mile' },
      { key: 'callClosing',          label: 'Call Closing' }
    ];

    const bandEl = $('mc-band-display');
    const scoresEl = $('mc-result-scores');
    const transcriptResultEl = $('mc-result-transcript');
    const transcriptBox = $('mc-result-transcript-box');
    const methodEl = $('mc-result-method');

    // Band card — shown first, most prominent
    if (aiScores && typeof aiScores.overall === 'number') {
      renderBandCard('mc-band-display', 'mock-call', aiScores.overall);
    }

    if (scoresEl) {
      if (aiScores && typeof aiScores.overall === 'number') {
        const reasons = aiScores._reasons || {};
        let html = `<div class="ai-scores-list">`;

        MC_LABELS.forEach(({ key, label }) => {
          const val = aiScores[key];
          if (val === undefined) return;
          const barPct = ((val / 5) * 100).toFixed(0);
          const stars = '★'.repeat(Math.round(val)) + '☆'.repeat(5 - Math.round(val));
          const reason = reasons[key] ? `<div class="score-reason">${reasons[key]}</div>` : '';
          html += `
            <div class="ai-score-row">
              <span class="score-label">${label}</span>
              <div class="score-bar"><div class="score-bar-fill" style="width:${barPct}%;background:var(--mc-color)"></div></div>
              <span class="score-stars" style="color:var(--mc-color)">${stars}</span>
              <span class="score-val">${val}/5</span>
            </div>${reason}`;
        });
        html += `</div>`;
        scoresEl.innerHTML = html;
        scoresEl.classList.remove('hidden');
      } else {
        scoresEl.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:1rem">
          No transcript captured — your recording has been saved for admin review.</p>`;
        scoresEl.classList.remove('hidden');
      }
    }

    if (methodEl) {
      if (method === 'claude') {
        methodEl.innerHTML = '<span class="pill good">🤖 Scored by Claude AI</span>';
      } else if (method === 'js') {
        methodEl.innerHTML = '<span class="pill info">📊 Scored by phrase analysis (add API key for Claude scoring)</span>';
      }
    }

    if (transcript && transcriptResultEl) {
      transcriptResultEl.textContent = transcript;
      if (transcriptBox) transcriptBox.classList.remove('hidden');
    }
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
    toast('Writing submitted!', 'success');
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
