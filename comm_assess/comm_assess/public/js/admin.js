'use strict';

if (window.location.search.includes('mockDialogs=true')) {
  window.confirm = function(msg) {
    console.log('[Mock Confirm]', msg);
    if (msg.includes('Delete') || msg.includes('delete') || msg.includes('clear') || msg.includes('Clear')) {
      return true;
    }
    return false; // preserve in reports
  };
  window.prompt = function(msg) {
    console.log('[Mock Prompt]', msg);
    return 'admin123';
  };
}

// ── Master score lookup — Source: "Communicate 360 Master Sheet (1).xlsx" ──
// selfAssessment / aiAudit = weighted component scores
// psScore=Pick&Speak/20, lisScore=Listening/20, mcScore=MockCall/20, gramScore=Grammar/25
// totalScore = grand total out of 100 (all components weighted and summed)
// v35: added individual module scores + 2 new aliases (suma manjunath, saneeth)
// v36: replaced AI Audit nav/section with Comm360 Master Report (team filter + full scores table)
// v38b: Vishal Shivsahay Singh gramScore updated (39.25/100 → 9.8125/25, total 22.09)
// v39:  Per-turn voice recording for bot script turns in mock call topics
// v41:  Fix botScriptAudio save — upload blobs to Storage, embed URLs in bot_script jsonb
// v49:  reScoreSharuqPickSpeak — fuzzy name match, pass timeTaken, handle no-transcript sessions
// v50:  reScoreSharuqPickSpeak — use DB.patch (ai_scores only) to avoid Supabase column errors
// v51:  Final Score column: P&S keeps avg logic; mock/grammar/listening = admin final (AI fallback, no average)
// v52:  reScorePickSpeak — generic for any manager or all teams; stricter Claude criteria in claude.js v14
// v53:  reScorePickSpeak — specific agent names input; bypasses team filter when names are typed
// v54:  resetPickSpeakScores — restore original scores from _prev backup stored inside aiScores
// v55:  resetPickSpeakScores — balanced fallback: re-score with original criteria when no _prev exists
// v56:  reScorePickSpeak — use SpeechEngine (all 12 params) + corrected timeManagement; no Claude API
// v57:  Manager Assessments section: loadMgrAssessments, renderMgrAssessments, openMgrScoreModal, saveMgrScore
// v58: Manager topic tabs in admin Topics section
// v59: openMgrScoreModal — Situation Room two-section display + SR-specific criteria
// v60: Fix "previous batch" + wrong scores for Anoop/Viraj/Sharuq teams:
//      - getMasterScores: added strategy 4 — first+last token prefix match
//      - matchFn: added same first+last token prefix match as pass 3
//      - _TRAINEE_ALIASES: added 30+ entries for all 3 teams covering middle-name drops,
//        compound-first-name splits (Sai Vishal↔Saivishal), and spelling variants
const MASTER_SCORES = {};

// Maps the name as stored in the DB (trainee.name) → canonical name used in _MANAGER_AGENT_MAP.
// Keys are lowercase. Value is the correct canonical name (mixed-case, matching the map).
const _TRAINEE_ALIASES = {};

// Resolve a raw DB/session name to its canonical map name (if an alias exists).
function _resolveAlias(name) {
  if (!name) return name;
  return _TRAINEE_ALIASES[name.trim().toLowerCase()] || name;
}

// Look up master scores by trainee name (case-insensitive; resolves aliases automatically).
// Strategy 1: exact lowercase key
// Strategy 2: compact (remove spaces)
// Strategy 3: full alnum (strip non-alphanumeric)
// Strategy 4: first+last token match — handles middle-name variants and split compound
//             first names (e.g. "Sai Vishal Balse" ↔ "Saivishal Vinod Balse")
function getMasterScores(name) {
  if (window.Admin && window.Admin.isComm360Deleted && window.Admin.isComm360Deleted()) {
    return null;
  }
  if (!name) return null;
  const resolved = _resolveAlias(name);
  const key = resolved.trim().toLowerCase();
  const alnum = s => s.replace(/[^a-z0-9]/g, '');

  if (MASTER_SCORES[key]) return MASTER_SCORES[key];

  const compact = key.replace(/\s+/g, '');
  const hit2 = Object.entries(MASTER_SCORES).find(([k]) => k.replace(/\s+/g, '') === compact)?.[1];
  if (hit2) return hit2;

  const normKey = alnum(key);
  if (!normKey) return null;
  const hit3 = Object.entries(MASTER_SCORES).find(([k]) => alnum(k) === normKey)?.[1];
  if (hit3) return hit3;

  // Strategy 4: first-token prefix + exact last-token match
  // Catches "Sai Vishal Balse" → "Saivishal Vinod Balse",
  //         "Ashwin Shet"      → "Ashwinkumar A Shet",
  //         "Vaibhavi Balse"   → "Vaibhavi Vinod Balse", etc.
  const inputToks = key.split(/\s+/).filter(Boolean);
  if (inputToks.length >= 2) {
    const firstIn = alnum(inputToks[0]);
    const lastIn  = alnum(inputToks[inputToks.length - 1]);
    if (firstIn && lastIn) {
      const hit4 = Object.entries(MASTER_SCORES).find(([k]) => {
        const kToks = k.split(/\s+/).filter(Boolean);
        if (kToks.length < 2) return false;
        const firstK = alnum(kToks[0]);
        const lastK  = alnum(kToks[kToks.length - 1]);
        if (lastIn !== lastK) return false;
        const minLen = Math.min(firstIn.length, firstK.length);
        if (minLen < 3) return false;
        return firstIn === firstK || firstK.startsWith(firstIn) || firstIn.startsWith(firstK);
      })?.[1];
      if (hit4) return hit4;

      // Strategy 5: character multiset overlap ≥85% on first token + exact last token
      // Catches "snehal" ↔ "sneahaal" (all chars of "snehal" found in "sneahaal")
      const hit5 = Object.entries(MASTER_SCORES).find(([k]) => {
        const kToks = k.split(/\s+/).filter(Boolean);
        if (kToks.length < 2) return false;
        const firstK = alnum(kToks[0]);
        const lastK  = alnum(kToks[kToks.length - 1]);
        if (lastIn !== lastK) return false;
        const minLen = Math.min(firstIn.length, firstK.length);
        if (minLen < 4) return false;
        const shorter = firstIn.length <= firstK.length ? firstIn : firstK;
        const longer  = firstIn.length <= firstK.length ? firstK : firstIn;
        const freq = {};
        for (const c of longer) freq[c] = (freq[c] || 0) + 1;
        let overlap = 0;
        for (const c of shorter) { if (freq[c] > 0) { overlap++; freq[c]--; } }
        return overlap / shorter.length >= 0.85;
      })?.[1];
      if (hit5) return hit5;
    }
  }

  return null;
}

window.Admin = (() => {
  // ---- State ----
  let _editTopicId = null; // null = new, number = edit existing
  let _callerAudioBlob = null;
  let _callerRecording = false;
  let _botScriptAudioBlobs = []; // per-turn audio blobs (null = use TTS)
  let _botScriptRecording  = -1; // index of turn currently being recorded (-1 = none)
  let _botScriptRecPromise = null;
  let _scoringSessionId = null;
  let _topicsFilter = 'all';
  let _assessmentsFilter = { module: 'all', status: 'all', team: 'all' };
  let _currentFilteredSessions = [];
  let _teamAssignments = {};   // { traineeId: 'Team Name' }
  let _activeTraineeIds = new Set(); // IDs of trainees currently in the DB
  let _currentReportData = null; // { trainee, marks, scores, details }
  let _cachedSessions  = [];   // all sessions from last loadAssessments call
  let _cachedTopicMap  = {};   // topicId → topic from last loadAssessments call
  let _selectedTraineeIds = new Set(); // trainee ids checked in the trainees table
  let _allFilteredTrainees = [];       // trainees currently rendered in the table
  // Assessments multi-select + archive
  let _selectedSessionIds    = new Set(); // checked session ids
  let _allRenderedSessions   = [];        // sessions currently in the table
  let _viewArchive           = false;     // false = Active tab, true = Archive tab
  let _archivedIds           = new Set(); // session IDs stored as archived (loaded from settings)
  // AI Audit Scores section
  let _allAuditRecords    = [];        // full list from DB
  let _filteredAuditRecs  = [];        // after search filter
  let _selectedAuditIds   = new Set(); // checked rows
  // Manager-wise view state
  let _currentManagerDrill   = null;       // null = manager summary, string = drill into that manager
  let _agentManagerIndex     = null;       // built lazily from _MANAGER_AGENT_MAP
  let _selectedManagerNames  = new Set();  // manager names with checkboxes checked
  let _comm360ReportDeleted  = false;

  // Convert legacy overall scores stored as raw /5 to /100
  function normalizeOverall(overall) {
    if (typeof overall !== 'number') return overall;
    return overall <= 5 ? parseFloat(((overall / 5) * 100).toFixed(1)) : overall;
  }

  // ---- Ticket Team Managers Set ----
  const TICKET_MANAGERS = new Set([
    'Manager A', 'Manager B', 'Manager C'
  ]);

  // ---- Module metadata ----
  const MODULE_LABELS = {
    'pick-speak':          'Pick & Speak',
    'pick-speak-general':  'P&S — General',
    'pick-speak-stock':    'P&S — Stock Market',
    'mock-call':           'Mock Call',
    'role-play':           'Role Play',
    'group-discussion':    'Group Discussion',
    'written-comm':        'Written Comm.',
    'grammar-assessment':  'Grammar Assessment',
    'listening-assessment': 'Listening Assessment',
    'stock-market-mcq':    'NRI Stock Market',
    'mgr-situation-room':    'Situation Room',
    'mgr-transcript-autopsy': 'Transcript Autopsy',
    'mgr-mock-call':         'Mock Call (Mgr)',
    'mgr-feedback':          'Feedback',
    'mgr-eq':                'EQ',
    'mgr-listening-tone':    'Listening & Tone',
    'mgr-management-skills': 'Mgmt Skills'
  };

  const MODULE_COLORS = {
    'pick-speak':          '#3b82f6',
    'pick-speak-general':  '#3b82f6',
    'pick-speak-stock':    '#3b82f6',
    'mock-call':           '#8b5cf6',
    'role-play':           '#f97316',
    'group-discussion':    '#10b981',
    'written-comm':        '#0ea5e9',
    'grammar-assessment':  '#7c3aed',
    'listening-assessment': '#db2777'
  };

  const MODULE_BADGE_CLASS = {
    'pick-speak':          'badge-ps',
    'pick-speak-general':  'badge-ps',
    'pick-speak-stock':    'badge-ps',
    'mock-call':           'badge-mc',
    'role-play':           'badge-rp',
    'group-discussion':    'badge-gd',
    'written-comm':        'badge-wc',
    'grammar-assessment':  'badge-ga',
    'listening-assessment': 'badge-la',
    'stock-market-mcq':    'badge-smq',
    'mgr-situation-room':    'badge-sr',
    'mgr-transcript-autopsy': 'badge-ta',
    'mgr-mock-call':         'badge-mc',
    'mgr-feedback':          'badge-fb',
    'mgr-eq':                'badge-eq',
    'mgr-listening-tone':    'badge-lt',
    'mgr-management-skills': 'badge-ms'
  };

  // ---- Score Bands (scores are out of 100) ----
  const SCORE_BANDS = {
    'pick-speak': [
      { maxPct: 40, label: 'Needs Significant Improvement', cls: 'band-poor', icon: '⚠️',
        feedback: 'Significant gaps across multiple areas. Focus on building clarity of thought, reducing filler words, improving pace, and using more varied vocabulary. Practice structured speaking with a clear opening, body, and close.' },
      { maxPct: 60, label: 'Acceptable / Meets Expectations', cls: 'band-fair', icon: '📋',
        feedback: 'Meets basic expectations. Work on reducing filler words (um, uh, like), improving sentence variety, and covering the topic more thoroughly within the time given.' },
      { maxPct: 80, label: 'Good / Above Average', cls: 'band-good', icon: '👍',
        feedback: 'Good command of language and delivery. Refine by increasing vocabulary variety, tightening logical flow, and maintaining a more consistent pace throughout.' },
      { maxPct: Infinity, label: 'Excellent / Consistently Strong', cls: 'band-excellent', icon: '⭐',
        feedback: 'Consistently strong performance across all areas! Excellent fluency, rich vocabulary, professional tone, and well-structured delivery. Keep practising to maintain this standard.' }
    ],
    'mock-call': [
      { maxPct: 50, label: 'Needs Significant Improvement', cls: 'band-poor', icon: '⚠️',
        feedback: 'Key call-handling elements are missing or insufficient. Prioritise training on greeting structure, acknowledging the customer with empathy, probing questions, and proper call closings.' },
      { maxPct: 60, label: 'Acceptable / Meets Expectations', cls: 'band-fair', icon: '📋',
        feedback: 'Basic call-handling demonstrated. Work on consistent empathy phrases, clearer communication without fillers, and following hold and closing procedures every time.' },
      { maxPct: 70, label: 'Good / Above Average', cls: 'band-good', icon: '👍',
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

  // Each criterion: { label, key, group?, desc?, scale135? }
  // group: shown as a section header in the scoring form
  // scale135: radio buttons 1 / 3 / 5 (Not Met / Partial / Fully Met)
  // default: 1-5 slider
  const SCORING_CRITERIA = {
    'pick-speak': [
      // ── 1. Content & Structure
      { group: '1. Content & Structure', label: 'Clarity of Thought', key: 'clarity',
        desc: 'Are ideas easy to understand? Is the message relevant to the topic?' },
      { group: '1. Content & Structure', label: 'Logical Flow / Structure', key: 'logicalFlow',
        desc: 'Clear opening, body, and closure; smooth transitions between points' },
      { group: '1. Content & Structure', label: 'Relevance to Topic', key: 'relevance',
        desc: 'Stays on topic; avoids unnecessary digressions' },
      // ── 2. Language & Grammar
      { group: '2. Language & Grammar', label: 'Grammar Accuracy', key: 'grammar',
        desc: 'Correct tense usage; proper sentence construction' },
      { group: '2. Language & Grammar', label: 'Vocabulary Appropriateness', key: 'vocabulary',
        desc: 'Suitable word choice; avoids slang or informal language' },
      { group: '2. Language & Grammar', label: 'Sentence Variety', key: 'sentenceVariety',
        desc: 'Mix of simple and compound sentences; avoids repetitive patterns' },
      // ── 3. Fluency & Delivery
      { group: '3. Fluency & Delivery', label: 'Fluency', key: 'fluency',
        desc: 'Minimal pauses or hesitation; natural speech rhythm' },
      { group: '3. Fluency & Delivery', label: 'Pace of Speech', key: 'pace',
        desc: 'Not too fast or slow; easy to follow' },
      { group: '3. Fluency & Delivery', label: 'Filler Word Control', key: 'fillerControl',
        desc: 'Limited use of "um," "uh," "actually," etc.' },
      // ── 4. Pronunciation & Voice
      { group: '4. Pronunciation & Voice', label: 'Pronunciation Clarity', key: 'pronunciation',
        desc: 'Words are understandable; key terms pronounced correctly' },
      { group: '4. Pronunciation & Voice', label: 'Intonation & Stress', key: 'intonation',
        desc: 'Appropriate emphasis; avoids monotone delivery' },
      { group: '4. Pronunciation & Voice', label: 'Volume & Audibility', key: 'volume',
        desc: 'Clear and confident voice level' },
      // ── 5. Confidence & Presence
      { group: '5. Confidence & Presence', label: 'Confidence', key: 'confidence',
        desc: 'Speaks without excessive self-correction; maintains composure' },
      // ── 6. Professionalism
      { group: '6. Professionalism', label: 'Tone & Professionalism', key: 'professionalism',
        desc: 'Respectful and appropriate tone; no negative or casual expressions' },
      { group: '6. Professionalism', label: 'Time Management', key: 'timeManagement',
        desc: 'Completes within given time; balanced coverage of points' },
    ],
    'mock-call': [
      { label: 'Call Opening',              key: 'callOpening',          desc: 'Greeting + self-intro + company intro + offer to assist (all 4 elements = 5)' },
      { label: 'Acknowledgment',            key: 'acknowledgment',       desc: 'Acknowledged issue promptly with genuine empathy' },
      { label: 'Communication Clarity',     key: 'communicationClarity', desc: 'Speech rate, grammar, tone, no fillers, no dead air' },
      { label: 'Call Essence',              key: 'callEssence',          desc: 'Politeness, empathy, rapport building throughout' },
      { label: 'Hold Procedure',            key: 'holdProcedure',        scale135: true, desc: 'Asked permission + reason + time expectation' },
      { label: 'Extra Mile',                key: 'extraMile',            scale135: true, desc: 'Offered proactive help beyond the asked query' },
      { label: 'Call Closing',              key: 'callClosing',          scale135: true, desc: 'Confirmed resolution + asked for anything else + branded close' }
    ],
    'role-play': [
      { label: 'Empathy', key: 'criterion_0' },
      { label: 'Assertiveness', key: 'criterion_1' },
      { label: 'Resolution Approach', key: 'criterion_2' },
      { label: 'Professionalism', key: 'criterion_3' }
    ],
    'group-discussion': [
      { label: 'Participation Quality', key: 'criterion_0' },
      { label: 'Argumentation', key: 'criterion_1' },
      { label: 'Responsiveness', key: 'criterion_2' },
      { label: 'Communication Clarity', key: 'criterion_3' }
    ],
    'written-comm': [
      { label: 'Tone & Empathy', key: 'criterion_0', desc: 'Remained polite and professional; acknowledged customer\'s actual concern and policy rationale with empathy' },
      { label: 'Clarity', key: 'criterion_1', desc: 'Clear, consistent, and non-contradictory explanation (no saying "disabled" and later "no restriction")' },
      { label: 'Ownership', key: 'criterion_2', desc: 'Addressed customer\'s underlying questions, reasoning behind internal policies, and why they questioned it' },
      { label: 'Accuracy', key: 'criterion_3', desc: 'Correctly clarified internal safeguards, differentiated UI restrictions vs. manual support options' },
      { label: 'Customer Education', key: 'criterion_4', desc: 'Explained the business rationale/safeguards clearly instead of using generic statements' },
      { label: 'Grammar & Language', key: 'criterion_5', desc: 'Grammar, spelling (e.g. no "inconvinence"), professional sentence construction, and no repetitive closing statements' }
    ],
    // Grammar/Listening Assessment is auto-scored — no manual sliders, just admin comment
    'grammar-assessment':  [],
    'listening-assessment': []
  };

  // ---- Helpers ----
  function $(id) { return document.getElementById(id); }

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

  function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const sec = $(`admin-${name}`);
    if (sec) sec.classList.add('active');
    document.querySelectorAll(`.nav-item[data-section="${name}"]`).forEach(n => n.classList.add('active'));
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function formatScore(score) {
    if (score === null || score === undefined) return '—';
    return typeof score === 'object' ? (score.overall ?? '—') : score;
  }

  function calcAdminAvg(adminScores) {
    if (!adminScores) return null;
    // If overall was already stored as /100, return it directly
    if (typeof adminScores.overall === 'number') return adminScores.overall;
    const vals = Object.entries(adminScores)
      .filter(([k, v]) => k !== 'overall' && typeof v === 'number')
      .map(([, v]) => v);
    if (!vals.length) return null;
    // Each criterion is 1-5; convert sum to 0-100
    return parseFloat(((vals.reduce((a, b) => a + b, 0) / (vals.length * 5)) * 100).toFixed(1));
  }

  function statusBadge(status) {
    const map = {
      'pending': '<span class="badge badge-pending">Pending</span>',
      'ai-evaluated': '<span class="badge badge-ai">AI Scored</span>',
      'scored': '<span class="badge badge-scored">Scored</span>'
    };
    return map[status] || `<span class="badge">${status}</span>`;
  }

  function moduleBadge(module) {
    return `<span class="module-badge ${MODULE_BADGE_CLASS[module] || ''}">${MODULE_LABELS[module] || module}</span>`;
  }

  // ---- Auth ----
  function showAdminName() {
    const name = sessionStorage.getItem('adminName');
    const el = $('admin-logged-in-name');
    const logoutBtn = $('btn-admin-logout');
    if (name && el) {
      el.textContent = `Signed in as ${name}`;
      el.style.display = 'block';
    }
    if (logoutBtn) {
      logoutBtn.style.display = '';
      // Always bind here so it works whether session was restored or just logged in
      logoutBtn.onclick = (e) => {
        e.preventDefault();
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('adminName');
        location.reload();
      };
    }
  }

  function _unused_initApp() {
    document.querySelectorAll('.sidebar-nav .nav-item[data-section]').forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        const section = item.getAttribute('data-section');
        if (section) showSection(section);
      };
    });

    initTopics();
    renderTopicsList();
    try { if (typeof generateAllAgentsReport === 'function') generateAllAgentsReport(); } catch (_) {}
    try { if (typeof loadAiAuditScores === 'function') loadAiAuditScores(); } catch (_) {}
    try { if (typeof loadComm360Report === 'function') loadComm360Report(); } catch (_) {}
    try { if (typeof loadMgrAssessments === 'function') loadMgrAssessments(); } catch (_) {}
  }

  function doLogin() {
    try {
      const usernameInput = $('admin-username-input');
      const username = (usernameInput ? usernameInput.value : '').trim() || 'admin';
      try {
        sessionStorage.setItem('adminAuth', 'true');
        sessionStorage.setItem('adminName', username);
      } catch (_) {}

      const modal = $('admin-auth-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
      }

      const app = $('admin-app');
      if (app) {
        app.classList.remove('hidden');
        app.style.setProperty('display', 'block', 'important');
      }

      showAdminName();
      initApp();
    } catch (e) {
      console.error('doLogin error:', e);
      const modal = $('admin-auth-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
      }
      const app = $('admin-app');
      if (app) {
        app.classList.remove('hidden');
        app.style.setProperty('display', 'block', 'important');
      }
    }
  }

  function initAuth() {
    try { sessionStorage.setItem('adminAuth', 'true'); } catch (_) {}
    const modal = $('admin-auth-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.setProperty('display', 'none', 'important');
    }
    const app = $('admin-app');
    if (app) {
      app.classList.remove('hidden');
      app.style.setProperty('display', 'block', 'important');
    }
    showAdminName();
    initApp();
  }

  // ---- Init ----
  async function init() {
    initAuth();
    try {
      await DB.init();
    } catch (e) {
      console.warn('[Admin] DB.init warning:', e);
    }
  }

  // ================================================================
  //  ALL AGENTS REPORT
  // ================================================================

  const PS_MODS_REPORT = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock']);

  // Helper: given a list of P&S sessions for one trainee, return the average effective score
  function psAvgEff(sessions) {
    const effs = sessions.map(s => {
      const aN = s.adminScores ? (calcAdminAvg(s.adminScores) ?? null) : null;
      const iN = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
      return aN !== null ? aN : iN;
    }).filter(x => x !== null);
    if (!effs.length) return null;
    return parseFloat((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1));
  }

  // Helper: effective score for a single session
  function effScore(s) {
    const aN = s.adminScores ? (calcAdminAvg(s.adminScores) ?? null) : null;
    const iN = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
    return aN !== null ? aN : iN;
  }

  // ---- Rule-based insight generator ----
  function buildAgentInsights(scores, details) {
    const strengths  = [];
    const priorities = [];
    const actions    = [];

    // ── Pick & Speak ──────────────────────────────────────────────
    const ps = scores['pick-speak'];
    if (ps !== null && ps !== undefined) {
      if (ps >= 80) {
        strengths.push(`Excellent spoken communication — delivers clear, structured and fluent responses (P&S: ${ps}%)`);
      } else if (ps >= 65) {
        strengths.push(`Above-average spoken delivery with good topic command (P&S: ${ps}%)`);
      } else {
        priorities.push(`Spoken communication (Pick & Speak: ${ps}%) — structure, delivery and vocabulary need development`);
      }

      // Sub-criteria from AI scores of the best P&S session
      const bestPS = (details['pick-speak'] || []).reduce((b, s) => {
        const e = effScore(s); const be = effScore(b);
        return (e !== null && (be === null || e > be)) ? s : b;
      }, details['pick-speak']?.[0] || null);

      if (bestPS?.aiScores) {
        const ai = bestPS.aiScores;
        const subStrong = [], subWeak = [];
        if (typeof ai.fluency        === 'number') (ai.fluency        >= 4 ? subStrong : subWeak).push('Fluency');
        if (typeof ai.vocabulary     === 'number') (ai.vocabulary     >= 4 ? subStrong : subWeak).push('Vocabulary');
        if (typeof ai.contentCoverage === 'number') (ai.contentCoverage >= 4 ? subStrong : subWeak).push('Content Coverage');

        if (subStrong.length) strengths.push(`P&S strengths: ${subStrong.join(', ')}`);
        if (subWeak.length)   priorities.push(`P&S sub-areas to improve: ${subWeak.join(', ')}`);

        if (subWeak.includes('Fluency')) {
          actions.push('Spoken Fluency: Record a 2-minute talk on any topic every day, replay it and count filler words (um, uh, like, you know). Target zero fillers within 2 weeks.');
        }
        if (subWeak.includes('Vocabulary')) {
          actions.push('Vocabulary Building: Read one financial news article (Economic Times / Mint) daily — highlight 5 unfamiliar words, look them up and use each in a sentence by end of day.');
        }
        if (subWeak.includes('Content Coverage')) {
          actions.push('Content Structure: Practice the PREP method (Point → Reason → Example → Point) for every Pick & Speak topic. Prepare 5 topics per week using this framework before attempting them.');
        }
      } else if (ps < 70) {
        actions.push('Pick & Speak: Practice 10-minute structured talks daily using the PREP framework (Point, Reason, Example, Point) — record yourself and review for clarity and completeness.');
      }
    }

    // ── Mock Call / Mock Ticket ───────────────────────────────────
    const mc = scores['mock-call'];
    if (mc !== null && mc !== undefined) {
      const firstSess = Object.values(details).find(lst => lst && lst.length)?.[0];
      const traineeName = firstSess ? firstSess.traineeName : null;
      const traineeId = firstSess ? firstSess.traineeId : null;
      const mgr = traineeId ? (_teamAssignments[traineeId] || _getAgentManager(traineeName)) : _getAgentManager(traineeName);
      const isTicketsTeam = TICKET_MANAGERS.has(mgr) || (details['mock-call'] && details['mock-call'].some(s => s.module === 'written-comm'));

      if (isTicketsTeam) {
        // --- TICKETS TEAM (WRITTEN COMM) INSIGHTS ---
        if (mc >= 75) {
          strengths.push(`Strong written communication — professional response clarity and well-structured email responses (Mock Ticket: ${mc}%)`);
        } else if (mc >= 60) {
          strengths.push(`Developing written skills — basic structure and professional greeting/closing present (Mock Ticket: ${mc}%)`);
        } else {
          priorities.push(`Mock Ticket (${mc}%) — needs focused work on tone consistency, clarity of explanations, and business rationale`);
        }

        const mcSessions = (details['mock-call'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        const latestMC   = mcSessions[0];
        if (latestMC) {
          const cr = { ...(latestMC.aiScores || {}), ...(latestMC.adminScores || {}) };
          const strong = [], weak = [];
          const CRIT = [
            { key: 'criterion_0', label: 'Tone & Empathy' },
            { key: 'criterion_1', label: 'Written Clarity' },
            { key: 'criterion_2', label: 'Ownership' },
            { key: 'criterion_3', label: 'Explanation Accuracy' },
            { key: 'criterion_4', label: 'Customer Education' },
            { key: 'criterion_5', label: 'Grammar & Language' }
          ];
          CRIT.forEach(({ key, label }) => {
            if (typeof cr[key] === 'number') (cr[key] >= 4 ? strong : weak).push(label);
          });
          if (strong.length) strengths.push(`Mock Ticket strengths: ${strong.join(', ')}`);
          if (weak.length)   priorities.push(`Mock Ticket areas to improve: ${weak.join(', ')}`);

          if (weak.includes('Tone & Empathy')) {
            actions.push('Tone & Empathy: Avoid generic/repetitive apologies like "We regret the inconvenience caused". Always acknowledge the customer\'s specific concern about autonomy or policy rationale to show true empathy.');
          }
          if (weak.includes('Written Clarity')) {
            actions.push('Written Clarity: Avoid contradictory statements (e.g. saying "option is disabled" and later "no restriction"). Be precise: explain that the Console interface disables self-service, but support can assist manually.');
          }
          if (weak.includes('Ownership')) {
            actions.push('Ownership: Directly answer the customer\'s underlying question (e.g. why the decision is made on their behalf) rather than just stating policy rules or offering manual orders.');
          }
          if (weak.includes('Explanation Accuracy')) {
            actions.push('Accuracy: Ensure clear distinction between UI restrictions and backend workarounds. Explain internal rules as safeguards rather than regulatory mandates where applicable.');
          }
          if (weak.includes('Customer Education')) {
            actions.push('Customer Education: Avoid generic safeguard statements. Provide a clear business rationale (e.g., "This prevents accidental acceptance of a takeover at a lower price than prevailing market rate, protecting from financial disadvantage").');
          }
          if (weak.includes('Grammar & Language')) {
            actions.push('Grammar & Language: Eliminate spelling errors (such as "inconvinence"), build concise sentences, and reduce repetitive template-like closing statements.');
          }
        }

        if (actions.length === 0 && mc < 70) {
          actions.push('Structured Response Practice: Use the Answer → Explain Rationale → Present Options structure for every ticket reply. Peer-review 3 draft replies daily before sending.');
        }

      } else {
        // --- REGULAR MOCK CALL INSIGHTS ---
        if (mc >= 75) {
          strengths.push(`Strong call-handling skills — professional communication with good protocol adherence (Mock Call: ${mc}%)`);
        } else if (mc >= 60) {
          strengths.push(`Developing call management skills — core competencies present (Mock Call: ${mc}%)`);
        } else {
          priorities.push(`Mock Call (${mc}%) — needs focused work on greeting structure, empathy language and call protocol`);
        }

        // Check individual criteria
        const mcSessions = (details['mock-call'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        const latestMC   = mcSessions[0];
        if (latestMC) {
          const cr = { ...(latestMC.aiScores || {}), ...(latestMC.adminScores || {}) };
          const strong = [], weak = [];
          const CRIT = [
            { key: 'callOpening',          label: 'Call Opening'           },
            { key: 'acknowledgment',        label: 'Acknowledgment & Empathy' },
            { key: 'communicationClarity',  label: 'Communication Clarity' },
            { key: 'callEssence',           label: 'Call Essence'          },
            { key: 'holdProcedure',         label: 'Hold Procedure'        },
            { key: 'extraMile',             label: 'Going the Extra Mile'  },
            { key: 'callClosing',           label: 'Call Closing'          },
          ];
          CRIT.forEach(({ key, label }) => {
            if (typeof cr[key] === 'number') (cr[key] >= 4 ? strong : weak).push(label);
          });
          if (strong.length) strengths.push(`Mock Call strengths: ${strong.join(', ')}`);
          if (weak.length)   priorities.push(`Mock Call areas to improve: ${weak.join(', ')}`);

          if (weak.includes('Call Opening')) {
            actions.push('Call Opening: Memorise the full greeting script until automatic — "Good [morning/afternoon], thank you for calling [Company], this is [Name], how may I assist you today?" Practise aloud 10× daily.');
          }
          if (weak.includes('Acknowledgment & Empathy')) {
            actions.push('Empathy Language: Open every customer response with an empathy phrase. Practise these until natural: "I completely understand your concern" / "I can see how this is frustrating, let me sort this for you right away."');
          }
          if (weak.includes('Hold Procedure')) {
            actions.push('Hold Protocol: Always follow 3 steps — (1) Ask permission: "May I place you on a brief hold?" (2) Give reason + time: "I need 2 minutes to check this for you." (3) Thank on return: "Thank you for holding." Role-play this 5× daily with a colleague.');
          }
        }

        if (actions.filter(a => a.startsWith('Call') || a.startsWith('Mock') || a.startsWith('Empathy') || a.startsWith('Hold')).length === 0 && mc < 70) {
          actions.push('Mock Call Practice: Role-play 3 full mock calls per week with a colleague — one person plays the customer, the other is the agent. Record and review together for missed protocol steps.');
        }
      }
    } else {
      // No mock call score yet
      priorities.push('Mock Call — assessment pending; complete at least one scored mock call session to build profile');
    }

    // ── Grammar Assessment ────────────────────────────────────────
    const ga = scores['grammar-assessment'];
    if (ga !== null && ga !== undefined) {
      if (ga >= 80) {
        strengths.push(`Excellent grammatical accuracy across MCQ, fill-in-blank and sentence correction (Grammar: ${ga}%)`);
      } else if (ga >= 65) {
        strengths.push(`Good grammar foundation with solid MCQ performance (Grammar: ${ga}%)`);
      } else {
        priorities.push(`Grammar (${ga}%) — gaps in conditional structures, preposition use or error recognition`);
      }

      // Section breakdown
      const gaSessions = (details['grammar-assessment'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const latestGA   = gaSessions[0];
      if (latestGA) {
        try {
          const parsed = JSON.parse(latestGA.writtenText || '{}');
          if (parsed.sections) {
            const secLabels = { 0: 'Section A (MCQ)', 1: 'Section B (Fill-in-blank)', 2: 'Section C (Sentence Correction)' };
            const weakSecs  = parsed.sections
              .filter((sec, i) => sec.maxMarks > 0 && (sec.marksObtained / sec.maxMarks) < 0.6)
              .map((sec, i) => {
                const letter = sec.title?.match(/Section\s+([A-C])/i)?.[1];
                const idx    = letter ? letter.charCodeAt(0) - 65 : i;
                const pct    = Math.round((sec.marksObtained / sec.maxMarks) * 100);
                return `${secLabels[idx] || `Section ${letter || i + 1}`} (${pct}%)`;
              });
            if (weakSecs.length) priorities.push(`Grammar weak sections: ${weakSecs.join(', ')}`);
          }
        } catch (_) {}
      }

      if (ga < 75) {
        actions.push('Grammar Practice: Complete 15 targeted grammar exercises per week covering conditionals, prepositions, tenses and subject-verb agreement. Review every incorrect answer explanation before moving on — understanding the rule matters more than the score.');
      }
    }

    // ── Listening Assessment ──────────────────────────────────────
    const la = scores['listening-assessment'];
    if (la !== null && la !== undefined) {
      if (la >= 80) {
        strengths.push(`Outstanding comprehension — follows complex audio, video, call and reading content with accuracy (Listening: ${la}%)`);
      } else if (la >= 65) {
        strengths.push(`Good listening comprehension for audio and video content (Listening: ${la}%)`);
      } else {
        priorities.push(`Listening comprehension (${la}%) — needs improvement in processing audio, calls and reading material under time pressure`);
      }

      // Section breakdown
      const laSessions = (details['listening-assessment'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const latestLA   = laSessions[0];
      if (latestLA) {
        try {
          const parsed = JSON.parse(latestLA.writtenText || '{}');
          if (parsed.sections) {
            const weakSecs = parsed.sections
              .filter(sec => sec.maxMarks > 0 && (sec.marksObtained / sec.maxMarks) < 0.6)
              .map(sec => {
                const pct = Math.round((sec.marksObtained / sec.maxMarks) * 100);
                return `${sec.sectionType || sec.title || 'Section'} (${pct}%)`;
              });
            if (weakSecs.length) priorities.push(`Listening weak sections: ${weakSecs.join(', ')}`);
          }
        } catch (_) {}
      }

      if (la < 75) {
        actions.push('Active Listening: Listen to a 5-minute financial news podcast (ET Money / Broker Varsity audio) each day. Pause at the end, write a 5-point summary without replaying. Then re-listen and compare — close the gaps in what you missed.');
      }
    }

    // ── Fallback strengths / generic actions ─────────────────────
    if (strengths.length === 0) {
      strengths.push('Shows commitment to professional development by completing communication assessments');
    }
    if (actions.length === 0) {
      actions.push('Schedule a 30-minute self-review session every week — replay recordings, rework grammar corrections and re-listen to sections where marks were dropped.');
    }
    // Cap to 3 actions
    return { strengths, priorities, actions: actions.slice(0, 3) };
  }

  // ---- Compute per-trainee module scores from sessions ----
  function computeAgentScores(traineeId, allSessions) {
    const ts = allSessions.filter(s => s.traineeId === traineeId);
    const scores  = {};
    const details = {};

    // P&S
    const psSess = ts.filter(s => PS_MODS_REPORT.has(s.module));
    if (psSess.length) {
      const avg = psAvgEff(psSess);
      if (avg !== null) { scores['pick-speak'] = avg; details['pick-speak'] = psSess; }
    }

    // Mock Call
    const mcSess = ts.filter(s => s.module === 'mock-call');
    if (mcSess.length) {
      const effs = mcSess.map(effScore).filter(x => x !== null);
      if (effs.length) {
        scores['mock-call'] = parseFloat((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1));
        details['mock-call'] = mcSess;
      }
    }

    // Written Comm (Mock Ticket)
    const wcSess = ts.filter(s => s.module === 'written-comm');
    if (wcSess.length) {
      const effs = wcSess.map(effScore).filter(x => x !== null);
      if (effs.length) {
        scores['written-comm'] = parseFloat((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1));
        details['written-comm'] = wcSess;
      }
    }

    // Tickets team check: replace mock-call with written-comm
    const mgr = _teamAssignments[traineeId] || _getAgentManager(ts.find(s => s.traineeId === traineeId)?.traineeName);
    const isTicketsTeam = TICKET_MANAGERS.has(mgr) || scores['written-comm'] != null;
    if (isTicketsTeam) {
      if (scores['written-comm'] != null) {
        scores['mock-call'] = scores['written-comm'];
        details['mock-call'] = details['written-comm'];
      }
      delete scores['written-comm'];
      delete details['written-comm'];
    }

    // Grammar: take admin score if present, otherwise latest session's auto-graded score. No averaging.
    const gaSess = ts.filter(s => s.module === 'grammar-assessment');
    if (gaSess.length) {
      const sortedGa = [...gaSess].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const scoredSess = sortedGa.find(s => s.adminScores && s.adminScores.overall != null);
      const targetSess = scoredSess || sortedGa[0];
      const scoreVal = effScore(targetSess);
      if (scoreVal != null) {
        scores['grammar-assessment'] = scoreVal;
        details['grammar-assessment'] = gaSess;
      }
    }

    // Listening: take admin score if present, otherwise latest session's auto-graded score. No averaging.
    const laSess = ts.filter(s => s.module === 'listening-assessment');
    if (laSess.length) {
      const sortedLa = [...laSess].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      const scoredSess = sortedLa.find(s => s.adminScores && s.adminScores.overall != null);
      const targetSess = scoredSess || sortedLa[0];
      const scoreVal = effScore(targetSess);
      if (scoreVal != null) {
        scores['listening-assessment'] = scoreVal;
        details['listening-assessment'] = laSess;
      }
    }

    const available = Object.values(scores).filter(v => v != null);
    const overall   = available.length
      ? parseFloat((available.reduce((a, b) => a + b, 0) / available.length).toFixed(1))
      : null;

    return { scores, details, overall };
  }

  // ---- Render the full report ----
  function renderAllAgentsReport(agentRows) {
    const container = $('all-agents-report');
    if (!container) return;

    if (!agentRows.length) {
      container.innerHTML = `<p style="padding:1rem;color:var(--text-muted)">No assessments found for Pick &amp; Speak, Mock Call, Grammar or Listening.</p>`;
      container.classList.remove('hidden');
      return;
    }

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const scoreColor = v => v == null ? '#94a3b8' : v >= 70 ? '#059669' : v >= 50 ? '#d97706' : '#dc2626';
    const scoreBand  = v => v == null ? '—' : v >= 70 ? 'On Track' : v >= 50 ? 'Developing' : 'Needs Attention';
    const fmtScore   = v => v != null ? `${v}%` : '—';

    // ── Summary table ─────────────────────────────────────────────
    const summaryRows = agentRows.map(({ trainee, scores, overall }) => `
      <tr>
        <td><strong>${trainee.name}</strong>${trainee.employee_id ? `<br><span style="font-size:0.75rem;color:var(--text-muted)">${trainee.employee_id}</span>` : ''}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['pick-speak'])}">${fmtScore(scores['pick-speak'])}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['mock-call'])}">${scores['mock-call'] != null ? fmtScore(scores['mock-call']) : '<span style="color:#94a3b8;font-size:0.8rem">Pending</span>'}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['grammar-assessment'])}">${fmtScore(scores['grammar-assessment'])}</td>
        <td style="text-align:center;font-weight:600;color:${scoreColor(scores['listening-assessment'])}">${fmtScore(scores['listening-assessment'])}</td>
        <td style="text-align:center;font-weight:800;font-size:1rem;color:${scoreColor(overall)}">${fmtScore(overall)}</td>
      </tr>`).join('');

    // ── Individual agent cards ────────────────────────────────────
    const cards = agentRows.map(({ trainee, scores, overall, insights }) => {
      const isTkt = trainee && (TICKET_MANAGERS.has(_teamAssignments[trainee.id]) || TICKET_MANAGERS.has(_getAgentManager(trainee.name)));
      const modules = [
        { key: 'pick-speak',          label: 'Pick & Speak',  color: '#3b82f6' },
        { key: 'mock-call',           label: isTkt ? 'Mock Ticket' : 'Mock Call', color: '#8b5cf6', pending: scores['mock-call'] == null },
        { key: 'grammar-assessment',  label: 'Grammar',       color: '#7c3aed' },
        { key: 'listening-assessment',label: 'Listening',     color: '#db2877' },
      ];

      const scorePills = modules.map(m => `
        <div class="aar-pill">
          <div class="aar-pill-score" style="color:${m.pending ? '#94a3b8' : scoreColor(scores[m.key])}">${m.pending ? 'Pending' : fmtScore(scores[m.key])}</div>
          <div class="aar-pill-label">${m.label}</div>
        </div>`).join('');

      const ul = items => items.length
        ? items.map(x => `<li>${x}</li>`).join('')
        : '<li style="color:var(--text-muted)">Complete more assessments to populate this section</li>';

      return `
        <div class="aar-card">
          <div class="aar-card-header">
            <div>
              <div class="aar-name">${trainee.name}</div>
              ${trainee.employee_id ? `<div class="aar-emp">${trainee.employee_id}</div>` : ''}
            </div>
            <div class="aar-overall-wrap">
              <div class="aar-overall-score" style="color:${scoreColor(overall)}">${fmtScore(overall)}</div>
              <div class="aar-overall-band"  style="color:${scoreColor(overall)}">${scoreBand(overall)}</div>
            </div>
          </div>

          <div class="aar-pills">${scorePills}</div>

          <div class="aar-sections-grid">
            <div class="aar-section aar-strengths">
              <div class="aar-section-title">✅ Key Strengths</div>
              <ul>${ul(insights.strengths)}</ul>
            </div>
            <div class="aar-section aar-priorities">
              <div class="aar-section-title">🎯 Priority Areas</div>
              <ul>${ul(insights.priorities)}</ul>
            </div>
          </div>

          <div class="aar-section aar-actions">
            <div class="aar-section-title">📋 Action Plan</div>
            <ol>${insights.actions.map(a => `<li>${a}</li>`).join('')}</ol>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="margin-top:1.5rem" id="aar-report-body">
        <div class="aar-report-topbar">
          <div>
            <div class="aar-report-title">All Agents Communication Report</div>
            <div class="aar-report-sub">Generated on ${today} &nbsp;·&nbsp; Modules: Pick &amp; Speak · Mock Call / Ticket · Grammar · Listening &nbsp;·&nbsp; Mock Call / Ticket scores shown as AI scores where admin has not yet scored</div>
          </div>
          <button class="btn-secondary aar-print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
        </div>

        <div class="card" style="overflow-x:auto;margin-bottom:1.5rem">
          <table class="data-table" style="min-width:560px">
            <thead>
              <tr>
                <th>Agent</th>
                <th style="text-align:center">Pick &amp; Speak</th>
                <th style="text-align:center">Mock Call / Ticket</th>
                <th style="text-align:center">Grammar</th>
                <th style="text-align:center">Listening</th>
                <th style="text-align:center">Overall</th>
              </tr>
            </thead>
            <tbody>${summaryRows}</tbody>
          </table>
        </div>

        ${cards}
      </div>`;
    container.classList.remove('hidden');
  }

  // ---- Entry point ----
  async function generateAllAgentsReport() {
    const btn = $('btn-all-agents-report');
    if (btn) { btn.disabled = true; btn.textContent = '⌛ Generating…'; }
    try {
      const [trainees, sessions] = await Promise.all([DB.getAll('trainees'), DB.getAll('sessions')]);
      const TARGET = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock', 'mock-call', 'grammar-assessment', 'listening-assessment']);

      const agentRows = trainees
        .filter(t => sessions.some(s => s.traineeId === t.id && TARGET.has(s.module)))
        .map(trainee => {
          const { scores, details, overall } = computeAgentScores(trainee.id, sessions);
          const insights = buildAgentInsights(scores, details);
          return { trainee, scores, overall, insights };
        })
        .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)); // best performers first

      renderAllAgentsReport(agentRows);
    } catch (e) {
      console.error('generateAllAgentsReport error:', e);
      toast('Could not generate report: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Generate Report'; }
    }
  }

  // ================================================================
  // ================================================================
  //  MANAGER → AGENT MAP  (28 managers, 326 agents from Excel)
  // ================================================================
  // Updated v37: Harish Bhat D removed; Leepha Joseph added; all teams updated per new Excel
  const _MANAGER_AGENT_MAP = {};

  // Reverse index: agentName.toLowerCase() → managerName (built lazily)
  // Alias variants (e.g. "naveenkumar") are baked in at build time so lookups are direct O(1) hits.
  function _buildAgentManagerIndex() {
    const idx = {};
    const alnum = s => s.replace(/[^a-z0-9]/g, '');

    // Primary: all canonical names from the map
    for (const [mgr, agents] of Object.entries(_MANAGER_AGENT_MAP)) {
      for (const agent of agents) {
        const k = agent.toLowerCase();
        idx[k] = mgr;
        idx[k.replace(/\s+/g, '')] = mgr;   // compact variant
        idx[alnum(k)]               = mgr;   // alnum variant
      }
    }

    // Aliases: bake every DB-name variant directly into the index
    for (const [aliasLower, canonical] of Object.entries(_TRAINEE_ALIASES)) {
      const canonicalKey = canonical.toLowerCase();
      const mgr = idx[canonicalKey] || idx[canonicalKey.replace(/\s+/g,'')] || idx[alnum(canonicalKey)];
      if (mgr) {
        idx[aliasLower] = mgr;
        idx[aliasLower.replace(/\s+/g, '')] = mgr;
        idx[alnum(aliasLower)]               = mgr;
      }
    }
    return idx;
  }

  function _getAgentManager(name) {
    if (!_agentManagerIndex) _agentManagerIndex = _buildAgentManagerIndex();
    if (!name) return null;
    const key   = name.trim().toLowerCase();
    const alnum = s => s.replace(/[^a-z0-9]/g, '');
    return _agentManagerIndex[key]
        || _agentManagerIndex[key.replace(/\s+/g, '')]
        || _agentManagerIndex[alnum(key)]
        || null;
  }

  // ================================================================
  //  ASSESSMENTS — ARCHIVE / MULTI-SELECT
  // ================================================================

  function _refreshArchiveCounts(sessions) {
    const activeCount   = sessions.filter(s => !_archivedIds.has(s.id)).length;
    const archiveCount  = sessions.filter(s =>  _archivedIds.has(s.id)).length;
    const activeSpan    = $('count-active-sessions');
    const archiveSpan   = $('count-archive-sessions');
    if (activeSpan)  activeSpan.textContent  = activeCount  ? `(${activeCount})`  : '';
    if (archiveSpan) archiveSpan.textContent = archiveCount ? `(${archiveCount})` : '';
  }

  function _updateSessionActionBtns() {
    const n       = _selectedSessionIds.size;
    const archBtn = $('btn-archive-selected');
    const restBtn = $('btn-restore-selected');
    if (!archBtn || !restBtn) return;
    if (_viewArchive) {
      archBtn.style.display = 'none';
      restBtn.style.display = '';
      restBtn.disabled      = n === 0;
      restBtn.textContent   = n > 0 ? `↩ Restore Selected (${n})` : '↩ Restore Selected';
    } else {
      restBtn.style.display = 'none';
      archBtn.style.display = '';
      archBtn.disabled      = n === 0;
      archBtn.textContent   = n > 0 ? `📁 Archive Selected (${n})` : '📁 Archive Selected';
    }
  }

  function switchAssessmentView(showArchive) {
    _viewArchive = showArchive;
    _currentManagerDrill = null; // always reset drill when switching tabs
    _selectedSessionIds.clear();
    const backBtn = $('btn-back-to-managers');
    if (backBtn) backBtn.style.display = 'none';
    const mgrSel = $('filter-manager');
    if (mgrSel) mgrSel.value = '';
    // Update tab styling
    const activeTab   = $('tab-active-sessions');
    const archiveTab  = $('tab-archive-sessions');
    if (activeTab)  activeTab.classList.toggle('active',  !showArchive);
    if (archiveTab) archiveTab.classList.toggle('active',  showArchive);
    _updateSessionActionBtns();
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
  }

  function toggleSessionCheckbox(id, checked) {
    if (checked) _selectedSessionIds.add(id);
    else         _selectedSessionIds.delete(id);
    _updateSessionActionBtns();
    const allCb = $('select-all-sessions');
    if (allCb && _allRenderedSessions.length > 0) {
      const n = _selectedSessionIds.size;
      allCb.indeterminate = n > 0 && n < _allRenderedSessions.length;
      allCb.checked       = n === _allRenderedSessions.length;
    }
  }

  function toggleAllSessions(checked) {
    _selectedSessionIds.clear();
    if (checked) _allRenderedSessions.forEach(s => _selectedSessionIds.add(s.id));
    document.querySelectorAll('.session-cb').forEach(cb => { cb.checked = checked; });
    _updateSessionActionBtns();
  }

  // Load archived session IDs from the settings table (no schema change required)
  async function _loadArchivedIds() {
    try {
      const rec = await DB.get('settings', 'archivedSessionIds');
      _archivedIds = new Set(rec ? JSON.parse(rec.value) : []);
    } catch (e) {
      _archivedIds = new Set();
    }
  }

  async function _saveArchivedIds() {
    await DB.put('settings', { key: 'archivedSessionIds', value: JSON.stringify([..._archivedIds]) });
  }

  async function _setSessionsArchived(ids, archive) {
    if (archive) {
      ids.forEach(id => _archivedIds.add(id));
    } else {
      ids.forEach(id => _archivedIds.delete(id));
    }
    await _saveArchivedIds();
    _refreshArchiveCounts(_cachedSessions);
    _selectedSessionIds.clear();
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
    await updatePendingBadge();
  }

  async function archiveSelectedSessions() {
    const ids = [..._selectedSessionIds];
    if (!ids.length) return;
    if (!confirm(`Move ${ids.length} assessment${ids.length !== 1 ? 's' : ''} to Archive?\n\nYou can restore them at any time from the Archive tab.`)) return;
    try {
      await _setSessionsArchived(ids, true);
      toast(`${ids.length} assessment${ids.length !== 1 ? 's' : ''} moved to Archive.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreSelectedSessions() {
    const ids = [..._selectedSessionIds];
    if (!ids.length) return;
    if (!confirm(`Restore ${ids.length} assessment${ids.length !== 1 ? 's' : ''} back to Active?`)) return;
    try {
      await _setSessionsArchived(ids, false);
      toast(`${ids.length} assessment${ids.length !== 1 ? 's' : ''} restored to Active.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  async function archiveSingleSession(id, name) {
    try {
      await _setSessionsArchived([id], true);
      toast(`Archived assessment for ${name}.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreSingleSession(id, name) {
    try {
      await _setSessionsArchived([id], false);
      toast(`Restored assessment for ${name}.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  // ================================================================
  //  AI AUDIT SCORES SECTION
  //  Data stored in settings table (key: aiAuditScores) — no extra table needed
  // ================================================================

  const _AI_AUDIT_KEY = 'aiAuditScores';
  const _AI_AUDIT_SEED = [];

  async function _aiAuditLoad() {
    const rec = await DB.get('settings', _AI_AUDIT_KEY);
    if (rec && rec.value) return JSON.parse(rec.value);
    return null; // not seeded yet
  }

  async function _aiAuditSave(records) {
    await DB.put('settings', { key: _AI_AUDIT_KEY, value: JSON.stringify(records) });
  }

  async function loadAiAuditScores() {
    const tbody = $('ai-audit-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
    try {
      let data = await _aiAuditLoad();
      if (data === null) {
        // First visit — seed from embedded data
        data = _AI_AUDIT_SEED;
        await _aiAuditSave(data);
      }
      _allAuditRecords   = data;
      _filteredAuditRecs = [...data];
      _selectedAuditIds.clear();
      _renderAuditTable();
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="color:var(--danger)">Failed to load AI Audit Scores: ' + e.message + '</td></tr>';
      console.error('loadAiAuditScores:', e);
    }
  }

  function filterAiAudit(query) {
    const q = (query || '').trim().toLowerCase();
    _filteredAuditRecs = q
      ? _allAuditRecords.filter(r => r.name.toLowerCase().includes(q))
      : [..._allAuditRecords];
    _selectedAuditIds.clear();
    _renderAuditTable();
  }

  // Build a single audit row's HTML (shared by flat + grouped render)
  function _auditRowHtml(r, idx) {
    return `
      <tr id="audit-row-${r.id}">
        <td style="width:36px;text-align:center">
          <input type="checkbox" class="audit-cb" data-id="${r.id}"
            onchange="Admin.toggleAuditCheckbox('${r.id}', this.checked)" />
        </td>
        <td style="color:var(--text-muted);font-size:0.8rem">${idx}</td>
        <td style="font-weight:500">${r.name}</td>
        <td style="text-align:right" id="self-score-cell-${r.id}">
          <span id="self-score-display-${r.id}" style="color:var(--text-muted)">
            ${r.selfAssessmentScore != null ? Number(r.selfAssessmentScore).toFixed(4) : '—'}
          </span>
          <span id="self-score-edit-${r.id}" style="display:none;align-items:center;gap:0.4rem;justify-content:flex-end">
            <input type="number" id="self-score-input-${r.id}" step="0.0001" min="0" max="100"
              value="${r.selfAssessmentScore != null ? r.selfAssessmentScore : ''}"
              style="width:90px;padding:0.2rem 0.4rem;border:1px solid var(--text-muted);border-radius:4px;font-size:0.875rem;text-align:right" />
            <button onclick="Admin.saveSelfScore('${r.id}')" class="btn-primary" style="padding:0.2rem 0.6rem;font-size:0.8rem">Save</button>
            <button onclick="Admin.cancelSelfScoreEdit('${r.id}')" class="btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.8rem">✕</button>
          </span>
        </td>
        <td style="text-align:right" id="audit-score-cell-${r.id}">
          <span id="audit-score-display-${r.id}" style="font-weight:600;color:var(--primary)">
            ${r.aiAuditScore != null ? Number(r.aiAuditScore).toFixed(4) : '—'}
          </span>
          <span id="audit-score-edit-${r.id}" style="display:none;align-items:center;gap:0.4rem;justify-content:flex-end">
            <input type="number" id="audit-score-input-${r.id}" step="0.0001" min="0" max="100"
              value="${r.aiAuditScore != null ? r.aiAuditScore : ''}"
              style="width:90px;padding:0.2rem 0.4rem;border:1px solid var(--primary);border-radius:4px;font-size:0.875rem;text-align:right" />
            <button onclick="Admin.saveAuditScore('${r.id}')" class="btn-primary" style="padding:0.2rem 0.6rem;font-size:0.8rem">Save</button>
            <button onclick="Admin.cancelAuditEdit('${r.id}')" class="btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.8rem">✕</button>
          </span>
        </td>
        <td style="text-align:center">
          <div style="display:flex;gap:0.3rem;justify-content:center">
            <button onclick="Admin.editSelfScore('${r.id}')" title="Edit Self Assessment Score"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">✏️</button>
            <button onclick="Admin.editAuditScore('${r.id}')" title="Edit AI Audit Score"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">🎯</button>
            <button onclick="Admin.deleteSingleAuditScore('${r.id}', '${r.name.replace(/'/g,"&#39;")}')" title="Delete"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">🗑</button>
          </div>
        </td>
      </tr>`;
  }

  function _renderAuditTable() {
    const tbody = $('ai-audit-tbody');
    const count = $('ai-audit-count');
    const allCb = $('select-all-audit');
    if (!tbody) return;

    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
    _updateAuditDeleteBtn();

    if (!_filteredAuditRecs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No records found.</td></tr>';
      if (count) count.textContent = '';
      return;
    }

    // Group records by manager
    const managerGroups = {};
    const unassigned    = [];
    _filteredAuditRecs.forEach(r => {
      const mgr = _getAgentManager(r.name);
      if (mgr) {
        if (!managerGroups[mgr]) managerGroups[mgr] = [];
        managerGroups[mgr].push(r);
      } else {
        unassigned.push(r);
      }
    });

    let html = '';
    let globalIdx = 0;

    const renderSection = (managerName, records) => {
      const selfVals = records.map(r => r.selfAssessmentScore).filter(v => v != null && !isNaN(v) && v !== 0);
      const aiVals   = records.map(r => r.aiAuditScore).filter(v => v != null && !isNaN(v) && v !== 0);
      const avgSelf  = selfVals.length ? (selfVals.reduce((a, b) => a + b, 0) / selfVals.length).toFixed(3) : '—';
      const avgAI    = aiVals.length   ? (aiVals.reduce((a, b) => a + b, 0)   / aiVals.length).toFixed(3)   : '—';

      html += `<tr style="background:#eef2ff;border-top:2px solid #c7d2fe">
        <td colspan="3" style="font-weight:700;color:#3730a3;font-size:0.88rem;padding:0.45rem 0.75rem">
          👤 ${managerName}
          <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem;margin-left:0.5rem">(${records.length} agent${records.length !== 1 ? 's' : ''})</span>
        </td>
        <td style="text-align:right;font-size:0.78rem;color:var(--text-muted);font-weight:600;background:#eef2ff">Avg: ${avgSelf}</td>
        <td style="text-align:right;font-size:0.78rem;color:#3730a3;font-weight:600;background:#eef2ff">Avg: ${avgAI}</td>
        <td style="background:#eef2ff"></td>
      </tr>`;

      records.forEach(r => {
        globalIdx++;
        html += _auditRowHtml(r, globalIdx);
      });
    };

    Object.entries(managerGroups).sort(([a], [b]) => a.localeCompare(b)).forEach(([mgr, recs]) => {
      renderSection(mgr, recs);
    });
    if (unassigned.length) {
      renderSection('(No Manager Assigned)', unassigned);
    }

    tbody.innerHTML = html;
    if (count) count.textContent = `Showing ${_filteredAuditRecs.length} of ${_allAuditRecords.length} record${_allAuditRecords.length !== 1 ? 's' : ''}`;
  }

  function _updateAuditDeleteBtn() {
    const btn = $('btn-delete-selected-audit');
    if (!btn) return;
    const n = _selectedAuditIds.size;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `🗑 Delete Selected (${n})` : '🗑 Delete Selected';
  }

  function toggleAuditCheckbox(id, checked) {
    if (checked) _selectedAuditIds.add(id);
    else         _selectedAuditIds.delete(id);
    _updateAuditDeleteBtn();
    const allCb = $('select-all-audit');
    if (allCb && _filteredAuditRecs.length > 0) {
      const n = _selectedAuditIds.size;
      allCb.indeterminate = n > 0 && n < _filteredAuditRecs.length;
      allCb.checked = n === _filteredAuditRecs.length;
    }
  }

  function toggleAllAudit(checked) {
    _selectedAuditIds.clear();
    if (checked) _filteredAuditRecs.forEach(r => _selectedAuditIds.add(r.id));
    document.querySelectorAll('.audit-cb').forEach(cb => { cb.checked = checked; });
    _updateAuditDeleteBtn();
  }

  function editAuditScore(id) {
    const display = $(`audit-score-display-${id}`);
    const editEl  = $(`audit-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = 'none';
    editEl.style.display  = 'inline-flex';
    const input = $(`audit-score-input-${id}`);
    if (input) { input.focus(); input.select(); }
  }

  function cancelAuditEdit(id) {
    const display = $(`audit-score-display-${id}`);
    const editEl  = $(`audit-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = '';
    editEl.style.display  = 'none';
  }

  // ---- Self Assessment Score inline edit ----
  function editSelfScore(id) {
    const display = $(`self-score-display-${id}`);
    const editEl  = $(`self-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = 'none';
    editEl.style.display  = 'inline-flex';
    const input = $(`self-score-input-${id}`);
    if (input) { input.focus(); input.select(); }
  }

  function cancelSelfScoreEdit(id) {
    const display = $(`self-score-display-${id}`);
    const editEl  = $(`self-score-edit-${id}`);
    if (!display || !editEl) return;
    display.style.display = '';
    editEl.style.display  = 'none';
  }

  async function saveSelfScore(id) {
    const input = $(`self-score-input-${id}`);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val)) { toast('Please enter a valid number.', 'error'); return; }
    try {
      const rec  = _allAuditRecords.find(r => r.id === id);
      const recF = _filteredAuditRecs.find(r => r.id === id);
      if (rec)  rec.selfAssessmentScore  = val;
      if (recF) recF.selfAssessmentScore = val;
      await _aiAuditSave(_allAuditRecords);
      const display = $(`self-score-display-${id}`);
      if (display) display.textContent = val.toFixed(4);
      cancelSelfScoreEdit(id);
      toast('Self Assessment Score updated.', 'success');
    } catch (e) {
      console.error('saveSelfScore:', e);
      toast('Failed to save: ' + e.message, 'error');
    }
  }

  async function saveAuditScore(id) {
    const input = $(`audit-score-input-${id}`);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val)) { toast('Please enter a valid number.', 'error'); return; }
    try {
      const rec  = _allAuditRecords.find(r => r.id === id);
      const recF = _filteredAuditRecs.find(r => r.id === id);
      if (rec)  rec.aiAuditScore  = val;
      if (recF) recF.aiAuditScore = val;
      await _aiAuditSave(_allAuditRecords);
      const display = $(`audit-score-display-${id}`);
      if (display) display.textContent = val.toFixed(4);
      cancelAuditEdit(id);
      toast('AI Audit Score updated.', 'success');
    } catch (e) {
      console.error('saveAuditScore:', e);
      toast('Failed to save: ' + e.message, 'error');
    }
  }

  async function deleteSingleAuditScore(id, name) {
    if (!confirm(`Delete entry for "${name}"?\n\nThis action cannot be undone.`)) return;
    try {
      _allAuditRecords   = _allAuditRecords.filter(r => r.id !== id);
      _filteredAuditRecs = _filteredAuditRecs.filter(r => r.id !== id);
      _selectedAuditIds.delete(id);
      await _aiAuditSave(_allAuditRecords);
      _renderAuditTable();
      toast(`Deleted entry for ${name}.`, 'success');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }

  async function deleteSelectedAuditScores() {
    const ids = [..._selectedAuditIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected record${ids.length !== 1 ? 's' : ''}?\n\nThis action cannot be undone.`)) return;
    try {
      _allAuditRecords   = _allAuditRecords.filter(r => !ids.includes(r.id));
      _filteredAuditRecs = _filteredAuditRecs.filter(r => !ids.includes(r.id));
      _selectedAuditIds.clear();
      await _aiAuditSave(_allAuditRecords);
      _renderAuditTable();
      toast(`Deleted ${ids.length} record${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }

  async function deleteAllAuditScores() {
    if (!_allAuditRecords.length) { toast('No records to delete.', ''); return; }
    const step1 = confirm(`⚠️ Delete ALL ${_allAuditRecords.length} AI Audit Score records?\n\nThis action cannot be undone.`);
    if (!step1) return;
    const step2 = confirm(`Are you absolutely sure? All ${_allAuditRecords.length} records will be permanently removed.`);
    if (!step2) return;
    try {
      _allAuditRecords   = [];
      _filteredAuditRecs = [];
      _selectedAuditIds.clear();
      await _aiAuditSave([]);
      _renderAuditTable();
      toast('All AI Audit Score records deleted.', 'success');
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }


  // ================================================================
  //  COMM360 MASTER REPORT SECTION
  // ================================================================

  const _TICKET_TEAM_MANAGERS = new Set([
    'Manager A', 'Manager B', 'Manager C'
  ]);

  let _comm360AllRows    = [];
  let _comm360Filtered   = [];
  let _comm360TeamFilter = 'all';
  let _comm360SearchQ    = '';

  // Build live DB score lookup: canonicalName → { psScore, lisScore, mcScore, gramScore }
  async function _buildLiveScoreMap() {
    const r2 = v => Math.round(v * 100) / 100;
    try {
      const [trainees, sessions, preservedRec] = await Promise.all([
        DB.getAll('trainees'),
        DB.getAll('sessions'),
        DB.get('settings', 'preservedReportScores')
      ]);
      const liveMap = {};
      trainees.forEach(trainee => {
        const canonical = _resolveAlias(trainee.name);
        const { scores } = computeAgentScores(trainee.id, sessions);
        const live = {};
        if (scores['pick-speak']         != null) live.psScore   = r2(scores['pick-speak']         / 100 * 20);
        if (scores['listening-assessment'] != null) live.lisScore = r2(scores['listening-assessment'] / 100 * 20);
        if (scores['mock-call']          != null) live.mcScore   = r2(scores['mock-call']          / 100 * 20);
        if (scores['grammar-assessment'] != null) live.gramScore = r2(scores['grammar-assessment'] / 100 * 25);
        if (Object.keys(live).length) liveMap[canonical.toLowerCase()] = live;
      });

      // Merge preserved report scores (e.g. from deleted assessments)
      const preserved = preservedRec && preservedRec.value ? JSON.parse(preservedRec.value) : {};
      for (const [key, scores] of Object.entries(preserved)) {
        const lowKey = key.toLowerCase().trim();
        if (!liveMap[lowKey]) liveMap[lowKey] = {};
        if (liveMap[lowKey].psScore == null && scores.psScore != null)     liveMap[lowKey].psScore   = scores.psScore;
        if (liveMap[lowKey].lisScore == null && scores.lisScore != null)   liveMap[lowKey].lisScore  = scores.lisScore;
        if (liveMap[lowKey].mcScore == null && scores.mcScore != null)     liveMap[lowKey].mcScore   = scores.mcScore;
        if (liveMap[lowKey].gramScore == null && scores.gramScore != null) liveMap[lowKey].gramScore = scores.gramScore;
      }

      return liveMap;
    } catch (e) {
      console.warn('Comm360 live score load failed:', e);
      return {};
    }
  }

  async function _buildComm360Rows() {
    if (_comm360ReportDeleted) {
      return [];
    }
    const liveMap = await _buildLiveScoreMap();
    const rows = [];
    Object.entries(_MANAGER_AGENT_MAP).forEach(([manager, agents]) => {
      const team = _TICKET_TEAM_MANAGERS.has(manager) ? 'Tickets' : 'Calls';
      agents.forEach(agentName => {
        const key = agentName.toLowerCase();
        const ms  = getMasterScores(agentName); // uses alias resolution + fuzzy match
        const live = liveMap[key] || {};

        // SA / AI always from MASTER_SCORES (manually uploaded, not in DB sessions)
        const selfAssessment = ms ? ms.selfAssessment : null;
        const aiAudit        = ms ? ms.aiAudit        : null;

        // Module scores: prefer live DB, fall back to MASTER_SCORES historical
        const psScore   = live.psScore   != null ? live.psScore   : (ms ? ms.psScore   : null);
        const lisScore  = live.lisScore  != null ? live.lisScore  : (ms ? ms.lisScore  : null);
        const mcScore   = live.mcScore   != null ? live.mcScore   : (ms ? ms.mcScore   : null);
        const gramScore = live.gramScore != null ? live.gramScore : (ms ? ms.gramScore : null);

        // Recompute total from components so live scores flow through
        const parts = [selfAssessment, aiAudit, psScore, lisScore, mcScore, gramScore].filter(v => v != null);
        const totalScore = parts.length ? parseFloat(parts.reduce((a, b) => a + b, 0).toFixed(2)) : null;

        rows.push({ name: agentName, manager, team, selfAssessment, aiAudit, psScore, lisScore, mcScore, gramScore, totalScore });
      });
    });
    rows.sort((a, b) => a.manager.localeCompare(b.manager) || a.name.localeCompare(b.name));
    return rows;
  }

  async function loadComm360Report() {
    const tbody = $('comm360-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Loading…</td></tr>';
    _comm360TeamFilter = 'all';
    _comm360SearchQ    = '';
    ['all', 'calls', 'tickets'].forEach(t => {
      const btn = $(`comm360-filter-${t}`);
      if (btn) btn.className = t === 'all' ? 'btn-primary' : 'btn-ghost';
    });
    const searchEl = $('comm360-search');
    if (searchEl) searchEl.value = '';
    _comm360AllRows  = await _buildComm360Rows();
    _comm360Filtered = [..._comm360AllRows];
    _renderComm360Table();
  }

  function filterComm360(team) {
    _comm360TeamFilter = team;
    ['all', 'calls', 'tickets'].forEach(t => {
      const btn = $(`comm360-filter-${t}`);
      if (btn) btn.className = t === team ? 'btn-primary' : 'btn-ghost';
    });
    _applyComm360Filter();
  }

  function searchComm360(query) {
    _comm360SearchQ = (query || '').trim().toLowerCase();
    _applyComm360Filter();
  }

  function _applyComm360Filter() {
    let rows = _comm360AllRows;
    if (_comm360TeamFilter !== 'all') {
      const target = _comm360TeamFilter === 'calls' ? 'Calls' : 'Tickets';
      rows = rows.filter(r => r.team === target);
    }
    if (_comm360SearchQ) {
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(_comm360SearchQ) ||
        r.manager.toLowerCase().includes(_comm360SearchQ)
      );
    }
    _comm360Filtered = rows;
    _renderComm360Table();
  }

  function _c360fmt(val, dec) {
    if (val == null || isNaN(val)) return '<span style="color:var(--text-muted)">—</span>';
    return Number(val).toFixed(dec != null ? dec : 2);
  }

  function _renderComm360Table() {
    const tbody = $('comm360-tbody');
    const count = $('comm360-count');
    if (!tbody) return;

    const delBtn = $('btn-delete-comm360');
    if (delBtn) {
      if (_comm360ReportDeleted) {
        delBtn.textContent = '🔄 Restore Report';
        delBtn.className = 'btn-ghost';
        delBtn.onclick = () => Admin.restoreEntireComm360Report();
      } else {
        delBtn.textContent = '🗑 Delete Report';
        delBtn.className = 'btn-ghost btn-ghost-danger';
        delBtn.onclick = () => Admin.deleteEntireComm360Report();
      }
    }

    if (!_comm360Filtered.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No records found.</td></tr>';
      if (count) count.textContent = '';
      return;
    }

    const groups = {};
    _comm360Filtered.forEach(r => {
      if (!groups[r.manager]) groups[r.manager] = [];
      groups[r.manager].push(r);
    });

    let html = '';
    let idx  = 0;

    Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).forEach(([manager, recs]) => {
      const team = recs[0].team;
      const teamBadge = team === 'Tickets'
        ? '<span style="background:#d1fae5;color:#065f46;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.4rem">🎫 Tickets</span>'
        : '<span style="background:#dbeafe;color:#1e3a8a;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px;margin-left:0.4rem">📞 Calls</span>';
      const psRecs = recs.filter(r => r.psScore != null);
      const avgPs  = psRecs.length
        ? (psRecs.reduce((a, r) => a + r.psScore, 0) / psRecs.length).toFixed(2)
        : '—';

      html += `<tr style="background:#eef2ff;border-top:2px solid #c7d2fe">
        <td colspan="4" style="font-weight:700;color:#3730a3;font-size:0.88rem;padding:0.45rem 0.75rem">
          👤 ${manager}${teamBadge}
          <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem;margin-left:0.5rem">(${recs.length} agent${recs.length !== 1 ? 's' : ''})</span>
        </td>
        <td colspan="2" style="background:#eef2ff"></td>
        <td style="text-align:right;font-size:0.78rem;color:#3730a3;font-weight:600;background:#eef2ff">Avg: ${avgPs}</td>
        <td colspan="3" style="background:#eef2ff"></td>
      </tr>`;

      recs.forEach(r => {
        idx++;
        const teamCell = r.team === 'Tickets'
          ? '<span style="background:#d1fae5;color:#065f46;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px">🎫</span>'
          : '<span style="background:#dbeafe;color:#1e3a8a;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:4px">📞</span>';
        const totalColor = r.totalScore == null ? 'inherit'
          : r.totalScore >= 60 ? 'var(--success)'
          : r.totalScore >= 40 ? 'var(--warning)'
          : 'var(--danger)';
        html += `<tr>
          <td style="color:var(--text-muted);font-size:0.8rem;text-align:center">${idx}</td>
          <td style="font-weight:500">${r.name}</td>
          <td style="color:var(--text-muted);font-size:0.85rem">${r.manager}</td>
          <td style="text-align:center">${teamCell}</td>
          <td style="text-align:right">${_c360fmt(r.selfAssessment)}</td>
          <td style="text-align:right;color:var(--primary);font-weight:600">${_c360fmt(r.aiAudit)}</td>
          <td style="text-align:right">${_c360fmt(r.psScore)}</td>
          <td style="text-align:right">${_c360fmt(r.lisScore)}</td>
          <td style="text-align:right">${_c360fmt(r.mcScore)}</td>
          <td style="text-align:right">${_c360fmt(r.gramScore)}</td>
          <td style="text-align:right;font-weight:700;color:${totalColor}">${_c360fmt(r.totalScore)}</td>
        </tr>`;
      });
    });

    tbody.innerHTML = html;
    if (count) count.textContent = `Showing ${_comm360Filtered.length} of ${_comm360AllRows.length} agent${_comm360AllRows.length !== 1 ? 's' : ''}`;
  }


  async function deleteEntireComm360Report() {
    const step1 = confirm("⚠️ Are you sure you want to delete the ENTIRE Comm360 Master Report?\n\nThis will clear all historical master scores and preserved scores. (Live assessment sessions in the DB will remain intact).");
    if (!step1) return;

    const pin = prompt("Enter Admin Password to confirm deletion of the Comm360 Report:");
    if (pin === null) return;

    const pwRec = await DB.get('settings', 'adminPassword');
    const correctPw = pwRec ? pwRec.value : 'admin123';
    if (pin !== correctPw) {
      alert("Invalid password.");
      return;
    }

    try {
      _comm360ReportDeleted = true;
      await DB.put('settings', { key: 'comm360ReportDeleted', value: 'true' });
      await DB.put('settings', { key: 'preservedReportScores', value: '{}' });
      
      _comm360AllRows = [];
      _comm360Filtered = [];
      _renderComm360Table();
      
      toast('Comm360 Master Report deleted.', 'success');
    } catch (e) {
      console.error('Delete comm360 report failed:', e);
      toast('Deletion failed: ' + e.message, 'error');
    }
  }

  async function restoreEntireComm360Report() {
    const step1 = confirm("🔄 Are you sure you want to restore the Comm360 Master Report default scores?");
    if (!step1) return;

    try {
      _comm360ReportDeleted = false;
      await DB.put('settings', { key: 'comm360ReportDeleted', value: 'false' });
      
      _comm360AllRows = await _buildComm360Rows();
      _comm360Filtered = [..._comm360AllRows];
      _renderComm360Table();
      
      toast('Comm360 Master Report restored.', 'success');
    } catch (e) {
      console.error('Restore comm360 report failed:', e);
      toast('Restoration failed: ' + e.message, 'error');
    }
  }


  // ── Populate the re-score manager dropdown ────────────────────────────────
  function _populateRescoreSelect() {
    const sel = $('rescore-manager-select');
    if (!sel || sel.dataset.populated) return;
    Object.keys(_MANAGER_AGENT_MAP).sort().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    });
    sel.dataset.populated = '1';
  }

  // ── Generic Written Comm re-scorer ────────────────────────────────────────
  // Reads the manager from #rescore-manager-select.
  // Value "__ALL__" → score every Written Comm session in the DB.
  // Any other value  → score only that manager's agents.
  async function reScoreWrittenComm() {
    if (typeof SpeechEngine === 'undefined') {
      toast('SpeechEngine not loaded — cannot re-score', 'error'); return;
    }

    const sel         = $('rescore-manager-select');
    const agentInput  = $('rescore-agent-names');
    const managerName = sel ? sel.value : '';

    // Parse specific agent names if provided (comma-separated)
    const rawAgentStr = (agentInput ? agentInput.value : '').trim();
    const specificNames = rawAgentStr
      ? rawAgentStr.split(',').map(n => n.trim().toLowerCase()).filter(Boolean)
      : [];

    // If specific names are entered, skip team validation — target those agents directly
    // If no specific names, a team must be selected
    if (!specificNames.length && !managerName) {
      toast('Select a team or enter specific agent names first', 'warning');
      return;
    }

    const isAll = managerName === '__ALL__';

    // Build team set when no specific names given
    let teamSet = null; // null = match everything (All Teams mode)
    if (!specificNames.length && !isAll) {
      const agents = _MANAGER_AGENT_MAP[managerName] || [];
      if (!agents.length) { toast(`No agents found for "${managerName}"`, 'error'); return; }
      teamSet = new Set(agents.map(n => n.toLowerCase().trim()));
    }

    // Fuzzy match helper — checks against specificNames first, then teamSet
    function matchesTarget(name) {
      if (!name) return false;
      const n = name.toLowerCase().trim();
      if (specificNames.length) {
        // Specific-names mode: check if this session's trainee matches any of the given names
        return specificNames.some(target => n.includes(target) || target.includes(n));
      }
      if (!teamSet) return true; // All Teams
      if (teamSet.has(n)) return true;
      for (const m of teamSet) {
        if (m.includes(n) || n.includes(m)) return true;
      }
      return false;
    }

    const btn   = $('btn-rescore-wc');
    const label = specificNames.length
      ? specificNames.map(n => n.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')).join(', ')
      : (isAll ? 'All Teams' : managerName);

    if (btn) { btn.disabled = true; btn.textContent = '⌛ Re-scoring…'; }
    if (sel) sel.disabled = true;
    if (agentInput) agentInput.disabled = true;

    try {
      const allSessions = await DB.getAll('sessions');
      const targets = allSessions.filter(s =>
        s.module === 'written-comm' &&
        matchesTarget(s.traineeName)
      );

      if (!targets.length) {
        toast(`No Written Comm sessions found for: ${label}`, 'warning');
        return;
      }

      let done = 0, updated = 0;
      const errors = [];

      for (const session of targets) {
        if (btn) btn.textContent = `⌛ ${done + 1}/${targets.length}`;
        try {
          const duration     = session.timeTaken || 0;
          const textToScore  = session.transcript || session.writtenText || '';
          let newAiScores = null;

          if (textToScore.trim().length > 0) {
            newAiScores = SpeechEngine.scoreWriting(textToScore, duration, session.topicTitle);
            newAiScores._summary = SpeechEngine.generateCoachingSummary('written-comm', newAiScores);
            newAiScores._method = 'js-rescore';
          }

          if (newAiScores && session.id) {
            // Preserve original scores as _prev (only first time — never overwrite the original)
            if (session.aiScores && !session.aiScores._prev) {
              newAiScores._prev = session.aiScores;
            } else if (session.aiScores && session.aiScores._prev) {
              newAiScores._prev = session.aiScores._prev;
            }
            // patch — only writes ai_scores, never touches admin_scores
            await DB.patch('sessions', session.id, { aiScores: newAiScores });
            updated++;
          } else if (!session.id) {
            errors.push(`${session.traineeName}: missing session ID`);
          }
        } catch (e) {
          errors.push(`${session.traineeName}: ${e.message}`);
          console.error(`Re-score failed for ${session.traineeName}:`, e);
        }
        done++;
        await new Promise(r => setTimeout(r, 100)); // small delay for UI updates
      }

      if (errors.length) {
        console.error('Re-score errors:', errors);
        toast(`${label}: ${updated} updated, ${errors.length} failed — see console`, 'warning');
      } else {
        toast(`Re-scoring complete — ${updated}/${targets.length} sessions updated (${label})`, 'success');
      }

      await loadAssessments();

    } catch (e) {
      console.error('Re-score failed:', e);
      toast('Re-score failed: ' + e.message, 'error');
    } finally {
      if (btn)        { btn.disabled = false; btn.textContent = '🔄 Re-score Written'; }
      if (sel)          sel.disabled = false;
      if (agentInput)   agentInput.disabled = false;
    }
  }

  // ── Reset Written Comm scores to pre-re-score originals ──────────────────
  async function resetWrittenScores() {
    const sel        = $('rescore-manager-select');
    const agentInput = $('rescore-agent-names');
    const managerName = sel ? sel.value : '';

    const rawAgentStr  = (agentInput ? agentInput.value : '').trim();
    const specificNames = rawAgentStr
      ? rawAgentStr.split(',').map(n => n.trim().toLowerCase()).filter(Boolean)
      : [];

    if (!specificNames.length && !managerName) {
      toast('Select a team or enter specific agent names first', 'warning');
      return;
    }

    const isAll   = managerName === '__ALL__';
    let teamSet   = null;
    if (!specificNames.length && !isAll) {
      const agents = _MANAGER_AGENT_MAP[managerName] || [];
      if (!agents.length) { toast(`No agents found for "${managerName}"`, 'error'); return; }
      teamSet = new Set(agents.map(n => n.toLowerCase().trim()));
    }

    function matchesTarget(name) {
      if (!name) return false;
      const n = name.toLowerCase().trim();
      if (specificNames.length) return specificNames.some(t => n.includes(t) || t.includes(n));
      if (!teamSet) return true;
      if (teamSet.has(n)) return true;
      for (const m of teamSet) { if (m.includes(n) || n.includes(m)) return true; }
      return false;
    }

    const label = specificNames.length
      ? specificNames.map(n => n.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')).join(', ')
      : (isAll ? 'All Teams' : managerName);

    if (!confirm(`Reset AI scores back to original (pre-re-score) values for: ${label}?\n\nThis cannot be undone.`)) return;

    const btn = $('btn-reset-wc');
    if (btn) { btn.disabled = true; btn.textContent = '⌛ Resetting…'; }
    if (sel) sel.disabled = true;
    if (agentInput) agentInput.disabled = true;

    try {
      const allSessions = await DB.getAll('sessions');

      // Target all matching Written Comm sessions — those with _prev (backup exists) OR js-rescore method
      const targets = allSessions.filter(s =>
        s.module === 'written-comm' &&
        matchesTarget(s.traineeName) &&
        s.aiScores &&
        (s.aiScores._prev || s.aiScores._method === 'js-rescore')
      );

      if (!targets.length) {
        toast(`No re-scored Written Comm sessions found for: ${label} — nothing to reset`, 'warning');
        return;
      }

      let done = 0, restored = 0;
      const errors = [];
      for (const session of targets) {
        if (btn) btn.textContent = `⌛ ${done + 1}/${targets.length}`;
        try {
          let restoredScores = null;

          if (session.aiScores._prev) {
            // Backup exists — restore directly (strip _prev so it's a clean object)
            const { _prev, ...originalScores } = session.aiScores._prev;
            restoredScores = originalScores;
          } else if (session.transcript || session.writtenText) {
            // No backup — re-score with standard SpeechEngine.scoreWriting
            const duration  = session.timeTaken || 0;
            restoredScores  = SpeechEngine.scoreWriting(session.transcript || session.writtenText || '', duration, session.topicTitle);
            restoredScores._summary = SpeechEngine.generateCoachingSummary('written-comm', restoredScores);
          }

          if (restoredScores && session.id) {
            await DB.patch('sessions', session.id, { aiScores: restoredScores });
            restored++;
          }
        } catch (e) {
          errors.push(`${session.traineeName}: ${e.message}`);
          console.error(`Reset failed for ${session.traineeName}:`, e);
        }
        done++;
        await new Promise(r => setTimeout(r, 80)); // small UI tick
      }

      if (errors.length) {
        console.error('Reset errors:', errors);
        toast(`${label}: ${restored} restored, ${errors.length} failed — see console`, 'warning');
      } else {
        toast(`Scores reset — ${restored}/${targets.length} sessions restored (${label})`, 'success');
      }

      await loadAssessments();

    } catch (e) {
      console.error('Reset failed:', e);
      toast('Reset failed: ' + e.message, 'error');
    } finally {
      if (btn)        { btn.disabled = false; btn.textContent = '↩ Reset Scores'; }
      if (sel)          sel.disabled = false;
      if (agentInput)   agentInput.disabled = false;
    }
  }

  // ── Manager Assessments ──────────────────────────────────────────
  let _mgrSessions = [];

  async function loadMgrAssessments() {
    try {
      const all = await DB.getAll('sessions');
      _mgrSessions = all.filter(s => s.module && s.module.startsWith('mgr-'));
      renderMgrAssessments();
      // Update badge
      const pending = _mgrSessions.filter(s => !s.adminScores).length;
      const badge = document.getElementById('mgr-pending-badge');
      if (badge) badge.textContent = pending > 0 ? pending : '0';
    } catch (e) {
      console.error('loadMgrAssessments error:', e);
    }
  }

  function renderMgrAssessments() {
    const moduleFilter = document.getElementById('mgr-filter-module') ? document.getElementById('mgr-filter-module').value : 'all';
    const statusFilter = document.getElementById('mgr-filter-status') ? document.getElementById('mgr-filter-status').value : 'all';

    let sessions = _mgrSessions;
    if (moduleFilter !== 'all') sessions = sessions.filter(s => s.module === moduleFilter);
    if (statusFilter === 'pending') sessions = sessions.filter(s => !s.adminScores);
    if (statusFilter === 'scored')  sessions = sessions.filter(s =>  s.adminScores);

    const tbody = document.getElementById('mgr-assessments-tbody');
    if (!tbody) return;

    if (!sessions.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No manager assessments yet.</td></tr>';
      return;
    }

    const MGR_MODULE_LABELS = {
      'mgr-situation-room':     '🎯 Situation Room',
      'mgr-transcript-autopsy': '📋 Transcript Autopsy',
      'mgr-mock-call':          '📞 Mock Call',
      'mgr-feedback':           '💬 Feedback',
      'mgr-eq':                 '🧠 Emotional Intelligence',
      'mgr-listening-tone':     '🎧 Listening & Tone',
      'mgr-management-skills':  '📊 Management Skills',
    };

    // Sort newest first
    const sorted = [...sessions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    tbody.innerHTML = sorted.map(s => {
      const aiScore    = s.aiScores    && s.aiScores.overall    != null ? s.aiScores.overall    + '%' : '—';
      const adminScore = s.adminScores && s.adminScores.overall != null ? s.adminScores.overall + '%' : '—';
      const status     = s.adminScores
        ? '<span class="badge badge-scored">Scored</span>'
        : '<span class="badge badge-pending">Pending</span>';
      const date = s.submittedAt
        ? new Date(s.submittedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
        : '—';
      const topicDisplay = (s.topicTitle || '—').replace(/'/g, '&#39;');
      return `<tr>
        <td><strong>${s.traineeName || '—'}</strong></td>
        <td>${MGR_MODULE_LABELS[s.module] || s.module}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${topicDisplay}">${s.topicTitle || '—'}</td>
        <td>${date}</td>
        <td>${status}</td>
        <td>${aiScore}</td>
        <td>${adminScore}</td>
        <td><button class="btn-ghost" style="font-size:0.8rem;padding:0.35rem 0.75rem"
          onclick="Admin.openMgrScoreModal('${s.id}')">Score</button></td>
      </tr>`;
    }).join('');
  }

  async function openMgrScoreModal(sessionId) {
    const session = _mgrSessions.find(s => s.id === sessionId);
    if (!session) return;

    const modal = document.getElementById('mgr-score-modal');
    if (!modal) return;

    modal.querySelector('#mgr-modal-name').textContent    = session.traineeName || '—';
    modal.querySelector('#mgr-modal-module').textContent  = (session.module || '').replace('mgr-','').replace(/-/g,' ');
    modal.querySelector('#mgr-modal-topic').textContent   = session.topicTitle  || '—';

    const isMcq     = session.module === 'mgr-listening-tone';
    const isSR      = session.module === 'mgr-situation-room';
    const isWritten = ['mgr-transcript-autopsy','mgr-eq','mgr-management-skills'].includes(session.module);
    const isFeedback = session.module === 'mgr-feedback';

    const transcriptBox = modal.querySelector('#mgr-modal-transcript');

    if (isSR) {
      // Two-section Situation Room — writtenText is a JSON blob
      let srData = null;
      try { srData = JSON.parse(session.writtenText || 'null'); } catch (_) {}
      if (srData) {
        const secA = srData.sectionA || {};
        const secB = srData.sectionB || {};
        const esc  = t => (t || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        transcriptBox.innerHTML =
          '<div style="margin-bottom:1rem">' +
            '<div style="font-size:0.72rem;font-weight:800;letter-spacing:0.06em;color:#7c3aed;margin-bottom:0.4rem">SECTION A — WHAT WOULD YOU SAY?</div>' +
            '<div style="font-size:0.8rem;color:#666;margin-bottom:0.3rem"><em>Prompt: ' + esc(secA.prompt) + '</em></div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#f5f3ff;padding:0.75rem;border-radius:6px;border-left:3px solid #7c3aed">' + esc(secA.response || '(no response)') + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:0.72rem;font-weight:800;letter-spacing:0.06em;color:#dc2626;margin-bottom:0.4rem">SECTION B — THE WRONG RESPONSE ANALYSIS</div>' +
            '<div style="font-size:0.75rem;font-weight:700;color:#666;margin:0.5rem 0 0.2rem">Errors Identified:</div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#fef2f2;padding:0.75rem;border-radius:6px;border-left:3px solid #dc2626;margin-bottom:0.5rem">' + esc(secB.errors || '(none)') + '</div>' +
            '<div style="font-size:0.75rem;font-weight:700;color:#666;margin-bottom:0.2rem">Why Each Error Made It Worse:</div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#fffbeb;padding:0.75rem;border-radius:6px;border-left:3px solid #f59e0b;margin-bottom:0.5rem">' + esc(secB.impact || '(none)') + '</div>' +
            '<div style="font-size:0.75rem;font-weight:700;color:#666;margin-bottom:0.2rem">Rewrite:</div>' +
            '<div style="white-space:pre-wrap;font-size:0.88rem;background:#f0fdf4;padding:0.75rem;border-radius:6px;border-left:3px solid #10b981">' + esc(secB.rewrite || '(none)') + '</div>' +
          '</div>';
      } else {
        transcriptBox.innerHTML = '<div style="color:var(--text-muted);font-style:italic">No response data found.</div>';
      }
    } else if (isWritten) {
      transcriptBox.innerHTML = '<strong>Written Response:</strong><div style="white-space:pre-wrap;margin-top:0.5rem;font-size:0.9rem;max-height:240px;overflow-y:auto">' +
        (session.writtenText || '(no text)').replace(/</g,'&lt;') + '</div>';
    } else if (isMcq) {
      const ai = session.aiScores || {};
      transcriptBox.innerHTML = '<strong>Auto-Score:</strong> ' + (ai.correct || 0) + '/' + (ai.total || 5) + ' correct — ' + (ai.overall || 0) + '%';
    } else {
      transcriptBox.innerHTML = '<strong>Transcript:</strong><div style="white-space:pre-wrap;margin-top:0.5rem;font-size:0.9rem;max-height:200px;overflow-y:auto">' +
        (session.transcript || '(no transcript)').replace(/</g,'&lt;') + '</div>';
    }

    // AI scores display
    const aiBox = modal.querySelector('#mgr-modal-ai-scores');
    if (session.aiScores && session.aiScores.overall != null) {
      if (isSR) {
        const sa = session.aiScores.sectionA || {};
        const sb = session.aiScores.sectionB || {};
        aiBox.innerHTML =
          '<strong>AI Score: ' + session.aiScores.overall + '%</strong>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.3rem;margin-top:0.5rem;font-size:0.8rem">' +
            '<span style="color:#7c3aed">A — Tone &amp; Empathy: <strong>' + (sa.toneEmpathy ?? '—') + '/5</strong></span>' +
            '<span style="color:#7c3aed">A — Ownership: <strong>' + (sa.ownershipLanguage ?? '—') + '/5</strong></span>' +
            '<span style="color:#7c3aed">A — Avoided Risky Lang: <strong>' + (sa.avoidedRiskyLanguage ?? '—') + '/5</strong></span>' +
            '<span style="color:#dc2626">B — Error ID: <strong>' + (sb.errorIdentification ?? '—') + '/5</strong></span>' +
            '<span style="color:#dc2626">B — Impact Explanation: <strong>' + (sb.impactExplanation ?? '—') + '/5</strong></span>' +
            '<span style="color:#dc2626">B — Rewrite Quality: <strong>' + (sb.rewriteQuality ?? '—') + '/5</strong></span>' +
          '</div>' +
          (sa.whatNotToSay && !/clean/i.test(sa.whatNotToSay) ? '<div style="margin-top:0.4rem;font-size:0.78rem;color:#92400e;background:#fef9c3;padding:0.4rem 0.6rem;border-radius:4px">⚠ <strong>Risky language (A):</strong> ' + sa.whatNotToSay + '</div>' : '') +
          (sb.keyMissed && !/all key/i.test(sb.keyMissed) ? '<div style="margin-top:0.3rem;font-size:0.78rem;color:#92400e;background:#fef9c3;padding:0.4rem 0.6rem;border-radius:4px">📝 <strong>Missed error (B):</strong> ' + sb.keyMissed + '</div>' : '');
      } else {
        aiBox.innerHTML = '<strong>AI Score: ' + session.aiScores.overall + '%</strong>';
      }
    } else {
      aiBox.innerHTML = '';
    }

    // Scoring criteria inputs
    const criteriaEl = modal.querySelector('#mgr-scoring-criteria');
    const audioLabels   = ['Leadership Presence','Decision Quality','Communication Clarity','Empathy & EQ','Professionalism'];
    const writtenLabels = ['Content Quality','Critical Thinking','Communication Clarity','Empathy & Insight','Action Orientation'];
    const srLabels      = ['A — Tone & Empathy','A — Ownership Language','A — Avoided Risky Language','B — Error Identification','B — Impact Explanation','B — Rewrite Quality'];
    const labels = isSR ? srLabels : (isWritten ? writtenLabels : audioLabels);
    const existing = session.adminScores || {};

    if (isMcq) {
      criteriaEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">This is an auto-scored MCQ assessment. You may add a comment below.</p>';
    } else {
      criteriaEl.innerHTML = labels.map((label, i) => {
        const key = label.toLowerCase().replace(/[^a-z]/g, '');
        const val = existing[key] != null ? existing[key] : (existing['score' + (i+1)] != null ? existing['score' + (i+1)] : '');
        const color = isSR ? (i < 3 ? 'color:#5b21b6' : 'color:#991b1b') : '';
        return '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem">' +
          '<label style="min-width:220px;font-size:0.85rem;' + color + '">' + label + '</label>' +
          '<input type="number" min="1" max="5" step="0.5" value="' + val + '" class="mgr-criteria-input" data-key="' + key + '" style="width:70px;border:1px solid var(--border);border-radius:6px;padding:0.35rem 0.5rem;font-size:0.9rem" />' +
          '<span style="font-size:0.8rem;color:var(--text-muted)">(1–5)</span>' +
          '</div>';
      }).join('');
    }

    modal.querySelector('#mgr-admin-comment').value = session.adminComment || '';
    modal.dataset.sessionId = sessionId;
    modal.classList.remove('hidden');
  }

  async function saveMgrScore() {
    const modal = document.getElementById('mgr-score-modal');
    if (!modal) return;
    const sessionId = modal.dataset.sessionId;
    const session = _mgrSessions.find(s => s.id === sessionId);
    if (!session) return;

    const isMcq = session.module === 'mgr-listening-tone';
    let adminScores = {};

    if (!isMcq) {
      const inputs = modal.querySelectorAll('.mgr-criteria-input');
      let sum = 0, count = 0;
      inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val)) { adminScores[inp.dataset.key] = val; sum += val; count++; }
      });
      adminScores.overall = count > 0 ? parseFloat(((sum / (count * 5)) * 100).toFixed(1)) : null;
    } else {
      adminScores = Object.assign({}, session.aiScores); // MCQ: admin score = AI score
    }

    const comment = modal.querySelector('#mgr-admin-comment').value.trim();

    try {
      await DB.patch('sessions', sessionId, { adminScores, adminComment: comment });
      const idx = _mgrSessions.findIndex(s => s.id === sessionId);
      if (idx >= 0) {
        _mgrSessions[idx].adminScores  = adminScores;
        _mgrSessions[idx].adminComment = comment;
      }
      renderMgrAssessments();
      modal.classList.add('hidden');
      toast('Manager score saved!', 'success');
    } catch (e) {
      alert('Error saving score: ' + e.message);
    }
  }

  // ---- Seed: NRI Basics of Stock Market MCQ ----
  async function seedStockMarketMcq(silent = false) {
    const existing = await DB.getAll('topics');
    const smqTopics = existing.filter(t => t.module === 'stock-market-mcq');

    // Delete legacy topics that predate the Set 1 / Set 2 / Set 3 / Set 4 naming
    const oldTopics = smqTopics.filter(t => !t.title || (!t.title.includes('Set 1') && !t.title.includes('Set 2') && !t.title.includes('Set 3') && !t.title.includes('Set 4')));
    for (const old of oldTopics) {
      try { await DB.del('topics', old.id); } catch (_) {}
    }

    const validTopics = smqTopics.filter(t => t.title && (t.title.includes('Set 1') || t.title.includes('Set 2') || t.title.includes('Set 3') || t.title.includes('Set 4')));
    const hasSet1 = validTopics.some(t => t.title.includes('Set 1'));
    const hasSet2 = validTopics.some(t => t.title.includes('Set 2'));
    const hasSet3 = validTopics.some(t => t.title.includes('Set 3'));
    const hasSet4 = validTopics.some(t => t.title.includes('Set 4'));

    if (hasSet1 && hasSet2 && hasSet3 && hasSet4) {
      if (!silent) toast('NRI Stock Market topics already exist — no action taken.', 'info');
      return;
    }

    const set1Questions = [
      { stem: "In which year and city was Broker founded?", options: ["2005, Mumbai","2008, Hyderabad","2010, Bengaluru","2012, Delhi"], correct: 2, explanation: "Broker was founded in 2010 in Bengaluru by Nithin Kamath and Nikhil Kamath." },
      { stem: "Who are the founders of Broker?", options: ["Radhakishan Damani and Rakesh Jhunjhunwala","Nithin Kamath and Nikhil Kamath","Vijay Shekhar Sharma and Deepinder Goyal","Uday Kotak and Nandan Nilekani"], correct: 1, explanation: "Broker was founded by brothers Nithin Kamath and Nikhil Kamath." },
      { stem: "Broker was the first to introduce which revolutionary brokerage model in India?", options: ["Full-service broking with relationship managers","Discount broking — a flat fee of Rs. 20 per trade regardless of order size","Free broking with no charges at all","Subscription-based broking model"], correct: 1, explanation: "Broker pioneered discount broking — a flat Rs. 20 per trade regardless of order size." },
      { stem: "What was the major technological breakthrough that set Broker apart from traditional brokers?", options: ["Launching India's first mutual fund platform","Introducing phone-based trading","Launching Kite — a modern, fast, and lightweight trading platform","Launching a dedicated commodity exchange"], correct: 2, explanation: "Broker's Kite platform is widely regarded as a game-changer — fast, modern, and built in-house." },
      { stem: "Broker grew entirely without external funding. This means it is a:", options: ["Government-owned enterprise","Venture capital-backed startup","Bootstrapped company — funded only by the founders and internal profits","Listed public company on NSE"], correct: 2, explanation: "Broker is bootstrapped — it has never raised external venture capital." },
      { stem: "Which stock exchange was established in 1875 and is Asia's oldest exchange?", options: ["NSE","MCX","BSE","NCDEX"], correct: 2, explanation: "BSE (Bombay Stock Exchange), established in 1875, is Asia's oldest stock exchange." },
      { stem: "What is the benchmark index of the NSE (National Stock Exchange)?", options: ["S&P BSE Sensex","Nifty 50","Nifty Bank","BSE 500"], correct: 1, explanation: "The Nifty 50 is the flagship index of the NSE, tracking the top 50 companies." },
      { stem: "The S&P BSE Sensex tracks how many stocks?", options: ["50","100","30","200"], correct: 2, explanation: "The BSE Sensex tracks 30 of the largest and most actively traded stocks on the BSE." },
      { stem: "NSE was established in which year and pioneered which capability?", options: ["1985, screen-based trading","1992, automated trading","1994, online trading","2000, algorithmic trading"], correct: 1, explanation: "NSE was established in 1992 and pioneered automated electronic trading in India." },
      { stem: "In the IPO process, who is appointed as the lead manager?", options: ["SEBI","Stock Broker","Merchant Banker","Clearing Corporation"], correct: 2, explanation: "A Merchant Banker is appointed as the lead manager to manage the IPO process end-to-end." },
      { stem: "What does DRHP stand for in the context of an IPO?", options: ["Direct Registered Holding Prospectus","Draft Red Herring Prospectus","Demat Registration and Holding Paper","Direct Rights and Holdings Proposal"], correct: 1, explanation: "DRHP stands for Draft Red Herring Prospectus — the preliminary IPO document filed with SEBI." },
      { stem: "SEBI's role during its review of the DRHP is best described as:", options: ["Setting the IPO price","Vetting the financials of the company","Checking for full and fair disclosure only","Allocating shares to investors"], correct: 2, explanation: "SEBI checks that the DRHP provides full and fair disclosure — it does not verify financial accuracy." },
      { stem: "The final document filed with the exchange that includes the price band is called:", options: ["DRHP","Prospectus Summary","Red Herring Prospectus (RHP)","Allotment Letter"], correct: 2, explanation: "The Red Herring Prospectus (RHP) is the final version of the IPO document, including the price band." },
      { stem: "During the IPO live bidding phase, which mechanism blocks funds in an investor's bank account?", options: ["DDPI","eDIS","UPI-linked ASBA","TPIN"], correct: 2, explanation: "UPI-linked ASBA (Application Supported by Blocked Amount) blocks funds during IPO bidding." },
      { stem: "For retail investors in an IPO, the allotment process is done via:", options: ["First come, first served","Proportional allotment","Lottery","Auction bidding"], correct: 2, explanation: "Retail IPO allotment is done via lottery when oversubscribed, ensuring fairness." },
      { stem: "In the Secondary Market, when shares are traded between two investors, the company:", options: ["Receives a transaction fee","Issues new shares each time","Gets no money — only investors exchange ownership","Must approve each transaction"], correct: 2, explanation: "In the secondary market, only ownership transfers between investors — the company receives nothing." },
      { stem: "What drives share price changes in the secondary market on a second-by-second basis?", options: ["SEBI directives","Company announcements only","Supply and demand — more buyers raises price, more sellers lowers price","Fixed periodic auctions"], correct: 2, explanation: "Share prices are driven purely by supply and demand dynamics in the secondary market." },
      { stem: "SEBI stands for:", options: ["Stock Exchange Board of India","Securities and Exchange Board of India","Securities and Equity Bureau of India","Stock Equity and Brokerage Institution"], correct: 1, explanation: "SEBI — Securities and Exchange Board of India — is the regulator of the Indian securities market." },
      { stem: "Which exchanges fall under SEBI's purview for Equities and Derivatives in India?", options: ["MCX and NCDEX","NSE and BSE","BSE and MCX","NSE and NCDEX"], correct: 1, explanation: "NSE and BSE are the two main exchanges for equities and derivatives, both regulated by SEBI." },
      { stem: "MCX and NCDEX are specialized exchanges dealing in which market segment?", options: ["Equities","Government bonds","Commodities","Currency derivatives"], correct: 2, explanation: "MCX and NCDEX are commodity exchanges dealing in metals, energy, and agricultural products." },
      { stem: "Stock Brokers are described as which Pillar of financial intermediaries?", options: ["Pillar 1 – The Gateway","Pillar 2 – The Record Keepers","Pillar 3 – The Guarantors","Pillar 4 – The Regulators"], correct: 0, explanation: "Stock Brokers are Pillar 1 — The Gateway — as they are the entry point for investors to the market." },
      { stem: "Depositories (NSDL and CDSL) are described as:", options: ["Clearing Corporations","Secure digital vaults holding your electronic shares","Tax collection authorities","Broker subsidiaries"], correct: 1, explanation: "Depositories like NSDL and CDSL act as digital vaults, holding shares in dematerialised form." },
      { stem: "Clearing Corporations ensure trades settle with zero defaults. They are:", options: ["Regulated directly by the Government of India","Wholly owned subsidiaries of exchanges","Private equity firms","Part of SEBI"], correct: 1, explanation: "Clearing Corporations (e.g., NSCCL) are wholly owned subsidiaries of their respective exchanges." },
      { stem: "Brokers act as Depository Participants (DPs) to connect investors to:", options: ["SEBI","NSE and BSE","NSDL and CDSL","Clearing Corporations"], correct: 2, explanation: "As DPs, brokers like Broker connect investors to NSDL and CDSL for Demat services." },
      { stem: "Buying equity in a company means you own:", options: ["A loan given to the company","A micro-fraction of that business","The right to vote only","A fixed return bond"], correct: 1, explanation: "Buying equity (shares) means you own a proportional fraction of the company as a shareholder." },
      { stem: "Which correctly distinguishes Stocks from Shares?", options: ["They are exactly the same thing","Stock is general ownership; Shares are the specific units (e.g., 10 shares of Infosys)","Stocks are only for large companies; Shares for small","Stocks are traded on BSE; Shares on NSE"], correct: 1, explanation: "'Stock' refers to general ownership; 'shares' are the specific numbered units of that stock." },
      { stem: "Derivatives are financial contracts whose value is:", options: ["Fixed by SEBI","Equal to the face value of the underlying stock","Derived from an underlying asset rather than owning it directly","Based on inflation rates"], correct: 2, explanation: "Derivatives derive their value from an underlying asset without direct ownership." },
      { stem: "The Spot Market is where shares are bought and delivered:", options: ["After 30 days","Immediately or within the standard settlement cycle","Only during special sessions","Through futures contracts"], correct: 1, explanation: "The Spot (Cash) Market involves immediate buying/selling with settlement in the standard T+1 cycle." },
      { stem: "The Golden Rule for new investors as per the presentation is:", options: ["Always diversify across 10 asset classes","Never trade complex instruments you do not fully understand — master the Spot Market first","Buy on dips and sell on highs","Always use a stop loss"], correct: 1, explanation: "The golden rule: master the Spot Market first before venturing into complex derivatives or F&O." },
      { stem: "A Market Order executes at which price?", options: ["A price you specify in advance","The best available price at the moment of execution","The closing price of the previous day","The IPO price"], correct: 1, explanation: "A Market Order executes immediately at the best available market price — execution is guaranteed, price is not." },
      { stem: "Which order type guarantees price but not execution?", options: ["Market Order","Stop Loss Market Order","Limit Order","Bracket Order"], correct: 2, explanation: "A Limit Order sets a specific price — it executes only if the market reaches that price." },
      { stem: "A Stop Loss order is primarily used to:", options: ["Guarantee profit booking","Limit potential losses by triggering a sell at a defined price","Buy more shares when the price drops","Execute trades at opening bell only"], correct: 1, explanation: "A Stop Loss order automatically exits a position at a defined price to cap downside risk." },
      { stem: "The first step in the Broker account opening process is:", options: ["Physical visit to a Broker branch","Submission of paper KYC forms","Digital Onboarding (E-KYC) using Aadhaar-linked mobile number","Calling the Broker helpline"], correct: 2, explanation: "Broker's process starts with E-KYC using your Aadhaar-linked mobile for OTP verification." },
      { stem: "In-Person Verification (IPV) during Broker account opening is completed via:", options: ["A Broker executive visiting your home","A quick webcam video to confirm your presence — no physical visit required","Submission of a notarised document","Aadhaar OTP only"], correct: 1, explanation: "IPV at Broker is done digitally via a webcam video — no physical branch visit is required." },
      { stem: "E-Sign with Aadhaar during account opening involves:", options: ["Wet signature on printed forms","Physical stamp paper","Digitally signing forms using an OTP sent to your Aadhaar-linked mobile","Biometric fingerprint scan at a CDSL branch"], correct: 2, explanation: "E-Sign uses an OTP sent to your Aadhaar-linked mobile to digitally authenticate and sign documents." },
      { stem: "DDPI stands for:", options: ["Demat Debit and Pledge Instruction","Digital Delivery and Purchase Instruction","Demat Deposit and Proxy Instrument","Direct Debit and Pledge Index"], correct: 0, explanation: "DDPI stands for Demat Debit and Pledge Instruction — it replaces the older Power of Attorney (POA)." },
      { stem: "DDPI allows the broker to access shares:", options: ["For any transaction the broker deems necessary","Only for specific, investor-initiated trades","For pledging shares without investor knowledge","Across all linked family accounts"], correct: 1, explanation: "DDPI is investor-initiated — it only allows the broker to debit shares for trades specifically placed by the investor." },
      { stem: "If DDPI is not active, how must an investor authorize every sell transaction?", options: ["By calling the broker","Through the old Power of Attorney (POA)","Via eDIS — using a CDSL TPIN and OTP","By visiting the CDSL office"], correct: 2, explanation: "Without DDPI, investors must use eDIS with CDSL TPIN and OTP for each sell." },
      { stem: "Under T+1 settlement, when do shares reach your Demat vault after a buy trade?", options: ["Same day (T)","One trading day after the trade (T+1)","Two trading days after the trade (T+2)","Three trading days after the trade (T+3)"], correct: 1, explanation: "India moved to T+1 settlement — shares are credited to your Demat account one trading day after the buy trade." },
      { stem: "CMR (Client Master Report) is best described as:", options: ["A monthly brokerage statement","A tax filing document","The identity card for your Demat account detailing all core verified information","A report issued by SEBI"], correct: 2, explanation: "The CMR is the official identity document for your Demat account, containing all KYC-verified details." },
      { stem: "Adding a nominee to your Demat account is:", options: ["Optional but recommended","An absolute regulatory requirement to ensure wealth transfers to heirs","Only required for accounts with more than Rs. 10 lakh","Applicable only for joint accounts"], correct: 1, explanation: "SEBI mandates nomination for all Demat accounts — it ensures shares pass to heirs without legal complications." },
      { stem: "Short delivery occurs when a seller:", options: ["Sells at a price below the market","Sells shares but fails to deliver them to the exchange by the T+1 settlement deadline","Places a sell order after market hours","Sells more than 5% of their holding"], correct: 1, explanation: "Short delivery happens when a seller cannot deliver shares by the T+1 deadline." },
      { stem: "When short delivery happens, what action does the Clearing Corporation take?", options: ["The trade is cancelled and reversed","The buyer automatically gets cash","A live auction is conducted to buy the missing shares on behalf of the defaulting seller","The exchange suspends the stock"], correct: 2, explanation: "The Clearing Corporation conducts an auction to procure the missing shares, charging the defaulting seller." },
      { stem: "The penalty charged to the defaulting seller in a short delivery case can be up to:", options: ["5% of share value","10% of share value","20% of share value","50% of share value"], correct: 2, explanation: "The penalty for short delivery can be up to 20% of the share value." },
      { stem: "If the auction for short-delivered shares is successful, when are the shares credited to the buyer?", options: ["T+1","T+2 (visible in Kite from T+3)","T+3","T+5"], correct: 1, explanation: "After a successful auction, shares reach the buyer at T+2 (reflected in Kite from T+3)." },
      { stem: "If the auction completely fails, what happens to the buyer?", options: ["The buyer gets shares from the exchange inventory","The trade is reversed with no compensation","Cash is credited to the buyer trading account at the exchange close-out price","The buyer must wait for the next auction"], correct: 2, explanation: "If the auction fails, the Clearing Corporation credits cash to the buyer at the exchange close-out price." },
      { stem: "How much short delivery margin does Broker block on T day?", options: ["50%","80%","100%","120% of the security value"], correct: 3, explanation: "Broker blocks 120% of the security value as short delivery margin on T day." },
      { stem: "In Broker, the Gift Transfer feature is accessible via:", options: ["Kite mobile app only","Console > Portfolio > Holdings","The Broker branch office","CDSL directly"], correct: 1, explanation: "Gift Transfers are done through Console (console.Broker.com) under Portfolio > Holdings." },
      { stem: "What is the charge for gifting shares in Broker?", options: ["Free of charge","Rs. 10 per security + GST","Rs. 25 per security per transaction + 18% GST","0.1% of transaction value"], correct: 2, explanation: "Broker charges Rs. 25 per security per gift transaction plus 18% GST." },
      { stem: "For the sender, what is the tax implication of gifting shares?", options: ["10% long-term capital gains tax applies","No tax implication for the sender","Short-term capital gains tax applies","Gift tax of 5% is levied"], correct: 1, explanation: "Gifting shares has no tax implication for the sender — the tax obligation falls on the recipient." }
    ];

    const set2Questions = [
      { stem: "An investor bought 50 shares at Rs. 100 and another 50 shares at Rs. 150. They sell 50 shares. Under FIFO, the cost basis of the sold shares is:", options: ["Rs. 150 each — the higher-priced lot","Rs. 100 each — the first lot purchased","Rs. 125 each — average of both lots","Determined randomly by the broker"], correct: 1, explanation: "FIFO (First In First Out): the earliest-purchased lot (Rs. 100) is treated as sold first." },
      { stem: "A company has 5 crore shares outstanding with a current market price of Rs. 400 per share. Its market capitalisation is:", options: ["Rs. 2,000 crore","Rs. 400 crore","Rs. 20,000 crore","Rs. 800 crore"], correct: 0, explanation: "Market cap = Shares outstanding × Market price = 5 crore × Rs. 400 = Rs. 2,000 crore." },
      { stem: "A company announces a 1:1 bonus issue. An investor currently holding 300 shares will hold after the bonus:", options: ["300 shares","450 shares","600 shares","900 shares"], correct: 2, explanation: "1:1 bonus means 1 additional share for every 1 held. 300 + 300 = 600 shares total." },
      { stem: "A stock with a face value of Rs. 10 declares a 50% dividend. An investor holding 200 shares receives:", options: ["Rs. 100","Rs. 1,000","Rs. 5,000","Rs. 10,000"], correct: 1, explanation: "Dividend = 50% of Rs. 10 face value = Rs. 5 per share. 200 × Rs. 5 = Rs. 1,000." },
      { stem: "Under India's current tax law, Long-Term Capital Gains (LTCG) on listed equity exceeding Rs. 1.25 lakh per year are taxed at:", options: ["0% — fully exempt","10% without indexation","12.5% without indexation","20% with indexation"], correct: 2, explanation: "Post July 2024 Budget: LTCG on equity is taxed at 12.5% (without indexation) above Rs. 1.25 lakh exemption." },
      { stem: "Short-Term Capital Gains (STCG) on equity shares held for less than 12 months are taxed at:", options: ["10%","15%","20%","As per the investor's income tax slab"], correct: 2, explanation: "Post July 2024 Budget: STCG on equity is 20% (increased from the earlier 15%)." },
      { stem: "If Nifty 50 falls 20% from the previous day's closing level during trading, the exchange:", options: ["Halts trading for 45 minutes only","Continues trading with enhanced margin requirements","Suspends trading for the remainder of the day","Alerts SEBI to intervene manually"], correct: 2, explanation: "A 20% index-level circuit breaker triggers a market-wide halt for the rest of the trading day." },
      { stem: "An intraday trader at Broker does not close their open position before the market closes. Broker will:", options: ["Roll the position over to the next trading day","Auto square-off the position near market close","Keep it open indefinitely at no extra charge","Charge a SEBI-mandated overnight penalty"], correct: 1, explanation: "Broker auto squares off un-closed intraday positions to prevent unintended overnight delivery obligations." },
      { stem: "Securities Transaction Tax (STT) on delivery-based equity purchases is charged at:", options: ["0.025% of turnover","0.1% of turnover","0.5% of turnover","1% of turnover"], correct: 1, explanation: "STT on delivery-based equity buy transactions is 0.1% of the total transaction value." },
      { stem: "Normal equity trading hours on BSE and NSE are:", options: ["9:00 AM to 3:30 PM","9:15 AM to 3:30 PM","9:30 AM to 4:00 PM","10:00 AM to 4:30 PM"], correct: 1, explanation: "Continuous trading on BSE and NSE runs from 9:15 AM to 3:30 PM IST on all working days." },
      { stem: "The Pre-Open session on NSE/BSE, used to discover the opening price, runs from:", options: ["9:00 AM to 9:08 AM for order entry","9:00 AM to 9:15 AM (order entry 9:00–9:08, matching 9:08–9:12)","8:30 AM to 9:00 AM","9:15 AM to 9:30 AM"], correct: 1, explanation: "The Pre-Open session runs 9:00–9:15 AM: order collection 9:00–9:08, price matching 9:08–9:12, buffer 9:12–9:15." },
      { stem: "A stock's Earnings Per Share (EPS) is Rs. 20 and it trades at Rs. 400. Its Price-to-Earnings (P/E) ratio is:", options: ["10","20","40","8,000"], correct: 1, explanation: "P/E ratio = Market Price ÷ EPS = Rs. 400 ÷ Rs. 20 = 20." },
      { stem: "A company's stock has a face value of Rs. 1 but trades at Rs. 3,500. The face value is most relevant for:", options: ["Setting intraday margin requirements","Calculating dividends and bonus issues","Determining exchange circuit limits","Daily mark-to-market settlement"], correct: 1, explanation: "Dividends are declared as a percentage of face value (e.g., '500% dividend' means Rs. 5 per share at Rs. 1 face value)." },
      { stem: "A company does a 5:1 stock split. An investor holds 100 shares at Rs. 500 each. After the split, the investor has:", options: ["100 shares at Rs. 2,500 each","500 shares at Rs. 100 each","20 shares at Rs. 2,500 each","500 shares at Rs. 500 each"], correct: 1, explanation: "In a 5:1 split, shares multiply by 5 and price divides by 5. Total value (Rs. 50,000) stays unchanged." },
      { stem: "In a rights issue, who is given the first right to subscribe for the newly issued shares?", options: ["Retail public through a fresh IPO process","Qualified Institutional Buyers (QIBs) only","Existing shareholders, in proportion to their current holding","Foreign Institutional Investors (FIIs)"], correct: 2, explanation: "A rights issue offers new shares exclusively to existing shareholders in proportion to their current holding." },
      { stem: "A Nifty 50 ETF (Exchange Traded Fund) replicates the index by:", options: ["Outperforming Nifty 50 by picking the best stocks","Holding the same 50 stocks in the same proportion as the Nifty 50 index","Investing only in the top 5 Nifty stocks by weight","Holding mostly cash and buying futures"], correct: 1, explanation: "An ETF passively mirrors the index composition and proportion, aiming to match (not beat) its returns." },
      { stem: "Broker Coin is used to invest in:", options: ["Gold and silver commodity ETFs","Direct mutual funds — eliminating distributor commission","US-listed stocks and ETFs","Corporate bonds and NCDs"], correct: 1, explanation: "Broker Coin is Broker's platform for investing in direct mutual fund plans, which carry lower expense ratios." },
      { stem: "A GTT (Good Till Triggered) order in Broker Kite remains active for up to:", options: ["1 trading day only","7 calendar days","1 year from placement","Indefinitely until manually cancelled"], correct: 2, explanation: "GTT orders stay active for up to 1 year, automatically triggering when the price condition is met." },
      { stem: "When you pledge shares in Broker to obtain trading margin, the pledged shares:", options: ["Are sold and cash is credited to your trading account","Remain in your Demat account but are marked as pledged collateral","Are transferred to Broker's own account","Must be physically lodged with the clearing corporation"], correct: 1, explanation: "Pledging creates a lien on shares — they stay in your Demat but are locked as collateral until unpledged." },
      { stem: "When a company announces a share buyback, it generally signals:", options: ["The company is in financial difficulty and needs liquidity","Management believes shares are undervalued and returns surplus cash to shareholders","SEBI has mandated the repurchase","The company intends to delist from the exchange"], correct: 1, explanation: "A buyback typically signals that management finds the stock undervalued, and it returns value to shareholders." },
      { stem: "The Nifty Bank index on NSE tracks:", options: ["All BSE and NSE-listed public sector banks","The 12 most liquid and largest banking stocks listed on NSE","Only private sector banks","The top 5 banks by market capitalisation"], correct: 1, explanation: "Nifty Bank comprises the 12 most liquid and capitalised banking stocks on the NSE." },
      { stem: "Broker Varsity is best described as:", options: ["Broker's equity trading platform","A free, comprehensive stock market and financial education platform by Broker","Broker's direct mutual fund investment portal","An AI-based options analytics tool"], correct: 1, explanation: "Broker Varsity (varsity.Broker.com) provides free courses on equity, derivatives, and personal finance." },
      { stem: "SEBI defines a 'Large Cap' company as one ranked within the top ___ Indian listed companies by full market capitalisation:", options: ["50","100","250","500"], correct: 1, explanation: "As per SEBI's circular, large cap companies are the top 100 firms by full market capitalisation on Indian exchanges." },
      { stem: "In futures and options, 'Open Interest' refers to:", options: ["The total number of trades executed in that session","The total number of outstanding derivative contracts that have not yet been settled or closed","The interest payable on margin borrowed from the broker","The daily trading volume in the contract"], correct: 1, explanation: "Open Interest counts all active (open) contracts in the market — rising OI signals new money entering the market." },
      { stem: "India VIX (Volatility Index) measures:", options: ["The daily percentage change in the Nifty 50","The market's expectation of Nifty 50 volatility over the next 30 calendar days","The total market capitalisation of all NSE-listed companies","The number of FII net buy/sell transactions in a session"], correct: 1, explanation: "India VIX is computed from Nifty option prices and reflects market participants' expectation of near-term volatility." },
      { stem: "An NRI (Non-Resident Indian) who wants to invest in Indian equities must open:", options: ["A regular resident savings and Demat account","An NRE or NRO-linked Demat and trading account under FEMA guidelines","A US brokerage account with India access","A standard Broker account with no special designation"], correct: 1, explanation: "NRIs must route Indian equity investments through NRE or NRO accounts linked to a PIS (Portfolio Investment Scheme) account." },
      { stem: "TDS (Tax Deducted at Source) on dividends paid by Indian companies is deducted when the dividend from a single company exceeds ___ per financial year:", options: ["Rs. 1,000","Rs. 5,000","Rs. 10,000","Rs. 50,000"], correct: 1, explanation: "TDS at 10% is applicable on dividends exceeding Rs. 5,000 per financial year from a single company." },
      { stem: "A 'Bear Market' is typically defined as a market decline of:", options: ["5% or more from recent highs","10% or more over at least 2 months","20% or more from recent highs, sustained over time","Any week with more losing days than gaining days"], correct: 2, explanation: "A bear market is commonly defined as a 20% or greater decline from recent highs, sustained over months." },
      { stem: "An investor holds only IT-sector stocks in their portfolio. The main risk of this approach is:", options: ["Systematic risk that affects the entire market equally","Concentration risk — all stocks may decline together on the same sector news","Currency risk from rupee depreciation","Settlement risk from T+1 failures"], correct: 1, explanation: "Holding a single sector creates concentration risk — a negative sector event affects the entire portfolio simultaneously." },
      { stem: "Broker Sensibull is primarily a platform for:", options: ["Investing in direct mutual funds","Options trading — strategy builder, payoff graphs, and market analysis","Fundamental equity research and reports","Fixed income and bond investment"], correct: 1, explanation: "Sensibull (integrated with Broker) helps traders build options strategies, visualise payoffs, and find suitable option trades." },
      { stem: "The key difference between a Rights Issue and an FPO (Follow-on Public Offer) is:", options: ["Rights Issues are for newly incorporated companies; FPOs are for existing listed ones","A Rights Issue offers shares to existing shareholders first; an FPO offers shares to the general public","Rights Issue shares are free; FPO shares are always at a premium","An FPO is regulated by RBI; a Rights Issue is regulated by SEBI"], correct: 1, explanation: "Rights Issues give existing shareholders the exclusive right to buy new shares first; FPOs are open to the general public." },
      { stem: "A Futures contract obligates the buyer to:", options: ["Buy the underlying asset at the current spot price on the trade date","Buy the underlying asset at a pre-agreed price on a specified future date","Acquire the right (not obligation) to buy the underlying asset","Receive any dividends during the contract period"], correct: 1, explanation: "A futures contract is a binding obligation — both buyer and seller must complete the transaction at the agreed price and date." },
      { stem: "Buying a Put option gives the holder the:", options: ["Right to buy the underlying asset at the strike price","Obligation to sell the underlying asset on expiry","Right to sell the underlying asset at the strike price","Right to receive dividends during the option's life"], correct: 2, explanation: "A Put option gives the buyer the right (not obligation) to SELL the underlying at the strike price before expiry." },
      { stem: "In short selling, a trader:", options: ["Buys shares and holds them for a very short duration","Borrows and sells shares expecting the price to fall, then buys them back at a lower price to profit","Sells shares at a price lower than the prevailing market price","Sells only intraday positions without holding overnight"], correct: 1, explanation: "Short sellers borrow shares, sell them, hope the price falls, buy them back cheaper, and return them — pocketing the difference." },
      { stem: "A 'liquid' stock is best described as one that:", options: ["Has a very high P/E ratio","Can be bought or sold quickly in large quantities without significantly moving the price","Consistently pays large dividends","Has a face value of Rs. 1"], correct: 1, explanation: "Liquidity means a stock has sufficient buyers and sellers that large trades don't materially impact its price." },
      { stem: "Broker Streak allows traders to:", options: ["Invest directly in mutual funds without a distributor","Create, backtest, and deploy algorithmic trading strategies without coding","Access institutional equity research reports","Apply for IPOs and rights issues digitally"], correct: 1, explanation: "Broker Streak is a no-code algo trading platform for building, backtesting, and live-deploying rule-based strategies." },
      { stem: "Preference shareholders receive dividends:", options: ["After equity shareholders and at a variable rate","Only if the company earns profits above a prescribed threshold","Before equity shareholders, at a fixed rate, regardless of profit levels","Only on the maturity/redemption of preference shares"], correct: 2, explanation: "Preference shares carry a fixed dividend that is paid before any dividend is declared for equity shareholders." },
      { stem: "A REIT (Real Estate Investment Trust) allows retail investors to:", options: ["Directly own commercial office buildings","Invest in a pool of income-generating real estate through a SEBI-regulated security listed on the stock exchange","Earn tax-free rental income without any property ownership","Avail home loans at preferential interest rates"], correct: 1, explanation: "REITs pool investor money to own and operate real estate, and are listed on exchanges — giving small investors access to commercial property income." },
      { stem: "A Systematic Investment Plan (SIP) in a mutual fund involves:", options: ["A one-time lump sum investment made once a year","Investing a fixed amount at regular intervals (weekly/monthly) regardless of current market levels","Investing only when markets fall below a threshold price","Locking funds in a fixed deposit managed by a mutual fund house"], correct: 1, explanation: "SIP invests a fixed sum periodically — this rupee-cost averaging approach reduces the impact of market timing." },
      { stem: "A mutual fund's expense ratio of 1.2% is deducted:", options: ["As a one-time flat fee at the time of purchase","As a percentage of the fund's daily NAV, reducing the fund's NAV slightly each day","Only when units are redeemed by the investor","As an annual lump sum charged directly to the investor's bank account"], correct: 1, explanation: "The expense ratio is an annual fee expressed as a % of AUM, charged proportionally each day against the fund's NAV." },
      { stem: "Rolling over a futures position means:", options: ["Converting an open futures position into an equivalent options position","Closing the current expiry month's contract and simultaneously opening the same position in the next expiry month","Automatically extending the same contract by one more month without closing it","Pledging the open futures position as collateral for additional margin"], correct: 1, explanation: "Rollover = squaring off the near-month contract and re-entering in the next month, to maintain the same market view." },
      { stem: "The Securities Lending and Borrowing (SLB) mechanism allows:", options: ["Only share borrowing for short selling — lending is restricted","Only share lending by long-term holders — borrowing is restricted","Both lending (to earn a fee) and borrowing (for short selling) of securities","Only institutional investors to lend or borrow shares"], correct: 2, explanation: "SLB lets long-term holders lend idle shares for a fee, while short sellers borrow those shares to execute short positions." },
      { stem: "If the Nifty 50 index falls 20% from the previous day's close during a trading session, exchange regulations require:", options: ["A temporary 45-minute trading halt only","Trading to continue with enhanced circuit limits applied to individual stocks","Market-wide trading to be suspended for the remainder of that trading day","SEBI to intervene and manually set circuit limits for all stocks"], correct: 2, explanation: "A 20% market-wide circuit breaker halts all trading for the rest of the trading day, with no resumption till next morning." },
      { stem: "A mutual fund's NAV (Net Asset Value) is calculated:", options: ["Once a month based on the fund manager's portfolio assessment","At the end of every trading day, based on the current market value of all holdings divided by outstanding units","At the time of each individual buy or redeem transaction","Once a quarter after financial results are published"], correct: 1, explanation: "NAV = (Total assets – Liabilities) ÷ Outstanding units, calculated daily after market close for all open-ended funds." },
      { stem: "Investing in a 'Direct' mutual fund plan (vs. a 'Regular' plan) gives you a higher return because:", options: ["The fund manager takes more risk on your behalf","The expense ratio is lower — no distributor commission is embedded in the NAV","The Direct plan is managed directly by the AMC, giving priority in execution","The lock-in period is shorter, providing more flexibility"], correct: 1, explanation: "Direct plans exclude distributor commissions from the expense ratio, resulting in a higher NAV growth over time." },
      { stem: "A company earns a net profit of Rs. 100 crore and has 10 crore shares outstanding. Its Earnings Per Share (EPS) is:", options: ["Rs. 10","Rs. 100","Rs. 1,000","Rs. 10,000"], correct: 0, explanation: "EPS = Net Profit ÷ Shares Outstanding = Rs. 100 crore ÷ 10 crore = Rs. 10 per share." },
      { stem: "A stock has a Beta of 1.5. If Nifty 50 rises 10%, this stock is expected to rise approximately:", options: ["7% (it moves less than the market)","15% (it moves 1.5× the market in the same direction)","10% (it tracks the market exactly)","5% (it moves one-third as much as the market)"], correct: 1, explanation: "Beta measures a stock's sensitivity to market moves. Beta 1.5 means the stock moves 1.5× the market's movement." },
      { stem: "A Nifty 50 index fund has an expense ratio of 0.1% per year. If Nifty 50 returns 15% in a year, the investor earns approximately:", options: ["15.1%","15.0%","14.9%","10.0%"], correct: 2, explanation: "Net return ≈ index return − expense ratio = 15% − 0.1% = 14.9% (before taxes)." },
      { stem: "A rights issue is announced in a 1:4 ratio. An investor currently holding 800 shares can subscribe to a maximum of:", options: ["200 new shares","400 new shares","800 new shares","3,200 new shares"], correct: 0, explanation: "1:4 ratio = 1 new share for every 4 held. 800 ÷ 4 = 200 new shares entitlement." },
      { stem: "When pledged shares fall below the broker's required margin threshold, the investor typically receives:", options: ["An automatic closing of all open positions without any notice","A margin call — a notification to deposit additional funds or reduce open positions","A SEBI notice requiring closure of the trading account","A 30-day grace period with no penalty"], correct: 1, explanation: "A margin call is a broker's demand for more collateral. Failure to respond leads to the broker liquidating positions to recover margin." }
    ];

    try {

      if (!hasSet1) {
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 1',
          description: 'MCQ assessment (Set 1) covering Broker, stock exchanges, SEBI, IPO, order types, account opening, settlement, short delivery, gift transfers, and FIFO. 50 questions, 1 mark each.',
          scenario: '',
          checklist: set1Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!hasSet2) {
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 2',
          description: 'MCQ assessment (Set 2) with simpler questions on Broker, BSE/NSE, SEBI, IPO, Demat accounts, order types, settlement, and compliance. 50 questions, 1 mark each.',
          scenario: '',
          checklist: set2Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!hasSet3) {
        const set3Questions = [
          { stem: "Which scenario correctly identifies when DP charges are NOT applicable at Broker?", options: ["When selling delivery shares held in demat","When buying delivery shares","When selling F&O contracts","Both B and C — DP charges only apply when DEMAT debit happens on share sell"], correct: 3, explanation: "DP charges are levied only when shares are debited from your demat account. Buying shares or selling F&O positions (no demat debit involved) do not attract DP charges." },
          { stem: "An NRI trading under Non-PIS places a buy order for shares worth ₹30,000. What is the exact brokerage charged?", options: ["₹150","₹50","₹200","₹30"], correct: 0, explanation: "For NRI Non-PIS accounts at Broker, brokerage is 0.5% of the transaction value. 0.5% × ₹30,000 = ₹150." },
          { stem: "A Kite client currently has 245 instruments in their watchlists and 24 watchlists. They try to create one more watchlist. What happens?", options: ["The system allows it since the 250-instrument limit isn't breached","The new watchlist is created successfully — 25 is the limit","The new watchlist fails — 25 is the maximum number of watchlists","Both limits are breached simultaneously"], correct: 2, explanation: "Kite allows a maximum of 25 watchlists per account. Once 25 watchlists exist, no further watchlists can be created regardless of instrument count." },
          { stem: "What is the total AMC per year (including GST) for an NRI demat account at Broker?", options: ["₹500","₹540","₹590","₹600"], correct: 2, explanation: "Broker charges ₹500 per year as AMC for NRI demat accounts. With 18% GST, the total is ₹500 + ₹90 = ₹590 per year." },
          { stem: "A client has holdings worth ₹9.5 lakh in a single Broker BSDA account. The next quarter their portfolio grows to ₹10.5 lakh. What happens to their AMC?", options: ["They continue paying ₹100 + GST","They still pay ₹0 as BSDA cap hasn't been formally revised","Their account is converted to non-BSDA and they pay ₹300 + GST per year","They must close the account immediately"], correct: 2, explanation: "BSDA (Basic Services Demat Account) requires the holder to have securities in only one DP and the value must stay within limits. Exceeding the ₹10 lakh cap triggers conversion to a regular (non-BSDA) account with standard AMC charges." },
          { stem: "A company has 10 crore total shares. Promoters hold 72%, FIIs hold 18%, and the public holds 10%. What regulatory issue does this present?", options: ["FII holding is too high","Promoter holding exceeds SEBI threshold","Public shareholding is below the SEBI-mandated 25% minimum","No issue; SEBI has no minimum shareholding mandate"], correct: 2, explanation: "SEBI mandates a minimum public shareholding (MPS) of 25% for all listed companies. With only 10% public holding, this company is in violation and must reduce promoter holding to comply." },
          { stem: "A client has 3 different brokers and holds securities worth ₹3.5 lakh. Does their Broker account qualify as BSDA?", options: ["Yes, holdings are below ₹4 lakh","No, they hold accounts at multiple brokers","Yes, BSDA qualification only checks holdings at Broker","No, minimum holding to qualify is ₹1 lakh"], correct: 1, explanation: "BSDA eligibility requires the investor to hold a demat account with only ONE depository participant. Having accounts at multiple brokers disqualifies them from BSDA, regardless of holding value." },
          { stem: "An NRI client at Broker buys ₹5,00,000 worth of shares via PIS. What is the maximum brokerage they will be charged?", options: ["₹50","₹100","₹200","₹2,500"], correct: 2, explanation: "For NRI PIS accounts at Broker, brokerage is 0.5% of the transaction value, subject to a maximum of ₹200 per order. 0.5% of ₹5,00,000 = ₹2,500, but the cap of ₹200 applies." },
          { stem: "Which Broker product serves as the back-office platform for P&L, holdings, and tax reports?", options: ["Kite","Console","Coin","Varsity"], correct: 1, explanation: "Console (console.Broker.com) is Broker's back-office platform providing P&L statements, holdings overview, tax reports (including capital gains), and account details." },
          { stem: "You short a stock at Rs. 75. For you to make a profit, the stock should:", options: ["Move higher than Rs. 75","Stay exactly at Rs. 75","Move higher than Rs. 75 but lower than Rs. 80","Go to any price lower than Rs. 75"], correct: 3, explanation: "In a short position, you sell first and buy back later. Profit = selling price − buy-back price. For profit, the stock must fall below your shorting price of Rs. 75." },
          { stem: "The Repo Rate is best described as:", options: ["The rate at which commercial banks lend money to retail customers","The rate at which commercial banks lend and borrow between each other","The rate at which commercial banks borrow money from the RBI","The rate at which the RBI borrows money from retail customers"], correct: 2, explanation: "The Repo Rate is the rate at which the RBI lends money to commercial banks (banks borrow from RBI by pledging government securities). It is the primary tool the RBI uses to control liquidity and inflation." },
          { stem: "The Reverse Repo Rate is best described as:", options: ["The rate at which banks lend to retail customers","The rate at which banks borrow from each other","The deposit rate the RBI offers to banks when they park surplus funds with the RBI","The transaction fee applied by stock exchanges"], correct: 2, explanation: "The Reverse Repo Rate is the rate at which the RBI accepts deposits from commercial banks. When banks park surplus funds with the RBI overnight, they earn this rate." },
          { stem: "A company offers a buyback of shares at a 20% premium to the market price. What should an investor ideally do?", options: ["Tender shares blindly and pocket the premium immediately","Blindly ignore the offer without reviewing corporate details","Evaluate the company's future prospects and then decide whether to tender or retain","Negotiate with the broker for a better premium rate"], correct: 2, explanation: "A buyback premium is attractive but should not be accepted blindly. If the company's future growth potential exceeds the 20% premium, retaining the shares may be more valuable long-term." },
          { stem: "A trader selects CNC (Cash n Carry) and sells shares from their DEMAT account. When will they receive the full funds?", options: ["Shares are debited on T day; 100% funds are credited on the same day","80% of funds on the same day (T), remaining 20% on T+1 day","Shares are debited on T day; funds are completely received on T+2 day","100% of funds are received instantly on the same day"], correct: 1, explanation: "Under T+1 settlement: when you sell CNC shares, 80% of the sale proceeds are made available the same day (early pay-out), while the remaining 20% is credited on T+1 after settlement." },
          { stem: "Goods and Services Tax (GST) on stock market transactions is applicable on:", options: ["Only the brokerage charged by the stockbroker","Only the transaction charges applicable by the Stock Exchanges","Brokerage, transaction charges, and SEBI charges — all attract 18% GST","Only the stamp duty costs"], correct: 2, explanation: "GST at 18% is levied on brokerage, exchange transaction charges, SEBI turnover charges, and DP charges. Stamp duty and STT are exempt from GST." },
          { stem: "Once you place an order to buy a stock, how can you modify it and how many times?", options: ["25 times; you can modify only the price","250 times; you can modify only the quantity","20 times; you cannot modify the order details under any circumstances","25 times; you can modify both the price and quantity via the order book"], correct: 3, explanation: "Orders in Kite can be modified up to 25 times before execution. Both price and quantity can be changed via the Order Book as long as the order is still pending." },
          { stem: "A trader has shorted 560 shares of SBI. To square off this position, the trader must:", options: ["Short an additional 560 shares under an intraday product type","Instruct the broker to move the shares to another depository participant","BUY 560 shares of SBI to close the short position","Place a limit sell order at the upper circuit price"], correct: 2, explanation: "Short positions are squared off by buying back the same quantity of shares. Buying 560 SBI shares closes the 560-share short position." },
          { stem: "The last traded price of TCS is 1200. What happens when you place a market order to buy this stock?", options: ["The stock is bought at a guaranteed price below 1200","The stock will always be bought at a price higher than 1200","The stock is bought around the last traded price based on immediate market liquidity","Placing a market order is disabled due to volatility"], correct: 2, explanation: "A Market Order executes at the best available price at the moment of placement — typically close to the last traded price, but the exact price depends on current order book liquidity." },
          { stem: "The stock price of Yes Bank is trading at 373. You wish to initiate a BUY only if the stock moves UP to 385. Which order type should you use?", options: ["Place an immediate market order","Place a limit buy order at 385","Place a stop-loss buy trigger order at 385","Place an upper circuit bracket order"], correct: 2, explanation: "To buy a stock only when it rises above the current price, use a Stop-Loss buy order with a trigger at 385. A regular limit buy at 385 would execute immediately at the lower current price, not at 385." },
          { stem: "To be eligible to receive a corporate dividend, you need to be a shareholder on:", options: ["The dividend announcement date","The dividend declaration date","The record date","5 days prior to the record date"], correct: 2, explanation: "To receive a dividend, you must hold the shares on the Record Date. If you buy shares before the ex-dividend date, you'll be registered as a shareholder on the record date and receive the dividend." },
          { stem: "When you want to accurately measure and evaluate investment returns over a multi-year period, you opt for:", options: ["Absolute Return","CAGR (Compounded Annual Growth Rate)","Either Absolute Return or CAGR seamlessly","Intraday Scalping Percentage"], correct: 1, explanation: "CAGR (Compounded Annual Growth Rate) normalizes returns across different time periods, making it the standard metric for comparing multi-year investment performance." },
          { stem: "Which statement best describes the role of a Clearing Corporation?", options: ["Guarantee the structural settlement of funds and securities between counterparties","Help retail clients directly buy and execute transactions in the market","Store corporate securities in electronic DEMAT format vaults","Manage front-end trading terminal watchlists for retail participants"], correct: 0, explanation: "Clearing Corporations (e.g., NSCCL for NSE) act as the central counterparty to all trades, guaranteeing settlement of both funds and securities, and eliminating counterparty default risk." },
          { stem: "Which best describes the 'greenshoe option' in the context of an IPO?", options: ["To completely withdraw the IPO filing at any point if demand is poor","An option to stabilize the market price by buying up to 15% of the shares from the market post-listing","To dynamically change the volume count of shares on offer day-to-day","To vary the price band boundaries based on initial retail bidder responses"], correct: 1, explanation: "The greenshoe option (over-allotment option) allows underwriters to buy up to 15% of the originally offered shares from the open market post-listing to stabilize the stock price during the initial trading period." },
          { stem: "In corporate finance and reporting, CAPEX is best described as:", options: ["Funds required for marketing and consumer advertising campaigns","Funds required exclusively to repay long-standing institutional debt obligations","Funds deployed for capital expenditure towards long-term operational expansion and asset creation","Funds required to cover immediate day-to-day business operations"], correct: 2, explanation: "CAPEX (Capital Expenditure) refers to funds invested by a company in acquiring, upgrading, or maintaining physical or intangible long-term assets like machinery, buildings, or technology." },
          { stem: "All else being equal, if the price of a certain product increases systematically over time, it can be attributed to:", options: ["The subjective greed level of the merchant or seller","A broad, unbacked increase in local consumer purchasing power","Inflation","Bearish market sentiment cycles"], correct: 2, explanation: "Sustained, systematic price increases across an economy are the definition of inflation — a rise in the general price level of goods and services over time." },
          { stem: "During its formal monetary review sessions, the RBI directly reviews and calibrates which of the following rates?", options: ["Repo Rate, Reverse Repo Rate, and Cash Reserve Ratio (CRR)","Wholesale Price Index (WPI) and Consumer Price Index (CPI)","Industrial production data output numbers","Statutory direct corporate tax rate percentages"], correct: 0, explanation: "The RBI Monetary Policy Committee (MPC) directly controls the Repo Rate, Reverse Repo Rate, and CRR. WPI, CPI, and industrial data are inputs it monitors — not rates it sets." },
          { stem: "Post a corporate stock split event, the formal nominal face value of the share changes.", options: ["True — the face value is divided proportionally by the split ratio","False — face value remains unchanged; only the number of shares changes"], correct: 0, explanation: "In a stock split, the face value is reduced in proportion to the split ratio. For example, in a 5:1 split, a share with face value Rs. 10 becomes Rs. 2, while the number of shares increases fivefold." },
          { stem: "A transaction contract note is legally issued and sent to an investor by which entity?", options: ["The commercial bank linked to the trading account","The stockbroker","The Securities and Exchange Board of India (SEBI)","The National Stock Exchange clearing desk"], correct: 1, explanation: "A contract note is a legally binding document issued by the stockbroker to the client for every executed trade, confirming transaction details, charges, and taxes." },
          { stem: "The 'Market Depth' feature inside an active trading terminal provides which real-time data?", options: ["Real-time buy bids and sell offer quotes at various price levels","Overall historic trading volume accumulated over the past calendar year","Absolute structural Open, High, Low, and Close price parameters of previous days","Current aggregate market capitalisation of the firm"], correct: 0, explanation: "Market Depth (Level 2 data) shows the live order book — the top 5 buy bids and top 5 sell offers at various price levels, giving traders a view of buying and selling pressure." },
          { stem: "What is the primary function of an order book with respect to a trading terminal?", options: ["A layout to track historical stock prices","A layout to track daily opening prices","A system interface to keep track of pending and active orders placed by the client","An unchangeable book used to log only finalized, executed trades"], correct: 2, explanation: "The Order Book in a trading terminal displays all pending (open) orders placed by the client, allowing them to track, modify, or cancel orders before execution." },
          { stem: "An Initial Public Offering (IPO) fundamentally helps uplift a company's public profile and aids in its operational growth.", options: ["True — it raises fresh capital, enhances visibility, and enables employee ESOPs","False — an IPO only dilutes promoter control with no operational benefit"], correct: 0, explanation: "An IPO raises fresh equity capital, improves the company's credibility and public profile, provides an exit for early investors, enables ESOP schemes for employees, and funds growth initiatives." },
          { stem: "After a company lists its shares, which of the following pathways are open to promoters to raise additional equity capital?", options: ["Commercial bank fixed deposits and savings accounts","Intraday short selling via CNC product lines","Rights Issues, Offers for Sale (OFS), and Follow-on Public Offers (FPO)","Wholesale debt market bullion conversions"], correct: 2, explanation: "Once listed, a company can raise additional equity capital through Rights Issues (to existing shareholders), FPOs (to the public), or allow promoters to divest through OFS." },
          { stem: "A corporate Rights Issue creates new shares offered to existing shareholders. What structural impact does this have on existing stock value?", options: ["It permanently locks the share price from dropping below the entry cost","It dilutes the ownership value and percentage of previously held shares","It automatically doubles the nominal face value of the stock","It triggers an immediate T+1 cash settlement into the client's bank account"], correct: 1, explanation: "A Rights Issue increases the total number of shares outstanding. Without a proportional increase in company value, each existing share represents a smaller ownership percentage — this is dilution." },
          { stem: "The stock exchange allows a company to route capital divestments through an Offer for Sale (OFS) window primarily when:", options: ["The company needs fresh cash to fund a factory expansion project","The corporate board intends to issue free bonus stock rewards to retail traders","Promoters want to sell down their holdings and/or maintain minimum public shareholding requirements","The clearing corporation demands an emergency margin cash replenishment"], correct: 2, explanation: "OFS is a stock exchange mechanism used by promoters (or existing shareholders) to sell their shares to the public without issuing new shares, helping meet SEBI's minimum public shareholding norms." },
          { stem: "Why do market participants follow technology sector blue-chip earnings guidance announcements so closely every quarter?", options: ["Guidance numbers contain audited historical profit and loss data points","Management forecasts are legally binding commitments that eliminate market risk","Guidance numbers reveal forward-looking management expectations that heavily influence broader market sentiment","Corporate guidance determines the exact GST rate applied to brokerage transactions"], correct: 2, explanation: "Earnings guidance represents management's forward-looking expectations for revenue and profit. Since major tech stocks have large index weights, their outlooks can swing entire market sentiment." },
          { stem: "During an annual Union Budget, an increase in excise duties on cigarettes can drag down broader market indexes because:", options: ["Higher product prices automatically trigger an immediate stock split","The affected firm is forced to switch to the Wholesale Debt Market","The affected companies are index heavyweights, and a drop in their profitability causes participants to sell","An excise duty hike automatically expands the Cash Reserve Ratio (CRR)"], correct: 2, explanation: "Index-heavy companies like ITC are significantly impacted by excise duty hikes on cigarettes. When their earnings are expected to drop, institutions sell, dragging down indices where they have large weightages." },
          { stem: "When commercial banks park surplus cash reserves with the Reserve Bank of India, what is their primary objective?", options: ["To maximize speculative returns through leveraged equity derivatives","Capital safety, because the central bank carries zero default risk","To bypass standard clearing corporation transaction fees","To trigger an automated stock split across public PSU bank shares"], correct: 1, explanation: "Banks park funds with the RBI primarily for safety — the RBI carries sovereign-level, zero-default risk. The Reverse Repo facility provides a risk-free parking option for surplus funds." },
          { stem: "In both a corporate bonus issue and a corporate stock split, what happens to the investor's overall investment value?", options: ["It grows exponentially based on the split or bonus ratio","It is cut in half due to sudden market correction dynamics","It remains exactly the same before and after the corporate action takes effect","It is locked inside a broker pool account for a mandatory multi-year holding period"], correct: 2, explanation: "Both bonus issues and stock splits are accounting events. The number of shares increases but the price adjusts proportionally, keeping the total market value of the investor's holding unchanged." },
          { stem: "A company is profitable and holds excess cash but decides not to declare an annual dividend. What is the most likely strategic reason?", options: ["The company is legally prohibited from distributing dividends during high-inflation cycles","Management intends to reduce the total number of outstanding public market shares","Management believes they can generate better long-term value by reinvesting that cash into new growth projects","The company needs to deposit those funds with the RBI to satisfy CRR rules"], correct: 2, explanation: "Companies often retain earnings (instead of paying dividends) when they believe the reinvestment returns — in new products, acquisitions, or R&D — exceed what shareholders could earn elsewhere." },
          { stem: "Under the modern accelerated equity settlement cycle, what happens on settlement day when a client sells a stock?", options: ["Shares are transferred to a broker's pool account where they can be held for several weeks","Funds are entirely withheld by SEBI until an annual tax audit is completed","Earmarked shares are debited from the demat account and transferred to the clearing corporation for delivery","The stock is automatically converted into a leveraged futures contract position"], correct: 2, explanation: "Under T+1 settlement, earmarked shares are debited from the seller's demat account and transferred to the Clearing Corporation, which then credits them to the buyer's demat account on T+1." },
          { stem: "A Depository Participant (DP) serves as an intermediary between an investor and the main depository. A DP is legally defined as a member of:", options: ["The front-end algorithmic trading desk network","The commercial banking clearing house syndicate","National Securities Depository Limited (NSDL) and/or Central Depository Services Limited (CDSL)","The S&P BSE Sensex index construction committee"], correct: 2, explanation: "A DP (e.g., Broker) is a SEBI-registered entity that has been admitted as a member of NSDL and/or CDSL, acting as the link between individual investors and the central depository." },
          { stem: "The historical transition from physical paper share certificates to digital format stored inside a DEMAT account is known as:", options: ["Portfolio Hedging","Earmarking","Dematerialization","Book Building"], correct: 2, explanation: "Dematerialization is the process of converting physical paper share certificates into electronic form held in a Demat account with NSDL or CDSL." },
          { stem: "Which of the following criteria is a valid parameter to evaluate when choosing a stockbroker?", options: ["The broker's personal ability to guarantee risk-free returns on options trades","Whether the broker holds a physical seat on the central banking policy committee","The simplicity of the platform, quality of support, and transparency of the broker's own financial health","The broker's direct authority to modify executed trades inside the trade book"], correct: 2, explanation: "When choosing a broker, key evaluation factors include platform usability, customer service quality, fee transparency, regulatory compliance, and the broker's own financial stability." },
          { stem: "Which of the following points directly highlights a core objective of SEBI?", options: ["Setting weekly price targets for blue-chip technology stocks","Maximizing short-term speculative trading volumes for scalpers","Protecting retail investor interests and ensuring stock exchanges conduct business fairly","Managing the printing and distribution of paper currency notes"], correct: 2, explanation: "SEBI's core mandate includes protecting investor interests, promoting market development, and regulating the securities market to ensure fair, transparent, and efficient operations." },
          { stem: "An investor who actively identifies quality companies beaten down by short-term negative market sentiment is classified as a:", options: ["Growth Investor","Value Investor","Scalp Trader","Day Trader"], correct: 1, explanation: "A Value Investor seeks stocks trading below their intrinsic value, often caused by temporary negative sentiment. The strategy involves patience — waiting for the market to recognise the company's true worth." },
          { stem: "What is the standard term used to describe the very initial pool of capital raised by an entrepreneur from friends and family to jumpstart business operations?", options: ["Series A Venture Capital","Public Capitalization Float","The Seed Fund","Institutional Debt Debenture"], correct: 2, explanation: "Seed funding is the earliest stage of startup financing, typically from the founder, friends, and family. It funds initial product development and proof-of-concept before formal VC rounds." },
          { stem: "How does a Private Equity (PE) investor fundamentally differ from an early-stage Venture Capitalist (VC)?", options: ["PE investors focus exclusively on day-trading near-expiry options contracts","PE investors only deploy small capital sums into unproven conceptual ideas","PE investors typically write larger cheques and invest in mature, established firms to take on less structural risk","PE investors operate under direct oversight of the clearing corporation ledger"], correct: 2, explanation: "PE investors target mature, established businesses with proven revenue streams, deploying large capital for growth or buyouts. VCs take higher risk by funding early-stage startups with unproven business models." },
          { stem: "Apart from raising fresh CAPEX funds, what is another significant advantage a firm gains by going public via an IPO?", options: ["Gaining direct access to borrow interest-free cash from the RBI repo window","Eliminating all future corporate tax liabilities with the Ministry of Finance","Providing an exit route for early investors, rewarding employees via ESOPs, and improving visibility","Automatically protecting the stock from ever hitting a lower circuit limit"], correct: 2, explanation: "Beyond capital raising, an IPO provides early investors (VCs, PE firms) with a liquidity exit, allows employee ESOPs to be monetized, and significantly enhances the company's brand visibility and credibility." },
          { stem: "The structured process where a company collects investor bids at various price points within a designated price band to find the optimal issue price is called:", options: ["Earmarking for Settlement","Portfolio Benchmarking","Book Building","Capital Asset Allocation"], correct: 2, explanation: "Book Building is the IPO price discovery process — investors bid within the price band, and the final issue price (cut-off price) is determined based on demand aggregated across all bids." },
          { stem: "The highest price point a stock has ever traded since its primary stock exchange listing date is called its:", options: ["52-week High","All-time High","Upper Circuit Limit","Free Float Cap"], correct: 1, explanation: "The All-time High (ATH) is the highest price a stock has ever achieved since it began trading on the exchange. The 52-week high is a related but narrower metric covering only the past 12 months." },
          { stem: "A swing trader typically holds a market position for what duration?", options: ["Less than sixty seconds within a single morning session","Exactly until the end of the same trading day before market close","Anywhere from a few days to several weeks to capture price momentum","A minimum of ten consecutive calendar years to match retirement horizons"], correct: 2, explanation: "Swing trading involves holding positions for days to weeks, aiming to capture short-to-medium-term price moves. It sits between day trading (intraday) and long-term investing in terms of holding period." }
        ];
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 3',
          description: 'MCQ assessment (Set 3) covering advanced Broker features (DP charges, NRI accounts, BSDA, Console), corporate actions, RBI monetary policy, order types, CAPEX, SEBI objectives, and market concepts. 51 questions, 1 mark each.',
          scenario: '',
          checklist: set3Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!hasSet4) {
        const set4Questions = [
          { stem: "What is the maximum number of instruments that can be added to a single watchlist in Broker Kite?", options: ["25 instruments","50 instruments","75 instruments","100 instruments"], correct: 1, explanation: "Each watchlist in Kite supports up to 50 instruments. You can create up to 25 watchlists per account, giving a total capacity of 1,250 instrument slots across all watchlists." },
          { stem: "An After Market Order (AMO) placed through Broker is submitted to the exchange:", options: ["Immediately in an after-hours OTC session","At the start of the next trading day at 9:15 AM","At 3:30 PM on the same day as placement","Only if confirmed by the broker manually"], correct: 1, explanation: "AMOs are placed outside regular market hours and are queued for submission at the next day's market open (9:15 AM). They are useful for investors who cannot monitor markets during live trading hours." },
          { stem: "The 'ex-dividend date' for a stock means:", options: ["The date the company announces its dividend","The date the dividend is credited to shareholders","The cut-off date — buyers on or after this date do NOT receive the declared dividend","The date the dividend is recorded in company books"], correct: 2, explanation: "To receive a declared dividend, you must own the shares before the ex-dividend date. Buying on or after the ex-dividend date means you are not entitled to the current dividend." },
          { stem: "A Cover Order in Broker Kite is:", options: ["A standard market order with no conditions","An intraday order paired with a compulsory stop-loss, enabling higher leverage","A bracket order with both a target price and stop-loss","An order type available only for commodity instruments"], correct: 1, explanation: "A Cover Order pairs an entry order with a mandatory stop-loss, limiting broker risk and allowing Broker to offer higher intraday leverage compared to a plain MIS order." },
          { stem: "Under SEBI's Minimum Public Shareholding (MPS) rule, listed companies must maintain a minimum public float of:", options: ["10%","15%","25%","35%"], correct: 2, explanation: "SEBI mandates a minimum 25% public shareholding for all listed companies. Non-compliant companies must reduce promoter holdings via OFS, rights issues, or other SEBI-approved methods." },
          { stem: "An ELSS (Equity Linked Savings Scheme) fund has a mandatory lock-in period of:", options: ["1 year","2 years","3 years","5 years"], correct: 2, explanation: "ELSS has the shortest lock-in (3 years) among all Section 80C instruments. After lock-in, units can be freely redeemed. Investments up to Rs. 1.5 lakh per year qualify for Section 80C tax deduction." },
          { stem: "A Call option is 'In The Money' (ITM) when:", options: ["The option has no time value remaining","The strike price is above the current market price","The current market price is above the strike price","The option is trading at a loss"], correct: 2, explanation: "A Call option is ITM when the underlying's market price exceeds the strike price, giving it intrinsic value. Exercising an ITM call option yields an immediate gain before expiry." },
          { stem: "In Futures trading, 'Mark to Market' (MTM) settlement means:", options: ["Final settlement happens only at contract expiry","Unrealised P&L on open futures positions is settled in cash at the end of every trading day","The full contract value is blocked as margin upfront","Settlement is calculated against the 52-week average price"], correct: 1, explanation: "MTM requires daily cash settlement of gains and losses on open futures positions. This protects the clearing corporation from accumulated losses and requires traders to maintain adequate margin at all times." },
          { stem: "A 'Bulk Deal' on Indian stock exchanges is a transaction involving more than what percentage of a company's total shares?", options: ["0.5%","1%","2%","5%"], correct: 0, explanation: "SEBI defines a bulk deal as any single transaction exceeding 0.5% of a company's total equity shares. All bulk deals must be reported to the exchange by the end of the same trading day." },
          { stem: "A 'Block Deal' differs from a bulk deal because block deals:", options: ["Have no minimum quantity threshold","Are executed in a dedicated window (8:45–9:00 AM) within ±1% of the previous close, minimum Rs. 10 crore","Require prior SEBI approval before execution","Are restricted to domestic institutional investors only"], correct: 1, explanation: "Block deals are executed in a special pre-market window (8:45–9:00 AM) at prices within ±1% of the reference price, with a minimum transaction size of Rs. 10 crore per deal." },
          { stem: "When a stock hits its upper circuit limit during trading:", options: ["The stock is suspended for the rest of the day","Only sell orders are accepted — no new buy orders","Only buy orders are accepted — no new sell orders","The circuit limit automatically expands by 5%"], correct: 2, explanation: "At the upper circuit, the price cannot rise further. Buyers continue to place orders but no sellers offer shares at that level. Only buy orders queue — no sell orders execute." },
          { stem: "A 'Systematic Transfer Plan' (STP) in mutual funds allows an investor to:", options: ["Reinvest dividends automatically into more units","Periodically move a fixed amount from one fund (typically liquid/debt) into another (typically equity)","Withdraw units systematically at regular intervals","Transfer the entire corpus to another AMC at no cost"], correct: 1, explanation: "STP lets investors gradually deploy lump-sum money from a liquid/debt fund into an equity fund, combining capital safety with the rupee-cost averaging benefit of staggered equity investment." },
          { stem: "Dividend Yield of a stock is calculated as:", options: ["Annual Dividend per Share ÷ Current Market Price × 100","Total dividends paid ÷ Number of shares issued × 100","Annual Dividend per Share ÷ Face Value × 100","EPS × Dividend Payout Ratio × 100"], correct: 0, explanation: "Dividend Yield = (Annual Dividend per Share ÷ Current Market Price) × 100. It helps investors assess income return on their investment relative to the current stock price." },
          { stem: "For an NRI investor, which accounts allow complete, unrestricted repatriation of funds back abroad?", options: ["Only NRO accounts","Only NRE accounts","Both NRE and FCNR accounts","All NRI accounts without restriction"], correct: 2, explanation: "NRE (Non-Resident External) and FCNR (Foreign Currency Non-Resident) accounts are fully repatriable. NRO accounts have restricted repatriation — up to USD 1 million per year after applicable taxes." },
          { stem: "A 'New Fund Offer' (NFO) in mutual funds is:", options: ["A rights issue by an existing fund to existing unit holders","The first-time launch of a new fund scheme where units are offered at face value (typically Rs. 10)","A special offer where existing funds waive exit load for a limited period","A SEBI-mandated annual reset of fund NAV to Rs. 10"], correct: 1, explanation: "An NFO is a mutual fund's initial offering at face value (Rs. 10). After the NFO period closes, the fund invests the corpus and units trade at the evolving NAV based on portfolio performance." },
          { stem: "SEBI's Insider Trading Regulations prohibit trades based on:", options: ["Published quarterly earnings reports","Unpublished Price Sensitive Information (UPSI) not yet disclosed to the public","Broker research reports available on paid subscription","Technical chart analysis and price patterns"], correct: 1, explanation: "UPSI includes undisclosed merger plans, pre-announcement earnings data, regulatory outcomes, or any material non-public information. Trading on UPSI is a criminal offence under SEBI regulations." },
          { stem: "A company has 1 crore shares outstanding and EPS of Rs. 30. It issues a 2:1 bonus. The new EPS (profit unchanged) is:", options: ["Rs. 30","Rs. 15","Rs. 10","Rs. 60"], correct: 2, explanation: "A 2:1 bonus means 2 extra shares per 1 held — total shares triple from 1 crore to 3 crore. New EPS = Same Net Profit ÷ 3 crore shares = Rs. 30 ÷ 3 = Rs. 10 per share." },
          { stem: "The 'Price to Book Value' (P/BV) ratio is calculated as:", options: ["Market Price per Share ÷ Book Value per Share","Earnings per Share ÷ Book Value per Share","Market Capitalisation ÷ Annual Revenue","Net Profit ÷ Total Equity"], correct: 0, explanation: "P/BV = Market Price per Share ÷ Book Value per Share. A P/BV below 1 may suggest undervaluation; above 1 reflects the market's premium for intangibles, brand, and growth prospects." },
          { stem: "In a mutual fund, 'exit load' refers to:", options: ["An entry fee charged when you invest in the fund","A redemption fee charged if you exit the fund before a specified holding period","The fund manager's performance bonus deducted from returns","Annual GST charged on the expense ratio"], correct: 1, explanation: "Exit load is a penalty for early redemption, designed to discourage short-term trading in mutual funds. For example, a 1% exit load within 1 year means you receive 1% less of NAV on redemption." },
          { stem: "'Open Interest' rising while futures price is also rising typically indicates:", options: ["Existing positions are being squared off — bearish signal","New short positions are being added — bearish signal","New long positions are being added — bullish confirmation of uptrend","Market participants are reducing exposure neutrally"], correct: 2, explanation: "Rising Open Interest + Rising Price = new money flowing into long positions, confirming uptrend strength. Falling OI + Rising Price suggests short covering, a weaker bullish signal." },
          { stem: "The difference between 'Authorised Capital' and 'Paid-up Capital' of a company is:", options: ["Authorised capital is actual money received; paid-up capital is the maximum allowed","Authorised capital is the maximum share capital a company can issue; paid-up capital is what has actually been issued and paid for","They are the same term used in different regulatory contexts","Paid-up capital includes reserves; authorised capital does not"], correct: 1, explanation: "Authorised capital is the ceiling defined in the memorandum on how much share capital can be issued. Paid-up capital is the portion actually issued to and paid for by shareholders." },
          { stem: "A company's 'Return on Equity' (ROE) measures:", options: ["The percentage of revenue converted to profit","How efficiently a company generates profit from shareholders' equity","Dividend yield relative to book value","The ratio of operating profit to total assets"], correct: 1, explanation: "ROE = Net Profit ÷ Shareholders' Equity × 100. It shows how much profit is generated per rupee of equity. Higher ROE generally signals more efficient use of shareholder funds." },
          { stem: "Under SEBI's Takeover Code, a mandatory open offer is triggered when an acquirer's stake reaches or exceeds:", options: ["15%","25%","26%","51%"], correct: 1, explanation: "SEBI's Takeover Code requires a mandatory open offer to buy at least 26% more shares from public shareholders once the acquirer's holding reaches or crosses 25% in a listed company." },
          { stem: "An 'Offer for Sale' (OFS) is primarily used by:", options: ["The company to raise fresh capital for expansion","Existing shareholders (typically promoters) to sell their existing shares to the public","The exchange to list shares of unlisted subsidiaries","SEBI to divest shares in defaulting companies"], correct: 1, explanation: "OFS allows promoters or large shareholders to sell their existing stakes via the exchange platform. No fresh capital goes to the company in an OFS — only ownership is transferred." },
          { stem: "'Alpha' in investment returns represents:", options: ["The total annual return of a portfolio","The portion of return attributable to market movement","The excess return over a benchmark index, representing manager skill","The risk-free rate earned on government bonds"], correct: 2, explanation: "Alpha measures a portfolio's excess return relative to a benchmark. Alpha of +3% means the portfolio outperformed its benchmark by 3% — attributed to active management skill rather than market movement." },
          { stem: "Securities Transaction Tax (STT) on intraday equity trades (non-delivery) is charged at:", options: ["0.1% on both buy and sell sides","0.025% on the sell side only","0.05% on both buy and sell sides","0.1% on the sell side only"], correct: 1, explanation: "For intraday equity trades, STT is 0.025% on the sell side only. For delivery-based trades, STT is 0.1% on both buy and sell sides." },
          { stem: "A 'Debenture' issued by a company is:", options: ["A share of ownership with voting rights","A long-term debt instrument carrying a fixed interest rate","A government-guaranteed bond with no default risk","A derivative linked to the company's share price"], correct: 1, explanation: "Debentures are debt instruments issued by companies to raise loans. Debenture holders are creditors (not owners) and receive fixed interest (coupon) irrespective of company profits." },
          { stem: "What happens to a share price on the ex-dividend date, all else being equal?", options: ["It rises by the dividend amount as demand increases","It remains unchanged as dividends are paid from profits","It falls approximately by the dividend amount since the stock now trades without the dividend entitlement","It is frozen by the exchange until dividend is paid out"], correct: 2, explanation: "On the ex-dividend date, the stock price theoretically drops by the dividend amount as new buyers are no longer entitled to it. This is a mechanical adjustment, not a sign of poor company performance." },
          { stem: "'Compulsory Delisting' of a stock from an exchange occurs when:", options: ["The stock price falls below Rs. 1 for 30 consecutive days","SEBI or the exchange orders removal due to regulatory non-compliance, fraud, or prolonged non-operation","The promoter's holding exceeds 75% for two consecutive quarters","Market cap falls below the exchange minimum threshold for 90 days"], correct: 1, explanation: "Compulsory delisting is ordered by SEBI/exchange when a company fails to comply with listing norms, commits fraud, or fails to make required disclosures. It differs from voluntary (promoter-initiated) delisting." },
          { stem: "Dollar Cost Averaging (DCA) as an investment strategy involves:", options: ["Only investing when a target currency strengthens","Investing a fixed amount at regular intervals regardless of current price","Doubling investment each time the stock falls 10%","Waiting to invest only at a specific target price"], correct: 1, explanation: "DCA (Rupee Cost Averaging in Indian context) invests a fixed amount at regular intervals. When prices are low, more units are bought; when high, fewer. This smoothens entry cost over time." },
          { stem: "The Nifty Midcap 150 index tracks companies ranked:", options: ["1st to 150th by market cap on NSE","101st to 250th by full market capitalisation on NSE","Any 150 NSE companies not in Nifty 50","150 companies by trading volume, not market cap"], correct: 1, explanation: "Nifty Midcap 150 covers companies ranked 101–250 by full market cap, consistent with SEBI's categorisation: Top 100 = Large Cap, 101–250 = Mid Cap, beyond 250 = Small Cap." },
          { stem: "Pledging shares with a broker allows an investor to:", options: ["Transfer ownership of shares to the broker permanently","Use existing shareholdings as collateral to get additional trading margin without selling the shares","Earn interest on idle shares parked with the broker","Enable automatic dividend reinvestment"], correct: 1, explanation: "Pledging creates a lien on shares — ownership stays with the investor, but the broker can use them as margin collateral. If margin is not maintained, the broker can sell pledged shares to recover dues." },
          { stem: "A 'Rights Entitlement' (RE) that is tradeable on stock exchanges means:", options: ["Promoters have the right to retain their holding during an IPO","Shareholders can sell their rights entitlement to third parties who can then subscribe to the rights issue","A government certificate confirming investor rights compliance","A SEBI-mandated lock-in on rights issue shares"], correct: 1, explanation: "SEBI introduced tradeable Rights Entitlements so shareholders unwilling to subscribe can sell their entitlement. Buyers of REs can then exercise those rights to subscribe to shares in the issue." },
          { stem: "The 'Price Band' in a book-built IPO refers to:", options: ["The maximum and minimum price the stock can trade at on listing day","The floor and ceiling price within which investors bid during the IPO","SEBI's mandated fair price range based on P/E ratio","The range between face value and IPO premium"], correct: 1, explanation: "In a book-built IPO, SEBI allows a price band (floor to cap) of up to 20%. Investors bid within this range; the final issue (cut-off) price is the highest price at which the issue is fully subscribed." },
          { stem: "A Registrar and Transfer Agent (RTA) in an IPO is responsible for:", options: ["Setting the IPO price after collecting bids","Managing share allotment, maintaining the investor register, and processing refunds","Acting as the lead merchant banker managing the full IPO","Approving IPO filings on behalf of SEBI"], correct: 1, explanation: "RTAs (e.g., KFin Technologies, Link Intime) handle post-IPO operations: processing applications, allotting shares, crediting shares to demat accounts, and processing refunds for unsuccessful applicants." },
          { stem: "A mutual fund's Total Expense Ratio (TER) of 1.5% per annum means:", options: ["1.5% of invested amount is charged upfront as a one-time fee","1.5% of investment is deducted annually in a lump sum","~0.004% is deducted daily from the fund's gross assets, reducing the NAV slightly each day","Your returns are capped at benchmark return minus 1.5%"], correct: 2, explanation: "TER is applied daily: 1.5% ÷ 365 ≈ 0.004% per day. It is deducted from the fund's total assets, reducing the NAV incrementally. Investors never pay it directly — it is embedded in the NAV." },
          { stem: "A stock's '52-Week High' is:", options: ["The highest price the stock has ever traded since listing","The highest traded price over the past 52 weeks (approximately one year)","The highest price at which promoters bought shares in the last year","The highest price approved by SEBI for the stock in the past year"], correct: 1, explanation: "The 52-week high is the highest price traded in the last 52 weeks. Stocks near their 52-week high are often used as indicators of relative strength and momentum." },
          { stem: "A company has a Debt-to-Equity (D/E) ratio of 0. This means:", options: ["The company is highly leveraged with maximum debt","The company has zero debt — entirely equity-financed","Debt and equity are equal","The company has not issued any equity shares"], correct: 1, explanation: "A D/E of 0 means no debt. While this implies low financial risk, it may mean the company is foregoing the tax benefit of debt (interest is tax-deductible). Optimal D/E varies widely by industry." },
          { stem: "The Clearing Corporation for NSE trades in India is:", options: ["CDSL (Central Depository Services Limited)","NSDL (National Securities Depository Limited)","NSE Clearing Limited (formerly NSCCL)","SEBI's Settlement Division"], correct: 2, explanation: "NSE Clearing Limited (formerly NSCCL) is the clearing corporation for all NSE trades. It acts as the central counterparty — becoming the buyer to every seller and seller to every buyer, guaranteeing settlement." },
          { stem: "If a stock's P/E is significantly lower than its industry peers, it may indicate:", options: ["The stock is definitely overvalued and should be sold","Potential undervaluation relative to peers — or genuine concerns about growth prospects, requiring further analysis","The company is paying higher dividends than peers","The company's EPS is higher than the sector average"], correct: 1, explanation: "A low P/E vs peers could signal undervaluation (an opportunity) or reflect legitimate concerns about earnings quality or growth. Context and fundamental analysis are always essential before concluding." },
          { stem: "'Free Cash Flow' (FCF) for a company is:", options: ["Cash held in the company's current account","Operating cash flow minus capital expenditure — cash available to return to shareholders or reinvest","Total cash raised through IPOs and rights issues in a year","Revenue minus all operating costs before tax"], correct: 1, explanation: "FCF = Operating Cash Flow − CAPEX. It is the genuine surplus cash generated after sustaining and growing the asset base, and is a key metric for assessing dividend sustainability and company valuation." },
          { stem: "Under SEBI's Takeover Code, what is the minimum percentage an acquirer must offer to buy from public shareholders in a mandatory open offer?", options: ["10%","15%","26%","51%"], correct: 2, explanation: "In a mandatory open offer triggered by crossing the 25% threshold, the acquirer must offer to buy at least 26% of total shares from public shareholders, giving them a fair exit at a SEBI-regulated price." },
          { stem: "A 'Liquid Fund' in the mutual fund category primarily invests in:", options: ["Large-cap equity shares of highly liquid companies","Very short-term money market instruments with maturity up to 91 days","Long-term government bonds with active secondary market trading","A balanced mix of equity and short-term debt"], correct: 1, explanation: "Liquid funds invest in money market instruments (T-bills, CPs, CDs) maturing within 91 days. They offer high safety, minimal volatility, and quick redemption — ideal for parking short-term surplus funds." },
          { stem: "What is 'Scalping' in trading?", options: ["Making very short-term trades (seconds to minutes) to profit from tiny price movements, closing all positions within minutes","Buying stocks during results season and holding for exactly one quarter","Short selling stocks and covering at the end of each week","A SEBI-prohibited arbitrage strategy between NSE and BSE prices"], correct: 0, explanation: "Scalpers execute dozens or hundreds of trades daily targeting micro price movements, holding for seconds to minutes. This requires ultra-fast execution, tight spreads, and very high transaction volumes." },
          { stem: "A 'Qualified Institutional Buyer' (QIB) in Indian capital markets is:", options: ["Any retail investor with a net worth above Rs. 2 crore","SEBI-registered institutional entities (mutual funds, FIIs, insurance companies, banks) deemed financially sophisticated","Companies with paid-up capital above Rs. 100 crore","Brokers with more than Rs. 50 crore in client AUM"], correct: 1, explanation: "QIBs include mutual funds, FIIs/FPIs, SEBI-registered VCs, insurance companies, and scheduled commercial banks. They receive 50% of IPO allocation and are considered sophisticated enough to need fewer protections." },
          { stem: "The 'Holding Period Return' (HPR) of an investment is:", options: ["(Ending Value + Dividends − Beginning Value) ÷ Beginning Value × 100","Only the capital gain portion, excluding dividends received","Annual return compounded over the holding period","Ending Value ÷ CAGR of the benchmark index"], correct: 0, explanation: "HPR = (Ending Value + Dividends − Beginning Value) ÷ Beginning Value × 100. It captures total return over any holding period, combining price appreciation and income received." },
          { stem: "In an IPO, 'Anchor Investors' are:", options: ["Retail investors who apply for maximum lots in every IPO","SEBI-approved large QIBs who subscribe before the IPO opens at a fixed price, signalling confidence in the issue","The lead merchant banker who anchors the IPO process","NRI investors providing anchor capital through a fixed-rate bond"], correct: 1, explanation: "Anchor investors (large mutual funds, FIIs) subscribe before the IPO opens, at the final issue price. Their participation signals institutional confidence and helps stabilise demand for the offering." },
          { stem: "'Systematic Risk' in investing refers to:", options: ["Risk specific to one company due to its business or management","Market-wide risk affecting all securities that cannot be eliminated through diversification (e.g., recession, rate hikes)","The risk of a broker defaulting on client funds","Operational risk from T+1 settlement failures"], correct: 1, explanation: "Systematic risk (market risk) is undiversifiable — it affects the entire market. Examples include interest rate changes, inflation, recessions, and geopolitical events. It is measured using Beta." },
          { stem: "When a company undergoes 'Voluntary Delisting', the exit price for shareholders is determined by:", options: ["At least the face value of the shares","A reverse book-building process where 90% of public shareholders must tender shares before the price is accepted","The previous 6-month average market price set by the exchange","The IPO price plus simple interest at 8% per annum"], correct: 1, explanation: "In voluntary delisting, SEBI mandates a reverse book-building process. The discovered price is accepted only if 90% of public shareholders tender their shares, protecting minority investors from a forced below-market exit." }
        ];
        await DB.put('topics', {
          module: 'stock-market-mcq',
          title: 'NRI Basics of Stock Market — Set 4',
          description: 'MCQ assessment (Set 4) covering moderate concepts: AMO, cover orders, ELSS, ITM options, MTM settlement, block deals, STP, dividend yield, NRI accounts, insider trading, P/BV, ROE, SEBI takeover code, OFS, alpha, STT, debentures, F&O open interest, DCA, midcap indices, pledging, rights entitlement, TER, FCF, liquid funds, QIBs, HPR, anchor investors, systematic risk. 50 questions, 1 mark each.',
          scenario: '',
          checklist: set4Questions,
          bot_script: [],
          enabled: true,
          created_at: new Date().toISOString()
        });
      }
      if (!silent) toast('✅ NRI Stock Market topics seeded! Sets are now live.', 'success');
      await seedManagerTopics();
    renderTopicsList();
    } catch (e) {
      if (!silent) toast('❌ Seed failed: ' + e.message, 'error');
      else console.error('SMQ auto-seed failed:', e.message);
    }
  }

    // ---- Matches Module Filter Helper ----
  function matchesModuleFilter(itemModule, filterModule) {
    if (!filterModule || filterModule === 'all') return true;
    if (itemModule === filterModule) return true;
    if (filterModule === 'pick-speak' && (itemModule === 'pick-speak-stock' || itemModule === 'pick-speak-general' || itemModule === 'pick-speak')) return true;
    if ((filterModule === 'pick-speak-stock' || filterModule === 'pick-speak-general') && itemModule === 'pick-speak') return true;
    return false;
  }

  // ---- Topics Management ----
  async function seedManagerTopics() {
    try {
      await DB.init();
    } catch (e) {
      console.warn('seedManagerTopics failed:', e);
    }
  }

  async function renderTopicsList() {
    const container = $('topics-list');
    if (!container) return;

    try {
      await DB.init();
      const allTopics = await DB.getAll('topics');
      const filtered = allTopics.filter(t => matchesModuleFilter(t.module, _topicsFilter));

      if (!filtered.length) {
        container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:2rem;text-align:center;color:var(--text-muted)">No topics found. Create one with + New Topic.</div>';
        return;
      }

      container.innerHTML = filtered.map(t => {
        const isEnabled = t.enabled !== false;
        const desc = t.description || t.scenario || '';
        const shortDesc = desc.length > 120 ? desc.substring(0, 120) + '…' : desc;

        return `
          <div class="topic-card ${!isEnabled ? 'disabled' : ''}" style="background:#fff;border:1px solid var(--border-color,#e2e8f0);border-radius:8px;padding:1rem;display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <div class="topic-card-header" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.6rem">
                ${moduleBadge(t.module || 'pick-speak')}
                <button class="btn-small ${isEnabled ? 'primary' : 'ghost'}" style="font-size:0.75rem;padding:0.2rem 0.5rem" onclick="Admin.toggleTopicEnabled('${t.id}')">
                  ${isEnabled ? '✅ Enabled' : '⏸ Disabled'}
                </button>
              </div>
              <h3 class="topic-card-title" style="font-size:1rem;font-weight:600;margin-bottom:0.4rem;color:var(--text-main,#1e293b)">${t.title || 'Untitled Topic'}</h3>
              <p class="topic-card-desc" style="font-size:0.85rem;color:var(--text-muted,#64748b);line-height:1.4;margin-bottom:0.8rem">${shortDesc || 'No description'}</p>
            </div>
            <div class="topic-card-actions" style="display:flex;gap:0.4rem;margin-top:0.5rem">
              <button class="btn-small" onclick="Admin.openTopicModal('${t.id}')">✏️ Edit</button>
              <button class="btn-small danger" onclick="Admin.deleteTopic('${t.id}')">🗑 Delete</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('[Admin] renderTopicsList failed:', e);
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;color:var(--danger)">Failed to load topics: ${e.message}</div>`;
    }
  }

  function initTopics() {
    document.querySelectorAll('.module-tabs .tab-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        document.querySelectorAll('.module-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _topicsFilter = btn.getAttribute('data-module') || 'all';
        await renderTopicsList();
      };
    });

    const newBtn = $('btn-new-topic');
    if (newBtn) {
      newBtn.onclick = () => openTopicModal();
    }

    const closeBtn = $('btn-close-topic-modal');
    if (closeBtn) closeBtn.onclick = closeTopicModal;

    const cancelBtn = $('btn-cancel-topic');
    if (cancelBtn) cancelBtn.onclick = closeTopicModal;

    const saveBtn = $('btn-save-topic');
    if (saveBtn) saveBtn.onclick = saveTopic;
  }

  function closeTopicModal() {
    const modal = $('topic-modal');
    if (modal) modal.classList.add('hidden');
    _editTopicId = null;
  }

  async function openTopicModal(topicId = null) {
    _editTopicId = topicId;
    const modal = $('topic-modal');
    if (!modal) return;

    const titleEl = $('topic-modal-title');
    const modSelect = $('topic-module');
    const inputTitle = $('topic-title');
    const inputDesc = $('topic-description');
    const inputScen = $('topic-scenario');

    if (topicId) {
      if (titleEl) titleEl.textContent = 'Edit Topic';
      const t = await DB.get('topics', topicId);
      if (t) {
        if (modSelect) modSelect.value = t.module || 'pick-speak';
        if (inputTitle) inputTitle.value = t.title || '';
        if (inputDesc) inputDesc.value = t.description || '';
        if (inputScen) inputScen.value = t.scenario || '';
      }
    } else {
      if (titleEl) titleEl.textContent = 'New Topic';
      if (modSelect) modSelect.value = _topicsFilter !== 'all' ? _topicsFilter : 'pick-speak';
      if (inputTitle) inputTitle.value = '';
      if (inputDesc) inputDesc.value = '';
      if (inputScen) inputScen.value = '';
    }

    modal.classList.remove('hidden');
  }

  async function saveTopic() {
    const modSelect = $('topic-module');
    const inputTitle = $('topic-title');
    const inputDesc = $('topic-description');
    const inputScen = $('topic-scenario');

    const module = modSelect ? modSelect.value : 'pick-speak';
    const title = inputTitle ? inputTitle.value.trim() : '';
    const description = inputDesc ? inputDesc.value.trim() : '';
    const scenario = inputScen ? inputScen.value.trim() : '';

    if (!title) {
      alert('Please enter a topic title.');
      return;
    }

    try {
      const topic = {
        id: _editTopicId || ('topic_' + Date.now()),
        module,
        title,
        description,
        scenario,
        enabled: true,
        created_at: new Date().toISOString()
      };

      await DB.put('topics', topic);
      closeTopicModal();
      toast(_editTopicId ? 'Topic updated!' : 'Topic created!', 'success');
      renderTopicsList();
    } catch (e) {
      alert('Failed to save topic: ' + e.message);
    }
  }

  async function deleteTopic(topicId) {
    if (!confirm('Are you sure you want to delete this topic?')) return;
    try {
      await DB.del('topics', topicId);
      toast('Topic deleted.', '');
      renderTopicsList();
    } catch (e) {
      alert('Failed to delete topic: ' + e.message);
    }
  }

  async function toggleTopicEnabled(topicId) {
    try {
      const t = await DB.get('topics', topicId);
      if (t) {
        t.enabled = !(t.enabled !== false);
        await DB.put('topics', t);
        renderTopicsList();
      }
    } catch (e) {
      console.error('toggleTopicEnabled failed:', e);
    }
  }

  async function enableAllTopics() {
    try {
      const allTopics = await DB.getAll('topics');
      const filtered = allTopics.filter(t => matchesModuleFilter(t.module, _topicsFilter));
      for (const t of filtered) {
        t.enabled = true;
        await DB.put('topics', t);
      }
      toast('All topics enabled for current tab.', 'success');
      renderTopicsList();
    } catch (e) {
      console.error('enableAllTopics failed:', e);
    }
  }

  async function disableAllTopics() {
    try {
      const allTopics = await DB.getAll('topics');
      const filtered = allTopics.filter(t => matchesModuleFilter(t.module, _topicsFilter));
      for (const t of filtered) {
        t.enabled = false;
        await DB.put('topics', t);
      }
      toast('All topics disabled for current tab.', 'info');
      renderTopicsList();
    } catch (e) {
      console.error('disableAllTopics failed:', e);
    }
  }

  function applyAssessmentFilters(sessions, topicMap) {
    // First split by archive status (stored in settings, not a DB column)
    let filtered = _viewArchive
      ? sessions.filter(s => _archivedIds.has(s.id))
      : sessions.filter(s => !_archivedIds.has(s.id));

    filtered = filtered.filter(s => matchesModuleFilter(s.module, _assessmentsFilter.module));
    if (_assessmentsFilter.status !== 'all') {
      filtered = filtered.filter(s => s.status === _assessmentsFilter.status);
    }
    if (_assessmentsFilter.team !== 'all') {
      filtered = filtered.filter(s => _teamAssignments[s.traineeId] === _assessmentsFilter.team);
    }

    if (_currentManagerDrill) {
      _restoreIndividualSessionsHeader();
      const drill = _currentManagerDrill;
      // Resolve each session's manager using team-assignment (primary) or baked index (fallback)
      const resolveSessionMgr = s => {
        const assigned = _teamAssignments[s.traineeId];
        return (assigned && _MANAGER_AGENT_MAP[assigned]) ? assigned : _getAgentManager(s.traineeName);
      };
      if (drill === '(No Manager Assigned)') {
        filtered = filtered.filter(s => !resolveSessionMgr(s));
      } else {
        filtered = filtered.filter(s => resolveSessionMgr(s) === drill);
      }
      renderAssessmentsTable(filtered, topicMap);
    } else {
      // Default: manager summary view
      renderManagerSummaryTable(filtered, topicMap);
    }
  }

  // ---- Restore thead to individual-session columns ----
  function _restoreIndividualSessionsHeader() {
    const theadTr = $('assessments-thead-tr');
    if (!theadTr) return;
    theadTr.innerHTML = `
      <th style="width:36px;text-align:center">
        <input type="checkbox" id="select-all-sessions" onchange="Admin.toggleAllSessions(this.checked)" />
      </th>
      <th>Trainee</th>
      <th>Module</th>
      <th>Topic</th>
      <th>Submitted</th>
      <th>Status</th>
      <th>AI Score</th>
      <th>Admin Score</th>
      <th>Final Score</th>
      <th>Actions</th>`;
  }

  // ---- Manager summary table (default assessments view) ----
  function renderManagerSummaryTable(sessions, topicMap) {
    const theadTr = $('assessments-thead-tr');
    const tbody   = $('assessments-tbody');

    // Switch to manager-summary columns
    if (theadTr) {
      theadTr.innerHTML = `
        <th style="width:36px;text-align:center"><input type="checkbox" id="select-all-managers" onchange="Admin.toggleAllManagers(this.checked)" /></th>
        <th>Manager</th>
        <th style="text-align:center">Agents (with sessions / total)</th>
        <th style="text-align:center">Sessions</th>
        <th style="text-align:right">Avg AI Score</th>
        <th style="text-align:right">Avg Admin Score</th>
        <th>Actions</th>`;
    }

    _allRenderedSessions = sessions;
    _selectedSessionIds.clear();
    _selectedManagerNames.clear();
    _updateManagerActionBtns();
    // hide session-level bulk buttons when in manager summary
    const archBtn = $('btn-archive-selected');
    const restBtn = $('btn-restore-selected');
    if (archBtn) archBtn.style.display = 'none';
    if (restBtn) restBtn.style.display = 'none';

    if (!sessions.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${_viewArchive ? 'No archived assessments.' : 'No assessments found.'}</td></tr>`;
      return;
    }

    // Group sessions by manager
    // Primary: team assignment stored in settings (traineeId → managerName)
    // Fallback: name-based lookup from _MANAGER_AGENT_MAP
    const managerGroups = {};
    const unassigned    = [];
    sessions.forEach(s => {
      const assigned = _teamAssignments[s.traineeId];
      // Use team assignment if it's a known manager, else name-match (with alias resolution)
      const mgr = (assigned && _MANAGER_AGENT_MAP[assigned])
                ? assigned
                : _getAgentManager(s.traineeName);
      if (mgr) {
        if (!managerGroups[mgr]) managerGroups[mgr] = [];
        managerGroups[mgr].push(s);
      } else {
        unassigned.push(s);
      }
    });

    const makeRow = (mgr, mgrSessions, isUnassigned) => {
      const totalAgents        = isUnassigned ? '?' : ((_MANAGER_AGENT_MAP[mgr] || []).length);
      const agentsWithSessions = new Set(mgrSessions.map(s => (s.traineeName || '').trim().toLowerCase())).size;
      const agentsLabel        = isUnassigned ? agentsWithSessions : `${agentsWithSessions} / ${totalAgents}`;

      const aiNums    = mgrSessions.map(s => s.aiScores    ? normalizeOverall(s.aiScores.overall) : null).filter(x => x !== null);
      const adminNums = mgrSessions.map(s => s.adminScores ? calcAdminAvg(s.adminScores)           : null).filter(x => x !== null);
      const avgAI    = aiNums.length    ? (aiNums.reduce((a, b) => a + b, 0)    / aiNums.length).toFixed(1)    : '—';
      const avgAdmin = adminNums.length ? (adminNums.reduce((a, b) => a + b, 0) / adminNums.length).toFixed(1) : '—';

      const safeMgr    = mgr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const archiveBtn = _viewArchive
        ? `<button class="btn-small" onclick="event.stopPropagation();Admin.restoreAllManagerSessions('${safeMgr}')">↩ Restore All</button>`
        : `<button class="btn-small" onclick="event.stopPropagation();Admin.archiveAllManagerSessions('${safeMgr}')">📁 Archive All</button>`;

      return `<tr style="cursor:pointer" onclick="Admin.drillIntoManager('${safeMgr}')">
        <td style="text-align:center" onclick="event.stopPropagation()">
          ${!isUnassigned ? `<input type="checkbox" class="manager-cb" data-mgr="${mgr.replace(/"/g,'&quot;')}" onchange="Admin.toggleManagerCheckbox('${safeMgr}', this.checked)" />` : ''}
        </td>
        <td><strong style="color:var(--primary)">${mgr}</strong></td>
        <td style="text-align:center">${agentsLabel}</td>
        <td style="text-align:center;font-weight:600">${mgrSessions.length}</td>
        <td style="text-align:right">${avgAI !== '—' ? avgAI + '/100' : '—'}</td>
        <td style="text-align:right;font-weight:600;color:${avgAdmin !== '—' ? '#1d4ed8' : 'var(--text-muted)'}">${avgAdmin !== '—' ? avgAdmin + '/100' : '—'}</td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn-small primary" onclick="event.stopPropagation();Admin.drillIntoManager('${safeMgr}')">View Sessions</button>
          ${!isUnassigned ? archiveBtn : ''}
        </td>
      </tr>`;
    };

    const rows = Object.entries(managerGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mgr, mgrSessions]) => makeRow(mgr, mgrSessions, false))
      .join('');

    const unassignedRow = unassigned.length ? makeRow('(No Manager Assigned)', unassigned, true) : '';

    tbody.innerHTML = rows + unassignedRow;
  }

  // ---- Drill into a specific manager's sessions ----
  function drillIntoManager(managerName) {
    _currentManagerDrill = managerName;
    const backBtn = $('btn-back-to-managers');
    if (backBtn) {
      backBtn.style.display = '';
      backBtn.querySelector('button').textContent = `← Back to Managers  (${managerName})`;
    }
    const mgrSel = $('filter-manager');
    if (mgrSel) mgrSel.value = managerName;
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
  }

  function backToManagers() {
    _currentManagerDrill = null;
    const backBtn = $('btn-back-to-managers');
    if (backBtn) backBtn.style.display = 'none';
    const mgrSel = $('filter-manager');
    if (mgrSel) mgrSel.value = '';
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);
  }

  // ---- Archive / Restore all sessions for a manager ----
  // Resolve which manager a session belongs to — same logic used by renderManagerSummaryTable
  function _resolveSessionManager(s) {
    const assigned = _teamAssignments[s.traineeId];
    return (assigned && _MANAGER_AGENT_MAP[assigned]) ? assigned : _getAgentManager(s.traineeName);
  }

  async function archiveAllManagerSessions(managerName) {
    const ids = _cachedSessions
      .filter(s => _resolveSessionManager(s) === managerName)
      .filter(s => !_archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No active sessions to archive for this manager.', ''); return; }
    if (!confirm(`Archive all ${ids.length} active session${ids.length !== 1 ? 's' : ''} for ${managerName}?\n\nYou can restore them at any time from the Archive tab.`)) return;
    try {
      await _setSessionsArchived(ids, true);
      toast(`Archived ${ids.length} session${ids.length !== 1 ? 's' : ''} for ${managerName}.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreAllManagerSessions(managerName) {
    const ids = _cachedSessions
      .filter(s => _resolveSessionManager(s) === managerName)
      .filter(s => _archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No archived sessions to restore for this manager.', ''); return; }
    if (!confirm(`Restore all ${ids.length} archived session${ids.length !== 1 ? 's' : ''} for ${managerName}?`)) return;
    try {
      await _setSessionsArchived(ids, false);
      toast(`Restored ${ids.length} session${ids.length !== 1 ? 's' : ''} for ${managerName}.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  // ---- Manager checkbox multi-select ----
  function toggleManagerCheckbox(mgrName, checked) {
    if (checked) _selectedManagerNames.add(mgrName);
    else         _selectedManagerNames.delete(mgrName);
    _updateManagerActionBtns();
    const allCb = $('select-all-managers');
    if (allCb) {
      const allCbs = document.querySelectorAll('.manager-cb');
      const n = _selectedManagerNames.size;
      allCb.indeterminate = n > 0 && n < allCbs.length;
      allCb.checked       = allCbs.length > 0 && n === allCbs.length;
    }
  }

  function toggleAllManagers(checked) {
    _selectedManagerNames.clear();
    document.querySelectorAll('.manager-cb').forEach(cb => {
      cb.checked = checked;
      if (checked) _selectedManagerNames.add(cb.dataset.mgr);
    });
    _updateManagerActionBtns();
  }

  function _updateManagerActionBtns() {
    const archBtn = $('btn-archive-selected-managers');
    const restBtn = $('btn-restore-selected-managers');
    if (!archBtn || !restBtn) return;
    const n = _selectedManagerNames.size;
    if (_viewArchive) {
      archBtn.style.display = 'none';
      restBtn.style.display = '';
      restBtn.disabled      = n === 0;
      restBtn.textContent   = n > 0 ? `↩ Restore Selected (${n})` : '↩ Restore Selected';
    } else {
      restBtn.style.display = 'none';
      archBtn.style.display = '';
      archBtn.disabled      = n === 0;
      archBtn.textContent   = n > 0 ? `📁 Archive Selected (${n})` : '📁 Archive Selected';
    }
  }

  async function archiveSelectedManagers() {
    const managers = [..._selectedManagerNames];
    if (!managers.length) return;
    const ids = _cachedSessions
      .filter(s => managers.includes(_resolveSessionManager(s)))
      .filter(s => !_archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No active sessions found for selected managers.', ''); return; }
    if (!confirm(`Archive all ${ids.length} active session${ids.length !== 1 ? 's' : ''} for ${managers.length} selected manager${managers.length !== 1 ? 's' : ''}?\n\nYou can restore them at any time from the Archive tab.`)) return;
    try {
      await _setSessionsArchived(ids, true);
      _selectedManagerNames.clear();
      toast(`Archived ${ids.length} session${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      toast('Archive failed: ' + e.message, 'error');
    }
  }

  async function restoreSelectedManagers() {
    const managers = [..._selectedManagerNames];
    if (!managers.length) return;
    const ids = _cachedSessions
      .filter(s => managers.includes(_resolveSessionManager(s)))
      .filter(s => _archivedIds.has(s.id))
      .map(s => s.id);
    if (!ids.length) { toast('No archived sessions found for selected managers.', ''); return; }
    if (!confirm(`Restore all ${ids.length} archived session${ids.length !== 1 ? 's' : ''} for ${managers.length} selected manager${managers.length !== 1 ? 's' : ''}?`)) return;
    try {
      await _setSessionsArchived(ids, false);
      _selectedManagerNames.clear();
      toast(`Restored ${ids.length} session${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  }

  function renderAssessmentsTable(sessions, topicMap) {
    const tbody = $('assessments-tbody');
    const sorted = [...sessions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    _currentFilteredSessions = sorted; // track for Download All
    _allRenderedSessions = sorted;     // track for select-all
    _selectedSessionIds.clear();
    _selectedManagerNames.clear();
    _updateSessionActionBtns();
    // hide manager-level bulk buttons when in session drill view
    const mgrArchBtn = $('btn-archive-selected-managers');
    const mgrRestBtn = $('btn-restore-selected-managers');
    if (mgrArchBtn) mgrArchBtn.style.display = 'none';
    if (mgrRestBtn) mgrRestBtn.style.display = 'none';

    // Reset select-all checkbox
    const allCb = $('select-all-sessions');
    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">${_viewArchive ? 'No archived assessments.' : 'No assessments found.'}</td></tr>`;
      return;
    }

    // ── Pick & Speak: pre-compute per-trainee.
    // Effective score per session = admin score if scored, else AI score.
    // avgOfAll  = average of effective scores across ALL that trainee's P&S sessions.
    // bestId    = session with the highest effective score (that row shows avgOfAll; rest → N/A).
    const PS_MODULES = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock']);
    const psGrouped  = {}; // traineeId → [{ id, eff }]
    sorted.forEach(s => {
      if (!PS_MODULES.has(s.module)) return;
      const adminNum = s.adminScores ? (calcAdminAvg(s.adminScores)          ?? null) : null;
      const aiNum    = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
      const eff      = adminNum !== null ? adminNum : aiNum; // prefer admin
      if (eff === null) return;
      if (!psGrouped[s.traineeId]) psGrouped[s.traineeId] = [];
      psGrouped[s.traineeId].push({ id: s.id, eff });
    });
    const psByTrainee = {}; // traineeId → { bestId, avgOfAll }
    Object.entries(psGrouped).forEach(([tid, list]) => {
      const best     = list.reduce((a, b) => b.eff > a.eff ? b : a);
      const avgOfAll = parseFloat((list.reduce((s, x) => s + x.eff, 0) / list.length).toFixed(1));
      psByTrainee[tid] = { bestId: best.id, avgOfAll };
    });

    tbody.innerHTML = sorted.map(s => {
      const aiScore    = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? '—') : '—';
      const adminScore = s.adminScores ? (calcAdminAvg(s.adminScores)          ?? '—') : '—';
      const isScored   = !!s.adminScores;

      // For P&S: best-session row shows average of all sessions' effective scores; others → N/A
      // For all other modules (mock call, grammar, listening): admin score is final;
      //   if no admin score, AI score is final. No averaging.
      let avgScore;
      if (PS_MODULES.has(s.module)) {
        const info = psByTrainee[s.traineeId];
        avgScore = (info && s.id === info.bestId) ? info.avgOfAll : 'N/A';
      } else {
        const aiNum    = aiScore    !== '—' ? parseFloat(aiScore)    : null;
        const adminNum = adminScore !== '—' ? parseFloat(adminScore) : null;
        avgScore = adminNum !== null ? adminNum : (aiNum !== null ? aiNum : '—');
      }
      const ext = (s.recordingUrl || '').includes('.mp4') ? 'mp4' : (s.recordingUrl || '').includes('.ogg') ? 'ogg' : 'webm';
      const dlFilename = `${(s.traineeName || 'recording').replace(/\s+/g, '_')}-${s.module}-${(s.submittedAt || '').slice(0, 10)}.${ext}`;
      const dlBtn = s.recordingUrl
        ? `<button class="btn-small" onclick="Admin.downloadRecording('${s.recordingUrl}', '${dlFilename}')">⬇ Recording</button>`
        : '';

      const archiveBtn = _viewArchive
        ? `<button class="btn-small" onclick="Admin.restoreSingleSession('${s.id}', '${(s.traineeName || '').replace(/'/g, "\\'")}')">↩ Restore</button>`
        : `<button class="btn-small" onclick="Admin.archiveSingleSession('${s.id}', '${(s.traineeName || '').replace(/'/g, "\\'")}')">📁 Archive</button>`;

      return `
        <tr class="${_archivedIds.has(s.id) ? 'session-archived' : ''}">
          <td style="width:36px;text-align:center">
            <input type="checkbox" class="session-cb" data-id="${s.id}"
              onchange="Admin.toggleSessionCheckbox('${s.id}', this.checked)" />
          </td>
          <td><strong>${s.traineeName || '—'}</strong></td>
          <td>${moduleBadge(s.module)}</td>
          <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.topicTitle || '—'}</td>
          <td style="white-space:nowrap">${formatDate(s.submittedAt).split(' ')[0]}</td>
          <td>${statusBadge(isScored ? 'scored' : s.status)}</td>
          <td>${aiScore    !== '—' ? aiScore    + '/100' : '—'}</td>
          <td>${adminScore !== '—' ? adminScore + '/100' : '—'}</td>
          <td style="font-weight:600;color:${avgScore === 'N/A' || avgScore === '—' ? 'var(--text-muted)' : '#1d4ed8'}">${avgScore !== '—' && avgScore !== 'N/A' ? avgScore + '/100' : avgScore}</td>
          <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
            <button class="btn-small primary" onclick="Admin.openScoring('${s.id}')">
              ${isScored ? 'Review' : 'Score'}
            </button>
            ${dlBtn}
            ${archiveBtn}
            <button class="btn-small danger" onclick="Admin.deleteSession('${s.id}', '${(s.traineeName || '').replace(/'/g, "\\'")}')">
              🗑 Delete
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  // ---- Delete Session ----
  async function deleteSession(sessionId, traineeName) {
    const confirmed = confirm(
      `Delete this assessment?\n\nTrainee: ${traineeName || 'Unknown'}\n\nThis will remove the session details (recording & transcript) but PRESERVE the score in the reports.`
    );
    if (!confirmed) return;

    let deleteFromReports = false;
    const confirmReports = confirm(
      `Do you also want to permanently delete this score from Reports and the Comm360 Master Sheet?\n\n(Warning: This requires separate admin confirmation)`
    );
    if (confirmReports) {
      const pin = prompt("Enter Admin Password to confirm deletion from reports:");
      const pwRec = await DB.get('settings', 'adminPassword');
      const correctPw = pwRec ? pwRec.value : 'admin123';
      if (pin === correctPw) {
        deleteFromReports = true;
      } else {
        alert("Invalid password. The score will be preserved in reports.");
      }
    }

    try {
      const session = await DB.get('sessions', sessionId);
      if (session) {
        await _preserveScoresBeforeDeletion([session], deleteFromReports);
      }
      await DB.del('sessions', sessionId);
      toast('Assessment deleted.', '');
      loadAssessments();
    } catch (e) {
      console.error('Delete failed:', e);
      toast('Failed to delete assessment.', 'error');
    }
  }

  async function forceReSeed() {
    const btn = document.getElementById('btn-force-seed');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Seeding Database...';
    }
    toast('Checking and re-seeding default topics...', 'info');
    try {
      await DB.forceReSeed();
      toast('Database defaults successfully re-seeded!', 'success');
      await seedManagerTopics();
    renderTopicsList();
    } catch (e) {
      console.error('Force seed failed:', e);
      alert('Failed to seed database: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Force Re-seed Defaults';
      }
    }
  }

  // ---- Public API (called from inline onclick) ----
  return {
    init,
    doLogin,
    forceReSeed,
    openTopicModal,
    deleteTopic,
    toggleTopicEnabled,
    toggleGrammarSet,
    enableAllTopics,
    disableAllTopics,
    openScoring,
    updateAdminScoreDisplay,
    updateCriterionDisplay,
    selectScale135,
    viewTraineeSessions,
    setTraineeTeam,
    toggleTraineeCheckbox,
    toggleAllTrainees,
    deleteSelectedTrainees,
    deleteAllTrainees,
    downloadCSV,
    downloadSmqWrongAnswersReport,
    downloadRecording,
    downloadAllRecordings,
    deleteSession,
    deleteAllSessions,
    deduplicateTraineeSessions,
    copyLetter,
    downloadTraineePPT,
    downloadMasterExcel,
    reScoreWrittenComm,
    resetWrittenScores,
    // Assessments archive / multi-select / manager view
    switchAssessmentView,
    toggleSessionCheckbox,
    toggleAllSessions,
    archiveSelectedSessions,
    restoreSelectedSessions,
    archiveSingleSession,
    restoreSingleSession,
    drillIntoManager,
    backToManagers,
    archiveAllManagerSessions,
    restoreAllManagerSessions,
    toggleManagerCheckbox,
    toggleAllManagers,
    archiveSelectedManagers,
    restoreSelectedManagers,
    // Bot script per-turn audio upload
    toggleBotTurnRec,      // kept as no-op stub for cached HTML compatibility
    uploadBotTurnAudio,
    clearBotTurnAudio,
    removeBotScriptRow,
    // AI Audit Scores (kept for backward compatibility)
    filterAiAudit,
    toggleAuditCheckbox,
    toggleAllAudit,
    editSelfScore,
    cancelSelfScoreEdit,
    saveSelfScore,
    editAuditScore,
    cancelAuditEdit,
    saveAuditScore,
    deleteSingleAuditScore,
    deleteSelectedAuditScores,
    deleteAllAuditScores,
    // Comm360 Master Report
    filterComm360,
    searchComm360,
    isComm360Deleted: () => _comm360ReportDeleted,
    deleteEntireComm360Report,
    restoreEntireComm360Report,
    // Manager Assessments
    loadMgrAssessments,
    renderMgrAssessments,
    openMgrScoreModal,
    saveMgrScore,
    seedStockMarketMcq,
    downloadSmqWrongAnswersReport,
    deduplicateTraineeSessions,
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Admin.init());
} else {
  Admin.init();
}
