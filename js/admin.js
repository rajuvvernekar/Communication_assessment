'use strict';

// ── Master score lookup — Source: "Master total (1).xlsx" ──
// Col Q (Self Assessment Score) + Col R (AI Audit Score) + Col W (Grand Total, all components)
// Grand Total (W) = Self Assess + AI Audit + P&S + Listening + Mock Call + Grammar (all weighted)
// totalScore is used directly as the report total; selfAssessment+aiAudit kept for reference.
// Matched case-insensitively by trainee name. Returns null if not found.
const MASTER_SCORES = {
  "abdul razak":                     { selfAssessment: 9.243,  aiAudit: 3.945,  totalScore: 57.65 },
  "love preet singh":                { selfAssessment: 7.892,  aiAudit: 3.705,  totalScore: 43.97 },
  "mohit sharma":                    { selfAssessment: 8.324,  aiAudit: 4.005,  totalScore: 56.01 },
  "avinash bhagwanrao pawde":        { selfAssessment: 6.541,  aiAudit: 3.665,  totalScore: 56.94 },
  "vijay kumar n":                   { selfAssessment: 7.459,  aiAudit: 3.765,  totalScore: 54.16 },
  "k g saroj":                       { selfAssessment: 6.541,  aiAudit: 3.825,  totalScore: 63.23 },
  "ayachi mishra":                   { selfAssessment: 8.703,  aiAudit: 3.885,  totalScore: 64.11 },
  "naveenkumar ayyangoudar":         { selfAssessment: 7.459,  aiAudit: 3.945,  totalScore: 55.03 },
  "indranil bose":                   { selfAssessment: 8.649,  aiAudit: 3.965,  totalScore: 67.00 },
  "seema k s":                       { selfAssessment: 9.351,  aiAudit: 4.020,  totalScore: 55.58 },
  "d karthik":                       { selfAssessment: 9.405,  aiAudit: 3.810,  totalScore: 63.94 },
  "anupama h":                       { selfAssessment: 9.514,  aiAudit: 4.005,  totalScore: 66.76 },
  "stavan bhardwaj":                 { selfAssessment: 9.189,  aiAudit: 4.140,  totalScore: 72.49 },
  "n s sindhu":                      { selfAssessment: 8.865,  aiAudit: 3.855,  totalScore: 57.40 },
  "shefali tyagi":                   { selfAssessment: 18.500, aiAudit: 3.725,  totalScore: 71.52 },
  "saneeth t s":                     { selfAssessment: 0.000,  aiAudit: 0.000,  totalScore: 48.31 },
  "akash kumar singh":               { selfAssessment: 16.000, aiAudit: 3.905,  totalScore: 62.92 },
  "nikhil v durgude":                { selfAssessment: 9.459,  aiAudit: 3.920,  totalScore: 55.01 },
  "swetha a":                        { selfAssessment: 9.946,  aiAudit: 3.715,  totalScore: 53.33 },
  "shruthi k b":                     { selfAssessment: 9.297,  aiAudit: 3.975,  totalScore: 41.39 },
  "sachita g harihar":               { selfAssessment: 9.676,  aiAudit: 3.770,  totalScore: 60.14 },
  "adnan sahil s":                   { selfAssessment: 9.568,  aiAudit: 4.100,  totalScore: 68.91 },
  "mohammed jabeer khan":            { selfAssessment: 9.784,  aiAudit: 3.930,  totalScore: 57.13 },
  "heeral sonagare":                 { selfAssessment: 7.568,  aiAudit: 3.720,  totalScore: 59.65 },
  "aryaman m math":                  { selfAssessment: 7.027,  aiAudit: 3.605,  totalScore: 64.29 },
  "srusti vishnukant ladda":         { selfAssessment: 9.730,  aiAudit: 3.910,  totalScore: 66.22 },
  "m keshava naik":                  { selfAssessment: 9.189,  aiAudit: 3.845,  totalScore: 54.84 },
  "shankar kumar":                   { selfAssessment: 8.054,  aiAudit: 3.705,  totalScore: 51.77 },
  "alihussain basha hyatkhan":       { selfAssessment: 7.622,  aiAudit: 3.925,  totalScore: 54.40 },
  "suma manjunath tumbraguddi":      { selfAssessment: 9.081,  aiAudit: 3.965,  totalScore: 51.57 },
  "abhishek tenginkai":              { selfAssessment: 8.000,  aiAudit: 3.580,  totalScore: 56.44 },
  "ambaldhage vinay kumar":          { selfAssessment: 7.351,  aiAudit: 4.080,  totalScore: 56.25 },
  "lilesh bhaskar sapaliga":         { selfAssessment: 9.514,  aiAudit: 3.795,  totalScore: 68.03 },
  "anand jaiswal":                   { selfAssessment: 8.432,  aiAudit: 3.765,  totalScore: 52.81 }
};

// Look up master scores by trainee name (case-insensitive, trimmed).
// Also tries stripping all internal whitespace so "KG Saroj" → "kgsaroj" matches "k g saroj" → "kgsaroj".
// Returns null if not found.
function getMasterScores(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (MASTER_SCORES[key]) return MASTER_SCORES[key];
  // Collapse all whitespace and try again (handles "KG Saroj" vs "K G Saroj")
  const compact = key.replace(/\s+/g, '');
  return Object.entries(MASTER_SCORES).find(([k]) => k.replace(/\s+/g, '') === compact)?.[1] || null;
}

window.Admin = (() => {
  // ---- State ----
  let _editTopicId = null; // null = new, number = edit existing
  let _callerAudioBlob = null;
  let _callerRecording = false;
  let _scoringSessionId = null;
  let _topicsFilter = 'all';
  let _assessmentsFilter = { module: 'all', status: 'all', team: 'all' };
  let _currentFilteredSessions = [];
  let _teamAssignments = {};   // { traineeId: 'Team Name' }
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

  // Convert legacy overall scores stored as raw /5 to /100
  function normalizeOverall(overall) {
    if (typeof overall !== 'number') return overall;
    return overall <= 5 ? parseFloat(((overall / 5) * 100).toFixed(1)) : overall;
  }

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
    'listening-assessment': 'Listening Assessment'
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
    'listening-assessment': 'badge-la'
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
      { label: 'Clarity', key: 'criterion_0' },
      { label: 'Structure', key: 'criterion_1' },
      { label: 'Grammar', key: 'criterion_2' },
      { label: 'Tone', key: 'criterion_3' },
      { label: 'Professionalism', key: 'criterion_4' }
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

  function initAuth() {
    const savedAuth = sessionStorage.getItem('adminAuth');
    if (savedAuth === 'true') {
      $('admin-auth-modal').classList.add('hidden');
      $('admin-app').classList.remove('hidden');
      showAdminName();
      initApp();
      return;
    }

    const usernameInput = $('admin-username-input');
    const pwdInput = $('admin-pwd-input');
    const btn = $('btn-admin-login');
    const errEl = $('admin-pwd-error');

    const doLogin = async () => {
      const username = (usernameInput.value || '').trim().toLowerCase();
      const password = pwdInput.value;
      if (!username || !password) {
        errEl.textContent = 'Please enter your username and password.';
        errEl.classList.remove('hidden'); return;
      }
      btn.disabled = true; btn.textContent = 'Signing in…';
      errEl.classList.add('hidden');

      try {
        // Load admin users from Supabase settings
        const stored = await DB.get('settings', 'adminUsers');
        let users = [];
        try { users = JSON.parse(stored?.value || stored || '[]'); } catch (_) {}

        const match = users.find(u =>
          u.username.toLowerCase() === username && u.password === password
        );

        if (match) {
          sessionStorage.setItem('adminAuth', 'true');
          sessionStorage.setItem('adminName', match.username);
          $('admin-auth-modal').classList.add('hidden');
          $('admin-app').classList.remove('hidden');
          showAdminName();
          initApp();
        } else {
          errEl.textContent = 'Incorrect username or password.';
          errEl.classList.remove('hidden');
          pwdInput.value = '';
          pwdInput.focus();
        }
      } catch (e) {
        errEl.textContent = 'Login failed. Please try again.';
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false; btn.textContent = 'Sign In →';
      }
    };

    usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    pwdInput.addEventListener('keydown',      (e) => { if (e.key === 'Enter') doLogin(); });
    btn.addEventListener('click', doLogin);
  }

  // ---- App Init ----
  async function initApp() {
    bindSidebarNav();
    await loadDashboard();
    await updatePendingBadge();
  }

  function bindSidebarNav() {
    document.querySelectorAll('.nav-item[data-section]').forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const sec = link.dataset.section;
        showSection(sec);
        if (sec === 'dashboard') await loadDashboard();
        else if (sec === 'trainees') await loadTrainees();
        else if (sec === 'topics') await loadTopics();
        else if (sec === 'assessments') await loadAssessments();
        else if (sec === 'reports') await loadReportsDropdown();
        else if (sec === 'ai-audit') await loadAiAuditScores();
        else if (sec === 'settings') initSettings();
      });
    });
  }

  // ---- Dashboard ----
  async function loadDashboard() {
    const [trainees, sessions] = await Promise.all([DB.getAll('trainees'), DB.getAll('sessions')]);

    $('stat-trainees').textContent = trainees.length;
    $('stat-sessions').textContent = sessions.length;

    const pending = sessions.filter(s => s.status === 'pending' || s.status === 'ai-evaluated').length;
    $('stat-pending').textContent = pending;
    await updatePendingBadge();

    const scored = sessions.filter(s => s.adminScores);
    const avgScore = scored.length
      ? (scored.map(s => calcAdminAvg(s.adminScores)).filter(x => x !== null)
          .reduce((a, b) => a + b, 0) / scored.length).toFixed(1)
      : '—';
    $('stat-avg-score').textContent = avgScore;

    // Module breakdown
    const breakdown = $('module-breakdown');
    const counts = {};
    sessions.forEach(s => { counts[s.module] = (counts[s.module] || 0) + 1; });
    const maxCount = Math.max(...Object.values(counts), 1);

    if (Object.keys(counts).length === 0) {
      breakdown.innerHTML = '<div class="empty-state" style="padding:1rem">No sessions yet.</div>';
    } else {
      breakdown.innerHTML = Object.entries(counts).map(([mod, cnt]) => `
        <div class="module-bar-row">
          <span class="module-bar-label">${MODULE_LABELS[mod] || mod}</span>
          <div class="module-bar-track">
            <div class="module-bar-fill" style="width:${(cnt/maxCount*100).toFixed(0)}%;background:${MODULE_COLORS[mod]}"></div>
          </div>
          <span class="module-bar-count">${cnt}</span>
        </div>`).join('');
    }

    // Recent activity
    const recent = [...sessions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 8);
    const activityEl = $('recent-activity');
    if (recent.length === 0) {
      activityEl.innerHTML = '<div class="empty-state" style="padding:1rem">No recent activity.</div>';
    } else {
      activityEl.innerHTML = recent.map(s => `
        <div class="activity-item">
          <div class="activity-dot" style="background:${MODULE_COLORS[s.module]}"></div>
          <div class="activity-text">
            <strong>${s.traineeName}</strong> completed <em>${MODULE_LABELS[s.module]}</em>
            ${s.adminScores ? `— scored ${calcAdminAvg(s.adminScores)}/100` : ''}
          </div>
          <span class="activity-time">${formatDate(s.submittedAt).split(' ')[0]}</span>
        </div>`).join('');
    }
  }

  async function updatePendingBadge() {
    const sessions = await DB.getAll('sessions');
    const pending = sessions.filter(s => s.status === 'pending' || s.status === 'ai-evaluated').length;
    const badge = $('pending-badge');
    badge.textContent = pending > 0 ? pending : '';
  }

  // ---- Trainees ----
  // ---- Team Assignments (stored in settings table) ----
  async function loadTeamAssignments() {
    try {
      const s = await DB.get('settings', 'team_assignments');
      _teamAssignments = (s && s.value) ? JSON.parse(s.value) : {};
    } catch (_) { _teamAssignments = {}; }
  }

  async function saveTeamAssignments() {
    try {
      await DB.put('settings', { key: 'team_assignments', value: JSON.stringify(_teamAssignments) });
    } catch (e) { toast('Could not save team: ' + e.message, 'error'); }
  }

  async function setTraineeTeam(traineeId, teamName) {
    const name = teamName.trim();
    if (name) {
      _teamAssignments[traineeId] = name;
    } else {
      delete _teamAssignments[traineeId];
    }
    await saveTeamAssignments();
    populateTeamFilter();   // keep assessments dropdown in sync
    toast(name ? `Assigned to "${name}"` : 'Team removed', 'success');
  }

  function populateTeamFilter() {
    const sel = $('filter-team');
    if (!sel) return;
    const teams = [...new Set(Object.values(_teamAssignments))].sort();
    const current = sel.value;
    sel.innerHTML = '<option value="all">All Teams</option>' +
      teams.map(t => `<option value="${t}"${t === current ? ' selected' : ''}>${t}</option>`).join('');
  }

  async function loadTrainees() {
    await loadTeamAssignments();
    const [trainees, sessions] = await Promise.all([DB.getAll('trainees'), DB.getAll('sessions')]);
    renderTraineesTable(trainees, sessions, '');
    $('trainee-search').oninput = (e) => renderTraineesTable(trainees, sessions, e.target.value);
  }

  function renderTraineesTable(trainees, sessions, filter) {
    const tbody = $('trainees-tbody');
    const filtered = trainees.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));
    const allTeams = [...new Set(Object.values(_teamAssignments))].sort();

    // Reset selection state whenever the table re-renders
    _selectedTraineeIds.clear();
    _allFilteredTrainees = filtered;
    _updateTraineeDeleteBtn();

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No trainees found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const ts = sessions.filter(s => s.traineeId === t.id);
      const scored = ts.filter(s => s.adminScores);
      const avg = scored.length
        ? (scored.map(s => calcAdminAvg(s.adminScores)).filter(x => x !== null)
            .reduce((a, b) => a + b, 0) / scored.length).toFixed(1)
        : '—';
      const lastActive = ts.length
        ? formatDate([...ts].sort((a,b) => new Date(b.submittedAt)-new Date(a.submittedAt))[0].submittedAt).split(' ')[0]
        : '—';
      const currentTeam = _teamAssignments[t.id] || '';
      const datalistId  = `tdl-${t.id.replace(/-/g,'')}`;

      return `
        <tr>
          <td style="width:36px;text-align:center">
            <input type="checkbox" class="trainee-cb" data-id="${t.id}"
              onchange="Admin.toggleTraineeCheckbox('${t.id}', this.checked)" />
          </td>
          <td><strong>${t.name}</strong><br><small style="color:var(--text-muted)">${t.employee_id || ''}</small></td>
          <td>${ts.length}</td>
          <td>${lastActive}</td>
          <td>${avg !== '—' ? avg + ' / 5' : '—'}</td>
          <td>
            <datalist id="${datalistId}">
              ${allTeams.map(tm => `<option value="${tm}">`).join('')}
            </datalist>
            <input
              type="text"
              list="${datalistId}"
              value="${currentTeam.replace(/"/g, '&quot;')}"
              placeholder="Assign team…"
              style="border:1px solid var(--border);border-radius:6px;padding:0.3rem 0.6rem;font-size:0.82rem;width:140px;font-family:inherit"
              onblur="Admin.setTraineeTeam('${t.id}', this.value)"
              onkeydown="if(event.key==='Enter'){this.blur()}"
            />
          </td>
          <td>
            <button class="btn-small" onclick="Admin.viewTraineeSessions('${t.id}')">View Sessions</button>
          </td>
        </tr>`;
    }).join('');
  }

  // ---- Trainee selection helpers ----
  function _updateTraineeDeleteBtn() {
    const btn = $('btn-delete-selected-trainees');
    if (!btn) return;
    const n = _selectedTraineeIds.size;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `🗑 Delete Selected (${n})` : '🗑 Delete Selected';
  }

  function toggleTraineeCheckbox(id, checked) {
    if (checked) {
      _selectedTraineeIds.add(id);
    } else {
      _selectedTraineeIds.delete(id);
    }
    _updateTraineeDeleteBtn();
    // Sync select-all checkbox
    const allCb = $('select-all-trainees');
    if (allCb && _allFilteredTrainees.length > 0) {
      const n = _selectedTraineeIds.size;
      allCb.indeterminate = n > 0 && n < _allFilteredTrainees.length;
      allCb.checked = n === _allFilteredTrainees.length;
    }
  }

  function toggleAllTrainees(checked) {
    _selectedTraineeIds.clear();
    if (checked) _allFilteredTrainees.forEach(t => _selectedTraineeIds.add(t.id));
    document.querySelectorAll('.trainee-cb').forEach(cb => { cb.checked = checked; });
    _updateTraineeDeleteBtn();
  }

  // ---- Internal: delete trainees + their sessions ----
  async function _doDeleteTrainees(ids) {
    const allSessions = await DB.getAll('sessions');
    const sessionIds = allSessions.filter(s => ids.includes(s.traineeId)).map(s => s.id);

    // Cascade delete sessions then trainees
    await Promise.all(sessionIds.map(sid => DB.del('sessions', sid)));
    await Promise.all(ids.map(id => DB.del('trainees', id)));

    _selectedTraineeIds.clear();
    _updateTraineeDeleteBtn();
    toast(`Deleted ${ids.length} trainee${ids.length !== 1 ? 's' : ''} and ${sessionIds.length} session${sessionIds.length !== 1 ? 's' : ''}.`, 'success');
    await updatePendingBadge();
    await loadTrainees();
  }

  async function deleteSelectedTrainees() {
    const ids = [..._selectedTraineeIds];
    if (ids.length === 0) return;
    const confirmed = confirm(
      `⚠️ Delete ${ids.length} selected trainee${ids.length !== 1 ? 's' : ''}?\n\nThis will also permanently delete ALL their assessments, scores, and recordings.\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;
    await _doDeleteTrainees(ids);
  }

  async function deleteAllTrainees() {
    const all = await DB.getAll('trainees');
    if (!all.length) { toast('No trainees to delete.', ''); return; }
    const step1 = confirm(
      `⚠️ Delete ALL ${all.length} trainees?\n\nThis will permanently delete every trainee and ALL their assessments, scores, and recordings.\n\nThis action cannot be undone.`
    );
    if (!step1) return;
    const step2 = confirm(
      `Are you absolutely sure?\n\nAll ${all.length} trainees and their data will be deleted permanently.`
    );
    if (!step2) return;
    await _doDeleteTrainees(all.map(t => t.id));
  }

  async function viewTraineeSessions(traineeId) {
    showSection('assessments');
    // Switch to assessments tab and filter by trainee
    await loadAssessments(traineeId);
  }

  // ---- Topics ----
  async function loadTopics() {
    initTopicModal();
    renderTopicsList();

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _topicsFilter = btn.dataset.module;
        renderTopicsList();
      };
    });

    $('btn-new-topic').onclick = () => openTopicModal(null);
  }

  // Extract the set name from a grammar topic title, e.g.
  // "Grammar Set 3 — Section A: MCQ (40 Questions)" → "Grammar Set 3"
  function extractGrammarSetName(title) {
    const m = title.match(/^(.+?)\s+[—–-]+\s+Section/i);
    return m ? m[1].trim() : title;
  }

  async function renderTopicsList() {
    const topics = await DB.getAll('topics');
    const filtered = topics.filter(t => matchesModuleFilter(t.module, _topicsFilter));
    const container = $('topics-list');

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:2rem">No topics found. Create one with + New Topic.</div>';
      return;
    }

    // Split grouped-module topics from the rest
    const grammarTopics   = filtered.filter(t => t.module === 'grammar-assessment');
    const listeningTopics = filtered.filter(t => t.module === 'listening-assessment');
    const otherTopics     = filtered.filter(t => t.module !== 'grammar-assessment' && t.module !== 'listening-assessment');

    // Group grammar topics by set name
    const grammarSets = {};
    grammarTopics.forEach(t => {
      const setName = extractGrammarSetName(t.title);
      if (!grammarSets[setName]) grammarSets[setName] = [];
      grammarSets[setName].push(t);
    });

    // Group listening topics by set name (same title pattern)
    const listeningSets = {};
    listeningTopics.forEach(t => {
      const setName = extractGrammarSetName(t.title); // regex works for listening too
      if (!listeningSets[setName]) listeningSets[setName] = [];
      listeningSets[setName].push(t);
    });

    // Render non-grammar topics as individual cards
    const otherHtml = otherTopics.map(t => {
      const isEnabled = t.enabled !== false;
      return `
      <div class="topic-card ${getModuleShort(t.module)}${isEnabled ? '' : ' topic-disabled'}">
        <div class="topic-card-header">
          <div style="min-width:0">
            ${moduleBadge(t.module)}
            <h4 style="margin-top:0.35rem">${t.title}</h4>
          </div>
          <button class="topic-toggle-btn${isEnabled ? ' on' : ''}"
                  onclick="Admin.toggleTopicEnabled('${t.id}')"
                  title="${isEnabled ? 'Click to disable' : 'Click to enable'}">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label">${isEnabled ? 'Live' : 'Off'}</span>
          </button>
        </div>
        <p>${t.description || ''}</p>
        ${t.checklist && t.checklist.length ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">${t.checklist.length} evaluation criteria</div>` : ''}
        <div class="topic-card-actions">
          <button class="btn-small primary" onclick="Admin.openTopicModal('${t.id}')">Edit</button>
          <button class="btn-small danger" onclick="Admin.deleteTopic('${t.id}')">Delete</button>
        </div>
      </div>`;
    }).join('');

    // Render each grammar set as a single grouped card
    const grammarHtml = Object.entries(grammarSets).map(([setName, sections]) => {
      // Sort sections alphabetically (Section A, B, C)
      sections.sort((a, b) => a.title.localeCompare(b.title));
      const totalQ    = sections.reduce((s, t) => s + (t.checklist?.length || 0), 0);
      const allLive   = sections.every(t => t.enabled !== false);
      const anyLive   = sections.some(t => t.enabled !== false);
      const liveState = allLive ? 'on' : (anyLive ? 'partial' : '');

      const sectionRows = sections.map((t, i) => {
        const secLabel  = t.title.match(/Section\s+\w+[^)—]*/i)?.[0] || `Section ${i + 1}`;
        const qCount    = t.checklist?.length || 0;
        const isEnabled = t.enabled !== false;
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-top:1px solid var(--border)">
            <div style="min-width:0">
              <span style="font-size:0.82rem;font-weight:600;color:var(--text)">${secLabel}</span>
              <span style="font-size:0.75rem;color:var(--text-muted);margin-left:0.5rem">${qCount} question${qCount !== 1 ? 's' : ''}</span>
            </div>
            <div style="display:flex;gap:0.4rem;flex-shrink:0;align-items:center">
              <button class="topic-toggle-btn${isEnabled ? ' on' : ''}"
                      onclick="Admin.toggleTopicEnabled('${t.id}')"
                      title="${isEnabled ? 'Click to disable this section' : 'Click to enable this section'}"
                      style="transform:scale(0.82);transform-origin:right center">
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">${isEnabled ? 'Live' : 'Off'}</span>
              </button>
              <button class="btn-small primary" onclick="Admin.openTopicModal('${t.id}')">Edit</button>
              <button class="btn-small danger"  onclick="Admin.deleteTopic('${t.id}')">Delete</button>
            </div>
          </div>`;
      }).join('');

      // Build comma-separated section IDs for the set-level toggle
      const setIds = sections.map(s => s.id).join("','");

      return `
      <div class="topic-card ga${allLive ? '' : ' topic-disabled'}" style="grid-column:span 1">
        <div class="topic-card-header">
          <div style="min-width:0">
            ${moduleBadge('grammar-assessment')}
            <h4 style="margin-top:0.35rem">${setName}</h4>
          </div>
          <button class="topic-toggle-btn${allLive ? ' on' : ''}"
                  onclick="Admin.toggleGrammarSet(['${setIds}'])"
                  title="${allLive ? 'Disable entire set' : 'Enable entire set'}">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label">${allLive ? 'Live' : anyLive ? 'Part' : 'Off'}</span>
          </button>
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">
          ${sections.length} sections · ${totalQ} questions total · All MCQ
        </div>
        ${sectionRows}
      </div>`;
    }).join('');

    // Render each listening set as a single grouped card (same pattern as grammar)
    const LA_MARKS_LABEL = ['2 marks each', '5 marks each', '3 marks each'];
    const listeningHtml = Object.entries(listeningSets).map(([setName, sections]) => {
      sections.sort((a, b) => a.title.localeCompare(b.title));
      const totalQ  = sections.reduce((s, t) => s + (t.checklist?.length || 0), 0);
      const allLive = sections.every(t => t.enabled !== false);
      const anyLive = sections.some(t => t.enabled !== false);
      const setIds  = sections.map(s => s.id).join("','");

      const sectionRows = sections.map((t, i) => {
        const typeMatch  = t.title.match(/Section\s+\d+:\s*(\w+)/i);
        const secLabel   = typeMatch ? `Section ${i + 1}: ${typeMatch[1]}` : `Section ${i + 1}`;
        const qCount     = t.checklist?.length || 0;
        const isEnabled  = t.enabled !== false;
        const marksNote  = LA_MARKS_LABEL[i] || '';
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-top:1px solid var(--border)">
            <div style="min-width:0">
              <span style="font-size:0.82rem;font-weight:600;color:var(--text)">${secLabel}</span>
              <span style="font-size:0.75rem;color:var(--text-muted);margin-left:0.5rem">${qCount} Qs · ${marksNote}</span>
            </div>
            <div style="display:flex;gap:0.4rem;flex-shrink:0;align-items:center">
              <button class="topic-toggle-btn${isEnabled ? ' on' : ''}"
                      onclick="Admin.toggleTopicEnabled('${t.id}')"
                      style="transform:scale(0.82);transform-origin:right center">
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">${isEnabled ? 'Live' : 'Off'}</span>
              </button>
              <button class="btn-small primary" onclick="Admin.openTopicModal('${t.id}')">Edit</button>
              <button class="btn-small danger"  onclick="Admin.deleteTopic('${t.id}')">Delete</button>
            </div>
          </div>`;
      }).join('');

      return `
      <div class="topic-card la${allLive ? '' : ' topic-disabled'}" style="grid-column:span 1">
        <div class="topic-card-header">
          <div style="min-width:0">
            ${moduleBadge('listening-assessment')}
            <h4 style="margin-top:0.35rem">${setName}</h4>
          </div>
          <button class="topic-toggle-btn${allLive ? ' on' : ''}"
                  onclick="Admin.toggleGrammarSet(['${setIds}'])"
                  title="${allLive ? 'Disable entire set' : 'Enable entire set'}">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label">${allLive ? 'Live' : anyLive ? 'Part' : 'Off'}</span>
          </button>
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">
          ${sections.length} sections · ${totalQ} questions total · All MCQ · 100 marks
        </div>
        ${sectionRows}
      </div>`;
    }).join('');

    container.innerHTML = otherHtml + grammarHtml + listeningHtml;
  }

  function getModuleShort(module) {
    const map = { 'pick-speak': 'ps', 'pick-speak-general': 'ps', 'pick-speak-stock': 'ps', 'mock-call': 'mc', 'role-play': 'rp', 'group-discussion': 'gd', 'written-comm': 'wc', 'grammar-assessment': 'ga', 'listening-assessment': 'la' };
    return map[module] || '';
  }

  async function toggleTopicEnabled(topicId) {
    try {
      const topic = await DB.get('topics', topicId);
      if (!topic) return;
      const nowEnabled = topic.enabled === false; // flip: false→true, undefined/true→false
      // Use a targeted PATCH via Supabase client (avoids re-uploading blobs)
      const { error } = await DB.getClient()
        .from('topics')
        .update({ enabled: nowEnabled })
        .eq('id', topicId);
      if (error) throw error;
      toast(nowEnabled ? '✅ Topic enabled — visible to users.' : '⏸ Topic disabled — hidden from users.', '');
      renderTopicsList();
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('enabled')) {
        toast('⚠ Missing DB column. Run supabase-add-enabled-column.sql in your Supabase SQL Editor first.', 'error');
      } else {
        toast('Failed: ' + e.message, 'error');
      }
    }
  }

  // Toggle ALL sections of a grammar set on or off together
  async function toggleGrammarSet(ids) {
    try {
      // Determine new state: if the first section is currently disabled, enable all; else disable all
      const first = await DB.get('topics', ids[0]);
      if (!first) return;
      const nowEnabled = first.enabled === false; // flip
      for (const id of ids) {
        const { error } = await DB.getClient()
          .from('topics')
          .update({ enabled: nowEnabled })
          .eq('id', id);
        if (error) throw error;
      }
      toast(nowEnabled ? '✅ Grammar set enabled — visible to trainees.' : '⏸ Grammar set disabled — hidden from trainees.', '');
      renderTopicsList();
    } catch (e) {
      toast('Failed: ' + e.message, 'error');
    }
  }

  // Fetch-based download (bypasses cross-origin download restriction)
  async function downloadRecording(url, filename) {
    try {
      toast('Preparing download…', '');
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast('Download failed: ' + e.message, 'error');
    }
  }

  async function downloadAllRecordings() {
    const sessions = _currentFilteredSessions.filter(s => s.recordingUrl);
    if (!sessions.length) {
      toast('No recordings available in the current view.', 'error');
      return;
    }
    if (typeof JSZip === 'undefined') {
      toast('JSZip not loaded — cannot create zip.', 'error');
      return;
    }
    toast(`Packaging ${sessions.length} recording(s)… please wait.`, '');
    try {
      const zip = new JSZip();
      await Promise.all(sessions.map(async s => {
        const resp = await fetch(s.recordingUrl);
        if (!resp.ok) return; // skip failed fetches silently
        const blob = await resp.blob();
        const ext = s.recordingUrl.includes('.webm') ? 'webm' : s.recordingUrl.includes('.mp4') ? 'mp4' : 'ogg';
        const fname = `${(s.traineeName || 'unknown').replace(/\s+/g, '_')}-${s.module}-${(s.submittedAt || '').slice(0, 10)}.${ext}`;
        zip.file(fname, blob);
      }));
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = `commassess-recordings-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Recordings downloaded!', 'success');
    } catch (e) {
      toast('Download failed: ' + e.message, 'error');
    }
  }

  // Returns true if a topic/session module matches the active filter
  function matchesModuleFilter(recordModule, filter) {
    if (filter === 'all') return true;
    // Assessments filter dropdown: 'pick-speak' = show all P&S sub-types together
    if (filter === 'pick-speak') return recordModule === 'pick-speak' || recordModule === 'pick-speak-general' || recordModule === 'pick-speak-stock';
    // Topics tab: split view
    if (filter === 'pick-speak-stock') return recordModule === 'pick-speak-stock';
    if (filter === 'pick-speak-general') return recordModule === 'pick-speak-general' || recordModule === 'pick-speak';
    if (filter === 'grammar-assessment') return recordModule === 'grammar-assessment';
    return recordModule === filter;
  }

  async function openTopicModal(topicId) {
    _editTopicId = topicId;
    _callerAudioBlob = null;
    const modal = $('topic-modal');
    modal.classList.remove('hidden');

    if (topicId) {
      const topic = await DB.get('topics', topicId);
      $('topic-modal-title').textContent = 'Edit Topic';
      $('topic-module').value = topic.module;
      $('topic-title').value = topic.title || '';
      $('topic-description').value = topic.description || '';
      $('topic-scenario').value = topic.scenario || '';
      _callerAudioBlob = topic.callerAudioBlob || null;

      if (topic.module === 'grammar-assessment' || topic.module === 'listening-assessment') {
        // checklist holds question objects for grammar/listening-assessment
        const questions = (topic.checklist || []).filter(q => q && typeof q === 'object' && q.stem);
        renderMcqQuestions(questions);
        renderChecklistItems([]);
      } else {
        renderChecklistItems(topic.checklist || []);
      }
      renderBotScriptItems(topic.botScript || []);

      // Support both Storage URL (new) and legacy Blob
      const callerUrl = topic.callerAudioUrl
        || (_callerAudioBlob ? URL.createObjectURL(_callerAudioBlob) : null);
      if (callerUrl) {
        $('caller-preview-audio').src = callerUrl;
        $('caller-preview-audio').classList.remove('hidden');
        $('btn-clear-caller-audio').classList.remove('hidden');
      }
    } else {
      $('topic-modal-title').textContent = 'New Topic';
      $('topic-module').value = 'pick-speak-general';
      $('topic-title').value = '';
      $('topic-description').value = '';
      $('topic-scenario').value = '';
      $('caller-preview-audio').classList.add('hidden');
      $('btn-clear-caller-audio').classList.add('hidden');
      renderChecklistItems([]);
      renderBotScriptItems([]);
      $('mcq-questions-list').innerHTML = '';
    }

    toggleMockCallFields($('topic-module').value);
    $('topic-module').onchange = (e) => toggleMockCallFields(e.target.value);
  }

  function toggleMockCallFields(module) {
    const isMC  = module === 'mock-call';
    const isMCQ = module === 'grammar-assessment' || module === 'listening-assessment';
    $('topic-caller-audio-group').style.display = isMC ? '' : 'none';
    $('topic-bot-script-group').style.display    = isMC ? '' : 'none';
    $('topic-mcq-group').style.display           = isMCQ ? '' : 'none';
    // For MCQ modules, hide scenario & checklist (replaced by MCQ editor)
    const scenarioGroup   = $('topic-scenario').closest('.form-group');
    const checklistGroup  = $('topic-checklist-group');
    if (scenarioGroup)  scenarioGroup.style.display  = isMCQ ? 'none' : '';
    if (checklistGroup) checklistGroup.style.display = isMCQ ? 'none' : '';
    // If switching to an MCQ module, add one blank question to get started
    if (isMCQ && $('mcq-questions-list') && $('mcq-questions-list').children.length === 0) {
      addMcqQuestion();
    }
  }

  function renderBotScriptItems(lines = []) {
    const container = $('bot-script-items');
    container.innerHTML = lines.map(line => {
      const safe = line.replace(/"/g, '&quot;');
      return `<div class="checklist-item-row">
        <input type="text" placeholder="e.g. I've been charged twice this month!" value="${safe}">
        <button class="btn-remove-item" title="Remove" onclick="this.parentElement.remove()">✕</button>
      </div>`;
    }).join('');
    $('btn-add-bot-line').onclick = () => {
      $('bot-script-items').insertAdjacentHTML('beforeend', `
        <div class="checklist-item-row">
          <input type="text" placeholder="Customer line...">
          <button class="btn-remove-item" title="Remove" onclick="this.parentElement.remove()">✕</button>
        </div>`);
    };
  }

  function renderChecklistItems(items) {
    const container = $('checklist-items');
    container.innerHTML = '';
    items.forEach(item => addChecklistItem(item));
  }

  function addChecklistItem(value = '') {
    const container = $('checklist-items');
    const row = document.createElement('div');
    row.className = 'checklist-item-row';
    row.innerHTML = `
      <input type="text" placeholder="e.g. Greet professionally" value="${value.replace(/"/g, '&quot;')}">
      <button class="btn-remove-item" title="Remove">✕</button>`;
    row.querySelector('.btn-remove-item').onclick = () => row.remove();
    container.appendChild(row);
  }

  // ── MCQ Question Editor (Grammar Assessment) ──

  function renderMcqQuestions(questions = []) {
    const container = $('mcq-questions-list');
    container.innerHTML = '';
    if (questions.length === 0) {
      addMcqQuestion(); // start with one blank
    } else {
      questions.forEach(q => addMcqQuestion(q));
    }
  }

  function addMcqQuestion(data = null) {
    const container = $('mcq-questions-list');
    const idx       = container.children.length;
    const LABELS    = ['A', 'B', 'C', 'D'];
    const defaultOptions = ['', '', '', ''];
    const opts      = (data && data.options) ? data.options : defaultOptions;
    const correct   = (data && typeof data.correct === 'number') ? data.correct : 0;
    const stem      = (data && data.stem) ? data.stem.replace(/"/g, '&quot;') : '';
    const expl      = (data && data.explanation) ? data.explanation.replace(/"/g, '&quot;') : '';

    const block = document.createElement('div');
    block.className = 'mcq-question-block';
    block.innerHTML = `
      <div class="mcq-question-header">
        <span class="mcq-q-label">Question ${idx + 1}</span>
        <button class="btn-remove-item" title="Remove question">✕ Remove</button>
      </div>
      <textarea class="mcq-stem-input" placeholder="Type the question or sentence here...">${stem}</textarea>
      <div class="mcq-correct-hint">Mark the radio button (●) next to the correct answer:</div>
      <div class="mcq-options-wrap">
        ${LABELS.map((lbl, i) => `
          <div class="mcq-option-row">
            <input type="radio" name="mcq-correct-${idx}-${Date.now()}" class="mcq-correct-radio" value="${i}" ${correct === i ? 'checked' : ''}>
            <span class="mcq-option-letter">${lbl}</span>
            <input type="text" class="mcq-option-input" placeholder="Option ${lbl}" value="${(opts[i] || '').replace(/"/g, '&quot;')}">
          </div>`).join('')}
      </div>
      <input type="text" class="mcq-explanation-input" placeholder="Explanation (shown to trainee after test — optional)" value="${expl}">`;

    block.querySelector('.btn-remove-item').onclick = () => {
      block.remove();
      // Re-label remaining questions
      Array.from(container.children).forEach((b, i) => {
        const lbl = b.querySelector('.mcq-q-label');
        if (lbl) lbl.textContent = `Question ${i + 1}`;
      });
    };

    container.appendChild(block);
  }

  function initTopicModal() {
    $('btn-add-checklist').onclick = () => addChecklistItem();
    $('btn-add-mcq-question').onclick = () => addMcqQuestion();
    $('btn-close-topic-modal').onclick = closeTopicModal;
    $('btn-cancel-topic').onclick = closeTopicModal;
    $('btn-save-topic').onclick = saveTopic;

    // Caller audio recording in modal
    initCallerRecorder();
    $('btn-clear-caller-audio').onclick = () => {
      _callerAudioBlob = null;
      $('caller-preview-audio').src = '';
      $('caller-preview-audio').classList.add('hidden');
      $('btn-clear-caller-audio').classList.add('hidden');
    };
  }

  function initCallerRecorder() {
    let recPromise = null;
    const btn = $('btn-record-caller');
    const status = $('caller-rec-status');

    btn.onclick = async () => {
      if (!_callerRecording) {
        _callerRecording = true;
        btn.textContent = '⏹ Stop Recording';
        btn.style.background = '#fef2f2';
        status.textContent = '● Recording...';
        status.className = 'recording';
        recPromise = Recorder.start();
        Recorder.startTimer(null, 0, null, null, true);
      } else {
        _callerRecording = false;
        Recorder.stop();
        let blob = null;
        try { blob = await recPromise; } catch (e) {}
        _callerAudioBlob = blob;
        btn.textContent = '🎙 Re-record';
        btn.style.background = '';
        status.textContent = '✓ Recorded';
        status.className = '';
        if (blob) {
          const url = URL.createObjectURL(blob);
          $('caller-preview-audio').src = url;
          $('caller-preview-audio').classList.remove('hidden');
          $('btn-clear-caller-audio').classList.remove('hidden');
        }
      }
    };
  }

  function closeTopicModal() {
    $('topic-modal').classList.add('hidden');
    _editTopicId = null;
    _callerAudioBlob = null;
    if (_callerRecording) { Recorder.stop(); _callerRecording = false; }
  }

  async function saveTopic() {
    const title  = $('topic-title').value.trim();
    const module = $('topic-module').value;
    if (!title) { toast('Please enter a title.', 'error'); return; }

    let checklist;
    if (module === 'grammar-assessment' || module === 'listening-assessment') {
      // Collect MCQ questions from the editor blocks
      const blocks = document.querySelectorAll('#mcq-questions-list .mcq-question-block');
      const questions = [];
      blocks.forEach(block => {
        const stem = block.querySelector('.mcq-stem-input')?.value.trim() || '';
        if (!stem) return; // skip blank questions
        const options = Array.from(block.querySelectorAll('.mcq-option-input')).map(i => i.value.trim());
        const correctRadio = block.querySelector('.mcq-correct-radio:checked');
        const correct      = correctRadio ? parseInt(correctRadio.value) : 0;
        const explanation  = block.querySelector('.mcq-explanation-input')?.value.trim() || '';
        questions.push({ stem, options, correct, explanation });
      });
      if (!questions.length) {
        toast('Please add at least one question.', 'error');
        return;
      }
      checklist = questions; // stored as objects in the checklist field
    } else {
      checklist = Array.from(document.querySelectorAll('#checklist-items input'))
        .map(i => i.value.trim()).filter(v => v);
    }

    const botScript = Array.from(document.querySelectorAll('#bot-script-items input'))
      .map(i => i.value.trim()).filter(v => v);

    const data = {
      module,
      title,
      description: $('topic-description').value.trim(),
      scenario:    (module === 'grammar-assessment' || module === 'listening-assessment') ? '' : $('topic-scenario').value.trim(),
      checklist,
      botScript,
      callerAudioBlob: _callerAudioBlob || null,
      createdAt: new Date().toISOString()
    };

    try {
      if (_editTopicId) {
        data.id = _editTopicId;
        await DB.put('topics', data);
        toast('Topic updated!', 'success');
      } else {
        await DB.put('topics', data);
        toast('Topic created!', 'success');
      }
      closeTopicModal();
      renderTopicsList();
    } catch (e) {
      console.error('Save topic failed:', e);
      toast('Error saving topic: ' + (e.message || e), 'error');
    }
  }

  async function deleteTopic(id) {
    if (!confirm('Delete this topic? Sessions using it will still show, but new sessions can\'t use it.')) return;
    await DB.del('topics', id);
    toast('Topic deleted.', '');
    renderTopicsList();
  }

  // ---- Assessments ----
  async function loadAssessments(filterTraineeId = null) {
    const tbody = $('assessments-tbody');
    let sessions, topics;
    try {
      [sessions, topics] = await Promise.all([DB.getAll('sessions'), DB.getAll('topics')]);
    } catch (e) {
      console.error('loadAssessments DB error:', e);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state" style="color:#ef4444">
          ⚠ Could not load assessments: ${e.message || e}<br>
          <small>Check your Supabase configuration and RLS policies, then click Refresh.</small>
        </td></tr>`;
      }
      return;
    }

    await loadTeamAssignments();
    populateTeamFilter();

    const topicMap = {};
    topics.forEach(t => { topicMap[t.id] = t; });

    // Cache so saveScore can re-apply filters without a full reload
    _cachedSessions = sessions;
    _cachedTopicMap = topicMap;

    // Load archived session IDs from settings (no schema change required)
    await _loadArchivedIds();

    // Reset selection state on fresh load
    _selectedSessionIds.clear();
    _updateSessionActionBtns();

    // Update tab counts
    _refreshArchiveCounts(sessions);

    let filtered = sessions;
    if (filterTraineeId) {
      // When navigating from trainee view, show all their sessions regardless of archive
      filtered = sessions.filter(s => s.traineeId === filterTraineeId);
    }

    renderAssessmentsTable(filtered, topicMap);

    $('filter-module').onchange = () => {
      _assessmentsFilter.module = $('filter-module').value;
      applyAssessmentFilters(sessions, topicMap);
    };
    $('filter-status').onchange = () => {
      _assessmentsFilter.status = $('filter-status').value;
      applyAssessmentFilters(sessions, topicMap);
    };
    $('filter-team').onchange = () => {
      _assessmentsFilter.team = $('filter-team').value;
      applyAssessmentFilters(sessions, topicMap);
    };
    $('btn-refresh-assessments').onclick = () => loadAssessments();
    $('btn-export-csv').onclick = () => downloadCSV();

    initScoringModal();
  }

  async function downloadCSV() {
    if (typeof XLSX === 'undefined') {
      toast('⚠ Excel library not loaded yet. Please wait and try again.', 'error');
      return;
    }

    const [sessions, trainees] = await Promise.all([DB.getAll('sessions'), DB.getAll('trainees')]);
    const traineeMap = {};
    trainees.forEach(t => { traineeMap[t.id] = t; });

    const sorted = [...sessions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    // ── P&S: effective score per session = admin if scored, else AI.
    //    avgOfAll = average of effective scores across ALL that trainee's P&S sessions.
    //    bestId   = session with highest effective score (only that row shows avgOfAll).
    const CSV_PS = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock']);
    const csvPsGrouped = {};
    sorted.forEach(s => {
      if (!CSV_PS.has(s.module)) return;
      const aN  = s.adminScores ? (calcAdminAvg(s.adminScores)          ?? null) : null;
      const iN  = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
      const eff = aN !== null ? aN : iN;
      if (eff === null) return;
      if (!csvPsGrouped[s.traineeId]) csvPsGrouped[s.traineeId] = [];
      csvPsGrouped[s.traineeId].push({ id: s.id, eff });
    });
    const csvPsInfo = {}; // traineeId → { bestId, avgOfAll }
    Object.entries(csvPsGrouped).forEach(([tid, list]) => {
      const best     = list.reduce((a, b) => b.eff > a.eff ? b : a);
      const avgOfAll = parseFloat((list.reduce((s, x) => s + x.eff, 0) / list.length).toFixed(1));
      csvPsInfo[tid] = { bestId: best.id, avgOfAll };
    });

    // ── Build rows ──────────────────────────────────────────────
    const headers = [
      'Name', 'Employee ID', 'Module', 'Topic', 'Date',
      'AI Score', 'Admin Score', 'Avg Score',
      'AI Coaching Summary', 'Admin Coaching Summary'
    ];

    const rows = sorted.map(s => {
      const trainee   = traineeMap[s.traineeId] || {};
      const name      = s.traineeName || trainee.name || '';
      const empId     = trainee.employee_id || '';
      const module    = MODULE_LABELS[s.module] || s.module || '';
      const topic     = s.topicTitle || '';
      const date      = s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '';
      const aiScore   = s.aiScores?.overall != null ? normalizeOverall(s.aiScores.overall) : '';
      const admScore  = s.adminScores ? (calcAdminAvg(s.adminScores) ?? '') : '';
      const csvAI    = aiScore  !== '' ? parseFloat(aiScore)  : null;
      const csvAdmin = admScore !== '' ? parseFloat(admScore) : null;
      // P&S: best session shows average of ALL sessions' effective scores; others → 'N/A'
      // Non-P&S: (admin + AI) / 2, or whichever is available
      let avgScore;
      if (CSV_PS.has(s.module)) {
        const info = csvPsInfo[s.traineeId];
        avgScore = (info && s.id === info.bestId) ? info.avgOfAll : 'N/A';
      } else {
        avgScore = (csvAI !== null && csvAdmin !== null)
          ? parseFloat(((csvAI + csvAdmin) / 2).toFixed(1))
          : (csvAdmin !== null ? csvAdmin : (csvAI !== null ? csvAI : ''));
      }
      // Always regenerate fresh — avoids stale stored summaries with removed parameters
      // Grammar / Listening Assessment: AI summary = section-by-section breakdown
      let aiSummary = '';
      if (s.module === 'grammar-assessment' || s.module === 'listening-assessment') {
        try {
          const parsed = JSON.parse(s.writtenText || '{}');
          if (parsed.sections && Array.isArray(parsed.sections)) {
            const isListening = s.module === 'listening-assessment';
            const secBreakdown = parsed.sections.map((sec, i) => {
              const label = isListening ? (sec.sectionType || `Sec ${i + 1}`) : `Sec ${String.fromCharCode(65 + i)}`;
              return `${label}: ${sec.marksObtained ?? sec.correct ?? '?'}/${sec.maxMarks ?? sec.total ?? '?'}`;
            }).join(' | ');
            aiSummary = `Score: ${parsed.totalMarksObtained ?? parsed.totalCorrect ?? '?'}/${parsed.totalMaxMarks ?? parsed.totalQuestions ?? '?'} (${s.aiScores?.overall ?? '?'}%) — ${secBreakdown}`;
          } else if (s.aiScores) {
            const { correctAnswers, totalQuestions, overall } = s.aiScores;
            aiSummary = `Score: ${correctAnswers ?? '?'} / ${totalQuestions ?? '?'} correct (${overall ?? '?'}%)`;
          }
        } catch (_) {
          if (s.aiScores) {
            const { correctAnswers, totalQuestions, overall } = s.aiScores;
            aiSummary = `Score: ${correctAnswers ?? '?'} / ${totalQuestions ?? '?'} correct (${overall ?? '?'}%)`;
          }
        }
      } else if (s.aiScores && typeof SpeechEngine !== 'undefined') {
        aiSummary = SpeechEngine.generateCoachingSummary(s.module, s.aiScores);
      }
      const isAutoScoredModule = s.module === 'grammar-assessment' || s.module === 'listening-assessment';
      const adminSummary = (s.adminScores && !isAutoScoredModule && typeof SpeechEngine !== 'undefined')
        ? SpeechEngine.generateCoachingSummary(s.module, s.adminScores, 'admin')
        : (s.adminScores && isAutoScoredModule ? 'Reviewed by admin' : '');
      return [name, empId, module, topic, date, aiScore, admScore, avgScore, aiSummary, adminSummary];
    });

    // ── Build worksheet ─────────────────────────────────────────
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths (in characters)
    ws['!cols'] = [
      { wch: 22 }, // Name
      { wch: 14 }, // Employee ID
      { wch: 22 }, // Module
      { wch: 30 }, // Topic
      { wch: 12 }, // Date
      { wch: 10 }, // AI Score
      { wch: 12 }, // Admin Score
      { wch: 11 }, // Avg Score
      { wch: 55 }, // AI Coaching Summary
      { wch: 55 }, // Admin Coaching Summary
    ];

    // Enable text wrap + top-align on all cells
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = {
          alignment: { wrapText: true, vertical: 'top' },
          font: R === 0 ? { bold: true } : {}
        };
      }
    }

    // ── Build workbook & download ────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assessment Scores');
    const fileName = `commassess-scores-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName, { cellStyles: true, bookSST: false });
    toast('Excel file downloaded!', 'success');
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
    renderAssessmentsTable(filtered, topicMap);
  }

  function renderAssessmentsTable(sessions, topicMap) {
    const tbody = $('assessments-tbody');
    const sorted = [...sessions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    _currentFilteredSessions = sorted; // track for Download All
    _allRenderedSessions = sorted;     // track for select-all
    _selectedSessionIds.clear();
    _updateSessionActionBtns();

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
      // For all other modules: (admin + AI) / 2, or whichever is available
      let avgScore;
      if (PS_MODULES.has(s.module)) {
        const info = psByTrainee[s.traineeId];
        avgScore = (info && s.id === info.bestId) ? info.avgOfAll : 'N/A';
      } else {
        const aiNum    = aiScore    !== '—' ? parseFloat(aiScore)    : null;
        const adminNum = adminScore !== '—' ? parseFloat(adminScore) : null;
        avgScore = (aiNum !== null && adminNum !== null)
          ? parseFloat(((aiNum + adminNum) / 2).toFixed(1))
          : (adminNum !== null ? adminNum : (aiNum !== null ? aiNum : '—'));
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
      `Delete this assessment?\n\nTrainee: ${traineeName || 'Unknown'}\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await DB.del('sessions', sessionId);
      toast('Assessment deleted.', '');
      loadAssessments();
    } catch (e) {
      console.error('Delete failed:', e);
      toast('Failed to delete assessment.', 'error');
    }
  }

  // ---- Delete All Sessions ----
  async function deleteAllSessions() {
    const sessions = await DB.getAll('sessions');
    if (!sessions.length) {
      toast('No assessments to delete.', '');
      return;
    }

    // Two-step confirmation for a destructive bulk action
    const step1 = confirm(
      `⚠️ Delete ALL Assessments?\n\nThis will permanently delete ${sessions.length} assessment record${sessions.length !== 1 ? 's' : ''} across all trainees and modules.\n\nThis action cannot be undone.`
    );
    if (!step1) return;

    const step2 = confirm(
      `Are you absolutely sure?\n\nAll ${sessions.length} assessments — including scores, transcripts, and recordings — will be deleted permanently.`
    );
    if (!step2) return;

    const btn = $('btn-delete-all-assessments');
    if (btn) { btn.disabled = true; btn.textContent = '🗑 Deleting…'; }

    try {
      // Delete all using Supabase bulk delete (not null filter matches every row)
      const { error } = await DB.getClient()
        .from('sessions')
        .delete()
        .not('id', 'is', null);
      if (error) throw error;

      toast(`✅ All ${sessions.length} assessments deleted.`, 'success');
      await updatePendingBadge();
      loadAssessments();
    } catch (e) {
      console.error('Delete all failed:', e);
      toast('Failed to delete assessments: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🗑 Delete All'; }
    }
  }

  // ---- Scoring Modal ----
  function initScoringModal() {
    $('btn-close-scoring').onclick = closeScoringModal;
    $('btn-save-score').onclick = saveScore;
  }

  async function openScoring(sessionId) {
    _scoringSessionId = sessionId;
    const session = await DB.get('sessions', sessionId);
    if (!session) return;

    const modal = $('scoring-modal');
    modal.classList.remove('hidden');

    $('scoring-trainee').textContent = session.traineeName;
    $('scoring-module-badge').textContent = MODULE_LABELS[session.module] || session.module;
    $('scoring-module-badge').className = `module-badge ${MODULE_BADGE_CLASS[session.module] || ''}`;
    $('scoring-topic').textContent = session.topicTitle || '—';
    $('scoring-date').textContent = formatDate(session.submittedAt);

    const isWritten   = session.module === 'written-comm';
    const isGrammar   = session.module === 'grammar-assessment';
    const isListening = session.module === 'listening-assessment';
    const isMCQ       = isGrammar || isListening;

    // Show correct left-panel section based on module type
    if (isMCQ) {
      $('scoring-audio-section').classList.add('hidden');
      $('scoring-transcript-section').classList.add('hidden');
      $('scoring-written-section').classList.add('hidden');
      $('scoring-mcq-section').classList.remove('hidden');

      // Render MCQ results — supports new multi-section format and legacy flat format
      try {
        const LABELS     = ['A', 'B', 'C', 'D'];
        const parsed     = JSON.parse(session.writtenText || '{}');
        const isMultiSec = parsed && parsed.sections && Array.isArray(parsed.sections);

        if (isMultiSec) {
          // ── New format with weighted marks (A=1pt, B/C=2pts, total=100)
          const { sections, totalMarksObtained, totalMaxMarks, scoreOutOf100,
                  totalCorrect, totalQuestions } = parsed;
          const score   = totalMarksObtained ?? totalCorrect ?? 0;
          const maxScore = totalMaxMarks ?? totalQuestions ?? 0;
          const pctShow = scoreOutOf100 ?? (maxScore > 0 ? Math.round((score / maxScore) * 100) : 0);
          $('scoring-mcq-score').innerHTML =
            `<strong style="font-size:1.05rem">Total Score: ${score} / ${maxScore} marks (${pctShow}%)</strong>`;

          const accentColor = isListening ? '#db2777' : '#7c3aed';
          const accentBg    = isListening ? '#fdf2f8' : '#f5f3ff';
          $('scoring-mcq-review').innerHTML = sections.map((sec, secIdx) => {
            const secLabel    = isListening
              ? (sec.sectionType ? `Section ${secIdx + 1}: ${sec.sectionType}` : `Section ${secIdx + 1}`)
              : `Section ${String.fromCharCode(65 + secIdx)}`;
            const mObtained   = sec.marksObtained ?? sec.correct ?? 0;
            const mMax        = sec.maxMarks ?? sec.total ?? 0;
            const mPerQ       = sec.marksPerQ ?? 1;
            const rows = (sec.answerRecord || []).map((item, i) => {
              // Written-answer questions (fill-blank / rewrite)
              if (item.type === 'fill-blank' || item.type === 'rewrite') {
                const acceptedStr = (item.acceptedAnswers || []).join(' / ');
                const userText    = item.userAnswer || '(no answer)';
                return `<div class="mcq-scoring-item ${item.isCorrect ? 'mcq-correct' : 'mcq-wrong'}">
                  <strong>${i + 1}. ${item.stem}</strong><br>
                  ${item.isCorrect
                    ? `✅ <strong>"${userText}"</strong> <em style="color:#059669">(+${mPerQ} mark${mPerQ > 1 ? 's' : ''})</em>`
                    : `❌ Your answer: <strong>"${userText}"</strong><br>✔ Accepted: <em style="color:#7c3aed">${acceptedStr}</em>`}
                  ${item.explanation ? `<br><em style="font-size:0.78rem;color:#64748b">💡 ${item.explanation}</em>` : ''}
                </div>`;
              }
              // MCQ questions
              const userLbl    = item.userAnswer >= 0 ? LABELS[item.userAnswer] : '—';
              const correctLbl = LABELS[item.correct];
              return `<div class="mcq-scoring-item ${item.isCorrect ? 'mcq-correct' : 'mcq-wrong'}">
                <strong>${i + 1}. ${item.stem}</strong><br>
                ${item.isCorrect ? `✅ <strong>${userLbl}) ${item.options?.[item.userAnswer] || '—'}</strong> <em style="color:#059669">(+${mPerQ} mark${mPerQ > 1 ? 's' : ''})</em>` : `❌ Your answer: <strong>${userLbl}) ${item.options?.[item.userAnswer] || '—'}</strong> · Correct: <strong>${correctLbl}) ${item.options?.[item.correct] || '—'}</strong>`}
                ${item.explanation ? `<br><em style="font-size:0.78rem;color:#64748b">💡 ${item.explanation}</em>` : ''}
              </div>`;
            }).join('');
            return `<div style="margin-bottom:1.25rem">
              <div style="font-weight:700;color:${accentColor};padding:0.5rem 0.75rem;background:${accentBg};border-radius:6px;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center">
                <span>${secLabel} — ${sec.correct}/${sec.total} correct</span>
                <span style="background:${accentColor};color:#fff;padding:0.15rem 0.6rem;border-radius:999px;font-size:0.82rem">${mObtained} / ${mMax} marks</span>
              </div>
              ${rows}
            </div>`;
          }).join('');
        } else {
          // ── Legacy format: flat answerRecord array
          const answerRecord = Array.isArray(parsed) ? parsed : [];
          const correct = answerRecord.filter(a => a.isCorrect).length;
          const total   = answerRecord.length;
          const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;
          $('scoring-mcq-score').textContent = `Score: ${correct} / ${total} correct (${pct}%)`;
          $('scoring-mcq-review').innerHTML  = answerRecord.map((item, i) => {
            const userLbl    = item.userAnswer >= 0 ? LABELS[item.userAnswer] : '—';
            const correctLbl = LABELS[item.correct];
            return `<div class="mcq-scoring-item ${item.isCorrect ? 'mcq-correct' : 'mcq-wrong'}">
              <strong>${i + 1}. ${item.stem}</strong><br>
              ${item.isCorrect ? '✅' : '❌'} Your answer: <strong>${userLbl}) ${item.options?.[item.userAnswer] || '—'}</strong>
              ${!item.isCorrect ? ` · Correct: <strong>${correctLbl}) ${item.options?.[item.correct] || '—'}</strong>` : ''}
              ${item.explanation ? `<br><em style="font-size:0.78rem;color:#64748b">💡 ${item.explanation}</em>` : ''}
            </div>`;
          }).join('');
        }
      } catch (e) {
        $('scoring-mcq-score').textContent = 'Could not parse MCQ results.';
        $('scoring-mcq-review').innerHTML  = '';
      }
    } else if (isWritten) {
      $('scoring-audio-section').classList.add('hidden');
      $('scoring-transcript-section').classList.add('hidden');
      $('scoring-written-section').classList.remove('hidden');
      $('scoring-mcq-section').classList.add('hidden');
      $('scoring-written-text').textContent = session.writtenText || session.transcript || '';
    } else {
      $('scoring-written-section').classList.add('hidden');
      $('scoring-mcq-section').classList.add('hidden');
      $('scoring-audio-section').classList.remove('hidden');
      $('scoring-transcript-section').classList.remove('hidden');

      const audioEl = $('scoring-audio');
      // Support both Storage URL (new) and legacy Blob
      const recUrl = session.recordingUrl
        || (session.recordingBlob ? URL.createObjectURL(session.recordingBlob) : null);
      if (recUrl) {
        audioEl.src = recUrl;
      } else {
        audioEl.src = '';
        $('scoring-audio-section').innerHTML = '<h4>Recording</h4><p style="color:var(--text-muted);font-size:0.85rem">No recording available.</p>';
      }
      $('scoring-transcript').textContent = session.transcript || 'No transcript available.';
    }

    // AI scores display
    const aiDisplay = $('scoring-ai-scores-display');
    aiDisplay.innerHTML = '';
    if (session.aiScores) {
      // Grammar/Listening assessment: show a simple score summary, not individual criteria bars
      if (isMCQ) {
        const { overall, correctAnswers, totalQuestions, marksObtained, totalMarks } = session.aiScores;
        const accentColor  = isListening ? '#db2777' : '#7c3aed';
        const accentBorder = isListening ? '#fbcfe8' : '#ddd6fe';
        const accentBg2    = isListening ? '#fdf2f8' : '#f5f3ff';
        const accentDark   = isListening ? '#be185d' : '#6d28d9';
        const scoreDisplay = marksObtained != null ? `${marksObtained} / ${totalMarks ?? '?'} marks` : `${correctAnswers ?? '?'} / ${totalQuestions ?? '?'}`;
        aiDisplay.innerHTML = `
          <div style="background:${accentBg2};border:1px solid ${accentBorder};border-radius:8px;padding:0.75rem;text-align:center;margin-bottom:0.5rem">
            <div style="font-size:1.5rem;font-weight:800;color:${accentColor}">${scoreDisplay}</div>
            <div style="font-size:0.85rem;color:${accentDark};font-weight:600">${overall ?? '?'}% — Auto-graded</div>
          </div>`;
      } else {
      // Build label map from SCORING_CRITERIA for this module
      const moduleCriteria = SCORING_CRITERIA[session.module] || [];
      const labelMap = {};
      moduleCriteria.forEach(c => { labelMap[c.key.replace('criterion_', '')] = c.label; });
      // Also include common JS score keys
      const jsKeys = {
        fluency: 'Fluency', vocabulary: 'Vocabulary', contentCoverage: 'Content Coverage',
        clarity: 'Clarity', structure: 'Structure', tone: 'Tone',
        callOpening: 'Call Opening', acknowledgment: 'Acknowledgment',
        activeListening: 'Active Listening & Probing', communicationClarity: 'Communication Clarity',
        callEssence: 'Call Essence', holdProcedure: 'Hold Procedure',
        extraMile: 'Extra Mile', callClosing: 'Call Closing'
      };
      const reasons = session.aiScores._reasons || {};
      const aiMethod = session.aiScores._method;
      if (aiMethod) {
        aiDisplay.innerHTML += `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">
          ${aiMethod === 'claude' ? '🤖 Claude AI scored' : '📊 Phrase-analysis scored'}</div>`;
      }
      Object.entries(session.aiScores).forEach(([k, v]) => {
        if (k === 'overall' || k.startsWith('_') || typeof v !== 'number') return;
        const label = jsKeys[k] || k;
        const reason = reasons[k] ? `<div class="score-reason">${reasons[k]}</div>` : '';
        aiDisplay.innerHTML += `
          <div class="ai-score-row">
            <span class="score-label">AI: ${label}</span>
            <div class="score-bar"><div class="score-bar-fill" style="width:${((v/5)*100).toFixed(0)}%"></div></div>
            <span class="score-val">${v}/5</span>
          </div>${reason}`;
      });
      // For Pick & Speak, show the 3 voice criteria that AI cannot score from text
      if (session.module === 'pick-speak') {
        const manualCriteria = [
          { key: 'pronunciation', label: 'Pronunciation Clarity' },
          { key: 'intonation',    label: 'Intonation & Stress'   },
          { key: 'volume',        label: 'Volume & Audibility'   },
        ];
        const adminScores = session.adminScores || {};
        aiDisplay.innerHTML += `<div style="font-size:0.72rem;color:var(--text-muted);margin:0.75rem 0 0.25rem;font-weight:600;letter-spacing:0.03em">🎧 REQUIRES AUDIO REVIEW</div>`;
        manualCriteria.forEach(({ key, label }) => {
          const adminVal = adminScores[key] !== undefined ? `${adminScores[key]}/5` : 'not yet scored';
          aiDisplay.innerHTML += `
            <div class="ai-score-row" style="opacity:0.7;background:#fafafa">
              <span class="score-label" style="color:var(--text-muted)">🎧 ${label}</span>
              <div class="score-bar" style="background:#e2e8f0"><div class="score-bar-fill" style="width:0%"></div></div>
              <span class="score-val" style="font-size:0.72rem;color:var(--text-muted)">${adminVal}</span>
            </div>`;
        });
      }
      } // end else (non-grammar)

      if (!isGrammar && session.aiScores.overall !== undefined) {
        const _overallPct = normalizeOverall(session.aiScores.overall);
        aiDisplay.innerHTML += `
          <div class="ai-score-row" style="background:#eff6ff;border:1px solid #dbeafe;margin-top:0.25rem">
            <span class="score-label" style="font-weight:800">AI Overall</span>
            <div class="score-bar"><div class="score-bar-fill" style="width:${_overallPct.toFixed(0)}%;background:#3b82f6"></div></div>
            <span class="score-val" style="color:#3b82f6">${_overallPct}/100</span>
          </div>`;
      }

      // Always regenerate fresh — never use stored _summary (MCQ modules have no text summary)
      if (!isMCQ) {
        const coachingSummary = typeof SpeechEngine !== 'undefined'
          ? SpeechEngine.generateCoachingSummary(session.module, session.aiScores)
          : '';
        if (coachingSummary) {
          aiDisplay.innerHTML += `
            <div style="margin-top:0.75rem">
              <div style="font-size:0.72rem;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.35rem">
                AI Coaching Summary
              </div>
              <pre style="white-space:pre-wrap;font-family:inherit;font-size:0.8rem;line-height:1.7;background:#eff6ff;border:1px solid #bfdbfe;border-left:3px solid #3b82f6;border-radius:6px;padding:0.75rem 0.875rem;margin:0;color:var(--text)">${coachingSummary}</pre>
            </div>`;
        }
      }
    }

    // Admin coaching summary (if session already has admin scores) — always regenerate fresh
    if (session.adminScores) {
      const adminSummary = typeof SpeechEngine !== 'undefined'
        ? SpeechEngine.generateCoachingSummary(session.module, session.adminScores, 'admin')
        : '';
      if (adminSummary) {
        aiDisplay.innerHTML += `
          <div style="margin-top:0.75rem">
            <div style="font-size:0.72rem;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.35rem">
              ✅ Admin Coaching Summary
            </div>
            <pre style="white-space:pre-wrap;font-family:inherit;font-size:0.8rem;line-height:1.7;background:#f0fdf4;border:1px solid #bbf7d0;border-left:3px solid #22c55e;border-radius:6px;padding:0.75rem 0.875rem;margin:0;color:var(--text)">${adminSummary}</pre>
          </div>`;
      }
    }

    // Scoring criteria — with category group headers
    const criteria = SCORING_CRITERIA[session.module] || [];
    const criteriaContainer = $('scoring-criteria');
    criteriaContainer.innerHTML = '';
    let lastGroup = null;

    // Grammar Assessment: no manual scoring criteria — show info note instead
    if (isGrammar) {
      criteriaContainer.innerHTML = `
        <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:0.875rem;font-size:0.85rem;color:#5b21b6">
          <strong>📊 Auto-graded</strong><br>
          This test is automatically scored based on correct answers. The score has been calculated and saved. You can add a comment or feedback below.
        </div>`;
      $('scoring-total-display').textContent = (session.aiScores?.overall ?? '—');
    }

    criteria.forEach((criterion, idx) => {
      const key = criterion.key;
      const existingVal = session.adminScores ? (session.adminScores[key] ?? 3) : 3;

      // Insert category group header when group changes
      if (criterion.group && criterion.group !== lastGroup) {
        criteriaContainer.innerHTML += `<div class="criterion-group-header">${criterion.group}</div>`;
        lastGroup = criterion.group;
      }

      if (criterion.scale135) {
        // 1/3/5 radio buttons
        const optionDefs = [
          { val: 1, label: '✗ Not Met' },
          { val: 3, label: '~ Partial' },
          { val: 5, label: '✓ Fully Met' }
        ];
        const optionsHTML = optionDefs.map(opt => {
          const selected = existingVal === opt.val ? `selected-${opt.val}` : '';
          return `<label class="scale-135-option ${selected}" id="opt-label-${idx}-${opt.val}" onclick="Admin.selectScale135(${idx}, ${opt.val})">
            <input type="radio" name="scale135-${idx}" value="${opt.val}" ${existingVal === opt.val ? 'checked' : ''}>
            <span>${opt.label}</span>
          </label>`;
        }).join('');
        criteriaContainer.innerHTML += `
          <div class="criterion-row" id="criterion-row-${idx}">
            <div class="criterion-label">
              <span>${criterion.label}</span>
              <span class="criterion-val" id="cval-${idx}">${existingVal}/5</span>
            </div>
            ${criterion.desc ? `<div class="criterion-desc">${criterion.desc}</div>` : ''}
            <div class="scale-135-group" id="scale135-${idx}">${optionsHTML}</div>
          </div>`;
      } else {
        // Standard 1-5 slider
        const stars = '★'.repeat(existingVal) + '☆'.repeat(5 - existingVal);
        criteriaContainer.innerHTML += `
          <div class="criterion-row" id="criterion-row-${idx}">
            <div class="criterion-label">
              <span>${criterion.label}</span>
              <span class="criterion-val" id="cval-${idx}">${existingVal}/5</span>
            </div>
            ${criterion.desc ? `<div class="criterion-desc">${criterion.desc}</div>` : ''}
            <input type="range" min="1" max="5" value="${existingVal}" class="criterion-slider"
              id="slider-${idx}" oninput="Admin.updateCriterionDisplay(${idx}, this.value)" />
            <div class="criterion-stars" id="cstars-${idx}">${stars}</div>
          </div>`;
      }
    });

    $('scoring-comment').value = session.adminComment || '';
    updateScoringTotal(session.module, session.adminScores);

    // AI band classification in left panel
    const aiBandEl = $('scoring-ai-band');
    if (aiBandEl) {
      if (session.aiScores && session.aiScores.overall !== undefined) {
        const _aiBandPct = normalizeOverall(session.aiScores.overall);
        const band = getBand(session.module, _aiBandPct);
        const pct = Math.round(_aiBandPct);
        if (band) {
          aiBandEl.innerHTML = `
            <div class="band-card ${band.cls}" style="margin-bottom:0">
              <div class="band-header">
                <span class="band-icon">${band.icon}</span>
                <div class="band-info">
                  <div class="band-label" style="font-size:0.78rem">${band.label}</div>
                  <div class="band-score" style="font-size:0.72rem">AI: ${_aiBandPct}/100</div>
                </div>
              </div>
              <div class="band-feedback" style="font-size:0.72rem">${band.feedback}</div>
            </div>`;
          // Store band feedback for "Use AI feedback" button
          aiBandEl.dataset.bandFeedback = `[AI Assessment: ${band.label} — ${pct}/100]\n${band.feedback}`;
        } else {
          aiBandEl.innerHTML = '';
        }
      } else {
        aiBandEl.innerHTML = '';
      }
    }

    // "Use AI feedback" button — populates comment with AI band feedback
    const useAiFeedbackBtn = $('btn-use-ai-feedback');
    if (useAiFeedbackBtn) {
      useAiFeedbackBtn.onclick = () => {
        const bandFeedback = aiBandEl ? aiBandEl.dataset.bandFeedback : '';
        if (bandFeedback) {
          const existing = $('scoring-comment').value.trim();
          $('scoring-comment').value = existing
            ? existing + '\n\n' + bandFeedback
            : bandFeedback;
        } else {
          toast('No AI feedback available for this session.', '');
        }
      };
    }
  }

  function updateCriterionDisplay(idx, val) {
    val = parseInt(val);
    $(`cval-${idx}`).textContent = `${val}/5`;
    $(`cstars-${idx}`).textContent = '★'.repeat(val) + '☆'.repeat(5 - val);
    collectAndUpdateTotal();
  }

  function selectScale135(idx, val) {
    val = parseInt(val);
    // Update visual state
    [1, 3, 5].forEach(v => {
      const lbl = $(`opt-label-${idx}-${v}`);
      if (lbl) {
        lbl.classList.remove('selected-1', 'selected-3', 'selected-5');
        if (v === val) lbl.classList.add(`selected-${val}`);
      }
    });
    // Check the radio
    const radio = document.querySelector(`input[name="scale135-${idx}"][value="${val}"]`);
    if (radio) radio.checked = true;
    $(`cval-${idx}`).textContent = `${val}/5`;
    collectAndUpdateTotal();
  }

  function _bandColor(cls) {
    return cls === 'band-poor' ? '#dc2626' : cls === 'band-fair' ? '#a16207' : cls === 'band-good' ? '#16a34a' : '#7c3aed';
  }

  function collectAndUpdateTotal() {
    const rows = document.querySelectorAll('[id^="criterion-row-"]');
    const vals = [];
    rows.forEach((row, idx) => {
      const slider = $(`slider-${idx}`);
      if (slider) { vals.push(parseInt(slider.value)); return; }
      const radio = document.querySelector(`input[name="scale135-${idx}"]:checked`);
      if (radio) vals.push(parseInt(radio.value));
    });
    if (!vals.length) return;
    // Each criterion 1-5 → overall out of 100
    const total = ((vals.reduce((a, b) => a + b, 0) / (vals.length * 5)) * 100).toFixed(1);
    $('scoring-total-display').textContent = total;

    // Update live admin band inline
    const inlineEl = $('admin-band-inline');
    if (inlineEl && _scoringSessionId) {
      const badge = $('scoring-module-badge');
      const moduleKey = badge
        ? [...Object.entries({ 'pick-speak': 'Pick & Speak', 'mock-call': 'Mock Call', 'role-play': 'Role Play', 'group-discussion': 'Group Discussion', 'written-comm': 'Written Comm.' })].find(([, v]) => v === badge.textContent)?.[0]
        : null;
      if (moduleKey && SCORE_BANDS[moduleKey]) {
        const band = getBand(moduleKey, parseFloat(total));
        if (band) {
          inlineEl.textContent = `— ${band.icon} ${band.label}`;
          inlineEl.style.color = _bandColor(band.cls);
        }
      }
    }
  }

  function updateScoringTotal(module, existing) {
    if (module === 'grammar-assessment' || module === 'listening-assessment') return; // handled separately in openScoring
    const criteria = SCORING_CRITERIA[module] || [];
    let total;
    if (existing && typeof existing.overall === 'number') {
      total = existing.overall.toFixed(1);
    } else if (existing && criteria.length) {
      const vals = criteria.map(c => existing[c.key] ?? 3);
      total = ((vals.reduce((a, b) => a + b, 0) / (vals.length * 5)) * 100).toFixed(1);
    } else {
      total = '60.0';
    }
    $('scoring-total-display').textContent = total;

    const inlineEl = $('admin-band-inline');
    if (inlineEl && SCORE_BANDS[module]) {
      const band = getBand(module, parseFloat(total));
      if (band) {
        inlineEl.textContent = `— ${band.icon} ${band.label}`;
        inlineEl.style.color = _bandColor(band.cls);
      }
    }
  }

  async function saveScore() {
    const session = await DB.get('sessions', _scoringSessionId);
    if (!session) return;

    const criteria    = SCORING_CRITERIA[session.module] || [];
    const adminScores = {};

    // Grammar/Listening Assessment is auto-scored — admin just reviews and adds a comment
    if (session.module === 'grammar-assessment' || session.module === 'listening-assessment') {
      adminScores.overall = session.aiScores?.overall ?? 0;
    } else {
      criteria.forEach((criterion, i) => {
        const key = criterion.key;
        if (criterion.scale135) {
          const radio = document.querySelector(`input[name="scale135-${i}"]:checked`);
          if (radio) adminScores[key] = parseInt(radio.value);
        } else {
          const slider = $(`slider-${i}`);
          if (slider) adminScores[key] = parseInt(slider.value);
        }
      });

      // Compute overall out of 100 and store it
      const vals = criteria.map(c => adminScores[c.key] ?? 3);
      adminScores.overall = parseFloat(((vals.reduce((a, b) => a + b, 0) / (vals.length * 5)) * 100).toFixed(1));
    }

    // Generate and store coaching summary from admin scores
    if (typeof SpeechEngine !== 'undefined') {
      const adminSummary = SpeechEngine.generateCoachingSummary(session.module, adminScores, 'admin');
      if (adminSummary) adminScores._summary = adminSummary;
    }

    session.adminScores = adminScores;
    session.adminComment = $('scoring-comment').value.trim();
    session.status = 'scored';

    await DB.put('sessions', session);
    toast('Scores saved!', 'success');
    await updatePendingBadge();

    // Update the cached session entry so the table reflects new scores
    const idx = _cachedSessions.findIndex(s => s.id === session.id);
    if (idx !== -1) _cachedSessions[idx] = session;
    else _cachedSessions.push(session);

    // Re-render using the current filter — list stays exactly as the admin left it
    applyAssessmentFilters(_cachedSessions, _cachedTopicMap);

    // Close the modal automatically
    closeScoringModal();
  }

  function closeScoringModal() {
    $('scoring-modal').classList.add('hidden');
    _scoringSessionId = null;
  }

  // ---- Reports ----
  async function loadReportsDropdown() {
    const trainees = await DB.getAll('trainees');
    const select = $('report-trainee-select');
    select.innerHTML = '<option value="">— Choose a trainee —</option>';
    trainees.forEach(t => {
      select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });

    select.onchange = async () => {
      const id = select.value;
      if (!id) { $('report-content').classList.add('hidden'); return; }
      await loadTraineeReport(id);
    };
  }

  // ── Letter-report insight builder ─────────────────────────────
  function buildLetterInsights(scores, details, totalMark) {
    const r2 = v => parseFloat(v.toFixed(2));
    const ps = scores['pick-speak'];
    const mc = scores['mock-call'];
    const ga = scores['grammar-assessment'];
    const la = scores['listening-assessment'];

    const modNames = {
      'pick-speak': 'Pick & Speak',
      'mock-call':  'Mock Call',
      'grammar-assessment': 'Grammar',
      'listening-assessment': 'Listening'
    };
    const available = Object.entries(scores).filter(([, v]) => v != null).sort(([, a], [, b]) => b - a);
    const bestMod   = available[0]?.[0];
    const overall   = totalMark ?? 0;

    // ── Strengths paragraph ──
    let strengthPara = '';
    const subStrengths = [];

    // P&S sub-criteria
    const bestPS = (details['pick-speak'] || []).reduce((b, s) => {
      const e = effScore(s), be = b ? effScore(b) : -1;
      return (e !== null && e > (be ?? -1)) ? s : b;
    }, null);
    if (bestPS?.aiScores) {
      const ai = bestPS.aiScores;
      if (typeof ai.fluency        === 'number' && ai.fluency        >= 4) subStrengths.push('spoken fluency');
      if (typeof ai.vocabulary     === 'number' && ai.vocabulary     >= 4) subStrengths.push('vocabulary');
      if (typeof ai.contentCoverage === 'number' && ai.contentCoverage >= 4) subStrengths.push('content coverage and logical flow');
    }
    // Mock call sub-criteria
    const latestMC = (details['mock-call'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    if (latestMC) {
      const cr = { ...(latestMC.aiScores || {}), ...(latestMC.adminScores || {}) };
      if (typeof cr.callOpening         === 'number' && cr.callOpening         >= 4) subStrengths.push('professional call opening');
      if (typeof cr.acknowledgment      === 'number' && cr.acknowledgment      >= 4) subStrengths.push('empathy and acknowledgment');
      if (typeof cr.communicationClarity === 'number' && cr.communicationClarity >= 4) subStrengths.push('communication clarity');
      if (typeof cr.callEssence         === 'number' && cr.callEssence         >= 4) subStrengths.push('call essence and warmth');
      if (typeof cr.callClosing         === 'number' && cr.callClosing         >= 4) subStrengths.push('professional call closing');
    }
    if (la >= 70) subStrengths.push('listening comprehension');
    if (ga >= 75) subStrengths.push('grammatical precision');

    if (overall >= 72) {
      strengthPara = `You are among the stronger performers in this program${bestMod ? `, with particularly good results in ${modNames[bestMod]}` : ''}. ${subStrengths.length ? `Your performance reflects real strengths in ${subStrengths.slice(0, 3).join(', ')}.` : 'Your consistent performance reflects a high standard of professional communication.'}`;
    } else if (overall >= 55) {
      strengthPara = `You demonstrate a solid foundation in professional communication${bestMod ? `, with ${modNames[bestMod]} being your strongest area` : ''}. ${subStrengths.length ? `Specific strengths include ${subStrengths.slice(0, 2).join(' and ')}.` : 'With focused practice, you can build significantly on this foundation.'}`;
    } else {
      strengthPara = `You have engaged actively in the Communicate 360 program${bestMod ? ` and show early promise in ${modNames[bestMod]}` : ''}. Your participation across all assessments forms the starting point for meaningful growth.`;
    }

    // ── Priority bullets ──
    const priorityBullets = [];
    const addedParams = new Set();

    // P&S — find the weakest sub-criteria
    if (bestPS?.aiScores && ps != null) {
      const PS_CRIT = [
        { key: 'fluency',         label: 'Fluency',         mod: 'Pick & Speak' },
        { key: 'vocabulary',      label: 'Vocabulary',      mod: 'Pick & Speak' },
        { key: 'contentCoverage', label: 'Content Coverage', mod: 'Pick & Speak' },
      ];
      PS_CRIT.filter(c => typeof bestPS.aiScores[c.key] === 'number' && bestPS.aiScores[c.key] < 3.5)
        .sort((a, b) => bestPS.aiScores[a.key] - bestPS.aiScores[b.key])
        .slice(0, 2)
        .forEach(c => { priorityBullets.push({ param: c.label, desc: `This is the highest-impact area for your ${c.mod}.` }); addedParams.add(c.key); });
    } else if (ps != null && ps < 60) {
      priorityBullets.push({ param: 'Spoken Delivery', desc: 'Focus on structure, fluency and topic depth in Pick & Speak.' });
    }

    // Mock Call — weakest criteria
    if (latestMC) {
      const cr = { ...(latestMC.aiScores || {}), ...(latestMC.adminScores || {}) };
      const MC_CRIT = [
        { key: 'callOpening',          label: 'Call Opening',           mod: 'Mock Calls' },
        { key: 'acknowledgment',        label: 'Acknowledgment',         mod: 'Mock Calls' },
        { key: 'communicationClarity',  label: 'Communication Clarity',  mod: 'Mock Calls' },
        { key: 'callEssence',           label: 'Call Essence',           mod: 'Mock Calls' },
        { key: 'holdProcedure',         label: 'Hold Procedure',         mod: 'Mock Calls' },
        { key: 'extraMile',             label: 'Going the Extra Mile',   mod: 'Mock Calls' },
        { key: 'callClosing',           label: 'Call Closing',           mod: 'Mock Calls' },
      ];
      MC_CRIT.filter(c => typeof cr[c.key] === 'number' && cr[c.key] < 3.5)
        .sort((a, b) => cr[a.key] - cr[b.key])
        .slice(0, 2)
        .forEach(c => { priorityBullets.push({ param: c.label, desc: `This is the highest-impact area for your ${c.mod}.` }); });
    } else if (mc == null) {
      priorityBullets.push({ param: 'Mock Call', desc: 'Assessment pending — your score will be updated once reviewed by your manager.' });
    } else if (mc < 60) {
      priorityBullets.push({ param: 'Call Handling', desc: 'Focus on consistent greeting structure, empathy language and hold procedure.' });
    }

    // Grammar — weakest section
    if (ga != null && ga < 75) {
      const latestGA = (details['grammar-assessment'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
      let gaAdded = false;
      if (latestGA) {
        try {
          const parsed = JSON.parse(latestGA.writtenText || '{}');
          if (parsed.sections) {
            const weakSec = parsed.sections
              .filter(sec => sec.maxMarks > 0 && (sec.marksObtained / sec.maxMarks) < 0.65)
              .sort((a, b) => (a.marksObtained / a.maxMarks) - (b.marksObtained / b.maxMarks))[0];
            if (weakSec) {
              const letter = weakSec.title?.match(/Section\s+([A-C])/i)?.[1];
              const GRAM_LABEL = {
                A: { param: 'Grammar — Tense, Articles & Basic Grammar Rules',   desc: 'Practise identifying correct tense forms (past/present/future), and using articles (a/an/the) in context.' },
                B: { param: 'Grammar — Prepositions & Conjunctions',             desc: 'Focus on articles (a/an/the), prepositions (in/on/at/to/for) and conjunctions (and/but/so/because) in fill-in-the-blank exercises.' },
                C: { param: 'Grammar — Sentence Rewriting & Tense Correction',   desc: 'Practise rewriting sentences with correct tense, subject-verb agreement and modal verbs (should/could/would).' }
              };
              const gi = GRAM_LABEL[letter] || { param: 'Grammar', desc: 'Focus on prepositions, conjunctions and tense correction through daily practice.' };
              priorityBullets.push(gi);
              gaAdded = true;
            }
          }
        } catch (_) {}
      }
      if (!gaAdded) priorityBullets.push({ param: 'Grammar', desc: 'Focus on conditionals, prepositions and subject-verb agreement.' });
    }

    // Listening — weakest section
    if (la != null && la < 70) {
      const latestLA = (details['listening-assessment'] || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
      if (latestLA) {
        try {
          const parsed = JSON.parse(latestLA.writtenText || '{}');
          if (parsed.sections) {
            const weakSec = parsed.sections
              .filter(sec => sec.maxMarks > 0 && (sec.marksObtained / sec.maxMarks) < 0.65)
              .sort((a, b) => (a.marksObtained / a.maxMarks) - (b.marksObtained / b.maxMarks))[0];
            if (weakSec) {
              const type = weakSec.sectionType || 'Listening';
              priorityBullets.push({ param: `Listening — ${type}`, desc: `Active listening practice with ${type.toLowerCase()} material will improve this section significantly.` });
            }
          }
        } catch (_) {}
      }
    }

    // Priority intro paragraph
    let priorityIntro = '';
    if (overall >= 70) {
      priorityIntro = 'You communicate with structure and precision. The missing layer is warmth and consistency in the areas below. We recommend prioritizing:';
    } else if (overall >= 50) {
      priorityIntro = 'To strengthen your overall communication profile, we recommend focusing on the following areas:';
    } else {
      priorityIntro = 'To build a stronger communication foundation, prioritize the following areas in your daily practice:';
    }

    // ── Action plan ──
    const { actions } = buildAgentInsights(scores, details);
    const actionIntro = overall >= 65
      ? 'We suggest the following routines to build on your Key Strengths:'
      : 'We suggest the following targeted practices to address your priority areas:';

    // ── Closing ──
    const closing1 = 'Consistent practice of these focused actions will help you achieve greater consistency and impact in your communication.';
    const closing2 = overall >= 70 ? 'You have made excellent progress. Keep up the momentum.'
      : overall >= 50 ? 'You are on the right track. Stay committed to daily practice.'
      : 'Every step of deliberate practice builds lasting improvement. Keep going.';

    return { strengthPara, priorityIntro, priorityBullets, actionIntro, actions, closing1, closing2 };
  }

  // ── Render the letter into #report-letter-card ─────────────────
  function renderTraineeLetter(trainee, marks, insights) {
    const card = $('report-letter-card');
    if (!card) return;
    const { lisMark, psMark, gaMark, mcMark, totalMark } = marks;
    const { strengthPara, priorityIntro, priorityBullets, actionIntro, actions, closing1, closing2 } = insights;

    const fmt = (v, max) => v != null
      ? `<strong>${v.toFixed(2)} / ${max}</strong>`
      : `<strong style="color:#94a3b8">Not attempted / ${max}</strong>`;

    const priorityList = priorityBullets.length
      ? `<ul>${priorityBullets.map(b => `<li><strong>${b.param}:</strong> ${b.desc}</li>`).join('')}</ul>`
      : '<p style="color:var(--text-muted)">No specific priority areas — maintain your current standards.</p>';

    const actionList = actions.length
      ? `<ul>${actions.map(a => `<li>${a}</li>`).join('')}</ul>`
      : '<ul><li>Continue participating actively in all assessment modules.</li></ul>';

    card.innerHTML = `
      <div class="lrc-print-btn-wrap">
        <button id="lrc-copy-btn" class="btn-secondary" style="font-size:0.8rem;padding:0.4rem 0.9rem" onclick="Admin.copyLetter()">📋 Copy to Clipboard</button>
        <button id="lrc-ppt-btn" class="btn-primary" style="font-size:0.8rem;padding:0.4rem 0.9rem;margin-left:0.5rem" onclick="Admin.downloadTraineePPT()">⬇ Download PPT</button>
      </div>

      <div id="lrc-letter-body">
      <p class="lrc-salutation">Dear ${trainee.name},</p>
      <p>Thank you for your active participation in the recent <strong>Communicate 360</strong> training program. Please find below the summary of your performance assessment:</p>

      <h2 class="lrc-h2">Overall Performance Summary</h2>
      <p class="lrc-total">Total Score: ${totalMark != null ? totalMark.toFixed(2) : '—'} / 100</p>
      <ul class="lrc-score-list">
        <li>Listening: ${fmt(lisMark, 20)}</li>
        <li>Pick &amp; Speak: ${fmt(psMark, 20)}</li>
        <li>Grammar: ${fmt(gaMark, 25)}</li>
        <li>Mock Call: ${fmt(mcMark, 20)}</li>
      </ul>
      <p style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem;margin-bottom:0.1rem"><em>* AI &amp; Manager evaluation scores are taken into consideration and carry a weightage of 15% in the total score.</em></p>

      <h2 class="lrc-h2">Key Strengths</h2>
      <p>${strengthPara}</p>

      <h2 class="lrc-h2">Priority Areas for Development</h2>
      <p>${priorityIntro}</p>
      ${priorityList}

      <h2 class="lrc-h2">Your Action Plan</h2>
      <p>${actionIntro}</p>
      ${actionList}

      <p style="margin-top:1.25rem">${closing1}</p>
      <p style="margin-top:0.5rem"><strong>${closing2}</strong></p>
      </div>
    `;
  }

  // ================================================================
  //  PPT REPORT GENERATION (PptxGenJS)
  // ================================================================

  // Returns array of { lines: [...] } — short bullet lines for the right content panel.
  // Left panel shows only "Step N"; right panel shows these lines at 11pt white.
  function buildRoadmapSteps(name, scores, details, marks) {
    const steps = [];
    const { psMark, lisMark, gaMark, mcMark } = marks;

    // ── Pick & Speak ──────────────────────────────────────────────────────────
    const psSessions = details['pick-speak'] || [];
    const bestPS = psSessions.reduce((b, s) => {
      const e = effScore(s), be = b ? effScore(b) : -1;
      return (e !== null && e > (be ?? -1)) ? s : b;
    }, null);
    const psAI = bestPS?.aiScores || {};
    const PS_LINES = {
      fluency:        'Speak for 1 minute non-stop on any topic — flow matters more than perfection',
      pace:           'Record yourself and listen back; aim for 120–140 WPM for clear, natural delivery',
      logicalFlow:    'Structure every response: clear opening → developed middle → strong close',
      clarity:        'Use short sentences (10–15 words) — one idea per sentence, avoid jargon',
      confidence:     'Replace hedge phrases ("I think", "sort of") with confident, direct statements',
      fillerControl:  'Replace "um / uh / like" with a deliberate pause — silence sounds confident',
      vocabulary:     'Introduce one new professional term per response; read financial content daily',
      professionalism:'Use formal language throughout; open and close with structured, courteous phrases'
    };
    const weakPS = Object.entries(psAI)
      .filter(([k, v]) => PS_LINES[k] && typeof v === 'number' && v < 4)
      .sort(([,a],[,b]) => a - b);
    if (weakPS.length || (psMark != null && psMark < 15)) {
      const lines = weakPS.slice(0, 3).map(([k]) => PS_LINES[k]);
      if (lines.length < 2) {
        lines.push('Structure every response: clear opening → developed middle → strong close');
        lines.push('Record a 2-minute talk daily on a workplace topic and self-review');
      }
      steps.push({ lines });
    }

    // ── Mock Call ─────────────────────────────────────────────────────────────
    const mcSess = details['mock-call'] || [];
    const latestMC = [...mcSess].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    const mcCom = { ...(latestMC?.aiScores||{}), ...(latestMC?.adminScores||{}) };
    const MC_LINES = {
      callOpening:          '"Good morning/afternoon, [Company], this is [Name], how may I assist?" — all 4 elements, every call',
      acknowledgment:       'Acknowledge before solving: "I completely understand how frustrating this must be"',
      communicationClarity: 'Avoid jargon; use short sentences and confirm understanding: "Does that make sense?"',
      callEssence:          'Use positive words throughout: "certainly", "happy to help", "absolutely"',
      holdProcedure:        '"May I place you on hold for 2 minutes while I check?" — permission + reason + time',
      extraMile:            'After resolving: offer one proactive tip or related info the customer did not ask for',
      callClosing:          '"Is there anything else I can help you with?" then a warm sign-off — every call'
    };
    const weakMC = Object.entries(mcCom)
      .filter(([k, v]) => MC_LINES[k] && typeof v === 'number' && v < 4)
      .sort(([,a],[,b]) => a - b);
    if (weakMC.length || (mcMark != null && mcMark < 15)) {
      const lines = weakMC.slice(0, 3).map(([k]) => MC_LINES[k]);
      if (lines.length < 2) {
        lines.push('Role-play 3 full mock calls per week and identify missed protocol steps');
        lines.push('Practice the call opening 10 times daily until it becomes automatic');
      }
      steps.push({ lines });
    }

    // ── Listening ─────────────────────────────────────────────────────────────
    if (lisMark != null && lisMark < 15) {
      const laSess = details['listening-assessment'] || [];
      const latestLA = [...laSess].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
      const weakLA = (latestLA?.aiScores?.sections || []).filter(s => s.pct < 60);
      const lines = [
        'Listen to a 5-min audio clip; pause and write 5 key points without replaying',
        'Watch short video clips and capture specific details: names, numbers, sequence',
        'Avoid assumptions — verify exactly what you heard before forming a response'
      ];
      if (weakLA.length) lines.unshift(`Needs consistency in: ${weakLA.slice(0,2).map(s=>s.title.split('—')[0].trim()).join(' & ')}`);
      steps.push({ lines: lines.slice(0, 4) });
    }

    // ── Grammar ───────────────────────────────────────────────────────────────
    const gaSess = details['grammar-assessment'] || [];
    const latestGA = [...gaSess].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    const gaSecs  = latestGA?.aiScores?.sections || [];
    const weakGA  = gaSecs.filter(s => s.pct < 65).sort((a,b) => a.pct - b.pct);
    const GRAM_LINES = {
      A: [
        'Take 10 grammar MCQ tests daily and review every wrong answer carefully',
        'Tense drill: write 3 sentences each in simple, continuous and perfect tense daily',
        'Articles review: a/an/the — practice with fill-in-the-blank exercises every morning',
        '📖 Read aloud daily  🎙 Record & self-correct  ✍ Keep an error notebook'
      ],
      B: [
        'Study prepositions: in/on/at for time and place — use each in 5 real sentences daily',
        'Articles drill: a (consonant sound), an (vowel sound), the (specific/known noun)',
        'Conjunctions practice: and (addition), but (contrast), so (result), because (reason)',
        '📖 Read aloud daily  🎙 Record & self-correct  ✍ Keep an error notebook'
      ],
      C: [
        'Rewrite 5 incorrect sentences daily — focus on tense consistency throughout',
        'Subject–verb agreement: singular subject = singular verb; plural = plural verb',
        'Modal verbs: should (advice), could (possibility), would (conditional/polite)',
        '📖 Read aloud daily  🎙 Record & self-correct  ✍ Keep an error notebook'
      ]
    };
    const topLetter = (weakGA[0]?.title || '').match(/Section\s+([A-C])/i)?.[1]?.toUpperCase() || '';
    const gramLines = GRAM_LINES[topLetter] || [
      'Understand the right usage of articles (a/an/the) and prepositions (in/on/at/to/for)',
      'Concepts: subject + verb agreement; sentence structure; tense consistency',
      'Practise fill-in-the-blank and sentence rewriting exercises daily',
      '📖 Read aloud daily  🎙 Record & self-correct  ✍ Keep an error notebook'
    ];
    if (weakGA.length || (gaMark != null && gaMark < 18)) {
      steps.push({ lines: gramLines });
    }

    // ── Pad to minimum 3 steps ────────────────────────────────────────────────
    while (steps.length < 3) {
      steps.push({ lines: [
        'Dedicate 20 minutes daily: 5 min listening drill, 5 min grammar, 10 min speaking',
        'Record yourself weekly and compare to previous recordings to measure progress',
        'Consistency over intensity — small daily practice compounds into lasting skill'
      ]});
    }
    return steps.slice(0, 4);
  }

  async function generateTraineePPT(trainee, marks, scores, details) {
    if (typeof PptxGenJS === 'undefined') { toast('PptxGenJS library not loaded', 'error'); return; }

    const C = { navy:'14195A', teal:'028090', mint:'02C39A', lightBg:'F0F4F8', darkNav:'1E2761',
      amber:'F39C12', green:'27AE60', red:'E74C3C', orange:'E67E22', white:'FFFFFF',
      muted:'64748B', light:'A0B4C8', label:'CCDDEE', denom:'9BB0C8', divider:'E2E8F0', sidebar:'1E2D6B' };

    const { lisMark, psMark, gaMark, mcMark, totalMark } = marks;
    const W = 10, H = 5.625, name = trainee.name;

    const sColor = (v, max) => { if (v==null) return C.muted; const p=(v/max)*100; return p>=75?C.green:p>=50?C.amber:C.red; };
    const fmt2  = v => v != null ? v.toFixed(2) : '—';
    const noBorder = { type: 'none' };

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    // ── SLIDE 1 — Cover ─────────────────────────────────────────────────────────
    const s1 = pptx.addSlide();
    s1.background = { color: C.navy };
    // Left mint stripe
    s1.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.18, h:H, fill:{color:C.mint}, line:noBorder });
    // Top-right teal circle (decorative)
    s1.addShape(pptx.ShapeType.ellipse, { x:6.4, y:-0.55, w:4.3, h:4.3, fill:{color:C.mint}, line:noBorder });
    // Navy overlay square (creates window-in-circle effect)
    s1.addShape(pptx.ShapeType.rect, { x:7.25, y:0.82, w:2.5, h:2.5, fill:{color:C.navy}, line:noBorder });
    // Total score circle
    s1.addShape(pptx.ShapeType.ellipse, { x:7.55, y:0.92, w:1.9, h:1.9, fill:{color:C.darkNav}, line:noBorder });
    // Total score text
    s1.addText('Total Score',         { x:7.55, y:1.02, w:1.9, h:0.28, fontSize:9,  bold:true, color:C.label, align:'center', fontFace:'Calibri' });
    s1.addText(fmt2(totalMark),        { x:7.55, y:1.28, w:1.9, h:0.62, fontSize:30, bold:true, color:C.white, align:'center', fontFace:'Calibri' });
    s1.addText('/ 100',                { x:7.55, y:1.9,  w:1.9, h:0.28, fontSize:11, color:C.denom, align:'center', fontFace:'Calibri' });
    // Main text
    s1.addText('Performance Assessment Report', { x:0.45, y:0.55, w:6.6, h:0.32, fontSize:13, color:C.light, fontFace:'Calibri' });
    s1.addText(name,                            { x:0.45, y:0.88, w:6.5, h:1.1,  fontSize:name.length > 18 ? 34 : 42, bold:true, color:C.white, fontFace:'Calibri', breakLine:true });
    s1.addText('Communication & Call Centre Skills Evaluation', { x:0.45, y:2.55, w:6.5, h:0.38, fontSize:13, color:C.light, fontFace:'Calibri' });
    // 4 score cards
    const cards = [
      { label:'Pick & Speak', score:psMark, max:20 },
      { label:'Listening',    score:lisMark, max:20 },
      { label:'Mock Call',    score:mcMark,  max:20 },
      { label:'Grammar',      score:gaMark,  max:25 }
    ];
    const cXs = [0.3, 2.58, 4.86, 7.14], cW=2.1, cH=1.55, cY=3.55;
    cards.forEach((c, i) => {
      s1.addShape(pptx.ShapeType.rect, { x:cXs[i], y:cY, w:cW, h:cH, fill:{color:C.darkNav}, line:noBorder });
      s1.addText(c.label, { x:cXs[i]+0.1, y:cY+0.12, w:cW-0.2, h:0.26, fontSize:9, bold:true, color:C.label, align:'center', fontFace:'Calibri' });
      s1.addText(c.score!=null ? c.score.toFixed(2) : 'N/A', { x:cXs[i]+0.1, y:cY+0.36, w:cW-0.2, h:0.68, fontSize:26, bold:true, color:sColor(c.score,c.max), align:'center', fontFace:'Calibri' });
      s1.addText(`/ ${c.max}`, { x:cXs[i]+0.1, y:cY+1.08, w:cW-0.2, h:0.32, fontSize:12, color:C.denom, align:'center', fontFace:'Calibri' });
    });
    // Footer
    s1.addShape(pptx.ShapeType.rect, { x:0, y:H-0.42, w:W, h:0.42, fill:{color:C.teal}, line:noBorder });
    s1.addText('Confidential  |  Individual Coaching Report  |  * AI & Manager scores included (15% weightage)', { x:0.3, y:H-0.4, w:W-0.6, h:0.36, fontSize:9, color:C.white, align:'center', fontFace:'Calibri', valign:'middle' });

    // ── SLIDE 2 — Pick & Speak ───────────────────────────────────────────────────
    const s2 = pptx.addSlide();
    s2.background = { color: C.lightBg };
    s2.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:0.82, fill:{color:C.teal}, line:noBorder });
    s2.addText('🎤  Pick & Speak Feedback', { x:0.25, y:0.08, w:7.6, h:0.66, fontSize:20, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });
    s2.addShape(pptx.ShapeType.rect, { x:8.08, y:0.1, w:1.72, h:0.62, fill:{color:C.darkNav}, line:noBorder });
    s2.addText(`${fmt2(psMark)} / 20`, { x:8.08, y:0.1, w:1.72, h:0.62, fontSize:13, bold:true, color:C.mint, align:'center', valign:'middle', fontFace:'Calibri' });

    const psSessions = details['pick-speak'] || [];
    // Pick session with highest effective score
    const bestPS = psSessions.reduce((b, s) => {
      const e = effScore(s), be = b ? effScore(b) : -1;
      return (e !== null && e > (be ?? -1)) ? s : b;
    }, null);
    // Merge aiScores + adminScores — union of all available criteria (adminScores override where both exist)
    const psAI = { ...(bestPS?.aiScores || {}), ...(bestPS?.adminScores || {}) };
    const PS_CRIT = [
      { key:'fluency',        label:'Fluency',              tip:'Practice speaking on random topics for 1 minute non-stop. Focus on flow, not perfection.' },
      { key:'pace',           label:'Pace & Delivery',       tip:'Record yourself. Target 100–150 WPM for clear conversational delivery.' },
      { key:'logicalFlow',    label:'Logical Flow',          tip:'Use "first / then / finally" to structure responses. Open, develop, close clearly.' },
      { key:'clarity',        label:'Clarity of Expression', tip:'Use short sentences (10–20 words) with a single idea per sentence.' },
      { key:'confidence',     label:'Confidence',            tip:'Replace "I think" / "sort of" with confident statements. Pause instead of using fillers.' },
      { key:'fillerControl',  label:'Filler Word Control',   tip:'Replace "um / uh / like" with a deliberate pause — silence sounds more confident.' },
      { key:'vocabulary',     label:'Vocabulary',            tip:'Introduce one new professional term per response. Read industry content daily.' },
      { key:'professionalism',label:'Professionalism',       tip:'Avoid slang. Use formal language and close with structured, courteous phrases.' },
      { key:'contentCoverage',label:'Content Coverage',      tip:'Cover the topic thoroughly — relevant examples, well-developed ideas, clear conclusion.' },
      { key:'timeManagement', label:'Time Management',       tip:'Practice pacing: cover your key points within the allotted time without rushing.' },
      { key:'sentenceVariety',label:'Sentence Variety',      tip:'Mix short punchy sentences with longer ones. Vary your sentence structure to keep listeners engaged.' }
    ];
    // Show ONLY criteria with actual scores (no N/A cards); sort worst-first so priority is obvious
    const displayPS = PS_CRIT
      .filter(c => typeof psAI[c.key] === 'number')
      .sort((a, b) => (psAI[a.key] ?? 5) - (psAI[b.key] ?? 5))
      .slice(0, 6);
    const priorityPS = displayPS[0]?.label || 'Communication Delivery';

    s2.addShape(pptx.ShapeType.rect, { x:0, y:0.82, w:W, h:0.5, fill:{color:C.amber}, line:noBorder });
    s2.addText(`🎯  Priority Action: Start with '${priorityPS}' — highest-impact area to address first`, { x:0.25, y:0.82, w:W-0.5, h:0.5, fontSize:12, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });

    const psCardW=4.68, psCardH=0.76, psGap=0.07, psStartY=1.41;
    if (displayPS.length === 0) {
      // No detailed criteria available — show a single info card
      s2.addShape(pptx.ShapeType.rect, { x:0.22, y:psStartY, w:W-0.44, h:0.76, fill:{color:C.white}, line:{color:C.divider,pt:0.75} });
      s2.addShape(pptx.ShapeType.rect, { x:0.22, y:psStartY, w:0.08, h:0.76, fill:{color:C.muted}, line:noBorder });
      s2.addText('No detailed breakdown available for this session.', { x:0.40, y:psStartY+0.08, w:W-0.7, h:0.56, fontSize:11, color:C.muted, fontFace:'Calibri', valign:'middle' });
    } else {
      displayPS.forEach((c, idx) => {
        const col=idx%2, row=Math.floor(idx/2);
        const cx=(col===0)?0.22:5.1, cy=psStartY+row*(psCardH+psGap);
        const score = psAI[c.key];
        const sc = score >= 4 ? C.teal : C.amber;
        s2.addShape(pptx.ShapeType.rect, { x:cx, y:cy, w:psCardW, h:psCardH, fill:{color:C.white}, line:{color:C.divider,pt:0.75} });
        s2.addShape(pptx.ShapeType.rect, { x:cx, y:cy, w:0.08, h:psCardH, fill:{color:sc}, line:noBorder });
        s2.addText(c.label,          { x:cx+0.15, y:cy+0.06, w:psCardW-0.9, h:0.3, fontSize:11, bold:true, color:C.darkNav, fontFace:'Calibri' });
        s2.addText(`${score}/5`,     { x:cx+psCardW-0.78, y:cy+0.06, w:0.65, h:0.3, fontSize:11, bold:true, color:sc, align:'right', fontFace:'Calibri' });
        s2.addText(c.tip,            { x:cx+0.15, y:cy+0.35, w:psCardW-0.28, h:0.35, fontSize:8.5, color:C.muted, wrap:true, fontFace:'Calibri' });
      });
    }

    // ── SLIDE 3 — Mock Call ──────────────────────────────────────────────────────
    const s3 = pptx.addSlide();
    s3.background = { color: C.lightBg };
    s3.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:0.82, fill:{color:C.darkNav}, line:noBorder });
    s3.addText('📞  Mock Call Feedback', { x:0.25, y:0.08, w:7.6, h:0.66, fontSize:20, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });
    s3.addShape(pptx.ShapeType.rect, { x:8.08, y:0.1, w:1.72, h:0.62, fill:{color:C.teal}, line:noBorder });
    s3.addText(`${fmt2(mcMark)} / 20`, { x:8.08, y:0.1, w:1.72, h:0.62, fontSize:13, bold:true, color:C.white, align:'center', valign:'middle', fontFace:'Calibri' });

    const mcSess = details['mock-call'] || [];
    const latestMC = mcSess.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt))[0];
    const mcCom = { ...(latestMC?.aiScores||{}), ...(latestMC?.adminScores||{}) };
    const MC_CRIT2 = [
      { key:'callOpening',          label:'Call Opening',          tip:'Greet warmly, state your name & company, invite the customer\'s concern — all 4 elements.' },
      { key:'acknowledgment',       label:'Acknowledgment',        tip:'"I completely understand how frustrating this must be" — empathy always comes first.' },
      { key:'communicationClarity', label:'Communication Clarity', tip:'Short sentences, professional tone, zero fillers. Confirm understanding at key points.' },
      { key:'callEssence',          label:'Call Essence',          tip:'Use "certainly", "happy to help", "absolutely" throughout to build genuine warmth.' },
      { key:'holdProcedure',        label:'Hold Procedure',        tip:'Ask permission, state expected wait time, thank them on return — every time.' },
      { key:'extraMile',            label:'Extra Mile',            tip:'Proactively share a useful tip or related info beyond the specific query asked.' },
      { key:'callClosing',          label:'Call Closing',          tip:'"Is there anything else I can help you with?" + warm sign-off — every call.' }
    ];
    // Show ONLY scored criteria (no N/A cards); worst-first so priority is obvious
    const displayMC = [...MC_CRIT2]
      .filter(c => typeof mcCom[c.key] === 'number')
      .sort((a, b) => (mcCom[a.key] ?? 5) - (mcCom[b.key] ?? 5))
      .slice(0, 6);
    const priorityMC = displayMC[0]?.label || 'Call Handling';

    s3.addShape(pptx.ShapeType.rect, { x:0, y:0.82, w:W/2, h:0.5, fill:{color:C.green}, line:noBorder });
    s3.addText('✨  Development Areas (prioritised):', { x:0.1, y:0.82, w:W/2-0.15, h:0.5, fontSize:10, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });
    s3.addShape(pptx.ShapeType.rect, { x:W/2, y:0.82, w:W/2, h:0.5, fill:{color:C.amber}, line:noBorder });
    s3.addText(`🎯  Priority: '${priorityMC}' — highest-impact area`, { x:W/2+0.1, y:0.82, w:W/2-0.2, h:0.5, fontSize:10, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });

    const mcCols=[0.15,3.42,6.69], mcCW=3.08, mcCH=0.84, mcCGap=0.08, mcStartY=1.42;
    if (displayMC.length === 0) {
      s3.addShape(pptx.ShapeType.rect, { x:0.15, y:mcStartY, w:W-0.3, h:0.84, fill:{color:C.white}, line:{color:C.divider,pt:0.75} });
      s3.addShape(pptx.ShapeType.rect, { x:0.15, y:mcStartY, w:0.08, h:0.84, fill:{color:C.muted}, line:noBorder });
      s3.addText('No detailed breakdown available for this session.', { x:0.33, y:mcStartY+0.10, w:W-0.6, h:0.60, fontSize:11, color:C.muted, fontFace:'Calibri', valign:'middle' });
    } else {
      displayMC.forEach((c, idx) => {
        const col=idx%3, row=Math.floor(idx/3);
        const cx=mcCols[col], cy=mcStartY+row*(mcCH+mcCGap);
        const score = mcCom[c.key];
        const sc = score >= 4 ? C.teal : C.amber;
        s3.addShape(pptx.ShapeType.rect, { x:cx, y:cy, w:mcCW, h:mcCH, fill:{color:C.white}, line:{color:C.divider,pt:0.75} });
        s3.addShape(pptx.ShapeType.rect, { x:cx, y:cy, w:0.08, h:mcCH, fill:{color:sc}, line:noBorder });
        s3.addText(c.label,        { x:cx+0.15, y:cy+0.07, w:mcCW-0.85, h:0.3, fontSize:10.5, bold:true, color:C.darkNav, fontFace:'Calibri' });
        s3.addText(`${score}/5`,   { x:cx+mcCW-0.72, y:cy+0.07, w:0.6, h:0.3, fontSize:10.5, bold:true, color:sc, align:'right', fontFace:'Calibri' });
        s3.addText(c.tip,          { x:cx+0.15, y:cy+0.37, w:mcCW-0.25, h:0.42, fontSize:8, color:C.muted, wrap:true, fontFace:'Calibri' });
      });
    }

    // ── SLIDE 4 — Listening & Grammar ────────────────────────────────────────────
    const s4 = pptx.addSlide();
    s4.background = { color: C.lightBg };
    s4.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:0.82, fill:{color:C.navy}, line:noBorder });
    s4.addText('👂  Listening & Grammar Feedback', { x:0.25, y:0.08, w:W-0.5, h:0.66, fontSize:20, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });
    s4.addShape(pptx.ShapeType.rect, { x:4.87, y:0.9, w:0.06, h:H-1.05, fill:{color:C.divider}, line:noBorder });

    // LEFT — Listening
    const laSess2 = details['listening-assessment'] || [];
    const latestLA = laSess2.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt))[0];
    const laSecs   = latestLA?.aiScores?.sections || [];
    const laStrong = laSecs.filter(s=>s.pct>=60).map(s=>`✓ Good performance in ${s.title}`);
    const laWeak   = laSecs.filter(s=>s.pct<60).map(s=>`→ ${s.title} — needs focused practice`);
    if (!laSecs.length) { laStrong.push('✓ Demonstrates ability to follow spoken instructions'); laWeak.push('→ Focus on capturing finer details while listening'); laWeak.push('→ Avoid assumptions; verify before responding'); }

    s4.addShape(pptx.ShapeType.rect, { x:0.18, y:0.9, w:4.55, h:0.42, fill:{color:C.teal}, line:noBorder });
    s4.addText(`👂  Listening · ${fmt2(lisMark)} / 20`, { x:0.22, y:0.9, w:4.5, h:0.42, fontSize:12, bold:true, color:C.white, valign:'middle', fontFace:'Calibri' });
    let laY=1.38;
    laStrong.slice(0,2).forEach(txt=>{ s4.addShape(pptx.ShapeType.rect,{x:0.18,y:laY,w:4.55,h:0.44,fill:{color:C.white},line:{color:C.divider,pt:0.5}}); s4.addShape(pptx.ShapeType.rect,{x:0.18,y:laY,w:0.08,h:0.44,fill:{color:C.green},line:noBorder}); s4.addText(txt,{x:0.32,y:laY+0.04,w:4.3,h:0.36,fontSize:9.5,color:C.darkNav,fontFace:'Calibri',wrap:true,insetT:0.02,insetB:0.02}); laY+=0.49; });
    s4.addShape(pptx.ShapeType.rect, { x:0.18, y:laY, w:4.55, h:0.29, fill:{color:C.amber}, line:noBorder });
    s4.addText('Areas of Improvement', { x:0.22, y:laY, w:4.5, h:0.29, fontSize:9.5, bold:true, color:C.white, valign:'middle', fontFace:'Calibri' });
    laY+=0.33;
    laWeak.slice(0,3).forEach(txt=>{ s4.addShape(pptx.ShapeType.rect,{x:0.18,y:laY,w:4.55,h:0.44,fill:{color:C.white},line:{color:C.divider,pt:0.5}}); s4.addShape(pptx.ShapeType.rect,{x:0.18,y:laY,w:0.08,h:0.44,fill:{color:C.amber},line:noBorder}); s4.addText(txt,{x:0.32,y:laY+0.04,w:4.3,h:0.36,fontSize:9.5,color:C.darkNav,fontFace:'Calibri',wrap:true,insetT:0.02,insetB:0.02}); laY+=0.49; });

    // RIGHT — Grammar
    const GRAM_TOPICS2 = { 'A':'Multiple Choice — Tense, Articles, Basic Grammar Rules', 'B':'Fill in the Blanks — Articles (a/an/the), Prepositions, Conjunctions', 'C':'Sentence Rewriting — Tense Correction, Subject-Verb Agreement' };
    const gaSess2 = details['grammar-assessment'] || [];
    const latestGA2 = gaSess2.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt))[0];
    const gaSecs2   = latestGA2?.aiScores?.sections || [];
    const gaStrong  = gaSecs2.filter(s=>s.pct>=60).map(s=>`✓ Good performance in ${s.title}`);
    const gaWeak    = gaSecs2.filter(s=>s.pct<60).map(s=>{const l=(s.title||'').match(/Section\s+([A-C])/i)?.[1]?.toUpperCase()||'';return `→ ${GRAM_TOPICS2[l]||s.title}`;});
    if (!gaSecs2.length) { gaStrong.push('✓ Shows understanding of basic grammar concepts'); gaWeak.push('→ Articles (a/an/the) and Prepositions (in/on/at)'); gaWeak.push('→ Sentence rewriting and tense correction'); }

    s4.addShape(pptx.ShapeType.rect, { x:5.05, y:0.9, w:4.75, h:0.42, fill:{color:C.darkNav}, line:noBorder });
    s4.addText(`📝  Grammar · ${fmt2(gaMark)} / 25`, { x:5.09, y:0.9, w:4.7, h:0.42, fontSize:12, bold:true, color:C.white, valign:'middle', fontFace:'Calibri' });
    let gaY=1.38;
    gaStrong.slice(0,2).forEach(txt=>{ s4.addShape(pptx.ShapeType.rect,{x:5.05,y:gaY,w:4.75,h:0.44,fill:{color:C.white},line:{color:C.divider,pt:0.5}}); s4.addShape(pptx.ShapeType.rect,{x:5.05,y:gaY,w:0.08,h:0.44,fill:{color:C.green},line:noBorder}); s4.addText(txt,{x:5.19,y:gaY+0.04,w:4.5,h:0.36,fontSize:9.5,color:C.darkNav,fontFace:'Calibri',wrap:true,insetT:0.02,insetB:0.02}); gaY+=0.49; });
    s4.addShape(pptx.ShapeType.rect, { x:5.05, y:gaY, w:4.75, h:0.29, fill:{color:C.amber}, line:noBorder });
    s4.addText('Areas of Improvement', { x:5.09, y:gaY, w:4.7, h:0.29, fontSize:9.5, bold:true, color:C.white, valign:'middle', fontFace:'Calibri' });
    gaY+=0.33;
    gaWeak.slice(0,3).forEach(txt=>{ s4.addShape(pptx.ShapeType.rect,{x:5.05,y:gaY,w:4.75,h:0.44,fill:{color:C.white},line:{color:C.divider,pt:0.5}}); s4.addShape(pptx.ShapeType.rect,{x:5.05,y:gaY,w:0.08,h:0.44,fill:{color:C.amber},line:noBorder}); s4.addText(txt,{x:5.19,y:gaY+0.04,w:4.5,h:0.36,fontSize:9.5,color:C.darkNav,fontFace:'Calibri',wrap:true,insetT:0.02,insetB:0.02}); gaY+=0.49; });

    // ── SLIDE 5 — Overall Diagnosis ──────────────────────────────────────────────
    const s5 = pptx.addSlide();
    s5.background = { color: C.lightBg };
    s5.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:0.82, fill:{color:C.navy}, line:noBorder });
    s5.addText('Overall Diagnosis', { x:0.25, y:0.08, w:W-0.5, h:0.66, fontSize:20, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });

    const tot = totalMark ?? 0;
    const modMap = [['Pick & Speak',(psMark??0)/20*100],['Listening',(lisMark??0)/20*100],['Grammar',(gaMark??0)/25*100],['Mock Call',(mcMark??0)/20*100]];
    const bestMod = [...modMap].sort(([,a],[,b])=>b-a)[0]?.[0];
    const weakMod = [...modMap].sort(([,a],[,b])=>a-b)[0]?.[0];
    let overallLines, insightLines;
    if (tot >= 70) {
      overallLines = [
        `${name} demonstrates consistently high communication standards across all assessment modules.`,
        `${bestMod} stands out as the strongest area, reflecting strong preparation and professional delivery.`,
        `Overall performance is above average and ready for advanced client-facing responsibilities.`
      ];
      insightLines = [
        `The foundation is solid — focus now on converting good scores into excellent ones.`,
        `${weakMod} offers the biggest opportunity for improvement with targeted daily practice.`,
        `Schedule weekly self-review sessions to catch and correct micro-patterns early.`
      ];
    } else if (tot >= 55) {
      overallLines = [
        `${name} shows a solid foundation across the Communicate 360 assessment modules.`,
        `${bestMod ? `${bestMod} stands out as the strongest area, indicating clear natural aptitude.` : 'Active participation has laid the groundwork for measurable improvement.'}`,
        `With structured and consistent effort, the gap to high performance is well within reach.`
      ];
      insightLines = [
        `${weakMod} is the highest-priority area — targeted practice here will yield the fastest gains.`,
        `A consistent 15–20 minute daily routine covering grammar, listening and speaking will compound quickly.`,
        `Focus on quality of practice, not just quantity — self-correct every error and track weekly progress.`
      ];
    } else {
      overallLines = [
        `${name} has actively engaged with the Communicate 360 program across all assessment modules.`,
        `${bestMod ? `Early promise is visible in ${bestMod} — this is the foundation to build on.` : 'The foundation is being built — consistency now will accelerate future progress.'}`,
        `Dedicated daily practice is needed to convert participation into consistent, measurable skill.`
      ];
      insightLines = [
        `Start with the fundamentals: active listening, structured speaking and daily grammar review.`,
        `${weakMod} needs the most immediate attention — commit to focused 20-minute daily practice sessions.`,
        `Track weekly progress and celebrate small wins — every consistent session builds real momentum.`
      ];
    }
    const overallTxt = overallLines.join('\n');
    const insightTxt = insightLines.join('\n');

    s5.addShape(pptx.ShapeType.rect, { x:0.28, y:1.05, w:W-0.56, h:1.9, fill:{color:C.white}, line:{color:C.divider,pt:1} });
    s5.addShape(pptx.ShapeType.rect, { x:0.28, y:1.05, w:0.1,   h:1.9, fill:{color:C.green},  line:noBorder });
    s5.addText('Overall Assessment', { x:0.48, y:1.1, w:W-0.88, h:0.34, fontSize:12, bold:true, color:C.navy, fontFace:'Calibri' });
    s5.addText(overallTxt, { x:0.48, y:1.48, w:W-0.88, h:1.4, fontSize:11, color:C.darkNav, wrap:true, fontFace:'Calibri', valign:'top', lineSpacingMultiple:1.35 });

    s5.addShape(pptx.ShapeType.rect, { x:0.28, y:3.12, w:W-0.56, h:1.93, fill:{color:C.white}, line:{color:C.divider,pt:1} });
    s5.addShape(pptx.ShapeType.rect, { x:0.28, y:3.12, w:0.1,    h:1.93, fill:{color:C.orange}, line:noBorder });
    s5.addText('Core Insight', { x:0.48, y:3.17, w:W-0.88, h:0.34, fontSize:12, bold:true, color:C.navy, fontFace:'Calibri' });
    s5.addText(insightTxt, { x:0.48, y:3.55, w:W-0.88, h:1.44, fontSize:11, color:C.darkNav, wrap:true, fontFace:'Calibri', valign:'top', lineSpacingMultiple:1.35 });

    // ── SLIDE 6 — Development Roadmap ────────────────────────────────────────────
    // Layout matches reference PPT exactly:
    //   Left teal panel  x=0.45 w=1.30 — only "Step N" centred
    //   Right dark panel x=1.85 w=7.50 — short bullet lines 11pt white
    //   Row gap = 0.08", footer at y=5.23
    const s6 = pptx.addSlide();
    s6.background = { color: C.navy };
    // Mint left stripe (full height)
    s6.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.18, h:H, fill:{color:C.mint}, line:noBorder });
    // Title
    s6.addText('🚀  Development Roadmap', { x:0.45, y:0.13, w:9.00, h:0.65, fontSize:26, bold:true, color:C.white, fontFace:'Calibri', valign:'middle' });

    const steps = buildRoadmapSteps(name, scores, details, marks);
    const n = steps.length;
    const rowGap  = 0.08;
    const areaY   = 0.91;
    const footerY = 5.23;
    const totalH  = footerY - areaY;                          // 4.32"
    const stepH   = (totalH - rowGap * (n - 1)) / n;         // distribute evenly

    steps.forEach((step, i) => {
      const sY      = areaY + i * (stepH + rowGap);
      const labelY  = sY + (stepH - 0.40) / 2;               // vertically centre "Step N"
      const content = step.lines.join('\n');

      // Row background (dark navy sidebar)
      s6.addShape(pptx.ShapeType.rect, { x:0.45, y:sY, w:9.10, h:stepH, fill:{color:C.sidebar}, line:noBorder });
      // Left teal panel
      s6.addShape(pptx.ShapeType.rect, { x:0.45, y:sY, w:1.30, h:stepH, fill:{color:C.teal},    line:noBorder });
      // Step label — centred in left panel
      s6.addText(`Step ${i + 1}`, { x:0.45, y:labelY, w:1.30, h:0.40, fontSize:11, bold:true, color:C.white, align:'center', fontFace:'Calibri', valign:'middle' });
      // Bullet lines — right content panel
      // Font 10.5pt + lineSpacing 1.1 + explicit small insets ensure 4 lines never overflow
      // into the next row's background rect (verified: 4×10.5pt×1.1 = 0.64" < 0.88" box)
      s6.addText(content, { x:1.85, y:sY + 0.08, w:7.50, h:stepH - 0.14, fontSize:10.5, color:C.white, fontFace:'Calibri', valign:'top', wrap:true, lineSpacingMultiple:1.1, insetT:0.04, insetB:0.03 });
    });

    // Footer bar
    s6.addShape(pptx.ShapeType.rect, { x:0, y:footerY, w:W, h:0.40, fill:{color:C.teal}, line:noBorder });
    s6.addText(`Consistent practice is the key. You've got this, ${name}! 💪`, { x:0.30, y:footerY + 0.03, w:9.00, h:0.35, fontSize:11, bold:true, color:C.white, align:'center', fontFace:'Calibri', valign:'middle' });

    const filename = `${name.replace(/\s+/g,'_')}_Performance_Report.pptx`;
    await pptx.writeFile({ fileName: filename });
  }

  async function downloadTraineePPT() {
    if (!_currentReportData) { toast('Please select a trainee first', 'error'); return; }
    const btn = document.getElementById('lrc-ppt-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⌛ Generating…'; }
    try {
      const { trainee, marks, scores, details } = _currentReportData;
      await generateTraineePPT(trainee, marks, scores, details);
    } catch (e) {
      console.error('PPT generation failed:', e);
      toast('PPT generation failed: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⬇ Download PPT'; }
    }
  }

  async function copyLetter() {
    const body = document.getElementById('lrc-letter-body');
    const btn  = document.getElementById('lrc-copy-btn');
    if (!body || !btn) return;

    try {
      // Build a plain-text version for apps that only accept text
      const plainText = body.innerText;

      // Try rich (HTML) copy first so Word / Outlook / Gmail paste with formatting
      if (window.ClipboardItem) {
        const htmlBlob  = new Blob([body.innerHTML], { type: 'text/html' });
        const textBlob  = new Blob([plainText],      { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
      } else {
        // Fallback: plain text
        await navigator.clipboard.writeText(plainText);
      }

      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy to Clipboard'; }, 2500);
    } catch (err) {
      console.error('Copy failed:', err);
      btn.textContent = '❌ Copy failed';
      setTimeout(() => { btn.textContent = '📋 Copy to Clipboard'; }, 2500);
    }
  }

  async function loadTraineeReport(traineeId) {
    const [trainee, sessions] = await Promise.all([
      DB.get('trainees', traineeId),
      DB.getByIndex('sessions', 'traineeId', traineeId)
    ]);
    if (!trainee) return;
    $('report-content').classList.remove('hidden');

    // ── Module scores ──
    const { scores, details } = computeAgentScores(traineeId, sessions);
    const r2 = v => v != null ? parseFloat(v.toFixed(2)) : null;

    const lisMark = scores['listening-assessment'] != null ? r2(scores['listening-assessment'] / 100 * 20) : null;
    const psMark  = scores['pick-speak']            != null ? r2(scores['pick-speak']            / 100 * 20) : null;
    const gaMark  = scores['grammar-assessment']    != null ? r2(scores['grammar-assessment']    / 100 * 25) : null;
    const mcMark  = scores['mock-call']             != null ? r2(scores['mock-call']             / 100 * 20) : null;

    // ── Total score: use Excel master total (W) directly for exact match ──
    // Falls back to sum of module marks if trainee not found in master sheet.
    let totalMark = null;
    try {
      const ms = getMasterScores(trainee.name);
      if (ms && typeof ms.totalScore === 'number' && ms.totalScore > 0) {
        totalMark = r2(ms.totalScore);  // use pre-computed Excel grand total
      }
    } catch (_) { /* fall back gracefully */ }

    if (totalMark === null) {
      // Fallback: sum of whatever module marks are available
      const allMarks = [lisMark, psMark, gaMark, mcMark].filter(x => x != null);
      totalMark = allMarks.length ? r2(allMarks.reduce((a, b) => a + b, 0)) : null;
    }

    // ── Render letter ──
    const insights = buildLetterInsights(scores, details, totalMark);
    renderTraineeLetter(trainee, { lisMark, psMark, gaMark, mcMark, totalMark }, insights);
    _currentReportData = { trainee, marks: { lisMark, psMark, gaMark, mcMark, totalMark }, scores, details };

    // ── Session history table ── (same P&S avg logic as before)
    const PS_MODS = new Set(['pick-speak', 'pick-speak-general', 'pick-speak-stock']);
    const rPsList = [];
    sessions.forEach(s => {
      if (!PS_MODS.has(s.module)) return;
      const aN = s.adminScores ? (calcAdminAvg(s.adminScores) ?? null) : null;
      const iN = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
      const eff = aN !== null ? aN : iN;
      if (eff !== null) rPsList.push({ id: s.id, eff });
    });
    let rPsBestId = null, rPsAvgOfAll = null;
    if (rPsList.length) {
      rPsBestId   = rPsList.reduce((a, b) => b.eff > a.eff ? b : a).id;
      rPsAvgOfAll = parseFloat((rPsList.reduce((s, x) => s + x.eff, 0) / rPsList.length).toFixed(1));
    }

    const tbody = $('report-sessions-tbody');
    tbody.innerHTML = sessions.length === 0
      ? `<tr><td colspan="6" class="empty-state">No sessions yet.</td></tr>`
      : sessions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).map(s => {
          const rAI   = s.aiScores    ? (normalizeOverall(s.aiScores.overall) ?? null) : null;
          const rAdm  = s.adminScores ? (calcAdminAvg(s.adminScores)          ?? null) : null;
          let rAvg;
          if (PS_MODS.has(s.module)) {
            rAvg = (s.id === rPsBestId && rPsAvgOfAll !== null) ? rPsAvgOfAll : 'N/A';
          } else {
            rAvg = (rAI !== null && rAdm !== null)
              ? parseFloat(((rAI + rAdm) / 2).toFixed(1))
              : (rAdm !== null ? rAdm : (rAI !== null ? rAI : '—'));
          }
          return `<tr>
            <td>${moduleBadge(s.module)}</td>
            <td>${s.topicTitle || '—'}</td>
            <td>${formatDate(s.submittedAt).split(' ')[0]}</td>
            <td>${rAI  !== null ? rAI  + '/100' : '—'}</td>
            <td>${rAdm !== null ? rAdm + '/100' : '—'}</td>
            <td style="font-weight:600;color:${rAvg === 'N/A' || rAvg === '—' ? 'var(--text-muted)' : '#1d4ed8'}">${rAvg !== '—' && rAvg !== 'N/A' ? rAvg + '/100' : rAvg}</td>
          </tr>`;
        }).join('');
  }

  function drawRadarChart(trainee, sessions, modAvgs) {
    const canvas = $('report-radar');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 30;

    ctx.clearRect(0, 0, W, H);

    const modules = Object.keys(MODULE_LABELS);
    const angles = modules.map((_, i) => (i / modules.length) * Math.PI * 2 - Math.PI / 2);
    const avgMap = {};
    modAvgs.forEach(m => { avgMap[m.module] = m.avg; });

    // Draw grid
    [1, 2, 3, 4, 5].forEach(level => {
      ctx.beginPath();
      modules.forEach((_, i) => {
        const ratio = level / 5;
        const x = cx + r * ratio * Math.cos(angles[i]);
        const y = cy + r * ratio * Math.sin(angles[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw axes
    modules.forEach((_, i) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angles[i]), cy + r * Math.sin(angles[i]));
      ctx.strokeStyle = '#e2e8f0';
      ctx.stroke();
    });

    // Draw data
    if (modAvgs.length > 0) {
      ctx.beginPath();
      modules.forEach((mod, i) => {
        const val = avgMap[mod] || 0;
        const ratio = val / 5;
        const x = cx + r * ratio * Math.cos(angles[i]);
        const y = cy + r * ratio * Math.sin(angles[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(59,130,246,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Dots
      modules.forEach((mod, i) => {
        const val = avgMap[mod] || 0;
        const ratio = val / 5;
        const x = cx + r * ratio * Math.cos(angles[i]);
        const y = cy + r * ratio * Math.sin(angles[i]);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
      });
    }

    // Labels
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    modules.forEach((mod, i) => {
      const lx = cx + (r + 22) * Math.cos(angles[i]);
      const ly = cy + (r + 22) * Math.sin(angles[i]);
      const short = { 'pick-speak': 'P&S', 'mock-call': 'Call', 'role-play': 'Role', 'group-discussion': 'GD', 'written-comm': 'Written' };
      ctx.fillText(short[mod] || mod, lx, ly + 4);
    });
  }

  // ---- Settings ----
  function initSettings() {
    $('btn-save-pwd').onclick = async () => {
      const np = $('new-pwd').value;
      const cp = $('confirm-pwd').value;
      const msg = $('pwd-msg');
      if (!np) { msg.textContent = 'Please enter a new password.'; msg.style.color = 'red'; return; }
      if (np !== cp) { msg.textContent = 'Passwords do not match.'; msg.style.color = 'red'; return; }
      await DB.put('settings', { key: 'adminPassword', value: np });
      $('new-pwd').value = '';
      $('confirm-pwd').value = '';
      msg.textContent = 'Password updated successfully!';
      msg.style.color = 'green';
      toast('Password saved!', 'success');
    };

    // Claude AI Scoring — now proxied via Cloudflare Worker (key is server-side)
    const apiStatus = $('api-key-status');
    if (apiStatus) {
      const proxyUrl = CONFIG.CLAUDE_PROXY_URL || '';
      if (proxyUrl && !proxyUrl.includes('YOUR_WORKER')) {
        apiStatus.textContent = '✓ Cloudflare Worker proxy configured — AI scoring is active.';
        apiStatus.style.color = 'green';
      } else {
        apiStatus.textContent = '⚠ Cloudflare Worker URL not set in config.js — using JS phrase analysis fallback.';
        apiStatus.style.color = '#b45309';
      }
    }

    $('btn-clear-data').onclick = async () => {
      if (!confirm('This will delete ALL trainee sessions and assessment data. Topics will be re-seeded. Continue?')) return;
      const sessions = await DB.getAll('sessions');
      for (const s of sessions) await DB.del('sessions', s.id);
      const trainees = await DB.getAll('trainees');
      for (const t of trainees) await DB.del('trainees', t.id);
      sessionStorage.removeItem('adminAuth');
      toast('All data cleared. Reloading...', '');
      setTimeout(() => location.reload(), 1200);
    };
  }

  // ---- Init ----
  async function init() {
    await DB.init();
    initAuth();
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

    // ── Mock Call ─────────────────────────────────────────────────
    const mc = scores['mock-call'];
    if (mc !== null && mc !== undefined) {
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
        actions.push('Active Listening: Listen to a 5-minute financial news podcast (ET Money / Zerodha Varsity audio) each day. Pause at the end, write a 5-point summary without replaying. Then re-listen and compare — close the gaps in what you missed.');
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

    // Grammar
    const gaSess = ts.filter(s => s.module === 'grammar-assessment');
    if (gaSess.length) {
      const vals = gaSess.map(s => s.aiScores ? (normalizeOverall(s.aiScores.overall) ?? null) : null).filter(x => x !== null);
      if (vals.length) {
        scores['grammar-assessment'] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
        details['grammar-assessment'] = gaSess;
      }
    }

    // Listening
    const laSess = ts.filter(s => s.module === 'listening-assessment');
    if (laSess.length) {
      const vals = laSess.map(s => s.aiScores ? (normalizeOverall(s.aiScores.overall) ?? null) : null).filter(x => x !== null);
      if (vals.length) {
        scores['listening-assessment'] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
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
      const modules = [
        { key: 'pick-speak',          label: 'Pick & Speak',  color: '#3b82f6' },
        { key: 'mock-call',           label: 'Mock Call',     color: '#8b5cf6', pending: scores['mock-call'] == null },
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
            <div class="aar-report-sub">Generated on ${today} &nbsp;·&nbsp; Modules: Pick &amp; Speak · Mock Call · Grammar · Listening &nbsp;·&nbsp; Mock Call scores shown as AI scores where admin has not yet scored</div>
          </div>
          <button class="btn-secondary aar-print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
        </div>

        <div class="card" style="overflow-x:auto;margin-bottom:1.5rem">
          <table class="data-table" style="min-width:560px">
            <thead>
              <tr>
                <th>Agent</th>
                <th style="text-align:center">Pick &amp; Speak</th>
                <th style="text-align:center">Mock Call</th>
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
    _selectedSessionIds.clear();
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
  const _AI_AUDIT_SEED = [{"id":"48ba3d37-765a-4929-9ae5-1a0e67018aba","name":"Manigandan","selfAssessmentScore":7.027,"aiAuditScore":3.91},{"id":"20d684f1-8ce0-4122-95be-bf85f2b4f73c","name":"Swati Sharma","selfAssessmentScore":8.1081,"aiAuditScore":3.87},{"id":"ec0bae65-02aa-4a02-96ea-dbaa676141ec","name":"Himanshu Singh Rawat","selfAssessmentScore":9.0811,"aiAuditScore":3.865},{"id":"ab5e92b0-c8d5-4c0f-94a4-c787653f5e2b","name":"Aldrich Frewin Dsouza","selfAssessmentScore":8.6486,"aiAuditScore":3.8},{"id":"509365e4-4e6d-4947-9846-171c99e781c3","name":"Surya Hendry","selfAssessmentScore":8.3243,"aiAuditScore":0.36},{"id":"3c1544f1-f563-49ee-bed2-7d27c6600542","name":"Mohd Altaf Bhutta","selfAssessmentScore":7.2973,"aiAuditScore":3.945},{"id":"0c9484d1-4fcd-4c9f-98d8-d113fca827ec","name":"Ashish Yadav","selfAssessmentScore":7.2973,"aiAuditScore":3.89},{"id":"eb1c3281-6495-4a96-a835-902197877f80","name":"Jayanthi Maniram","selfAssessmentScore":7.6757,"aiAuditScore":3.965},{"id":"d51480cb-e64c-43b7-9e40-e84c254c5009","name":"Tulsi Shankar Solanki","selfAssessmentScore":8.973,"aiAuditScore":3.925},{"id":"9ff5c6a0-e2dc-4af3-a327-4bea24f3d0d8","name":"Adwait Keshavraj Gondkar","selfAssessmentScore":6.7568,"aiAuditScore":4.05},{"id":"685381a9-c39e-4ad2-903a-4cb588ccb0e1","name":"Javed Umar Masute","selfAssessmentScore":7.6216,"aiAuditScore":4.06},{"id":"bbd14b82-63e5-4afc-a01a-b6dd156124c4","name":"Israel Jaisingh","selfAssessmentScore":7.8378,"aiAuditScore":3.84},{"id":"f30e86f5-790d-4afb-8640-3f7a5e840373","name":"Priya Singh","selfAssessmentScore":9.5676,"aiAuditScore":3.865},{"id":"380e4088-0aec-4de7-8a89-cb816a4311a7","name":"Rashid Firoz Ahmed Ansari","selfAssessmentScore":7.5135,"aiAuditScore":3.55},{"id":"a02ccf01-e93e-4bd2-8d85-dbc7fefbae0d","name":"Salman Batliwala","selfAssessmentScore":6.8108,"aiAuditScore":3.89},{"id":"0d7c7e31-c98d-4aab-8748-ddc6ed4f5e50","name":"Amit Sharma Rajeshwar","selfAssessmentScore":7.4054,"aiAuditScore":3.955},{"id":"6d7845af-4270-4411-a5f3-1c3869a8a143","name":"Naved Abdul Latif Qureshi","selfAssessmentScore":8.7027,"aiAuditScore":3.89},{"id":"e46697d3-f782-4556-b0b4-26142bd6a12c","name":"Vishal Shivsahay Singh","selfAssessmentScore":8.2703,"aiAuditScore":4.005},{"id":"29a09f12-0c97-4b37-b810-9a5f42ae648a","name":"Shweta Anil Tiwari","selfAssessmentScore":6.1081,"aiAuditScore":3.66},{"id":"b3a082ea-0372-4c6d-b6ed-0ff168ae4a32","name":"Chitra Mulchand Raghani","selfAssessmentScore":9.4054,"aiAuditScore":3.885},{"id":"cd88baa1-de3a-466a-a5ef-a22ff524b1cc","name":"Irfan Mustafa Shaikh","selfAssessmentScore":9.6757,"aiAuditScore":3.91},{"id":"692f341b-6151-4ca6-8cab-88c02b3acf02","name":"Pragya Agrawal","selfAssessmentScore":9.2432,"aiAuditScore":3.765},{"id":"d4cc08b6-4468-49c3-a574-d37d3c2d0c74","name":"Abdul Razak","selfAssessmentScore":9.2432,"aiAuditScore":3.945},{"id":"1c5f7579-4fe0-43a1-839f-3501960d17bc","name":"Himanshu Narula","selfAssessmentScore":7.1892,"aiAuditScore":3.865},{"id":"312b7d65-51ff-47e0-8681-5ca1edae26b6","name":"Ankit","selfAssessmentScore":7.4595,"aiAuditScore":3.855},{"id":"7b7315d1-6138-44fd-8293-0873f04d40da","name":"Love Preet Singh","selfAssessmentScore":7.8919,"aiAuditScore":3.705},{"id":"5e530e0b-9997-4fb2-bee0-c4a893cb3803","name":"Shivanagoud Huvanagoud Ninganagoudar","selfAssessmentScore":7.7297,"aiAuditScore":3.92},{"id":"56663fea-2af2-44ee-a709-899b1ecf5cac","name":"Nivedita Mukherjee","selfAssessmentScore":7.4595,"aiAuditScore":3.725},{"id":"911fcc3a-d4cd-4245-8b86-670c1f6f1ba3","name":"Mohit Sharma","selfAssessmentScore":8.3243,"aiAuditScore":4.005},{"id":"388fe495-0ca8-431b-891e-51f4ab08dbbb","name":"Avinash Bhagwanrao Pawde","selfAssessmentScore":6.5405,"aiAuditScore":3.665},{"id":"681fbfd0-14b5-4a80-bda9-3c9a920c9807","name":"Diksha U Rane","selfAssessmentScore":6.4324,"aiAuditScore":3.8},{"id":"b2f73ccf-8f0f-4d6e-8f2d-c7bd8b3895f6","name":"Prashant Tiwari","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"30961a0f-5bfd-448d-b399-3747fd0786dc","name":"Vijay Kumar N","selfAssessmentScore":7.4595,"aiAuditScore":3.765},{"id":"3b666171-89cc-4d40-af03-f0df6bfe91e5","name":"K G Saroj","selfAssessmentScore":6.5405,"aiAuditScore":3.825},{"id":"169469e9-1dde-430a-802f-f3e6125393e9","name":"Ayachi Mishra","selfAssessmentScore":8.7027,"aiAuditScore":3.885},{"id":"5b15de0f-e5d2-4a69-b07a-86d12641acbc","name":"Naveenkumar Ayyangoudar","selfAssessmentScore":7.4595,"aiAuditScore":3.945},{"id":"60024f5a-e582-49ce-ab86-d930bbe5f47c","name":"Indranil Bose","selfAssessmentScore":8.6486,"aiAuditScore":3.965},{"id":"c4b4c12d-f5e2-42ee-84a5-2b620f59b0ce","name":"Seema K S","selfAssessmentScore":9.3514,"aiAuditScore":4.02},{"id":"636248a5-9270-472e-8ba3-f905de1523fd","name":"D Karthik","selfAssessmentScore":9.4054,"aiAuditScore":3.81},{"id":"052b4e8f-3ff9-4088-82a1-e60b22d2096b","name":"Anupama H","selfAssessmentScore":9.5135,"aiAuditScore":4.005},{"id":"4091cd28-3c7b-4fd1-b8c2-fef685751e86","name":"Ankita Das","selfAssessmentScore":9.1351,"aiAuditScore":3.96},{"id":"d4eed1ed-60f9-482b-81c4-968d43572601","name":"Stavan Bhardwaj","selfAssessmentScore":9.1892,"aiAuditScore":4.14},{"id":"69dd759d-37e4-4bf7-be27-e412531dbd7b","name":"Ankit Raj","selfAssessmentScore":9.8378,"aiAuditScore":3.855},{"id":"2f6fa9dd-d125-4a89-b3f0-0fa69e70035c","name":"N S Sindhu","selfAssessmentScore":8.8649,"aiAuditScore":3.855},{"id":"39acb824-705d-4771-9249-e7946886ae33","name":"Shefali Tyagi","selfAssessmentScore":18.5,"aiAuditScore":3.725},{"id":"cc5c7542-b48c-4eac-b21c-e20d3386058e","name":"Saneeth T S","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"f19fc47e-ef0c-4136-80f2-6e6ea919ffa5","name":"Aditya Anil Korde","selfAssessmentScore":15.8,"aiAuditScore":3.805},{"id":"11726dfa-969e-4a1c-baff-855230449a03","name":"Shahrukh Shaikh","selfAssessmentScore":14.7,"aiAuditScore":3.885},{"id":"3e115365-3fba-4144-9f27-d6d1e98c0f99","name":"Gorak Vani","selfAssessmentScore":14.4,"aiAuditScore":3.71},{"id":"98c60454-99b8-49c5-925b-669ee97b10d1","name":"Rajat Gupta","selfAssessmentScore":15.4,"aiAuditScore":3.76},{"id":"2ef1a2d2-542a-41eb-8b87-e76101b62d07","name":"Bhagesh paithankar","selfAssessmentScore":14.1,"aiAuditScore":3.69},{"id":"01810360-e520-4d62-a7dc-03b323ee4a4e","name":"Akash Kumar Singh","selfAssessmentScore":16.0,"aiAuditScore":3.905},{"id":"d7fb38f1-f10d-41b0-8b87-c0aaa51184ed","name":"Bhavna Deepak Porwal","selfAssessmentScore":8.8,"aiAuditScore":3.685},{"id":"826ac9e5-99fe-4d88-9253-66801df033da","name":"Bana Gari Naresh Kumar","selfAssessmentScore":15.9,"aiAuditScore":3.66},{"id":"b2ab2d1d-0401-462a-b759-4f3ceb5d0049","name":"Sritam Prusty","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"69e6646e-4c13-41f4-ba5f-76938f1f963d","name":"Mahesh Mohan Prabhu","selfAssessmentScore":13.9,"aiAuditScore":3.94},{"id":"5ccc85a4-21f4-4698-8588-e5ce6d2f1010","name":"Haritha K","selfAssessmentScore":9.0811,"aiAuditScore":4.1},{"id":"8fa4d34e-65a8-4158-85be-6a8f5a646f8d","name":"Umang Jain","selfAssessmentScore":8.973,"aiAuditScore":3.92},{"id":"2c602f2f-cd89-4a48-b9cc-2ca0ea4bfde5","name":"Rahul Ranjan Roy","selfAssessmentScore":8.2703,"aiAuditScore":3.97},{"id":"cd686e2a-4653-422c-9124-cb4bb712e3bf","name":"Vansh Arora","selfAssessmentScore":8.4865,"aiAuditScore":3.895},{"id":"7c8984f6-96f7-4615-9ac0-4e93c0049796","name":"Deepika S","selfAssessmentScore":9.027,"aiAuditScore":3.825},{"id":"2eddfb2a-a472-40b6-ac88-22ed2cdefa3a","name":"Muthu Anusuya P","selfAssessmentScore":7.7297,"aiAuditScore":3.66},{"id":"e8c53f97-bff7-4473-a55e-3fec6cf14ca9","name":"Aman Sharma","selfAssessmentScore":8.1622,"aiAuditScore":3.585},{"id":"39610dee-9689-48a7-9ddd-bea33d3d09d8","name":"Vickey Sharma","selfAssessmentScore":8.5405,"aiAuditScore":4.03},{"id":"539142d3-cfbe-4ab2-870b-959173e034aa","name":"Sahib Singh","selfAssessmentScore":8.973,"aiAuditScore":3.86},{"id":"30e50f8a-9d43-4512-8cf6-5481e8e83025","name":"M Sunny","selfAssessmentScore":8.4865,"aiAuditScore":3.89},{"id":"b3314c0d-933d-4d79-ae6a-7481e64148e0","name":"Nishikant Tiwari","selfAssessmentScore":8.4324,"aiAuditScore":3.855},{"id":"b71a8bee-b796-42b5-acdc-4715d18ad95b","name":"Chetan Patil","selfAssessmentScore":8.7027,"aiAuditScore":3.98},{"id":"b40c6957-b049-4dee-9fd3-c66f9936d4a6","name":"Nikhil V Durgude","selfAssessmentScore":9.4595,"aiAuditScore":3.92},{"id":"a0180668-7ada-4963-b39b-e4c768fb7318","name":"Swetha A","selfAssessmentScore":9.9459,"aiAuditScore":3.715},{"id":"831d1e0b-bfb6-4dd4-8430-0a022dce1719","name":"Shruthi K B","selfAssessmentScore":9.2973,"aiAuditScore":3.975},{"id":"8f672407-549b-423a-ae87-591646fd93b6","name":"Sachita G Harihar","selfAssessmentScore":9.6757,"aiAuditScore":3.77},{"id":"19e161e3-45eb-48b0-961a-425efb769f13","name":"Adnan Sahil S","selfAssessmentScore":9.5676,"aiAuditScore":4.1},{"id":"53d1c987-d951-4a60-ba31-22bcd848f8b4","name":"Mohammed Jabeer Khan","selfAssessmentScore":9.7838,"aiAuditScore":3.93},{"id":"adda17b7-5bb5-479d-b153-b4c3cf5bcc24","name":"Mutyala Dinesh","selfAssessmentScore":9.0811,"aiAuditScore":3.605},{"id":"fc38dfaf-462b-4f14-984a-027e8b861c0b","name":"Heeral Sonagare","selfAssessmentScore":7.5676,"aiAuditScore":3.72},{"id":"4d4fbc99-8546-4689-9699-ab20a57b1208","name":"Aryaman M Math","selfAssessmentScore":7.027,"aiAuditScore":3.605},{"id":"8d27d8d3-246c-4902-8f3a-1c684db2bee8","name":"Srusti Vishnukant Ladda","selfAssessmentScore":9.7297,"aiAuditScore":3.91},{"id":"fa101fa0-143b-4474-93b7-49c8e629d35d","name":"Maddu Vidya","selfAssessmentScore":6.8649,"aiAuditScore":3.89},{"id":"fa7a1fd8-9122-4bc9-97d7-e819c692907c","name":"Ankit Gupta","selfAssessmentScore":5.8919,"aiAuditScore":3.85},{"id":"c5aff930-a65f-4bb7-97d9-df27f8f000ee","name":"Rohit Anand","selfAssessmentScore":6.1622,"aiAuditScore":4.075},{"id":"da9fbdcb-d05d-40e9-8540-54deb3c2d6bc","name":"Ashish Pandey","selfAssessmentScore":9.0811,"aiAuditScore":3.885},{"id":"d3e64389-e387-4b3a-ab7a-917260614264","name":"Devanand Harinarayan Gupta","selfAssessmentScore":6.2703,"aiAuditScore":3.51},{"id":"f98aacca-27cf-440d-8195-a285215679ed","name":"Jerril Rajan","selfAssessmentScore":8.0,"aiAuditScore":4.06},{"id":"b2e0ed5a-cd83-46d5-add5-5119385989f6","name":"Jayanth Prasad B S","selfAssessmentScore":9.2432,"aiAuditScore":3.525},{"id":"1e0daa92-b237-4a59-8622-e002a6bda51f","name":"Arun P P","selfAssessmentScore":6.6486,"aiAuditScore":3.715},{"id":"4b33963b-e149-4383-b44e-008b50c3a958","name":"Sudhir Kumar Mishra","selfAssessmentScore":7.0811,"aiAuditScore":3.95},{"id":"3c03aa10-1468-4396-b219-da5e6da3892e","name":"Priyanshu Gupta","selfAssessmentScore":8.6486,"aiAuditScore":4.02},{"id":"cdcd4b5e-c316-4df9-8adc-ae33031dcdd5","name":"Vinayak Kini","selfAssessmentScore":9.5676,"aiAuditScore":3.93},{"id":"ae296815-f114-460d-beba-b3fa9993e7f8","name":"Benjamin Anand Mitra","selfAssessmentScore":6.2162,"aiAuditScore":3.98},{"id":"84a1e80b-adb0-4a23-8361-0701d4560e63","name":"Namreen I Bombaywale","selfAssessmentScore":7.6757,"aiAuditScore":3.82},{"id":"fbfd548f-336f-4455-8256-1f9153724c66","name":"Deva Sahaya Rubia","selfAssessmentScore":8.5946,"aiAuditScore":4.08},{"id":"4247cb3c-8bae-4a88-b93c-a5d035ff3019","name":"Geetha Bhandari","selfAssessmentScore":9.2432,"aiAuditScore":3.9},{"id":"30f53f98-cc50-45bc-997c-eeee967dc3ab","name":"Shaheen Ismail Dhaliet","selfAssessmentScore":8.9189,"aiAuditScore":3.91},{"id":"53ff95e2-2a4a-404c-8122-f568706110c7","name":"Sourav Basotia","selfAssessmentScore":8.5946,"aiAuditScore":3.775},{"id":"a1be9ecd-f9f7-4f1b-85d9-252ff9f93ac1","name":"Pratik Poddar","selfAssessmentScore":8.5405,"aiAuditScore":3.82},{"id":"22dd02d6-a0c0-4385-945c-2c8bf8ff1f8a","name":"Ashok Sunar","selfAssessmentScore":8.4324,"aiAuditScore":3.96},{"id":"f955c6a7-bd67-4826-b2d1-6186356061f1","name":"Anjali Gupta","selfAssessmentScore":8.4324,"aiAuditScore":3.735},{"id":"2543d279-f433-4872-9762-e776539ffad5","name":"M Keshava Naik","selfAssessmentScore":9.1892,"aiAuditScore":3.845},{"id":"3e894934-5817-49ed-b23b-97288b6e3e41","name":"Shankar Kumar","selfAssessmentScore":8.0541,"aiAuditScore":3.705},{"id":"d5ab17df-e8b6-40ca-ab64-084415ba8ce5","name":"Alihussain Basha Hyatkhan","selfAssessmentScore":7.6216,"aiAuditScore":3.925},{"id":"9e78616a-2e0d-4abb-a9b2-918101c933ea","name":"Suma Manjunath Tumbraguddi","selfAssessmentScore":9.0811,"aiAuditScore":3.965},{"id":"65f60033-31c8-437a-bf4b-efe5dbf98117","name":"Suresh Kumar Sahoo","selfAssessmentScore":9.6216,"aiAuditScore":3.905},{"id":"a98d54e8-9ce3-4762-bd50-627c886497d9","name":"Abhishek Tenginkai","selfAssessmentScore":8.0,"aiAuditScore":3.58},{"id":"d96a3c56-cda8-4044-a848-e976a0bd6330","name":"Ambaldhage Vinay Kumar","selfAssessmentScore":7.3514,"aiAuditScore":4.08},{"id":"b5cde1c8-a7d6-414e-9b28-2c0bc95dced9","name":"Lilesh Bhaskar Sapaliga","selfAssessmentScore":9.5135,"aiAuditScore":3.795},{"id":"eea5505d-6a38-45c2-9374-0ac1abe28b21","name":"Anand Jaiswal","selfAssessmentScore":8.4324,"aiAuditScore":3.765},{"id":"dd7a37b5-b768-4404-910d-bbb780c811d0","name":"Kamalpreet Kour","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"d22d1092-8b79-4d39-a4d7-d3535b5e3eee","name":"Ashish Thakur","selfAssessmentScore":8.5946,"aiAuditScore":3.91},{"id":"2571c59e-6dad-4b4a-97f8-41b56e4c17c1","name":"B H Srinivas Pai","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"1de57bc2-ce8b-43ac-905f-a1a377ac8770","name":"Sougata Das","selfAssessmentScore":7.027,"aiAuditScore":3.9},{"id":"56de0a91-86a0-4cbb-8f32-8bfdd6ced51e","name":"Arun Kumar M","selfAssessmentScore":8.7568,"aiAuditScore":3.935},{"id":"62124987-6b77-421d-91a3-9d68dfe6b2d3","name":"Rohit Basavaraj Uppin","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"874745bb-54ea-41bc-8356-5f38aa1ed010","name":"Malay Pathak","selfAssessmentScore":8.3784,"aiAuditScore":4.875},{"id":"84fd5a61-3f45-467b-94c4-ed9809dbb291","name":"Ananth Sai Sharma","selfAssessmentScore":8.0541,"aiAuditScore":3.825},{"id":"46ea061e-e50c-40da-8488-e2f0102669be","name":"Madhusudan R","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"2d4192bc-ddf9-4f8e-a084-cdb0ebfda2e8","name":"Mrinal Sarkar","selfAssessmentScore":8.8108,"aiAuditScore":3.97},{"id":"0b7b51ed-af66-4fcc-ab79-752d3dec7b1a","name":"Apurva Tyagi","selfAssessmentScore":8.973,"aiAuditScore":3.29},{"id":"dc85870b-f48e-47b0-9455-07adb76d4ff8","name":"Anirudh","selfAssessmentScore":null,"aiAuditScore":null},{"id":"1a471d7f-64d8-428f-b8eb-5a98d7066b6f","name":"Dev","selfAssessmentScore":null,"aiAuditScore":null},{"id":"e879beda-c686-43ff-865a-0e36e4eceeb9","name":"Deepak Kumar","selfAssessmentScore":8.4324,"aiAuditScore":3.27},{"id":"b3bb3af3-ad2a-4c33-9acb-eb40bfb1f59a","name":"Anchal Ratan Isaac","selfAssessmentScore":7.1892,"aiAuditScore":4.085},{"id":"713b45bf-864e-4997-8a89-42af5324d3ec","name":"Irfan Pasha S","selfAssessmentScore":6.0,"aiAuditScore":3.825},{"id":"6a053322-e504-4d81-83b6-a3a81d56e540","name":"Akilkumar","selfAssessmentScore":6.1081,"aiAuditScore":3.885},{"id":"eed3a599-d541-458a-b0ce-c55882cc1559","name":"Ashish Jyoti Bora","selfAssessmentScore":9.3514,"aiAuditScore":4.0},{"id":"b25167a0-bcab-4f66-acbe-cd48baa2e5bb","name":"Koushik C","selfAssessmentScore":7.1892,"aiAuditScore":4.125},{"id":"80b4c310-ec18-4b66-b288-d943126e068d","name":"Tabassum Sharieff","selfAssessmentScore":null,"aiAuditScore":3.975},{"id":"53394abd-eebe-453e-9180-61a02b45c034","name":"Govind Goel","selfAssessmentScore":5.8378,"aiAuditScore":3.825},{"id":"99ed1a6c-3c3b-4ff7-a0c3-a2cf17925b82","name":"Neha Chugh","selfAssessmentScore":7.5676,"aiAuditScore":3.895},{"id":"34b9cd84-7563-482c-a6a9-63833bcc5bba","name":"Anubhav Nepal","selfAssessmentScore":7.8378,"aiAuditScore":4.025},{"id":"7639c4b8-fd8f-49fb-9bbf-72d767cf7454","name":"Sanjay S","selfAssessmentScore":8.0,"aiAuditScore":3.895},{"id":"a809d0fd-e4da-4c44-a83d-a1710b76e240","name":"Shashidhara L","selfAssessmentScore":7.5135,"aiAuditScore":4.0},{"id":"8e918761-3122-4209-ae4e-636225724a4e","name":"Abhimanyu","selfAssessmentScore":7.4054,"aiAuditScore":3.91},{"id":"5487cad9-ddc4-4674-8587-01253312c2b0","name":"Deepak B Nair","selfAssessmentScore":7.1892,"aiAuditScore":3.82},{"id":"f9176f5a-2c01-4f05-a9ab-ba1a12283eb8","name":"Shruti Jain","selfAssessmentScore":8.3784,"aiAuditScore":3.65},{"id":"c64137cb-6bb4-47cc-a0fd-dcfb0a7ff62c","name":"Joel K Joy","selfAssessmentScore":9.4595,"aiAuditScore":3.905},{"id":"51981df1-246f-440f-8d73-ac9786b432fe","name":"Anil kumara M","selfAssessmentScore":7.3514,"aiAuditScore":3.995},{"id":"a6af131e-dc3a-4b16-8964-c188bf240217","name":"Sourabh Singha","selfAssessmentScore":7.5135,"aiAuditScore":3.91},{"id":"746f3fa5-cebd-4f47-93ee-a1c647fdc35c","name":"Amit Khatri","selfAssessmentScore":7.027,"aiAuditScore":3.955},{"id":"2471d0cb-3f15-4ee8-804b-4225cfd7b632","name":"Yadhu Raman","selfAssessmentScore":8.2162,"aiAuditScore":3.87},{"id":"cc1dcacd-f7be-4eb3-83da-6271c9523ec5","name":"Premkumar Shivappa Kumbar","selfAssessmentScore":8.7568,"aiAuditScore":3.825},{"id":"153f58b0-a10e-4b5b-b3eb-9a9f79599ece","name":"Prasidhi Kamal Rathi","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"a4ac5e9b-30fc-423d-b982-ebdc2922d221","name":"Supriti Sinha","selfAssessmentScore":7.6216,"aiAuditScore":3.9},{"id":"873c7861-8bb8-493a-8670-fa1f1f7b8ae5","name":"Sushree Sangita Santi","selfAssessmentScore":9.2973,"aiAuditScore":3.84},{"id":"27321136-0c0f-47b3-af4b-447d31941191","name":"Syeda Tayaba","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"319346f3-d76a-4034-97c3-dbd1fd706e59","name":"Soumya Das","selfAssessmentScore":8.0541,"aiAuditScore":3.975},{"id":"bce1d6c4-afd7-4716-b756-d223ac9ce9c8","name":"Chandru B","selfAssessmentScore":9.6757,"aiAuditScore":3.85},{"id":"c4e1cf6f-3b8c-4236-9285-1b3515910518","name":"Ankita Bharat Kabra","selfAssessmentScore":7.6757,"aiAuditScore":3.86},{"id":"d9a09fe7-9c58-403e-b2af-c954c2c0ef37","name":"Priyanka Singh","selfAssessmentScore":6.7568,"aiAuditScore":3.875},{"id":"a1d510f9-b498-4b64-9540-712bd378c0a2","name":"Bhanuprakash","selfAssessmentScore":8.0,"aiAuditScore":3.825},{"id":"8e612689-cb3b-4eae-af0e-68faa0693965","name":"Mohan Bhumayya Sabban","selfAssessmentScore":8.0,"aiAuditScore":3.795},{"id":"f8edea13-ad66-4359-b487-2c3beb6849da","name":"MD Tahur","selfAssessmentScore":7.3514,"aiAuditScore":3.93},{"id":"50f2f892-8a03-4788-8d00-443a2ce64112","name":"Vaishali B","selfAssessmentScore":7.4054,"aiAuditScore":3.685},{"id":"46a84e27-246a-4b61-b388-66f5f063e777","name":"Shekhar Suman","selfAssessmentScore":7.3514,"aiAuditScore":4.0},{"id":"857db4ca-b50f-4e50-9b29-10762f3489aa","name":"Ranjitha K","selfAssessmentScore":7.1351,"aiAuditScore":3.915},{"id":"4960e49e-82f6-440e-9bb0-e7464d6ffe4b","name":"Harsh Mahesh Upadhyay","selfAssessmentScore":9.1892,"aiAuditScore":4.065},{"id":"19c2ea52-0a55-42b2-8c5b-21f95b230872","name":"Naheet Parwin","selfAssessmentScore":8.0,"aiAuditScore":3.815},{"id":"dbcb5992-9d20-401e-b075-bcd552b521bd","name":"Bhagyashree","selfAssessmentScore":9.2432,"aiAuditScore":3.88},{"id":"afe0bb41-af86-44d8-bad6-87f6ea995966","name":"Jatin Sharma","selfAssessmentScore":7.2973,"aiAuditScore":3.89},{"id":"b71c1f04-3115-41ac-9a92-88f87a303bcc","name":"Megham Sai Srinivas","selfAssessmentScore":7.3514,"aiAuditScore":3.97},{"id":"5cb20437-b1b9-40bc-bcec-c8205af9cd82","name":"Pawan Rajesh Bohra","selfAssessmentScore":7.5135,"aiAuditScore":3.19},{"id":"6328ccb9-efc3-4951-ba21-e0258918c89e","name":"Sakshi Suryakant Pawar","selfAssessmentScore":7.6757,"aiAuditScore":3.96},{"id":"648b743b-893a-47e7-b9ee-4d9a0d183200","name":"Vipul Devendra Manek","selfAssessmentScore":8.2162,"aiAuditScore":3.96},{"id":"dbec161f-bfcf-4501-a9e0-8732ea602d79","name":"Vikram R","selfAssessmentScore":8.973,"aiAuditScore":3.845},{"id":"e3059587-c5d3-4da9-9e90-7a43a4847c60","name":"Nikhil Raveendran","selfAssessmentScore":6.1622,"aiAuditScore":3.85},{"id":"9fefad87-d757-4c8f-80d2-a359210a267e","name":"Mahesh H","selfAssessmentScore":8.7568,"aiAuditScore":3.89},{"id":"7fd55466-2bf4-4681-8191-ef0649c37964","name":"Charitha N","selfAssessmentScore":8.4324,"aiAuditScore":4.07},{"id":"e7436ed4-c34f-4163-b4cd-038fea5a4d26","name":"Subhashree Das","selfAssessmentScore":8.0,"aiAuditScore":3.925},{"id":"305ad089-0ee7-425c-b4b9-9bd2e71ad663","name":"Nishant Pareek","selfAssessmentScore":7.1892,"aiAuditScore":4.045},{"id":"667c32b2-3344-4422-a88b-671ce8ef940a","name":"Krupa N","selfAssessmentScore":8.2162,"aiAuditScore":3.86},{"id":"c4154076-3cb6-4dd1-a3eb-19dc5a74e189","name":"Amrita Meher","selfAssessmentScore":7.027,"aiAuditScore":3.81},{"id":"c51eb2fd-0ace-4555-be50-d996805fe254","name":"Aryasomayajula Lakshmi Tejaswi","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"68407d4b-07d8-4b61-ac8b-77c9dce27798","name":"Renuka Devi C","selfAssessmentScore":7.7838,"aiAuditScore":3.75},{"id":"f98819b4-0062-4ccc-8c38-58b829fa1297","name":"Tapasi Gayen","selfAssessmentScore":7.1351,"aiAuditScore":3.93},{"id":"98076472-78fc-447e-aa30-38cc3ae6cd68","name":"Praveen Kumar J H","selfAssessmentScore":6.7027,"aiAuditScore":3.885},{"id":"9904ae4b-c15a-4df2-82ba-743f2457beeb","name":"Raghu R","selfAssessmentScore":8.2162,"aiAuditScore":3.92},{"id":"3f6328b4-7884-402c-baa6-3125b8f821a9","name":"Rashmi Sachin Desai","selfAssessmentScore":7.2973,"aiAuditScore":3.965},{"id":"8ae45059-1bdd-43d2-8367-2994e6808a94","name":"Amritpal Singh","selfAssessmentScore":9.6757,"aiAuditScore":3.915},{"id":"e330db89-9bd8-43ae-8476-601dd45a5137","name":"Rugved Sambhajirao Yadav","selfAssessmentScore":7.8919,"aiAuditScore":3.91},{"id":"a48ed1b4-1f8a-429e-9609-d0b2cd4c482d","name":"Sweta Soni","selfAssessmentScore":7.7838,"aiAuditScore":3.89},{"id":"6d6d9d1e-70b1-41bb-8f8c-a208ade4a362","name":"Aswin Prasad","selfAssessmentScore":8.7568,"aiAuditScore":3.84},{"id":"ffcfef27-e82c-48d6-ad52-67e23e0b264c","name":"Nitesh Kumar","selfAssessmentScore":9.5676,"aiAuditScore":3.9},{"id":"cbb2d57c-7162-43fa-a2d7-2757262f8b03","name":"Neeti Toppo","selfAssessmentScore":8.0,"aiAuditScore":3.875},{"id":"f809b5b2-5764-4ad2-baed-61fc4658c477","name":"Suman Adithya Rao","selfAssessmentScore":8.0,"aiAuditScore":4.025},{"id":"e88e6cb6-b240-4136-9a02-4e4c163434a8","name":"Vilas L","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fa5ef157-f765-4bac-bd5d-5d38c1905d03","name":"Venkatesh Barad","selfAssessmentScore":7.5135,"aiAuditScore":3.86},{"id":"81467673-7654-4f92-b1e2-1f6e7b0998d2","name":"Simran Gabrial Masih","selfAssessmentScore":8.3243,"aiAuditScore":4.035},{"id":"6a9f057e-6702-47ea-bfeb-36341a2208cc","name":"Vipul Jain","selfAssessmentScore":8.0,"aiAuditScore":3.815},{"id":"fcde312a-89e5-4a45-ab9f-c9ac459eac23","name":"Dipanwita Saha","selfAssessmentScore":8.4324,"aiAuditScore":3.95},{"id":"0fb9b74c-d11a-41d6-9a31-af7dfdbe23a7","name":"Sayantan Bhattacharyya","selfAssessmentScore":8.3243,"aiAuditScore":3.96},{"id":"02400f6a-0af5-469e-b458-68f2bcfc2c86","name":"Ganesh T","selfAssessmentScore":8.4865,"aiAuditScore":3.58},{"id":"ec6b0f10-1538-426f-99cf-baafa357619d","name":"Sweta Jugran","selfAssessmentScore":8.5946,"aiAuditScore":3.89},{"id":"678c6cef-0a19-4492-a16c-a2c021f50098","name":"Chittimani Bhaviteja","selfAssessmentScore":7.8919,"aiAuditScore":4.045},{"id":"6f4f5186-db8a-44cc-8857-d6cd34600cf9","name":"Riya Goyal","selfAssessmentScore":8.4865,"aiAuditScore":3.775},{"id":"407481ee-da8b-4183-b711-06be75e15992","name":"Kumar M G","selfAssessmentScore":7.5135,"aiAuditScore":3.625},{"id":"2e1e9c1c-d84b-4635-910c-0c9043a1bd20","name":"Ishan Dhadwal","selfAssessmentScore":6.5946,"aiAuditScore":3.72},{"id":"c94d5ce9-8355-43aa-afbe-860a39a158f6","name":"K Prakash Rao","selfAssessmentScore":7.1351,"aiAuditScore":3.965},{"id":"276073a8-0d7d-4773-a110-0c14d42233eb","name":"Akhil M A","selfAssessmentScore":8.2162,"aiAuditScore":3.92},{"id":"4f4db217-024f-49b3-9d0f-1a1795f206fa","name":"Sharique Shahid Ansari","selfAssessmentScore":7.9459,"aiAuditScore":3.89},{"id":"c1a2fd7e-b420-413c-a513-8576560b655b","name":"Shridhar","selfAssessmentScore":9.5135,"aiAuditScore":4.03},{"id":"116f7e33-91b4-44ef-9482-775917db11aa","name":"Shweta Chauhan","selfAssessmentScore":9.0811,"aiAuditScore":3.78},{"id":"efcfff28-ef6c-4bb2-9cc2-3e814854ff39","name":"Ajmal Rahim","selfAssessmentScore":5.9459,"aiAuditScore":3.995},{"id":"bb2824aa-a965-4766-aa0b-93f2b4dc0606","name":"Jyoti Umesh Sulgekar","selfAssessmentScore":7.1351,"aiAuditScore":4.0},{"id":"12260ddf-c8ef-4363-a04e-901d70812367","name":"Ravishankar Mohan Cherukupalli","selfAssessmentScore":9.5135,"aiAuditScore":3.945},{"id":"02d5a439-887d-49aa-8dc3-18c9e1439832","name":"Tanish Kumar Sahoo","selfAssessmentScore":7.9459,"aiAuditScore":3.96},{"id":"d5cbc294-e15b-4e30-905b-0340c71428a1","name":"Jaideep Singh","selfAssessmentScore":7.6757,"aiAuditScore":4.0},{"id":"d3a8a3a4-55ba-41ce-b57b-9d4fc55b0798","name":"Neethu Paulose","selfAssessmentScore":8.7568,"aiAuditScore":3.95},{"id":"984e4f32-a165-4e15-86b0-0decd36f1432","name":"Arpitha L K","selfAssessmentScore":9.8919,"aiAuditScore":3.915},{"id":"9ce130f1-0dd4-42e7-896e-30e61c4f0a07","name":"M Nikhil","selfAssessmentScore":9.6216,"aiAuditScore":3.875},{"id":"7892016b-7760-4b74-b77e-845ad3c2693c","name":"Rajashekharayya Salimath","selfAssessmentScore":7.1892,"aiAuditScore":3.845},{"id":"8157def2-2d05-421e-99a3-e2b43f4f56e1","name":"Nayan Hosur","selfAssessmentScore":9.6216,"aiAuditScore":3.895},{"id":"162e1a00-d5f0-4418-826c-8802331631ce","name":"Aditya Karnad","selfAssessmentScore":8.6486,"aiAuditScore":3.955},{"id":"81d07d75-3ee4-4b04-b8dd-5989acb32177","name":"Ashwinkumar A Shet","selfAssessmentScore":7.1892,"aiAuditScore":3.925},{"id":"a75ee6d1-2046-44f9-aeda-3f8410c66ec7","name":"Rohan Ajit Kokane","selfAssessmentScore":8.0,"aiAuditScore":3.98},{"id":"d04ce041-fd5d-4107-85cd-60eb77f1826e","name":"Amit Mahantesh Baligar","selfAssessmentScore":8.7568,"aiAuditScore":3.955},{"id":"48ea5e8a-9cee-4eba-8533-7c680e018de7","name":"Vikas Koti","selfAssessmentScore":8.0,"aiAuditScore":3.58},{"id":"48ce8f8e-96ac-42c5-af14-34277c6a6729","name":"Adnan Parvezahmed Darga","selfAssessmentScore":9.6757,"aiAuditScore":3.94},{"id":"0783e148-eed1-4abe-8da8-016b3258f1d9","name":"Sujay Sanjeev Satpute","selfAssessmentScore":6.8108,"aiAuditScore":3.875},{"id":"055427c9-ae39-44fe-a500-cae00aee50af","name":"Amardeep Narayan Baswa","selfAssessmentScore":8.01,"aiAuditScore":4.005},{"id":"84dc941f-77ce-40f7-b48a-b2cb470d5514","name":"Ankush Ajay Chougule","selfAssessmentScore":9.4054,"aiAuditScore":3.98},{"id":"441cc13e-61cc-4af5-b274-1bf49da31324","name":"Abdulsamad Riyazahmed Jamadar","selfAssessmentScore":9.1351,"aiAuditScore":3.685},{"id":"8a681a5f-4b48-4203-b551-48b08cbd131c","name":"Rakesh Guddadmani","selfAssessmentScore":8.7568,"aiAuditScore":3.91},{"id":"bfe0ce38-b998-491f-82dd-1403c846bbb0","name":"Prajwal","selfAssessmentScore":9.6757,"aiAuditScore":3.67},{"id":"a5366e32-dc77-4d5b-9bc8-dd88f5b057aa","name":"Prathamesh Kakatikar D","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fd4c3619-7111-40f6-b43f-d66de1718a68","name":"S Raju","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"d95dfea9-4aff-4366-9f90-b0f59de164f3","name":"Rakesh Naik","selfAssessmentScore":9.027,"aiAuditScore":3.915},{"id":"915154f6-8089-496c-9f32-7f2bcca8adc0","name":"Shabaaz Babajan Shaikh","selfAssessmentScore":8.9189,"aiAuditScore":3.93},{"id":"dc7bda68-deaa-4ef7-b733-ffa3bb5528a6","name":"Yalleshi Mareppa Holennavar","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fc471712-48a7-4ef2-a5dc-44bf7b4da84a","name":"Faisal Javed Shaikh","selfAssessmentScore":8.8649,"aiAuditScore":3.925},{"id":"6b1f45d5-69f4-443f-a967-0ed07ff11519","name":"Nauseen Asif Nargund","selfAssessmentScore":8.2703,"aiAuditScore":3.975},{"id":"c8add316-def6-4ae3-b180-170e171c15cc","name":"Vaibhavi Vinod Balse","selfAssessmentScore":8.1622,"aiAuditScore":4.01},{"id":"10610ff8-6786-4289-98b3-bbcb7378daba","name":"Nisha Shankar Kurubar","selfAssessmentScore":8.9189,"aiAuditScore":4.04},{"id":"c565317b-cabe-4ecc-9670-f5ec0010f440","name":"Anupam Premanand Vernekar","selfAssessmentScore":8.6486,"aiAuditScore":4.015},{"id":"b6955b9a-b7e0-4526-ad62-5c0cf2069aae","name":"Vishal Vijay Chavan","selfAssessmentScore":7.4595,"aiAuditScore":4.005},{"id":"96809b7d-753c-47fd-9dc1-bfa79786b9f1","name":"Nitin Namdev Ningannavar","selfAssessmentScore":8.7027,"aiAuditScore":4.03},{"id":"af635550-2f8a-4b9b-9679-cf3f2149489a","name":"Uday Satish Devakar","selfAssessmentScore":8.0541,"aiAuditScore":3.91},{"id":"86194a4c-019f-46ad-92b5-2ae139eea7b9","name":"Faizan Mohammed Ismail Rangrez","selfAssessmentScore":8.7568,"aiAuditScore":3.93},{"id":"e8757881-5225-4f87-b475-8a234a3a3134","name":"Shubham Oza","selfAssessmentScore":8.4865,"aiAuditScore":3.965},{"id":"28ddb3ef-ea1f-401d-8a70-6952cd844f78","name":"Rohit Rajeshkumar Patil","selfAssessmentScore":8.4865,"aiAuditScore":3.915},{"id":"c565597a-6936-4475-944b-6e29551d06cb","name":"Nehal Ravindra Kallimani","selfAssessmentScore":8.6486,"aiAuditScore":3.96},{"id":"257554d7-0bd0-49e3-8d32-1bd78819874a","name":"Juned Peerjade","selfAssessmentScore":8.973,"aiAuditScore":3.655},{"id":"01937bd6-1f16-4db8-9896-fd454b8afaf5","name":"Wagesh Gopal Jadhav","selfAssessmentScore":8.4865,"aiAuditScore":3.74},{"id":"b591f0ab-7385-4755-989c-695c809a7ac3","name":"Taha Shaikh","selfAssessmentScore":8.6486,"aiAuditScore":3.65},{"id":"1fd6946d-9a43-48bc-8e13-bec5b5e4aef1","name":"Shubham Sambhaji Bhadavankar","selfAssessmentScore":8.4865,"aiAuditScore":3.965},{"id":"79e6a309-d9de-4c36-9e15-04614d4d9c81","name":"Mohammed Younus C A","selfAssessmentScore":8.5946,"aiAuditScore":3.765},{"id":"7f7799ff-a76d-4ce3-a38a-8f4e70381f77","name":"Nikhil Subhash Chavan","selfAssessmentScore":8.1081,"aiAuditScore":3.965},{"id":"8a5cc4ce-d5d4-45bc-913b-53eb7a2c2c65","name":"Gautam Shah","selfAssessmentScore":7.7838,"aiAuditScore":3.945},{"id":"b4c263c6-b8fb-4672-91e3-c0bad5277162","name":"Sneahaal Mulaawadmath","selfAssessmentScore":9.4595,"aiAuditScore":3.965},{"id":"0aad546a-7470-495a-87ce-e41765728dc6","name":"Saivishal Vinod Balse","selfAssessmentScore":7.5135,"aiAuditScore":4.03},{"id":"139dedd5-5372-433d-bb4b-e70c7bd86d9f","name":"Nitin Nagoji Chikke","selfAssessmentScore":8.5405,"aiAuditScore":4.03},{"id":"956dc97b-9215-419f-bfc6-3571447a38a7","name":"Gajanan Ternikar","selfAssessmentScore":7.0811,"aiAuditScore":3.915},{"id":"82a9a65a-28dc-4d54-bde1-d45733374e2f","name":"Nagaratna Mahantesh Marihal","selfAssessmentScore":8.2703,"aiAuditScore":3.915},{"id":"7d34ed29-7934-4edd-9c6a-3fe026b41baa","name":"Aaqib Beerwala","selfAssessmentScore":8.5946,"aiAuditScore":3.85},{"id":"be943366-a0c4-4b93-93c3-f277a3bbedae","name":"Nagesh Pednekar","selfAssessmentScore":7.5676,"aiAuditScore":3.86},{"id":"de299aa0-0bb7-4ca4-934d-6c0d49204aff","name":"Suraj Praveen Motimath","selfAssessmentScore":9.027,"aiAuditScore":3.79},{"id":"20ace82d-d344-4d9d-a03c-c9b49ce1173d","name":"Amit Goudadi","selfAssessmentScore":8.5946,"aiAuditScore":4.0},{"id":"fc1a3baf-9d22-42ae-959d-e24bc23a3ab8","name":"Anuj Ajay Chougule","selfAssessmentScore":8.5946,"aiAuditScore":3.645},{"id":"5b0ad595-96b7-4f03-9503-8fb209582dc9","name":"Sumanth Kumar Sahu","selfAssessmentScore":9.0811,"aiAuditScore":3.89},{"id":"cf75bd95-6afc-4e74-ac00-5b9685ecfd37","name":"Amulya K","selfAssessmentScore":6.4865,"aiAuditScore":3.81},{"id":"1822a733-759e-4e3f-94d0-67d9049d8896","name":"Anup Sadanandan","selfAssessmentScore":7.1892,"aiAuditScore":3.96},{"id":"608b4f2c-d5c7-41d2-955a-4e05dc759a96","name":"Maya M Pillai","selfAssessmentScore":6.5946,"aiAuditScore":3.39},{"id":"fd668bc5-c086-4beb-af51-373b378c988e","name":"Rohan Jain","selfAssessmentScore":6.5946,"aiAuditScore":3.655},{"id":"7766dd71-78cd-4fb1-96d0-3490660ef771","name":"Mehul Harihar Dhande","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"1d244d11-81a2-4504-b109-279765ed1d48","name":"Vivek Kumar Verma","selfAssessmentScore":4.7027,"aiAuditScore":3.86},{"id":"09b5d23a-16cb-43c4-b549-7a05536897e0","name":"Prathvik Saldanha","selfAssessmentScore":7.3514,"aiAuditScore":3.945},{"id":"bbd701c1-f99b-4e67-9bf9-3adc4f556d1f","name":"Jay Prakash Singh","selfAssessmentScore":7.7838,"aiAuditScore":4.01},{"id":"a6e33eb2-e8cd-4057-b255-0606bdb06cf4","name":"Hunny","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"fea5841e-a864-482b-ab7e-82802610e67d","name":"Ravikumar Mangilal Shah","selfAssessmentScore":7.5135,"aiAuditScore":3.895},{"id":"46202910-3f01-4f04-a999-806501090909","name":"Sadiya Banu","selfAssessmentScore":8.5946,"aiAuditScore":3.885},{"id":"46f37dce-3248-4dd3-bd62-08290153de81","name":"Sangeetha P","selfAssessmentScore":8.2162,"aiAuditScore":3.9},{"id":"f1b2a8d0-e99b-4127-b1c5-469fe7d2bf1a","name":"Regan Lobo","selfAssessmentScore":8.4865,"aiAuditScore":3.96},{"id":"c48bf1e4-4de4-4f9d-bb01-167fcc446650","name":"Sarfaraj Najeer Kudachee","selfAssessmentScore":7.2973,"aiAuditScore":3.785},{"id":"a1e578be-12e2-46c8-8729-f0a23ee115af","name":"Naman Prakash Awasthi","selfAssessmentScore":8.973,"aiAuditScore":3.855},{"id":"0f1822b5-a997-49b1-a8a6-238e88715cba","name":"Prateek Manvi","selfAssessmentScore":9.3514,"aiAuditScore":3.89},{"id":"934bea9b-8b1e-407f-958b-fb8762f1bb0d","name":"Amar Vishwakarma","selfAssessmentScore":7.5676,"aiAuditScore":3.885},{"id":"49d5b511-ed80-4884-9b4d-b550698d1140","name":"Shivanjali Kumari","selfAssessmentScore":9.7297,"aiAuditScore":3.965},{"id":"1192c2ec-d6df-4bbd-b4c1-2f5d4309c22e","name":"M Vinod","selfAssessmentScore":8.5405,"aiAuditScore":2.63},{"id":"882cfa94-d397-4f9c-92d8-5e27c58a0ca7","name":"Shaktiprasad Bentur","selfAssessmentScore":8.2703,"aiAuditScore":4.105},{"id":"25776972-3018-465a-9b82-1126895cadbf","name":"Vivek G K","selfAssessmentScore":8.5405,"aiAuditScore":3.955},{"id":"d4e08186-15e8-49ae-aca5-c8dd3c876a6c","name":"Rakesh S Sankangoudar","selfAssessmentScore":9.6757,"aiAuditScore":3.91},{"id":"f87cc375-7a63-4f1e-84b3-dc9340744d4e","name":"Gonegondla Karanam Venkata Karthik","selfAssessmentScore":8.2162,"aiAuditScore":3.725},{"id":"26bc8376-cec9-4e0d-8395-0aaaef860734","name":"Adarsh Singh Gautam","selfAssessmentScore":7.9459,"aiAuditScore":4.05},{"id":"f0cc8a0f-1da4-4c77-a7c3-855d3b18b9c9","name":"Shalini Y S","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"9f695785-b2c3-48df-8f0b-23e9cfb6b10b","name":"Girish A","selfAssessmentScore":8.2703,"aiAuditScore":3.825},{"id":"df439b59-6726-44fa-b884-a0f54e7ecb04","name":"Saqlain Khalique Shaikh","selfAssessmentScore":8.1081,"aiAuditScore":3.85},{"id":"64bebad9-f1ca-4b05-b815-31b0d2500e61","name":"M Kiran","selfAssessmentScore":5.7297,"aiAuditScore":3.725},{"id":"117505e2-7381-435f-9906-ac6dccd3bfa6","name":"Keyur P Shah","selfAssessmentScore":8.5946,"aiAuditScore":3.67},{"id":"028f0c7f-f4a7-49c8-85a9-67cf5819f715","name":"Aimen Nasardi","selfAssessmentScore":8.2162,"aiAuditScore":3.515},{"id":"16448b34-bcbb-4b15-aa2a-81004f81dcc4","name":"Shrikanth K","selfAssessmentScore":8.0,"aiAuditScore":3.85},{"id":"f1247b40-2617-4a19-bbe7-c387a1c5a033","name":"Srawani Deka Basumatary","selfAssessmentScore":8.1622,"aiAuditScore":4.0},{"id":"d8995e9a-5183-4748-bc0f-ae969956d4a0","name":"Vishvajeet Singh","selfAssessmentScore":8.0,"aiAuditScore":3.77},{"id":"328aefe9-dee0-447d-97f9-9ae3694aec47","name":"Harshvardhan Singh Rathore","selfAssessmentScore":7.8378,"aiAuditScore":4.015},{"id":"fcf4ed94-342f-4447-b4ce-ba365ad0f939","name":"Pratik P Bontra","selfAssessmentScore":8.0,"aiAuditScore":3.82},{"id":"9b097f1a-540b-467b-be3a-5d8eaf687fdf","name":"Rajan Kiran Wagh","selfAssessmentScore":8.0,"aiAuditScore":3.86},{"id":"79380e8f-f0b5-48d8-bc26-6cbc0b624e26","name":"Vipul Prakash Sande","selfAssessmentScore":7.8378,"aiAuditScore":3.97},{"id":"c074e3a6-9dfe-4a10-9ec0-9788304a0b7c","name":"Roshan KM","selfAssessmentScore":7.5135,"aiAuditScore":3.52},{"id":"d3de14bd-eca8-4e9f-935d-ffa38e33d1be","name":"Shashank Verma","selfAssessmentScore":7.027,"aiAuditScore":3.675},{"id":"e8d58f9d-142d-4a24-ae2f-a2f8c0118d88","name":"Martin Davis","selfAssessmentScore":6.7568,"aiAuditScore":3.8},{"id":"3fdc1327-b869-481f-9afd-40a11351675c","name":"Shrutika Sumit Jain","selfAssessmentScore":8.3784,"aiAuditScore":3.85},{"id":"9e6ab7f0-2ade-4f13-89ad-d6340f5a5df4","name":"Fiza Kouser","selfAssessmentScore":7.8919,"aiAuditScore":3.67},{"id":"59fec208-495d-443b-b40c-ee7c3a164428","name":"Tejas K Madeval","selfAssessmentScore":7.9459,"aiAuditScore":3.67},{"id":"8acf0bc6-e9fb-49fc-b379-fae2e37f5b20","name":"Khushpreet Kaur","selfAssessmentScore":9.6757,"aiAuditScore":3.85},{"id":"3d7aae1f-410f-46fe-8401-64f811776a1d","name":"Priyank Sharma","selfAssessmentScore":8.6486,"aiAuditScore":4.025},{"id":"46c97ac4-444f-4c78-9f86-a9c7cf5bf307","name":"Masooma Yousuf","selfAssessmentScore":8.4865,"aiAuditScore":3.525},{"id":"5075478b-da97-43b7-b611-965b2b63a541","name":"Nitin Tanajirao Pimpalpalle","selfAssessmentScore":8.973,"aiAuditScore":4.03},{"id":"24c94439-f141-4a83-a746-76ef86f3b4df","name":"S Mohammed Akhil","selfAssessmentScore":9.6216,"aiAuditScore":3.865},{"id":"9d5de090-8279-441b-b14a-be3b0bb850b9","name":"Ankit Agarwal","selfAssessmentScore":8.7027,"aiAuditScore":3.82},{"id":"f68f264a-5b27-431c-81f5-0567ef7d39ec","name":"Murgendra Rajashekhar Patil","selfAssessmentScore":8.8649,"aiAuditScore":3.77},{"id":"97d039e5-28b3-44f7-9b22-124dd0e2d8c3","name":"Sneha Shrikar","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"afa5e04d-c1d2-4ce6-a1ab-74dc6fee403f","name":"Mary Salins","selfAssessmentScore":9.7297,"aiAuditScore":3.985},{"id":"679da5f3-74b3-4117-b921-31526ba68399","name":"Sridevi K V","selfAssessmentScore":7.5135,"aiAuditScore":3.82},{"id":"4206ad91-de0a-4fe9-bbe7-1083d8d85ca4","name":"Suman Janghel","selfAssessmentScore":7.4054,"aiAuditScore":3.725},{"id":"4df77631-01e1-4c5f-9c36-a61049de92db","name":"Chandan Kumar","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"9401e397-bd08-4d3a-943a-2edace78581b","name":"Rahul Kumar","selfAssessmentScore":7.4595,"aiAuditScore":3.85},{"id":"52b3832c-6f38-4003-8184-6bde7df128f1","name":"Ravi Kumar Deo","selfAssessmentScore":6.973,"aiAuditScore":3.66},{"id":"4d4cceea-51ef-4ba3-b42d-26237073382e","name":"Vishal Bhattar","selfAssessmentScore":8.1081,"aiAuditScore":3.62},{"id":"5710743d-1806-4493-bf29-f2aa4175ad50","name":"Rohini Kumari","selfAssessmentScore":7.7838,"aiAuditScore":3.67},{"id":"6efc9a26-5f32-4a1e-a6a2-61bb7a586b49","name":"Uma Bohra","selfAssessmentScore":0.0,"aiAuditScore":0.0},{"id":"0b504567-5290-46c3-9d2f-3675d8b2b6ed","name":"Nikhil Murlidhar Bhatkar","selfAssessmentScore":8.1622,"aiAuditScore":3.725},{"id":"ac68f2b3-e984-4e4a-bfd6-6f7558bb7ec1","name":"Deepanshi Lalwani","selfAssessmentScore":8.973,"aiAuditScore":3.895},{"id":"7e47d241-7cfd-4fff-aae6-166ab2d463d6","name":"Roshni","selfAssessmentScore":7.6757,"aiAuditScore":3.925},{"id":"8c2f4304-e7a4-4541-9e77-d16137998ea9","name":"Mayank Lodha","selfAssessmentScore":6.4324,"aiAuditScore":3.825},{"id":"b2dcc32a-577e-4d2d-88b1-0904dafeb532","name":"Alamgir Haque","selfAssessmentScore":6.6486,"aiAuditScore":3.715},{"id":"bb8d945d-f0be-49a7-b3bb-5a9baae920db","name":"Karthik R","selfAssessmentScore":7.8378,"aiAuditScore":3.67},{"id":"2437bc2d-90df-4e21-8eff-ead2e3fd3f39","name":"Sachinkumar Ghanti B","selfAssessmentScore":9.4595,"aiAuditScore":3.885},{"id":"fa601a3e-fb78-4533-b029-307ef22bb0c4","name":"Bharat Halagalimath","selfAssessmentScore":7.7297,"aiAuditScore":3.765}];

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

    tbody.innerHTML = _filteredAuditRecs.map((r, idx) => `
      <tr id="audit-row-${r.id}">
        <td style="width:36px;text-align:center">
          <input type="checkbox" class="audit-cb" data-id="${r.id}"
            onchange="Admin.toggleAuditCheckbox('${r.id}', this.checked)" />
        </td>
        <td style="color:var(--text-muted);font-size:0.8rem">${idx + 1}</td>
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
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem" title="Edit Self Assessment Score">✏️</button>
            <button onclick="Admin.editAuditScore('${r.id}')" title="Edit AI Audit Score"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">🎯</button>
            <button onclick="Admin.deleteSingleAuditScore('${r.id}', '${r.name.replace(/'/g,"&#39;")}')" title="Delete"
              style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0.2rem">🗑</button>
          </div>
        </td>
      </tr>`).join('');

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


  // ---- Public API (called from inline onclick) ----
  return {
    init,
    openTopicModal,
    deleteTopic,
    toggleTopicEnabled,
    toggleGrammarSet,
    openScoring,
    updateCriterionDisplay,
    selectScale135,
    viewTraineeSessions,
    setTraineeTeam,
    toggleTraineeCheckbox,
    toggleAllTrainees,
    deleteSelectedTrainees,
    deleteAllTrainees,
    downloadCSV,
    downloadRecording,
    downloadAllRecordings,
    deleteSession,
    deleteAllSessions,
    generateAllAgentsReport,
    copyLetter,
    downloadTraineePPT,
    // Assessments archive / multi-select
    switchAssessmentView,
    toggleSessionCheckbox,
    toggleAllSessions,
    archiveSelectedSessions,
    restoreSelectedSessions,
    archiveSingleSession,
    restoreSingleSession,
    // AI Audit Scores
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
    deleteAllAuditScores
  };
})();

document.addEventListener('DOMContentLoaded', () => Admin.init());
