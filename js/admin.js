'use strict';

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
    'grammar-assessment':  'Grammar Assessment'
  };

  const MODULE_COLORS = {
    'pick-speak':          '#3b82f6',
    'pick-speak-general':  '#3b82f6',
    'pick-speak-stock':    '#3b82f6',
    'mock-call':           '#8b5cf6',
    'role-play':           '#f97316',
    'group-discussion':    '#10b981',
    'written-comm':        '#0ea5e9',
    'grammar-assessment':  '#7c3aed'
  };

  const MODULE_BADGE_CLASS = {
    'pick-speak':          'badge-ps',
    'pick-speak-general':  'badge-ps',
    'pick-speak-stock':    'badge-ps',
    'mock-call':           'badge-mc',
    'role-play':           'badge-rp',
    'group-discussion':    'badge-gd',
    'written-comm':        'badge-wc',
    'grammar-assessment':  'badge-ga'
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
    // Grammar Assessment is auto-scored — no manual sliders, just admin comment
    'grammar-assessment': []
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

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No trainees found.</td></tr>`;
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

    // Split grammar topics from the rest
    const grammarTopics = filtered.filter(t => t.module === 'grammar-assessment');
    const otherTopics   = filtered.filter(t => t.module !== 'grammar-assessment');

    // Group grammar topics by set name
    const grammarSets = {};
    grammarTopics.forEach(t => {
      const setName = extractGrammarSetName(t.title);
      if (!grammarSets[setName]) grammarSets[setName] = [];
      grammarSets[setName].push(t);
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

    container.innerHTML = otherHtml + grammarHtml;
  }

  function getModuleShort(module) {
    const map = { 'pick-speak': 'ps', 'pick-speak-general': 'ps', 'pick-speak-stock': 'ps', 'mock-call': 'mc', 'role-play': 'rp', 'group-discussion': 'gd', 'written-comm': 'wc', 'grammar-assessment': 'ga' };
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
    if (filter === 'pick-speak') return recordModule === 'pick-speak' || recordModule === 'pick-speak-general' || recordModule === 'pick-speak-stock';
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

      if (topic.module === 'grammar-assessment') {
        // checklist holds question objects for grammar-assessment
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
    const isGA  = module === 'grammar-assessment';
    $('topic-caller-audio-group').style.display = isMC ? '' : 'none';
    $('topic-bot-script-group').style.display    = isMC ? '' : 'none';
    $('topic-mcq-group').style.display           = isGA ? '' : 'none';
    // For grammar-assessment, hide scenario & checklist (replaced by MCQ editor)
    const scenarioGroup   = $('topic-scenario').closest('.form-group');
    const checklistGroup  = $('topic-checklist-group');
    if (scenarioGroup)  scenarioGroup.style.display  = isGA ? 'none' : '';
    if (checklistGroup) checklistGroup.style.display = isGA ? 'none' : '';
    // If switching to grammar-assessment, clear the MCQ list so it starts fresh
    if (isGA && $('mcq-questions-list') && $('mcq-questions-list').children.length === 0) {
      addMcqQuestion(); // add one blank question to get started
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
    if (module === 'grammar-assessment') {
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
      scenario:    module === 'grammar-assessment' ? '' : $('topic-scenario').value.trim(),
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
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color:#ef4444">
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

    let filtered = sessions;
    if (filterTraineeId) {
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

    // ── Build rows ──────────────────────────────────────────────
    const headers = [
      'Name', 'Employee ID', 'Module', 'Topic', 'Date',
      'AI Score', 'Admin Score',
      'AI Coaching Summary', 'Admin Coaching Summary'
    ];

    const rows = sorted.map(s => {
      const trainee   = traineeMap[s.traineeId] || {};
      const name      = s.traineeName || trainee.name || '';
      const empId     = trainee.employee_id || '';
      const module    = MODULE_LABELS[s.module] || s.module || '';
      const topic     = s.topicTitle || '';
      const date      = s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '';
      const aiScore   = s.aiScores?.overall ?? '';
      const admScore  = s.adminScores ? (calcAdminAvg(s.adminScores) ?? '') : '';
      // Always regenerate fresh — avoids stale stored summaries with removed parameters
      // Grammar Assessment: AI summary = section-by-section breakdown
      let aiSummary = '';
      if (s.module === 'grammar-assessment') {
        try {
          const parsed = JSON.parse(s.writtenText || '{}');
          if (parsed.sections && Array.isArray(parsed.sections)) {
            const secBreakdown = parsed.sections.map((sec, i) =>
              `Sec ${String.fromCharCode(65 + i)}: ${sec.correct}/${sec.total} (${sec.pct}%)`
            ).join(' | ');
            aiSummary = `Overall: ${parsed.totalCorrect}/${parsed.totalQuestions} (${parsed.overallPct}%) — ${secBreakdown}`;
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
      const adminSummary = (s.adminScores && s.module !== 'grammar-assessment' && typeof SpeechEngine !== 'undefined')
        ? SpeechEngine.generateCoachingSummary(s.module, s.adminScores, 'admin')
        : (s.adminScores && s.module === 'grammar-assessment' ? 'Reviewed by admin' : '');
      return [name, empId, module, topic, date, aiScore, admScore, aiSummary, adminSummary];
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
    let filtered = sessions;
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

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No assessments found.</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map(s => {
      const aiScore = s.aiScores ? (normalizeOverall(s.aiScores.overall) ?? '—') : '—';
      const adminScore = s.adminScores ? (calcAdminAvg(s.adminScores) ?? '—') : '—';
      const isScored = !!s.adminScores;
      const ext = (s.recordingUrl || '').includes('.mp4') ? 'mp4' : (s.recordingUrl || '').includes('.ogg') ? 'ogg' : 'webm';
      const dlFilename = `${(s.traineeName || 'recording').replace(/\s+/g, '_')}-${s.module}-${(s.submittedAt || '').slice(0, 10)}.${ext}`;
      const dlBtn = s.recordingUrl
        ? `<button class="btn-small" onclick="Admin.downloadRecording('${s.recordingUrl}', '${dlFilename}')">⬇ Recording</button>`
        : '';

      return `
        <tr>
          <td><strong>${s.traineeName || '—'}</strong></td>
          <td>${moduleBadge(s.module)}</td>
          <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.topicTitle || '—'}</td>
          <td style="white-space:nowrap">${formatDate(s.submittedAt).split(' ')[0]}</td>
          <td>${statusBadge(isScored ? 'scored' : s.status)}</td>
          <td>${aiScore !== '—' ? aiScore + '/100' : '—'}</td>
          <td>${adminScore !== '—' ? adminScore + '/100' : '—'}</td>
          <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
            <button class="btn-small primary" onclick="Admin.openScoring('${s.id}')">
              ${isScored ? 'Review' : 'Score'}
            </button>
            ${dlBtn}
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

    const isWritten = session.module === 'written-comm';
    const isGrammar = session.module === 'grammar-assessment';

    // Show correct left-panel section based on module type
    if (isGrammar) {
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

          $('scoring-mcq-review').innerHTML = sections.map((sec, secIdx) => {
            const letter      = String.fromCharCode(65 + secIdx);
            const mObtained   = sec.marksObtained ?? sec.correct ?? 0;
            const mMax        = sec.maxMarks ?? sec.total ?? 0;
            const mPerQ       = sec.marksPerQ ?? 1;
            const rows = (sec.answerRecord || []).map((item, i) => {
              const userLbl    = item.userAnswer >= 0 ? LABELS[item.userAnswer] : '—';
              const correctLbl = LABELS[item.correct];
              return `<div class="mcq-scoring-item ${item.isCorrect ? 'mcq-correct' : 'mcq-wrong'}">
                <strong>${i + 1}. ${item.stem}</strong><br>
                ${item.isCorrect ? `✅ <strong>${userLbl}) ${item.options?.[item.userAnswer] || '—'}</strong> <em style="color:#059669">(+${mPerQ} mark${mPerQ > 1 ? 's' : ''})</em>` : `❌ Your answer: <strong>${userLbl}) ${item.options?.[item.userAnswer] || '—'}</strong> · Correct: <strong>${correctLbl}) ${item.options?.[item.correct] || '—'}</strong>`}
                ${item.explanation ? `<br><em style="font-size:0.78rem;color:#64748b">💡 ${item.explanation}</em>` : ''}
              </div>`;
            }).join('');
            return `<div style="margin-bottom:1.25rem">
              <div style="font-weight:700;color:#7c3aed;padding:0.5rem 0.75rem;background:#f5f3ff;border-radius:6px;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center">
                <span>Section ${letter} — ${sec.correct}/${sec.total} correct</span>
                <span style="background:#7c3aed;color:#fff;padding:0.15rem 0.6rem;border-radius:999px;font-size:0.82rem">${mObtained} / ${mMax} marks</span>
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
      // Grammar assessment: show a simple score summary, not individual criteria bars
      if (isGrammar) {
        const { overall, correctAnswers, totalQuestions } = session.aiScores;
        aiDisplay.innerHTML = `
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:0.75rem;text-align:center;margin-bottom:0.5rem">
            <div style="font-size:1.5rem;font-weight:800;color:#7c3aed">${correctAnswers ?? '?'} / ${totalQuestions ?? '?'}</div>
            <div style="font-size:0.85rem;color:#6d28d9;font-weight:600">${overall ?? '?'}% — Auto-graded</div>
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

      // Always regenerate fresh — never use stored _summary (grammar-assessment has no text summary)
      if (!isGrammar) {
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
    if (module === 'grammar-assessment') return; // handled separately in openScoring
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

    // Grammar Assessment is auto-scored — admin just reviews and adds a comment
    if (session.module === 'grammar-assessment') {
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
    loadAssessments();

    // Refresh the scoring modal in-place so the admin sees the coaching summary immediately
    await openScoring(session.id);
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

  async function loadTraineeReport(traineeId) {
    const [trainee, sessions] = await Promise.all([
      DB.get('trainees', traineeId),
      DB.getByIndex('sessions', 'traineeId', traineeId)
    ]);

    if (!trainee) return;
    $('report-content').classList.remove('hidden');
    $('report-trainee-name').textContent = trainee.name;
    $('report-total-sessions').textContent = sessions.length;

    const scored = sessions.filter(s => s.adminScores);
    const avg = scored.length
      ? (scored.map(s => calcAdminAvg(s.adminScores)).filter(x => x !== null)
          .reduce((a, b) => a + b, 0) / scored.length).toFixed(1)
      : '—';
    $('report-avg-score').textContent = avg !== '—' ? avg + '/100' : '—';

    // Best module
    const modScores = {};
    scored.forEach(s => {
      const val = calcAdminAvg(s.adminScores);
      if (val !== null) {
        if (!modScores[s.module]) modScores[s.module] = [];
        modScores[s.module].push(val);
      }
    });
    const modAvgs = Object.entries(modScores).map(([m, vals]) => ({
      module: m, avg: vals.reduce((a,b)=>a+b,0)/vals.length
    }));
    const best = modAvgs.length ? modAvgs.sort((a,b)=>b.avg-a.avg)[0] : null;
    $('report-best-module').textContent = best ? MODULE_LABELS[best.module] : '—';

    // Session history
    const tbody = $('report-sessions-tbody');
    tbody.innerHTML = sessions.length === 0
      ? `<tr><td colspan="5" class="empty-state">No sessions yet.</td></tr>`
      : sessions.sort((a,b) => new Date(b.submittedAt)-new Date(a.submittedAt)).map(s => `
          <tr>
            <td>${moduleBadge(s.module)}</td>
            <td>${s.topicTitle || '—'}</td>
            <td>${formatDate(s.submittedAt).split(' ')[0]}</td>
            <td>${s.aiScores ? (normalizeOverall(s.aiScores.overall) ?? '—') + '/100' : '—'}</td>
            <td>${s.adminScores ? calcAdminAvg(s.adminScores) + '/100' : '—'}</td>
          </tr>`).join('');

    // Radar chart
    drawRadarChart(trainee, scored, modAvgs);
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
    downloadCSV,
    downloadRecording,
    downloadAllRecordings,
    deleteSession,
    deleteAllSessions
  };
})();

document.addEventListener('DOMContentLoaded', () => Admin.init());
