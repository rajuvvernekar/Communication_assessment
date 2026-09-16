'use strict';

// ============================================================
//  CommAssess — Database Layer (Supabase with LocalStorage fallback & auto-sync)
//  Drop-in replacement for the old IndexedDB-based DB module.
//  The public API (init, get, getAll, put, del, getByIndex)
//  is identical so the rest of the app needs minimal changes.
// ============================================================

const DB = (() => {
  let _sb = null; // Supabase client instance
  let _useLocalStorage = false;

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

  // ---- LocalStorage helper functions ----
  function _localGetAll(store) {
    try {
      const raw = localStorage.getItem('commassess_' + store);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  // Exposed for migration/sync purposes
  function _localClear(store) {
    localStorage.removeItem('commassess_' + store);
  }

  function _localGet(store, id) {
    const list = _localGetAll(store);
    if (store === 'settings') {
      return list.find(r => r.key === id) || null;
    }
    return list.find(r => r.id === id) || null;
  }

  function _localPut(store, data) {
    const list = _localGetAll(store);
    if (store === 'settings') {
      const idx = list.findIndex(r => r.key === data.key);
      if (idx > -1) list[idx] = data;
      else list.push(data);
      localStorage.setItem('commassess_' + store, JSON.stringify(list));
      return data.key;
    }
    if (!data.id) {
      data.id = 'local-' + Math.random().toString(36).substring(2, 11);
    }
    const idx = list.findIndex(r => r.id === data.id);
    if (idx > -1) list[idx] = data;
    else list.push(data);
    localStorage.setItem('commassess_' + store, JSON.stringify(list));
    return data.id;
  }

  function _localDel(store, id) {
    const list = _localGetAll(store);
    let updated;
    if (store === 'settings') {
      updated = list.filter(r => r.key !== id);
    } else {
      updated = list.filter(r => r.id !== id);
    }
    localStorage.setItem('commassess_' + store, JSON.stringify(updated));
  }

  function _localGetByIndex(store, field, value) {
    const list = _localGetAll(store);
    return list.filter(r => r[field] === value);
  }

  async function _seedLocalStorageDefaults() {
    const storedAdmins = _localGet('settings', 'adminUsers');
    let users = [];
    if (storedAdmins) {
      try {
        users = JSON.parse(storedAdmins.value || storedAdmins || '[]');
      } catch (_) {
        users = [];
      }
    }
    if (!Array.isArray(users) || users.length === 0) {
      users = [
        { username: 'admin', password: 'admin123' },
        { username: 'girish', password: 'admin123' },
        { username: 'harish', password: 'admin123' },
        { username: 'freeda', password: 'admin123' }
      ];
    } else {
      // Ensure 'admin' exists
      if (!users.some(u => u.username.toLowerCase() === 'admin')) {
        users.push({ username: 'admin', password: 'admin123' });
      }
      // Ensure 'girish' exists and password is reset to 'admin123'
      const girishUser = users.find(u => u.username.toLowerCase() === 'girish');
      if (girishUser) {
        girishUser.password = 'admin123';
      } else {
        users.push({ username: 'girish', password: 'admin123' });
      }
      // Ensure 'harish' exists and password is reset to 'admin123'
      const harishUser = users.find(u => u.username.toLowerCase() === 'harish');
      if (harishUser) {
        harishUser.password = 'admin123';
      } else {
        users.push({ username: 'harish', password: 'admin123' });
      }
      // Ensure 'freeda' exists and password is reset to 'admin123'
      const freedaUser = users.find(u => u.username.toLowerCase() === 'freeda');
      if (freedaUser) {
        freedaUser.password = 'admin123';
      } else {
        users.push({ username: 'freeda', password: 'admin123' });
      }
    }
    _localPut('settings', { key: 'adminUsers', value: JSON.stringify(users) });

    const storedPwd = _localGet('settings', 'adminPassword');
    if (!storedPwd) {
      _localPut('settings', { key: 'adminPassword', value: 'admin123' });
    }

    // Always (re)seed default topics into localStorage while running in
    // offline/fallback mode — previously this only ran _seedManagerTopics()
    // and only on a brand-new browser (inside the `!storedPwd` check above),
    // so any topic added after a trainee's first-ever load — including a
    // trainee whose Supabase ping simply timed out once — would never reach
    // their local copy, producing a permanent "No topics available" error
    // for that module even though the code/deployment was correct.
    try {
      await _seedDefaults();
    } catch (e) {
      console.warn('[DB] Local default-topic seeding failed:', e.message || e);
    }
    try {
      await _seedManagerTopics();
    } catch (e) {
      console.warn('[DB] Local manager-topic seeding failed:', e.message || e);
    }
  }

  // ---- Public: initialise Supabase client ----
  let _dbInitialized = false;
  async function init() {
    if (_dbInitialized) return;
    try {
      if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR_SUPABASE') || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')) {
        throw new Error('Supabase placeholder URL — using local storage');
      }
      _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      const pingPromise = _sb.from('settings').select('key').limit(1);
      // Was 2000ms — too aggressive on a slower/mobile connection, which
      // tipped otherwise-healthy sessions into the LocalStorage fallback
      // path (see _seedLocalStorageDefaults) and made newly-added modules
      // look like "No topics available" for those trainees.
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase connection timeout')), 6000));
      const { error } = await Promise.race([pingPromise, timeoutPromise]);
      if (error) throw error;

      // Run these independently: a failure seeding trainee topics should
      // never prevent manager topics from being (re)seeded, and vice versa.
      try {
        await _seedDefaults();
      } catch (seedErr) {
        console.warn('[DB] Seeding default topics skipped or failed:', seedErr.message || seedErr);
      }
      try {
        await _seedManagerTopics();
      } catch (seedErr) {
        console.warn('[DB] Seeding manager topics skipped or failed:', seedErr.message || seedErr);
      }

      console.log('[DB] Supabase connected successfully.');
      await _migrateLocalStorageToSupabase();
      _dbInitialized = true;
    } catch (e) {
      console.warn('[DB] Supabase unavailable, using LocalStorage fallback:', e.message || e);
      _useLocalStorage = true;
      await _seedLocalStorageDefaults();
      _dbInitialized = true;
    }
  }

  // ---- Migrate data saved locally during outage back to Supabase ----
  //
  // Two bugs fixed here (2026-09-16), found while investigating ~15 trainees
  // whose completed assessments never showed up in admin after a Supabase
  // project pause:
  //
  // 1. Supabase-js v2 calls do NOT throw on an API-level error (400, 409,
  //    RLS rejection, etc.) — they resolve normally with `{ data, error }`.
  //    The old code never checked `error`, so a rejected upsert/insert was
  //    silently treated as a success: no warning was ever logged for it.
  //    Every `_sb...` call below now destructures `error` and throws it so
  //    the per-item catch below actually sees these failures.
  //
  // 2. Regardless of (1), the old code called `_localClear(store)`
  //    unconditionally after the per-item loop — even for items whose
  //    migration had failed. That permanently discarded the only copy of
  //    that trainee's local data. Now only items that migrated successfully
  //    are cleared; anything that failed is written back to local storage
  //    so it's retried automatically on the trainee's next visit instead of
  //    being lost.
  async function _migrateLocalStorageToSupabase() {
    try {
      const stores = ['trainees', 'topics', 'sessions', 'ai_audit_scores', 'settings'];
      for (const store of stores) {
        const localItems = _localGetAll(store);
        if (localItems.length === 0) continue;

        console.log(`[DB] Found ${localItems.length} unsynced items in local storage for ${store}. Migrating to Supabase...`);
        const failedItems = [];
        for (const item of localItems) {
          try {
            if (store === 'settings') {
              // Settings key merge (e.g. merge team assignments, avoid overwriting adminUsers entirely unless default)
              if (item.key === 'adminUsers') continue; // don't push default admins over customized cloud database admins
              const { error } = await _sb.from('settings').upsert({ key: item.key, value: item.value }, { onConflict: 'key' });
              if (error) throw error;
            } else {
              const dbData = _toDB(store, item);
              let error;
              if (item.id) {
                ({ error } = await _sb.from(store).upsert(dbData, { onConflict: 'id' }));
              } else {
                ({ error } = await _sb.from(store).insert(dbData));
              }
              if (error) throw error;
            }
          } catch (itemErr) {
            console.warn(`[DB] Migration failed for item in ${store} (kept in local storage for retry):`, itemErr.message || itemErr);
            failedItems.push(item);
          }
        }
        // Only clear what actually made it to Supabase — see note above.
        if (failedItems.length > 0) {
          localStorage.setItem('commassess_' + store, JSON.stringify(failedItems));
          console.warn(`[DB] ${failedItems.length} of ${localItems.length} item(s) in ${store} failed to migrate and were kept locally; will retry next load.`);
        } else {
          _localClear(store);
        }
        console.log(`[DB] Completed migration for ${store}.`);
      }
    } catch (e) {
      console.warn('[DB] Automatic migration failed:', e.message || e);
    }
  }

  // Push a topic's current seed content onto an already-seeded row of the
  // same (module,title) when the deployed version is newer than what's
  // stored — see the call site inside _seedDefaults() for the full
  // rationale. No-ops for a title that isn't seeded yet (the normal insert
  // path will create it fresh, already correct) or if it's already current.
  //
  // NOTE: this used to only look up `defaults.find(t => t.module === module)`
  // — i.e. exactly ONE default title per module. That was fine back when
  // 'ops-call-assessment' was a single bundled topic, but it silently broke
  // once that topic was split into 4 separate conceptual titles (CDSL,
  // Nominee, Short Delivery, Suspended Stocks): only the first of the 4 ever
  // got refreshed, so the 4-questions-per-topic content survived in
  // already-seeded databases even after this file was updated to 8 questions
  // per topic. Fixed to loop over every default title for the module.
  async function _refreshOpsScriptIfStale(module, currentVersion, defaults, existing) {
    const defsForModule = defaults.filter(t => t.module === module);
    if (!defsForModule.length) return;

    const versionKey = `${module}ScriptVersion`;
    let storedVersion = 0;
    if (_useLocalStorage) {
      const rec = _localGet('settings', versionKey);
      storedVersion = rec ? (parseInt(rec.value || rec, 10) || 0) : 0;
    } else {
      const { data } = await _sb.from('settings').select('*').eq('key', versionKey);
      storedVersion = (data && data[0]) ? (parseInt(data[0].value, 10) || 0) : 0;
    }
    if (storedVersion >= currentVersion) return;

    let hadError = false;
    for (const def of defsForModule) {
      const liveRow = existing.find(t => t.module === module && t.title === def.title);
      if (!liveRow) continue; // not seeded yet — the normal insert path below creates it fresh, already correct

      const patch = { description: def.description, scenario: def.scenario, checklist: def.checklist, bot_script: def.bot_script };
      if (_useLocalStorage) {
        const localTopics = _localGetAll('topics');
        const idx = localTopics.findIndex(t => t.module === module && t.title === def.title);
        if (idx !== -1) {
          localTopics[idx] = { ...localTopics[idx], ...patch };
          localStorage.setItem('commassess_topics', JSON.stringify(localTopics));
        }
      } else {
        const { error: refreshErr } = await _sb.from('topics').update(patch).eq('module', module).eq('title', def.title);
        if (refreshErr) {
          console.error(`[DB] Failed to refresh ${module} topic "${def.title}":`, refreshErr);
          hadError = true;
        }
      }
    }

    if (hadError) return; // don't bump the version marker if any update failed — retry on next load

    if (_useLocalStorage) {
      _localPut('settings', { key: versionKey, value: String(currentVersion) });
    } else {
      await _sb.from('settings').upsert({ key: versionKey, value: String(currentVersion) }, { onConflict: 'key' });
    }
    console.log(`[DB] Refreshed ${module} topic content (${defsForModule.length} title(s)) to v${currentVersion}.`);
  }

  // ---- Seed default topics on first run ----
  async function _seedDefaults(force = false) {
    try {
      // Seed default admin users
      try {
        const { data: adminData } = await _sb.from('settings').select('*').eq('key', 'adminUsers');
        if (!adminData || adminData.length === 0) {
          const defaultAdmins = [
            { username: 'admin', password: 'admin123' },
            { username: 'girish', password: 'admin123' },
            { username: 'harish', password: 'admin123' },
            { username: 'freeda', password: 'admin123' }
          ];
          await _sb.from('settings').upsert({ key: 'adminUsers', value: JSON.stringify(defaultAdmins) }, { onConflict: 'key' });
        } else {
          let users = [];
          try { users = JSON.parse(adminData[0].value || '[]'); } catch (_) {}
          // Ensure 'admin' exists
          if (!users.some(u => u.username.toLowerCase() === 'admin')) {
            users.push({ username: 'admin', password: 'admin123' });
          }
          // Ensure 'girish' exists and password is reset to 'admin123'
          const girishUser = users.find(u => u.username.toLowerCase() === 'girish');
          if (girishUser) {
            girishUser.password = 'admin123';
          } else {
            users.push({ username: 'girish', password: 'admin123' });
          }
          // Ensure 'harish' exists and password is reset to 'admin123'
          const harishUser = users.find(u => u.username.toLowerCase() === 'harish');
          if (harishUser) {
            harishUser.password = 'admin123';
          } else {
            users.push({ username: 'harish', password: 'admin123' });
          }
          // Ensure 'freeda' exists and password is reset to 'admin123'
          const freedaUser = users.find(u => u.username.toLowerCase() === 'freeda');
          if (freedaUser) {
            freedaUser.password = 'admin123';
          } else {
            users.push({ username: 'freeda', password: 'admin123' });
          }
          await _sb.from('settings').upsert({ key: 'adminUsers', value: JSON.stringify(users) }, { onConflict: 'key' });
        }
      } catch (adminErr) {
        console.warn('[DB] Admin users seeding failed:', adminErr.message);
      }

      // Cleanup of old suffix-heavy titles to keep database clean
      const oldTitles = [
        'Physical Delivery Penalty – ITM Options Expired (Written Chat)',
        'IMPS Credit Delay – Missed Trade Dispute (Written Chat)',
        'Short Delivery Auction Penalty – IPO Shares Sale (Written Chat)',
        'Double Billing Dispute – Irate Client (Written Chat)',
        'Service Outage – Compensation Request (Written Chat)',
        'Physical Delivery Penalty – ITM Stock Options Expired Without Funds (Written Chat)',
        'IMPS Credit Delay – Missed Intraday Trade and Loss of Opportunity (Written Chat)',
        'Short Delivery Auction Penalty – Client Sold Recently Allotted IPO Shares (Written Chat)',
        'Angry Customer – Double Billing (Written Chat)',
        'Service Outage – Status Call (Written Chat)',
        'Angry Customer – Double Billing (Written Mail)',
        'Service Outage – Status Call (Written Mail)',
        'Physical Delivery Penalty – ITM Stock Options Expired Without Funds (Written Mail)',
        'IMPS Credit Delay – Missed Intraday Trade and Loss of Opportunity (Written Mail)',
        'Short Delivery Auction Penalty – Client Sold Recently Allotted IPO Shares (Written Mail)',
        'Account Modification – Name Change Document Rejection (Written Mail)',
        'Name Change – Client Refuses to Submit Gazette Notification (Written Mail)',
        'Takeover Offer – Client Insists Despite Higher Market Price (Written Mail)',
        'NCRP Lien – Delayed Payment Charges on Frozen Funds (Written Mail)',
        'Minor Account – Premature Blocking Before 18th Birthday (Written Mail)',
        'Emergency Withdrawal – Blocked Due to Open Long Index Options (Written Mail)',
        'Pledged Stocks – Undisclosed Aging Debit Balance & Trading Losses (Written Mail)'
      ];

      if (_useLocalStorage) {
        try {
          const localTopics = _localGetAll('topics');
          const filtered = localTopics.filter(t => !oldTitles.includes(t.title));
          localStorage.setItem('commassess_topics', JSON.stringify(filtered));
        } catch (_) {}
      } else {
        try {
          await _sb.from('topics').delete().in('title', oldTitles);
        } catch (e) {
          console.warn('[DB] Cloud cleanup of old titles failed:', e.message);
        }
      }

      let existing = [];
      if (_useLocalStorage) {
        existing = _localGetAll('topics');
      } else {
        const { data: res } = await _sb.from('topics').select('module, title, bot_script');
        existing = res || [];
      }

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
        {
          module: 'mock-call',
          title: 'Angry Customer – Double Billing',
          description: 'A customer calls furious about being charged twice for the same service.',
          scenario: 'You receive an inbound support call. The customer says: "I\'ve been charged TWICE this month and nobody is helping me! This is completely unacceptable — I want my money back NOW!"',
          checklist: ['Greet professionally and introduce yourself','Acknowledge the frustration with empathy','Verify the account details calmly','Offer a clear resolution or escalation path','Close the call warmly and professionally'],
          bot_script: [
            "I've been charged twice this month for my subscription fee! This is completely unacceptable. Why is my money being deducted twice without my permission?",
            "I checked my bank statement and both debits are cleared. I want my money back in my account right now. I shouldn't have to wait for your system errors.",
            "Can you send me a written confirmation or receipt right now showing that the refund has been processed? I don't trust verbal promises.",
            "Fine, I will check my bank account in 3 days. If it's not there, I will escalate this. Is there anything else you can do to make up for this trouble?"
          ],
          enabled: true
        },
        {
          module: 'mock-call',
          title: 'Service Outage – Status Call',
          description: 'Customer has had a 2-day service outage and wants a status update and compensation.',
          scenario: 'Customer says: "My internet has been down for 2 days straight. I work from home — this is costing me real clients and money. What exactly are you doing about it, and what compensation am I getting?"',
          checklist: ['Show genuine empathy for the business impact','Provide an honest and accurate status update','Offer a practical interim workaround if possible','Set realistic expectations on resolution timeline','Make a clear follow-up commitment'],
          bot_script: [
            "My internet has been down for 2 days straight. I work from home — this is costing me real clients and money. What exactly are you doing about it, and what compensation am I getting?",
            "I have already tried restarting my router and checking the cables — your basic troubleshooting is not the issue. Your main server in my area is down. When will it be fixed?",
            "I am losing over ₹5,000 every day this service is down. Your company needs to compensate me for this loss of income. It is a direct result of your server outage.",
            "Fine, log a formal complaint and give me the ticket number. I expect a credit adjustment on my next bill for the outage duration."
          ],
          enabled: true
        },
        {
          module: 'mock-call',
          title: 'Physical Delivery Penalty – ITM Stock Options Expired Without Funds',
          description: 'When an in-the-money (ITM) stock option is held to expiry, it is subject to physical delivery under exchange rules — meaning the buyer must pay the full contract value to take delivery of the underlying shares, and the seller must deliver them. If a client holds such an option at expiry without adequate funds or shares in their account, the position goes into compulsory physical delivery, resulting in auction penalties, margin shortfall charges, and possible financial loss. The client was not aware of this obligation and had assumed the position would simply expire or be cash-settled.',
          scenario: 'You receive an inbound support call. The client is furious about an unexpected penalty debited from their account after their ITM stock options expired without sufficient funds for physical delivery. They are demanding a full refund, claiming they were never informed about the physical delivery obligation.',
          checklist: [
            'Greet professionally and introduce yourself',
            'Empathize with the client\'s shock and acknowledge the financial impact of the unexpected penalty',
            'Clearly explain the physical delivery obligation for ITM stock options at expiry and that this is an exchange-mandated rule, not a broker policy',
            'Explain why the auto square-off may not have been triggered — ITM positions within the do-not-exercise range are not squared off automatically',
            'Walk the client through the penalty structure — what amount was charged, why it was applied, and which exchange circular governs it',
            'Escalate to the Risk or Compliance team and check whether any waiver or partial adjustment is possible, while setting honest expectations',
            'Close the call warmly and professionally'
          ],
          bot_script: [
            "I had absolutely no idea my options would go to physical delivery. Your platform never showed me a single warning before expiry. Why wasn't I informed that I needed funds to take delivery of the actual shares?",
            "I clearly did not have the funds for physical delivery — your own system would have shown that. So why was the position allowed to expire instead of being squared off automatically before expiry?",
            "I'm looking at my account right now and there is a debit for a physical delivery penalty that I never authorised. How is this even legal?",
            "I want the full penalty amount reversed. If your platform failed to warn me and failed to auto square-off my position, the fault is yours. Please reverse it or give me the contact of your nodal officer."
          ],
          enabled: true
        },
        {
          module: 'mock-call',
          title: 'IMPS Credit Delay – Missed Intraday Trade and Loss of Opportunity',
          description: 'IMPS (Immediate Payment Service) transfers are designed to credit funds near-instantly, typically within minutes. However, broker-end fund availability depends on payment gateway processing, bank batch timings, and internal risk checks — which can sometimes cause a delay between the bank\'s confirmation timestamp and when the funds appear as tradeable balance on the platform. A client who transferred funds early in the morning before a significant market move experienced this delay, missing an intraday opportunity, and is now holding the broker directly responsible for the financial loss.',
          scenario: 'You receive an inbound support call. The client transferred funds via IMPS at 9:10 AM — before market open — and the money only reflected as tradeable balance at 11:45 AM. In the intervening time, a stock they intended to buy moved 15% intraday. The client is demanding compensation for the missed opportunity and is threatening to escalate formally.',
          checklist: [
            'Greet professionally and introduce yourself',
            'Acknowledge the client\'s frustration and the financial impact of the missed opportunity without deflecting or dismissing their concern',
            'Explain the IMPS fund credit process — while IMPS is near-instant at the bank level, broker-end tradeable balance availability depends on payment gateway batch processing, T+0 cut-off windows, and internal risk checks',
            'Clarify the distinction between the bank\'s IMPS confirmation timestamp and the broker\'s fund availability timestamp',
            'Commit to investigating the specific delay with the payments and technology team, and to providing the client with a written explanation',
            'Explain the limitations on opportunity-loss compensation clearly and empathetically',
            'Close the call warmly and professionally'
          ],
          bot_script: [
            "I transferred funds via IMPS at 9:10 AM — I have the bank transaction receipt right here. Your platform only showed the money as available at 11:45 AM. IMPS is supposed to be instant — what exactly happened on your end?",
            "Because of that delay, I missed a trade that moved 15% intraday. That is a direct financial loss caused entirely by your system's failure to credit my account on time. I want compensation.",
            "I have used IMPS with other brokers and the funds always show within minutes — not hours. This is clearly a failure specific to your platform. Who is accountable here?",
            "If you cannot compensate me for the missed trade, I want the direct contact of your nodal officer and the SEBI SCORES complaint category for payment delays. I will file the complaint today."
          ],
          enabled: true
        },
        {
          module: 'mock-call',
          title: 'Short Delivery Auction Penalty – Client Sold Recently Allotted IPO Shares',
          description: 'When shares are allotted through an IPO, they follow a T+2 settlement cycle before they appear as freely tradeable in the demat account. If a client attempts to sell these shares before settlement is complete, the trade is accepted by the exchange but results in short delivery — because the shares cannot be delivered on settlement day. The exchange then runs an auction to source the undelivered shares, and the original seller is charged an auction penalty, which can be significantly higher than the market price. The client in this scenario was unaware of the settlement lock-in and is furious that the platform allowed the sell order to go through when delivery was not possible.',
          scenario: 'You receive an inbound support call. The client received IPO allotment shares and sold them the next day, believing they were freely tradeable. The sell order was accepted by the platform, but when delivery failed, the exchange ran an auction and debited a penalty from the client\'s account. The client is demanding a full reversal, arguing that the platform should have blocked an order it could not deliver.',
          checklist: [
            'Greet professionally and introduce yourself',
            'Empathize genuinely with the client\'s frustration and acknowledge the unexpected penalty debit without minimising the impact',
            'Explain the T+2 settlement cycle for IPO-allotted shares — shares are credited to the demat after allotment but are not deliverable until the settlement cycle completes',
            'Clarify that while the sell order being accepted on the exchange does not guarantee delivery capability — the exchange and broker systems operate in layers',
            'Walk through the auction penalty mechanism clearly — when short delivery occurs, the exchange sources shares via an auction and charges a penalty',
            'Escalate to the Operations or Risk team for a formal review of whether the penalty can be waived or adjusted, and commit to a clear TAT',
            'Close the call warmly and professionally'
          ],
          bot_script: [
            "I sold shares that your platform allowed me to sell — the order went through. Now you are telling me there is an auction penalty because of short delivery? Why did your platform accept the order in the first place?",
            "I just received these shares through an IPO allotment. Nobody told me there was a settlement period before I could sell. Shouldn't your system block the sale automatically?",
            "There is a significant debit for an auction penalty taken from my account. Your system created this situation by accepting an order it could not fulfil. How is that acceptable?",
            "I want the full auction penalty reversed. If you are not able to reverse it, I want the name of your grievance officer and the SEBI SCORES complaint link."
          ],
          enabled: true
        },

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
        
        // Written Communication — Static
        { module: 'written-comm', title: 'Project Delay Notification Email',
          description: 'Inform a client that a project will be delayed by 2 weeks due to unexpected technical issues.',
          scenario: 'To: Client (Sarah Mitchell, TechCorp)\nFrom: You\nSubject: [Write your own subject line]\n\nContext: The project was due this Friday. A critical API dependency failed late last week. The revised delivery date is 2 weeks from now.',
          checklist: ['Professional and honest subject line','Warm and professional greeting','Clear explanation without over-justifying','Revised timeline with a firm commitment','Apology that acknowledges impact on the client','Professional closing with next steps'] },
        { module: 'written-comm', title: 'Internal Escalation Memo',
          description: 'Write an internal memo escalating a recurring vendor delivery issue.',
          scenario: 'To: Your Manager (Rajesh Kumar, VP Operations)\nFrom: You\nSubject: [Write your own subject line]\n\nContext: Vendor X has missed 3 consecutive weekly deliveries. Each delay causes a 1-2 day productivity loss for your 5-person team.',
          checklist: ['Clear problem statement in the opening line','Quantified impact (time, people, cost if applicable)','Brief timeline of events and prior actions taken','Your recommendation or specific ask','Concise, professional tone throughout'] },

        // Written Communication — Interactive Email Correspondence
        {
          module: 'written-comm',
          title: 'Angry Customer – Double Billing',
          description: 'A customer has sent an email support request, furious about being charged twice for the same service.',
          scenario: 'A client opens a support email: "I have been charged twice for my subscription this month, and nobody is helping me! I want my refund immediately and a written confirmation."',
          checklist: [
            'Greet professionally and apologize sincerely for the billing error',
            'Verify the double debit transaction IDs on the client\'s billing ledger',
            'Initiate the refund request immediately and state the bank processing TAT (3-5 working days)',
            'Offer a reference number or ticket confirmation for tracking the refund',
            'Close the email politely, confirming if they have any other questions'
          ],
          bot_script: [
            "I've been charged twice this month for my subscription fee! This is completely unacceptable. Why is my money being deducted twice without my permission?",
            "I checked my bank statement and both debits are cleared. I want my money back in my account right now. I shouldn't have to wait for your system errors.",
            "Can you send me a written confirmation or receipt right now showing that the refund has been processed? I don't trust verbal promises.",
            "Fine, I will check my bank account in 3 days. If it's not there, I will escalate this. Is there anything else you can do to make up for this trouble?"
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Service Outage – Status Call',
          description: 'Customer has sent an email about a 2-day service outage, requesting a status update and compensation.',
          scenario: 'A client writes a support email: "My internet has been down for 2 days straight. I work from home — this is costing me real clients and money. What exactly are you doing about it, and what compensation am I getting?"',
          checklist: [
            'Acknowledge the system outage with sincere apologies and empathy for the impact',
            'Explain the root cause of the outage briefly and transparently',
            'Explain SEBI guidelines and platform terms of service regarding tech outages and opportunity losses',
            'Verify and log the client\'s affected position details for the technical investigation team',
            'Provide a formal support ticket number and outline the next follow-up steps'
          ],
          bot_script: [
            "My internet has been down for 2 days straight. I work from home — this is costing me real clients and money. What exactly are you doing about it, and what compensation am I getting?",
            "I have already tried restarting my router and checking the cables — your basic troubleshooting is not the issue. Your main server in my area is down. When will it be fixed?",
            "I am losing over ₹5,000 every day this service is down. Your company needs to compensate me for this loss of income. It is a direct result of your server outage.",
            "Fine, log a formal complaint and give me the ticket number. I expect a credit adjustment on my next bill for the outage duration."
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Physical Delivery Penalty – ITM Stock Options Expired Without Funds',
          description: 'When an in-the-money (ITM) stock option is held to expiry, it is subject to physical delivery under exchange rules — meaning the buyer must pay the full contract value to take delivery of the underlying shares, and the seller must deliver them. If a client holds such an option at expiry without adequate funds or shares in their account, the position goes into compulsory physical delivery, resulting in auction penalties, margin shortfall charges, and possible financial loss. The client was not aware of this obligation and had assumed the position would simply expire or be cash-settled.',
          scenario: 'A client has sent a support email: "I had absolutely no idea my stock options would go to physical delivery. Your platform didn\'t show any warnings. Why wasn\'t I informed that I needed funds to take delivery of the actual shares? I demand a refund of the penalty!"',
          checklist: [
            'Greet professionally and address the client by name if provided',
            'Acknowledge the client\'s frustration and shock regarding the physical delivery penalty',
            'Explain the compulsory physical delivery obligation for ITM options under exchange rules',
            'Explain why the auto square-off was not triggered for their specific position',
            'Propose a formal escalation to compliance for ledger review while setting realistic expectations'
          ],
          bot_script: [
            "I had absolutely no idea my options would go to physical delivery. Your platform never showed me a single warning before expiry. Why wasn't I informed that I needed funds to take delivery of the actual shares?",
            "I clearly did not have the funds for physical delivery — your own system would have shown that. So why was the position allowed to expire instead of being squared off automatically before expiry?",
            "I'm looking at my account right now and there is a debit for a physical delivery penalty that I never authorised. How is this even legal?",
            "I want the full penalty amount reversed. If your platform failed to warn me and failed to auto square-off my position, the fault is yours. Please reverse it or give me the contact of your nodal officer."
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'IMPS Credit Delay – Missed Intraday Trade and Loss of Opportunity',
          description: 'IMPS (Immediate Payment Service) transfers are designed to credit funds near-instantly, typically within minutes. However, broker-end fund availability depends on payment gateway processing, bank batch timings, and internal risk checks — which can sometimes cause a delay between the bank\'s confirmation timestamp and when the funds appear as tradeable balance on the platform. A client who transferred funds early in the morning before a significant market move experienced this delay, missing an intraday opportunity, and is now holding the broker directly responsible for the financial loss.',
          scenario: 'A client opens an email support ticket: "I transferred funds via IMPS at 9:10 AM, but they only showed up in my account at 11:45 AM! Because of this, I missed a stock buy order that went up 15% today. This is completely your system\'s fault, and I want compensation!"',
          checklist: [
            'Acknowledge the frustration regarding the delay and the missed market opportunity',
            'Explain the payment gateway flow and batch processing timelines for IMPS transfers',
            'Clarify the distinction between bank confirmation and broker-end ledger credit',
            'Commit to checking gateway logs and providing a written explanation for the delay',
            'State politely but clearly that opportunity-loss compensation is not possible under standard policies'
          ],
          bot_script: [
            "I transferred funds via IMPS at 9:10 AM — I have the bank transaction receipt right here. Your platform only showed the money as available at 11:45 AM. IMPS is supposed to be instant — what exactly happened on your end?",
            "Because of that delay, I missed a trade that moved 15% intraday. That is a direct financial loss caused entirely by your system's failure to credit my account on time. I want compensation.",
            "I have used IMPS with other brokers and the funds always show within minutes — not hours. This is clearly a failure specific to your platform. Who is accountable here?",
            "If you cannot compensate me for the missed trade, I want the direct contact of your nodal officer and the SEBI SCORES complaint category for payment delays. I will file the complaint today."
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Short Delivery Auction Penalty – Client Sold Recently Allotted IPO Shares',
          description: 'When shares are allotted through an IPO, they follow a T+2 settlement cycle before they appear as freely tradeable in the demat account. If a client attempts to sell these shares before settlement is complete, the trade is accepted by the exchange but results in short delivery — because the shares cannot be delivered on settlement day. The exchange then runs an auction to source the undelivered shares, and the original seller is charged an auction penalty, which can be significantly higher than the market price. The client in this scenario was unaware of the settlement lock-in and is furious that the platform allowed the sell order to go through when delivery was not possible.',
          scenario: 'A client writes in a support email: "I sold the IPO shares I was allotted, and your platform executed the trade. Now I see a huge auction penalty on my ledger! If they couldn\'t be delivered, why did you let me sell them? I want this penalty reversed immediately."',
          checklist: [
            'Empathize with the client\'s surprise at the penalty and acknowledge the financial impact',
            'Explain the T+2 settlement cycle for newly allotted IPO shares',
            'Explain how order placement and post-trade settlement checks operate in separate layers',
            'Explain the exchange-mandated auction penalty mechanism for short delivery',
            'Initiate a review with the risk operations team while setting honest expectations'
          ],
          bot_script: [
            "I sold shares that your platform allowed me to sell — the order went through. Now you are telling me there is an auction penalty because of short delivery? Why did your platform accept the order in the first place?",
            "I just received these shares through an IPO allotment. Nobody told me there was a settlement period before I could sell. Shouldn't your system block the sale automatically?",
            "There is a significant debit for an auction penalty taken from my account. Your system created this situation by accepting an order it could not fulfil. How is that acceptable?",
            "I want the full auction penalty reversed. If you are not able to reverse it, I want the name of your grievance officer and the SEBI SCORES complaint link."
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Account Modification – Name Change Document Rejection',
          description: 'A client submitted an Account Modification Form (Name Change). The documents were verified internally and couriered, but were later rejected by the processing team. The client writes in seeking clarification, as the documents were sent only after internal verification.',
          scenario: 'A client writes in a support email: "I was told by your team that my documents were perfectly fine before I couriered them. Now you\'re saying they\'re rejected — can you explain how that even happens?"',
          checklist: [
            "Stay calm and professional throughout",
            "Acknowledge the client's frustration with empathy",
            "Explain the internal vs external verification process clearly",
            "Offer a concrete resolution path (re-submission support, escalation)",
            "Confirm next steps in writing before ending the correspondence"
          ],
          bot_script: [
            "I was told by your team that my documents were perfectly fine before I couriered them. Now you're saying they're rejected — can you explain how that even happens?",
            "Do you have any idea how long it takes to get these documents arranged and couriered? Who is going to compensate me for that effort and cost?",
            "I specifically called and confirmed before sending. Do your teams not talk to each other?",
            "I don't want to hear 'I'll check and get back to you' — I've been patient enough. What is the exact reason my documents were rejected?"
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Name Change – Client Refuses to Submit Gazette Notification',
          description: 'A client requests a name change on their account. The Gazette notification is mandatory for processing. The client refuses to submit it, claiming other documents (Aadhaar, PAN, passport) should be sufficient, and insists on an exception.',
          scenario: 'A client writes in a support email: "I\'ve been your customer for so many years — isn\'t my word enough? Why do I need to prove my own name to you? I have my Aadhaar, PAN, and passport all updated with my new name."',
          checklist: [
            "Empathetically acknowledge the inconvenience",
            "Clearly explain the regulatory/policy reason for the Gazette requirement",
            "Guide the client on how to obtain a Gazette notification if possible",
            "Offer escalation path without overpromising exceptions",
            "Close professionally with a clear next step"
          ],
          bot_script: [
            "I\'ve been your customer for so many years — isn\'t my word enough? Why do I need to prove my own name to you?",
            "I have my Aadhaar, PAN, and passport all updated with my new name. Why isn\'t that sufficient? Why specifically a Gazette notification?",
            "Other institutions have updated my name without a Gazette — why is your process so outdated and complicated?",
            "Who made this rule? Is this a government regulation or just your company\'s internal policy? Show me where it\'s written."
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Takeover Offer – Client Insists Despite Higher Market Price',
          description: 'A client wants to apply for a takeover offer through Console/Kite. The policy allows takeover applications only when the market price is lower than the takeover price. In this case, the market price is higher, so the client must raise a support ticket instead of applying directly.',
          scenario: 'A client writes in a support email: "If I\'m willing to proceed at a higher takeover price, that\'s my financial decision to make — why is your system blocking me from doing that?"',
          checklist: [
            "Explain the policy and the reason behind the price-based restriction clearly",
            "Empathise with the urgency of the live market situation",
            "Walk the client through the ticket process step by step",
            "Set realistic expectations on turnaround time",
            "Offer to assist while the ticket is being raised"
          ],
          bot_script: [
            "If I\'m willing to proceed at a higher takeover price, that\'s my financial decision to make — why is your system blocking me from doing that?",
            "You\'re allowing it through Console when the market price is lower — so the system can process takeovers. Why is the same Console suddenly off-limits when the price is higher?",
            "What is the business logic behind this restriction? Is this a SEBI regulation or your internal risk policy? I want a clear answer.",
            "If I\'m the one bearing the financial risk of a higher takeover price, why does your organisation get to decide whether I can proceed or not?"
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'NCRP Lien – Delayed Payment Charges on Frozen Funds',
          description: 'A client calls/writes about delayed payment charges on their account. The funds were marked as Lien following an NCRP complaint. The client has filed a police complaint and claims they are not at fault. Due to the lien, the account moved into debit and delayed payment charges were applied.',
          scenario: 'A client writes in a support email: "I am the victim here — someone filed a complaint against me fraudulently, and instead of protecting me, you\'ve frozen my own money. How does that make any sense?"',
          checklist: [
            "Empathise genuinely — the client is a victim in this situation",
            "Clearly explain the regulatory obligation behind the Lien (NCRP directive)",
            "Explain the NOC process accurately and which authority issues it",
            "Address the delayed payment charges with sensitivity and escalation path",
            "Commit to sending a written summary of the correspondence and next steps"
          ],
          bot_script: [
            "I am the victim here — someone filed a complaint against me fraudulently, and instead of protecting me, you\'ve frozen my own money. How does that make any sense?",
            "I have already filed a police complaint proving I am not at fault. Why is that not enough for you to release my funds immediately?",
            "Did you even bother to verify the complaint before marking my funds as Lien? Or did you just act on it blindly without informing me?",
            "When exactly was the Lien marked, and why was I not notified immediately? I had to find out on my own — is that your standard process?"
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Minor Account – Premature Blocking Before 18th Birthday',
          description: 'A client\'s daughter had her minor account blocked 15 days before her 18th birthday as part of the system\'s majority-attainment process. The client argues the block should only trigger after she officially turns 18, and claims missed trading opportunities during those 15 days.',
          scenario: 'A client writes in a support email: "My daughter\'s account was blocked 15 days before her birthday — can you show me exactly which policy or clause says you are authorised to block an account before she even turns 18? Because as far as I know, she was still a minor and the account should have remained active."',
          checklist: [
            "Acknowledge the client's frustration and validate the concern",
            "Explain the policy reason for early blocking (system-triggered majority process)",
            "Clearly outline the unblocking and minor-to-major conversion steps",
            "Give a realistic commitment on resolution timeline",
            "Offer to send written confirmation of the process and timeline"
          ],
          bot_script: [
            "My daughter\'s account was blocked 15 days before her birthday — can you show me exactly which policy or clause says you are authorised to block an account before she even turns 18? Because as far as I know, she was still a minor and the account should have remained active.",
            "Those 15 days may seem small to you, but there were market movements and investment opportunities during that period that we completely missed out on. Who in your organisation is going to take accountability for that financial loss?",
            "I have been a loyal client for years. Is this how you treat long-standing customers — by blocking accounts without even sending a prior notice or warning? Why was I not informed before this action was taken?",
            "If your system triggered this block automatically, then clearly there is a flaw in your process. How do I know this kind of error won\'t happen again with my other accounts or future transactions?"
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Emergency Withdrawal – Blocked Due to Open Long Index Options',
          description: 'A client requests an instant withdrawal citing a personal emergency. Their account has an open long index options position. Policy disallows instant withdrawal with open positions. The client argues that long options have limited (capped) downside and insists the withdrawal should be allowed.',
          scenario: 'A client writes in a support email: "I have been waiting for over an hour now and nobody has given me a answer. Why does your platform even allow me to put my money in if you can\'t give it back to me when I need it the most?"',
          checklist: [
            "Empathise deeply with the emergency situation",
            "Explain the policy on withdrawals with open positions clearly and calmly",
            "Acknowledge the limited-loss nature of long options while holding firm on policy",
            "Walk through the emergency payout request process step by step",
            "Escalate proactively if the situation genuinely warrants it"
          ],
          bot_script: [
            "I have been waiting for over an hour now and nobody has given me a clear answer. Why does your platform even allow me to put my money in if you can\'t give it back to me when I need it the most?",
            "I understand there\'s something called limited loss on my position — does that mean my money is already safe? Then why can\'t you just release it to me right now?",
            "I never signed anything that said my funds would be locked. Where exactly in your terms does it say you can block my withdrawal? Can you read it out to me?",
            "If I close my options position right now and take the loss, will you process my withdrawal immediately? Or are you going to find another reason to hold my money?"
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'Pledged Stocks – Undisclosed Aging Debit Balance & Trading Losses',
          description: 'A client pledged stocks after calling/writing support but was not informed about an existing aging debit balance. They used the collateral margin to trade, incurred losses, and are now demanding a refund — claiming the support representative\'s omission directly caused the losses.',
          scenario: 'A client writes in a support email: "I specifically called/wrote your team before pledging my stocks and asked all the necessary questions. Why was I never told that there was an existing debit balance on my account? Isn\'t it your representative\'s job to disclose everything before I make a financial decision?"',
          checklist: [
            "Acknowledge the client's frustration without admitting liability prematurely",
            "Explain the process for investigating the communication logs",
            "Set clear expectations on investigation timelines",
            "Empathise with the financial impact while explaining the refund process",
            "Escalate to the appropriate team and give the client an owner's name and TAT"
          ],
          bot_script: [
            "I specifically called your team before pledging my stocks and asked all the necessary questions. Why was I never told that there was an existing debit balance on my account? Isn\'t it your representative\'s job to disclose everything before I make a financial decision?",
            "Because your sales manager hid this debit balance from me, I went ahead and traded, made losses, and now my collateral is blocked. How is any of this my fault? Your negligence caused my losses — why should I bear them?",
            "I have the call recording of when I spoke to your representative before pledging. If I pull that up and prove that the debit balance was never mentioned, will your company refund my losses in full? What is your stand on that?",
            "You are telling me I cannot trade using my collateral because of a debit balance that I didn\'t even know existed. So essentially you took my pledged stocks, let me trade, and then pulled the rug from under me. How is that not a fraudulent business practice?"
          ],
          enabled: true
        },
        {
          module: 'written-comm',
          title: 'NAV Date Dispute (Payment Aggregator Delay)',
          description: 'A client is disputing the NAV date allotted for their mutual fund purchase, which was delayed due to a payment aggregator processing lag. They are demanding the previous day\'s NAV or compensation for the price difference.',
          scenario: 'A client writes a support email: "I placed a mutual fund purchase order and transferred the funds at 11:30 AM yesterday — well before the 2 PM cut-off. But you have allotted today\'s NAV, which is 1.5% higher! This is completely unfair. I want my NAV date corrected or the difference refunded immediately."',
          checklist: [
            "Empathize with the client's frustration regarding the NAV price difference and the unit allotment impact",
            "Clearly explain SEBI regulations on NAV applicability — which mandate that NAV is based on fund realization by the AMC, not the payment timestamp",
            "Explain the payment aggregator's transit delay and how it affects the fund realization timeline",
            "Decline the request to manually alter the NAV date or offer financial compensation, citing regulatory boundaries",
            "Propose a formal check of the transaction logs with the payment gateway team and provide a clear TAT for a detailed audit report"
          ],
          bot_script: [
            "I placed a mutual fund purchase order and transferred the funds at 11:30 AM yesterday — well before the 2 PM cut-off. But you have allotted today\'s NAV, which is 1.5% higher! This is completely unfair. I want my NAV date corrected or the difference refunded immediately.",
            "Why should I pay for a delay in your payment gateway? I have the bank receipt showing the funds left my account at 11:32 AM. Your system accepted the transfer — how is it my fault if your aggregator was slow?",
            "This is absolute nonsense. Other apps give the same-day NAV if you pay before the cut-off. You are just hiding behind regulations to avoid paying for your platform\'s technical failures.",
            "Fine, run your check with the aggregator. But if the log shows the delay was on your gateway\'s end, I expect a full refund of the difference or I am taking this straight to the SEBI SCORES portal. Give me my ticket number."
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call: CDSL Easiest & Gifting
        // (8 conceptual questions, AI-adaptive). Split out from the old single
        // "Operations Escalation Helpline" mega-topic, which bundled CDSL
        // Easiest/gifting, nominee, short delivery and suspended stocks into
        // one 11-question call — separated per admin request so each area is
        // its own topic, then expanded from 4 to a full 8-question flow drawn
        // from the CDSL Easiest / Console Gifting reference material. These
        // are deliberately concept/rule questions, not data-driven ones: no
        // invented numbers or "Key details" blocks, just the caller probing
        // the agent's actual understanding of how the process works.
        {
          module: 'ops-call-assessment',
          title: 'CDSL Easiest & Gifting — Transfer Rules (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of CDSL Easiest, gifting, and cross-depository transfers — no numbers or data, just the concepts and rules. 8 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A sharp, well-informed client has several conceptual questions about how CDSL Easiest, gifting, and cross-depository transfers actually work — they are not disputing a specific transaction, they want to understand the real rules so they trust your answer. Answer each of the 8 questions accurately and confidently before the caller moves to the next.',
          checklist: [
            "Explain the actual underlying rule or process correctly, not a guess or a half-remembered version",
            "Clearly distinguish what is a technology/app step from what is a genuine regulatory or depository requirement",
            "Correct any wrong assumption in the caller's understanding rather than agreeing with it to keep them calm",
            "Use plain, precise language a non-technical client can actually follow",
            "Stay calm, professional and confident even when the caller pushes back or challenges your explanation"
          ],
          bot_script: [
            "I always thought CDSL Easiest was only for gifting shares within family. Can I actually use it to transfer shares to a friend, or move shares to my own account at a completely different broker?",
            "Why does a gift transfer need both a TPIN step from me AND a separate OTP step afterwards? What's actually different about what each of those two steps authorises — isn't one enough?",
            "If my broker uses CDSL but my brother's broker uses NSDL, does that change how the transfer has to be done, or is it exactly the same process either way from my side?",
            "Is there any real difference, from the depository's point of view, between a 'self transfer' — moving shares between two accounts I own — and a 'gift transfer' to someone else? Or is it just a label the app uses?",
            "What's the actual difference between a 'Trusted Account' transfer and an 'Account of Choice' transfer on CDSL Easiest? Why is one capped at a handful of accounts while the other needs a digital signature certificate?",
            "I keep hearing about 'adding a beneficiary' and 'adding a trusted account' as if they're two separate steps — aren't they the same thing? Why would a transfer need both before it goes through?",
            "If I miss the cut-off time on a gifting transaction, does it just quietly carry over and process the next day, or does the entire gift request have to be started over from scratch? Why would a time cut-off matter that much for something like this?",
            "If I gift some of my shares to my brother, does he have to pay any tax on receiving them, or is tax only a concern if I gift shares to someone who isn't a relative?"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call: Nominee Rules (Conceptual)
        // Expanded from 4 to a full 8-question flow drawn from the Nominee
        // Modification reference scenarios (add / replace / add-additional /
        // partial-replace / remove-one / remove-all-add-new / remove-all-opt-out /
        // detail-correction-only).
        {
          module: 'ops-call-assessment',
          title: 'Nominee Modification — Rules & Limits (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of nominee rules on a demat account — how many are allowed, who can be one, and what makes a minor nominee different. 8 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A client has several conceptual questions about nominee rules on their demat account — they want to understand the actual regulatory limits and requirements, not just be told "yes" or "no." Answer each of the 8 questions accurately and confidently before the caller moves to the next.',
          checklist: [
            "State the actual rule or limit correctly rather than guessing or making one up",
            "Clearly explain WHY a rule exists where relevant (e.g. extra verification for a minor), not just that it exists",
            "Correct any wrong assumption in the caller's understanding rather than agreeing with it to keep them calm",
            "Use plain, precise language a non-technical client can actually follow",
            "Stay calm, professional and confident even when the caller pushes back or challenges your explanation"
          ],
          bot_script: [
            "How many nominees am I actually allowed to add to a single demat account, and is there a rule about how the percentage share has to be split between them?",
            "Can a nominee be someone who isn't a blood relative — like a close friend or a business partner — or does the rule restrict nominees to family only?",
            "What's actually different about registering a minor as a nominee compared to an adult? Why would that need anything extra at all?",
            "If my mobile number isn't linked to my Aadhaar, does that block me from changing my nominee altogether, or does it just mean I have to use a different method to do it?",
            "If I already have two nominees and just want to swap one of them out for someone new, is that treated any differently from wiping out both nominees and starting fresh with completely new ones?",
            "Am I required to always have at least one nominee once I've added one, or can I remove all my nominees and opt out of the nomination facility altogether?",
            "If all I want to do is correct my nominee's name or update their address, do I really have to go through the entire nomination process again, the same as adding a brand-new nominee?",
            "Why would the process ask for both a physically signed form AND a digital eSign on top of it — isn't a digital signature alone enough to make this legally valid these days?"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call: Short Delivery & Auctions (Conceptual)
        // Expanded from 4 to a full 8-question flow drawn from the Short
        // Delivery / Auction Market reference material (close-out vs auction
        // charge, T2T and corporate-action carve-outs, holding-in-demat vs
        // genuine short scenarios, partial-fulfilment WAP pricing).
        {
          module: 'ops-call-assessment',
          title: 'Short Delivery & Auction Mechanics (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of why short delivery happens and how the auction settlement process actually works — no numbers, just the mechanics. 8 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A client wants to genuinely understand how short delivery and the auction process work — not dispute a specific number, but understand the mechanism well enough to trust the outcome next time it happens. Answer each of the 8 questions accurately and confidently before the caller moves to the next.',
          checklist: [
            "Explain the actual mechanism correctly rather than a simplified or incorrect version",
            "Be clear about whose responsibility short delivery and its cost actually is, and why",
            "Correct any wrong assumption in the caller's understanding rather than agreeing with it to keep them calm",
            "Use plain, precise language a non-technical client can actually follow",
            "Stay calm, professional and confident even when the caller pushes back or challenges your explanation"
          ],
          bot_script: [
            "Can you explain, in plain terms, why a short delivery even happens in the first place? Is it always the seller's fault, or can it happen for reasons completely outside their control?",
            "How is the auction settlement price for a short-delivered share actually decided? Is it just whatever the stock happened to close at that day, or is there a specific formula behind it?",
            "If a stock simply doesn't trade during the auction session — nobody offers to sell it — what happens to the buyer who was supposed to receive those shares?",
            "Is a short-delivery penalty a fine charged to the seller, or is it compensation paid out to the buyer? Where does that money actually end up going?",
            "Is an 'auction charge' and a 'close-out amount' really just two names for the same penalty, or are they genuinely two different things that apply in different situations?",
            "Why would a stock being in the trade-to-trade category, or being under a corporate action, change how a shortage gets settled instead of just running the normal auction like any other stock?",
            "If I already hold the shares in my demat account when I sell them, can a short delivery even happen to me, or does that situation only come up when someone sells shares they don't actually own yet?",
            "When the exchange can only buy back part of the missing shares in the auction and has to close out the rest in cash, how is the final price worked out for everyone — is it two separate prices, or one blended rate applied to the whole quantity?"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call: Suspended Stocks (Conceptual)
        // Expanded from 4 to a full 8-question flow drawn from the Suspended
        // Stocks reference material (weekly-trading vs full suspension,
        // off-market transfer/gifting rights during suspension, IRP vs plain
        // suspension, capital reduction as a corporate action that itself
        // triggers a temporary halt).
        {
          module: 'ops-call-assessment',
          title: 'Suspended Stocks — Trading Halts & Corporate Actions (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of what a trading suspension actually means and how it interacts with dividends, AGMs, and buybacks. 8 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A client holds a suspended stock and has several conceptual questions about what suspension actually means for their rights as a shareholder — not a specific transaction dispute, but genuine confusion about the rules. Answer each of the 8 questions accurately and confidently before the caller moves to the next.',
          checklist: [
            "Explain the actual distinction between suspension, delisting and similar terms correctly, not loosely or interchangeably",
            "Be clear about what a suspension does and does NOT freeze (e.g. corporate actions vs trading itself)",
            "Correct any wrong assumption in the caller's understanding rather than agreeing with it to keep them calm",
            "Use plain, precise language a non-technical client can actually follow",
            "Stay calm, professional and confident even when the caller pushes back or challenges your explanation"
          ],
          bot_script: [
            "What's the actual difference between a stock being 'suspended' and being 'delisted'? I keep hearing both terms used and I'm not sure if they mean the same thing.",
            "If a company's stock is suspended because of a SEBI investigation, does that automatically mean the company has done something wrong, or can trading be halted for other reasons entirely?",
            "Can a company still pay a dividend, or run a buyback, while its own stock is suspended from trading? I would have assumed a suspension freezes everything about the company.",
            "If my stock is suspended, can I still vote on resolutions at the company's AGM, or does the suspension affect my shareholder rights too?",
            "If my stock only trades once a week now instead of every day, has the suspension actually been lifted, or is that still a form of restriction dressed up to look like normal trading?",
            "Does a stock being suspended stop me from transferring it off-market to someone else or gifting it, or is buying and selling on the exchange the only thing that's actually blocked?",
            "What's genuinely different between a company going through insolvency resolution and a stock that's simply suspended for something like a compliance lapse? Do both restrict me the exact same way?",
            "If a company reduces the number of shares I hold as part of a corporate restructuring, does that happen while the stock keeps trading normally, or is trading usually paused during that kind of process?"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call (Corporate Action / Bonus Mismatch, 4 very difficult questions, AI-adaptive)
        {
          module: 'ops-call-assessment',
          title: 'Corporate Action Mismatch — Bonus Shares Credited in Wrong Ratio',
          description: 'A difficult escalation call about a bonus share credit the client believes is wrong, plus knock-on questions about the adjusted cost basis and a pledge that was auto-created on the new shares. 4 tough questions in a row, each with full data included.',
          scenario: 'You are on an escalation helpline. A client calls in angry because the bonus shares credited to their account do not match the ratio the company announced, and they are convinced the platform has shortchanged them. Answer each of the 4 data-heavy questions accurately and confidently before the caller moves to the next.',
          checklist: [
            "Address the exact numbers, dates and ratios the caller quotes — do not give a vague or generic answer",
            "Clearly state whether something is a platform error, a depository/exchange process, or expected corporate-action mechanics — do not let the caller assume the wrong one",
            "Correct any wrong assumption in the caller's question rather than agreeing with it to keep them calm",
            "Give a clear next step and realistic timeline for anything still in progress",
            "Stay calm, professional and empathetic even when the caller is frustrated or challenges your numbers"
          ],
          bot_script: [
            "Meridian Textiles announced a 1:2 bonus, so on my 300 shares I should have gotten 150 new ones. I only see 149 credited. Where is my missing share?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Company: Meridian Textiles</li><li>Announced bonus ratio: 1:2 (1 additional share for every 2 held)</li><li>Shares held on record date: 300</li><li>Client's expected credit: 150 new shares</li><li>Actual credit shown in Kite: 149 shares</li><li>Fractional entitlement: 300 × 1/2 = 150.0 exactly — no fraction involved</li><li>Client wants the missing share credited immediately or a cash equivalent</li></ul></div>",
            "Fine, if it really is 150, then why does my holdings page show the bonus shares credited on 5 March but my contract note says the record date was 8 March? Isn't that backwards?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Record date (fixed by the company): 8 March</li><li>Bonus shares actually credited to demat: 5 March</li><li>Client's assumption: credit date must be AFTER record date, so 5 March looks wrong</li><li>Reality to explain: the credit client is looking at on 5 March was an unrelated dividend memo entry, not the bonus credit — actual bonus credit landed on 12 March, 4 working days after the 8 March record date</li></ul></div>",
            "Now my average buy price on the app looks completely wrong — it barely dropped at all after a 1:2 bonus. Is the app not adjusting for the bonus properly?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Original holding before bonus: 300 shares at average price ₹450 per share</li><li>Total original investment: ₹1,35,000</li><li>After 1:2 bonus: 450 shares total (300 original + 150 bonus)</li><li>Correct adjusted average price: ₹1,35,000 ÷ 450 = ₹300 per share</li><li>App is currently showing: ₹430 per share (stale, not yet recalculated)</li><li>Client's question: is this an app bug, and does it affect their tax cost basis</li></ul></div>",
            "One more thing — 100 of my original shares are pledged for margin. Did the new bonus shares from those get auto-pledged too, or are they free in my account?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Shares pledged for margin (original, before bonus): 100 out of 300</li><li>Bonus ratio: 1:2, so bonus shares attributable to the pledged 100 = 50</li><li>Depository/exchange rule: bonus shares on a pledged holding are credited to the client's free balance first, NOT auto-pledged</li><li>Client must submit a fresh pledge request if they want the new 50 shares pledged too</li><li>Client's question: are the 50 new shares free right now, and do they need to do anything to use them as margin</li></ul></div>"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call (Dividend Shortfall / TDS, 4 very difficult questions, AI-adaptive)
        {
          module: 'ops-call-assessment',
          title: 'Dividend Shortfall — Received Amount Doesn\'t Match Declared Per-Share Rate',
          description: 'A difficult escalation call about a dividend payout the client believes is short, driven by TDS deduction and a partial holding technicality. 4 tough questions in a row, each with full data included.',
          scenario: 'You are on an escalation helpline. A client calls in convinced they have been shortchanged on a dividend payout because the amount credited does not match a simple multiplication of shares held by the declared per-share rate. Answer each of the 4 data-heavy questions accurately and confidently before the caller moves to the next.',
          checklist: [
            "Address the exact numbers, dates and rates the caller quotes — do not give a vague or generic answer",
            "Clearly state whether something is a platform error, a tax/regulatory deduction, or expected process — do not let the caller assume the wrong one",
            "Correct any wrong assumption in the caller's question rather than agreeing with it to keep them calm",
            "Give a clear next step and realistic timeline for anything still in progress",
            "Stay calm, professional and empathetic even when the caller is frustrated or challenges your numbers"
          ],
          bot_script: [
            "The company declared a dividend of ₹8 per share, I hold 500 shares, so I should have received ₹4,000. Only ₹3,600 landed in my bank. Where did ₹400 of my money go?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Declared dividend rate: ₹8 per share</li><li>Shares held on record date: 500</li><li>Gross dividend due: ₹4,000</li><li>TDS deducted under Section 194: 10%, i.e. ₹400</li><li>Net amount actually credited to bank: ₹3,600</li><li>Client did not know a dividend could be taxed at source</li></ul></div>",
            "Nobody told me tax would be cut. Is 10% the standard rate for everyone, or did I get charged extra because of something on my account?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Standard TDS rate on dividends under Section 194: 10%, applies to all resident individual shareholders whose dividend from one company exceeds ₹5,000 in a financial year</li><li>Client's total dividend from this company this year: ₹4,000 (this single payout) — client also received an earlier ₹2,500 payout from the same company in April, taking the yearly total to ₹6,500, which is why the ₹5,000 threshold was crossed</li><li>No PAN-linkage issue or higher-rate penalty applies to this account</li><li>Client's question: was this a special/extra deduction or the normal rate everyone pays once past ₹5,000/year</li></ul></div>",
            "I bought 200 of those 500 shares only 3 days before the record date. My friend says you need to hold for a minimum period to even get the dividend — did I actually qualify for the full amount?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Total shares held on record date: 500 (300 held long-term + 200 bought 3 days before record date)</li><li>Indian equity dividends: no minimum holding period requirement — any shares held on record date qualify in full, regardless of when purchased</li><li>Client's friend's claim (minimum holding period) is incorrect for this market</li><li>Client's question: did the recently-bought 200 shares reduce their payout in any way</li></ul></div>",
            "Can I get this TDS refunded right now since I'm not liable to pay tax this year, and can you send me a certificate proving ₹400 was deducted?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>TDS deducted this payout: ₹400</li><li>TDS is deducted and deposited with the Income Tax Department by the company/registrar, not held by the broker — broker cannot refund it directly</li><li>Client can claim it back only when filing their Income Tax Return, if their total tax liability is lower than the TDS deducted</li><li>Proof document: Form 16A / TDS certificate, issued by the company's registrar (not the broker), typically available on the registrar's portal or via the company after quarter-end</li><li>Client's 2 questions: can broker refund it now (no), and where does the certificate come from</li></ul></div>"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call (Pledge Release Delay, 4 very difficult questions, AI-adaptive)
        {
          module: 'ops-call-assessment',
          title: 'Pledge Release Delay — Margin Not Freed After Unpledging Shares for Fund Withdrawal',
          description: 'A difficult escalation call about margin that has not been freed up after the client unpledged shares to withdraw funds, with a knock-on question about an open position getting squared off. 4 tough questions in a row, each with full data included.',
          scenario: 'You are on an escalation helpline. A client unpledged shares yesterday expecting the margin to free up immediately, tried to withdraw funds, and is now angry that the money is not available and that a position got squared off along the way. Answer each of the 4 data-heavy questions accurately and confidently before the caller moves to the next.',
          checklist: [
            "Address the exact numbers, dates and timings the caller quotes — do not give a vague or generic answer",
            "Clearly state whether something is a platform error, an exchange/depository settlement cycle, or expected process — do not let the caller assume the wrong one",
            "Correct any wrong assumption in the caller's question rather than agreeing with it to keep them calm",
            "Give a clear next step and realistic timeline for anything still in progress",
            "Stay calm, professional and empathetic even when the caller is frustrated or challenges your numbers"
          ],
          bot_script: [
            "I submitted an unpledge request yesterday morning at 10 AM for shares worth ₹5,00,000. It's now the next day and my available margin still hasn't gone up. Why is my money still stuck?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Unpledge request submitted: yesterday, 10:00 AM</li><li>Value of shares unpledged: ₹5,00,000</li><li>Standard unpledge processing: same-day if requested before the cut-off (typically before market close), reflecting in margin by next trading day morning</li><li>Client's request was submitted well before cut-off, so it should already reflect</li><li>Actual status to check/explain: unpledge was processed correctly and margin IS available as of this morning — client may be looking at a cached balance on an old app screen; ask them to refresh/re-login</li></ul></div>",
            "Okay it's showing now, thank you. But I tried to withdraw ₹5,00,000 in cash right after that and it only let me withdraw ₹4,10,000. What happened to the rest?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Margin freed from unpledge: ₹5,00,000 (in the form of collateral/margin, not literal cash)</li><li>Client attempted cash withdrawal of: ₹5,00,000</li><li>Amount actually withdrawable: ₹4,10,000</li><li>Reason: ₹90,000 of the account's margin was still utilised against an existing open F&O position that day — only the UNUSED margin balance can be withdrawn as cash, freed collateral is not automatically cash</li><li>Client's question: why can't all ₹5,00,000 be withdrawn immediately</li></ul></div>",
            "While all this was happening, my Nifty futures position got auto-squared-off at a loss. Did unpledging my shares cause my position to get closed?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Position affected: 1 lot Nifty futures, opened 2 days earlier</li><li>Square-off time: 3:15 PM, same day as the unpledge request</li><li>Reason for square-off: separate margin shortfall alert triggered at 1:45 PM that day, unrelated to the unpledge — shortfall was due to an adverse price move on the futures position itself, not the unpledge action</li><li>Unpledging shares only reduces AVAILABLE collateral if anything, it cannot by itself create a shortfall on an already-funded position</li><li>Client's question: is the unpledge the cause (no) — needs the actual shortfall reason explained clearly</li></ul></div>",
            "This has cost me a real loss. Can you reverse the square-off, or at least waive the square-off penalty charge since I was in the middle of a legitimate unpledge request?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Square-off penalty charged: flat ₹50 + 18% GST per squared-off order, per exchange/broker policy</li><li>Square-offs triggered by a margin shortfall cannot be reversed once executed — the trade is final on the exchange</li><li>Penalty waivers are considered only case-by-case through a formal escalation/ticket process, not guaranteed and not something that can be promised on this call</li><li>Client's 2 questions: can the trade itself be reversed (no, final), and can the ₹50+GST fee be waived (can be escalated as a ticket, no promise)</li></ul></div>"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Writing (4 very difficult questions, AI-adaptive)
        {
          module: 'ops-writing-assessment',
          title: 'Operations Escalation Ticket — CDSL, Nominee, Short Delivery & Suspended Stocks',
          description: 'A single very difficult written escalation ticket covering CDSL Easiest, nominee modification, short delivery, and suspended stocks. 4 tough questions, one at a time — the client reacts in writing to how well you answer.',
          scenario: 'A client has written in with a single escalated support ticket that raises four separate, data-heavy questions one at a time — a CDSL Easiest reason-code rejection, a nominee-modification request, a short-delivery/auction compensation query, and a suspended-stock corporate action. Reply to each question accurately and professionally before the client raises the next one.',
          checklist: [
            "Address the exact numbers, dates and account details the client mentions — do not give a vague or generic answer",
            "Clearly state whether something is a platform error, a regulatory/exchange rule, or expected process",
            "Correct any wrong assumption in the client's message rather than agreeing with it",
            "Give a clear next step and realistic timeline for anything still in progress",
            "Keep a professional, empathetic tone throughout the written reply"
          ],
          bot_script: [
            "Hi, I tried transferring shares from my individual demat account to my HUF demat account using CDSL Easiest, and I selected 'Self Transfer' as the reason code, but the transaction is stuck/rejected. I'm the karta of the HUF, so I assumed this counts as a self-transfer. Can you tell me exactly what went wrong and what I need to do to complete this correctly?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Shares: 50 shares of TCS</li><li>From: individual demat account</li><li>To: HUF demat account (client is the karta of the HUF)</li><li>Reason code selected: \"Self Transfer\"</li><li>Current status: stuck / rejected</li></ul></div>",
            "I want to replace my existing nominee with my daughter, but my registered mobile number is NOT linked to my Aadhaar. Can I still do this online, and if not, exactly what do I need to send you?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Current nominee to be replaced: Mr. Sharma</li><li>New nominee: daughter</li><li>Aadhaar-to-mobile link status: NOT linked</li></ul></div>",
            "I bought 39 shares that never arrived due to a short delivery, and I was told there was an auction for it, but I still have neither the shares nor the money. What happens now, and how will I be compensated?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Shares purchased: 39 shares</li><li>Purchase date: 22nd April</li><li>Shortfall identified: on T+2, full 39-share shortfall (none delivered)</li><li>Client has received neither the shares nor any compensation so far</li></ul></div>",
            "I held 100 shares of a company, and now my app is showing only 36, while the price has jumped up a lot. Did you make an error, or did I lose two-thirds of my investment overnight?<div class=\"mc-bubble-facts\"><strong>Key details:</strong><ul><li>Shares held before: 100</li><li>Shares showing now: 36</li><li>Share price: has risen noticeably since the change</li></ul></div>"
          ],
          enabled: true
        }
      ];

      // If force is enabled, clean up any existing matching default topics first!
      if (force) {
        if (_useLocalStorage) {
          try {
            const titles = new Set(defaults.map(t => t.title));
            const localTopics = _localGetAll('topics');
            const filtered = localTopics.filter(t => !titles.has(t.title));
            localStorage.setItem('commassess_topics', JSON.stringify(filtered));
          } catch (_) {}
        } else {
          const titles = defaults.map(t => t.title);
          // Delete all matching titles to avoid duplicates and ensure a fresh clean state
          const { error: deleteError } = await _sb.from('topics').delete().in('title', titles);
          if (deleteError) {
            console.error('[DB] Delete defaults failed:', deleteError);
            throw new Error(deleteError.message || 'Failed to delete old default topics');
          }
        }
        // Refresh existing list to be empty so all default topics are re-seeded
        existing = [];
      }

      // Versioned content refresh for the two Ops Escalation topics: seeding
      // only ever INSERTS missing (module,title) pairs, so once a title is
      // already seeded, any later edit to its bot_script/description/etc.
      // in this file would otherwise never reach an already-seeded database.
      // Each topic's script content is tagged with a version number below;
      // _refreshOpsScriptIfStale compares that against a marker stored in
      // `settings` and, if the deployed version is newer, overwrites the
      // live row with the current content and bumps the marker. This is a
      // deliberate content push, not a merge — it will also overwrite any
      // hand-edit an admin made to this exact title after the marker was
      // last bumped, since there's no way to tell the two apart. Given how
      // new and low-traffic these two topics are, that tradeoff is fine for
      // now; a general "seeded defaults vs. admin-edited" distinction would
      // need real tracking if this pattern gets reused more broadly.
      const OPS_CALL_SCRIPT_VERSION    = 4; // v1: 7Q · v2: 11Q · v3: 11Q reformatted with "Key details" blocks · v4: split into 4 conceptual topics (CDSL, Nominee, Short Delivery, Suspended) at 8 questions each (was 4Q each — this is the version bump that actually pushes the 8Q content to already-seeded databases)
      const OPS_WRITING_SCRIPT_VERSION = 2; // v1: original 4Q · v2: reformatted with explicit "Key details" data blocks
      try {
        await _refreshOpsScriptIfStale('ops-call-assessment', OPS_CALL_SCRIPT_VERSION, defaults, existing);
        await _refreshOpsScriptIfStale('ops-writing-assessment', OPS_WRITING_SCRIPT_VERSION, defaults, existing);
      } catch (refreshErr) {
        console.warn('[DB] Ops script content refresh skipped:', refreshErr.message || refreshErr);
      }

      const existingMap = new Set(existing.map(t => `${t.module}:${t.title}`));
      const toInsert = defaults.filter(t => !existingMap.has(`${t.module}:${t.title}`));
      if (toInsert.length > 0) {
        if (_useLocalStorage) {
          try {
            const localTopics = _localGetAll('topics');
            toInsert.forEach((t, idx) => {
              localTopics.push({
                id: crypto.randomUUID ? crypto.randomUUID() : `topic-${idx}-${Date.now()}`,
                created_at: new Date().toISOString(),
                ...t
              });
            });
            localStorage.setItem('commassess_topics', JSON.stringify(localTopics));
            console.log(`[Offline] Seeded ${toInsert.length} new default topics.`);
          } catch (_) {}
        } else {
          // Insert one row at a time (not a single batched insert): if any
          // one row is rejected, the others still go through instead of the
          // whole batch silently failing together, and any row that fails
          // here simply gets retried on the next app load since existingMap
          // is recomputed from the live table each time.
          let insertedCount = 0;
          for (const t of toInsert) {
            try {
              const { error: insertError } = await _sb.from('topics').insert({ ...t, created_at: new Date().toISOString() });
              if (insertError) {
                console.error(`[DB] Insert default topic failed (${t.module}: "${t.title}"):`, insertError);
              } else {
                insertedCount++;
              }
            } catch (rowErr) {
              console.error(`[DB] Insert default topic threw (${t.module}: "${t.title}"):`, rowErr.message || rowErr);
            }
          }
          console.log(`Seeded ${insertedCount}/${toInsert.length} new default topics.`);
        }
      }
    } catch (e) {
      console.warn('DB seed skipped:', e.message);
      throw e; // re-throw so the caller knows the seeding failed
    }
  }

  // ---- Seed manager topics on first run ----
  // NOTE: this used to bail out once 10+ 'mgr-' rows existed, and inserted
  // hardcoded string ids (e.g. 'mgr-sr1') plus extra fields (wrongResponse,
  // sectionAPrompt) that don't exist in the Supabase 'topics' table (whose
  // id column is a UUID primary key). Against a real Supabase backend that
  // insert always failed silently (caught below), so none of these manager
  // topics ever actually reached the live database — only the localStorage
  // fallback ever "worked". Seeding is now per-title and idempotent: it
  // looks at what's already there for each mgr- module and only inserts
  // whatever titles are missing, using a clean payload that matches the
  // real schema and lets Postgres generate the id.
  async function _seedManagerTopics() {
    try {
      const mgrTopics = [
        // ── Situation Room
        { id: 'mgr-sr1', module: 'mgr-situation-room', title: 'The Unexpected Resignation', enabled: true, description: 'A crisis scenario requiring immediate team leadership and strategic thinking.', scenario: `Your top performer — handling 40% of team output — has resigned effective immediately citing burnout and poor management from you personally. The team already knows via WhatsApp. You have a leadership review call with your VP in 90 minutes.

Speak for 4-5 minutes: Your immediate 24-hour action plan, how you address the team's concerns directly (including the "poor management" claim), talent risk mitigation, and what you tell your VP.`, checklist: [], wrongResponse: `Vikram, honestly I'm shocked. The timing couldn't be worse...`, sectionAPrompt: 'Write the EXACT words you say to Vikram in the next 2–3 minutes.' },
        { id: 'mgr-sr2', module: 'mgr-situation-room', title: 'The Compliance Breach', enabled: true, description: 'A high-stakes compliance failure requiring immediate escalation and damage control.', scenario: `Your two senior agents bypassed compliance protocols for 8 weeks, marking 23 customer complaints as resolved without documentation. Regulators have flagged 3 of these cases. Your CXO has been notified and wants a briefing in 2 hours.

Speak for 4-5 minutes: Your escalation approach, how you handle the agents, customer remediation plan, your accountability to senior leadership, and systemic prevention measures.`, checklist: [], wrongResponse: `Okay, I'll get straight to the point. What you two have done is a serious compliance violation...`, sectionAPrompt: 'Write the EXACT words you say to open this conversation.' },
        { id: 'mgr-sr5', module: 'mgr-situation-room', title: 'The HNW Portfolio Delay Crisis', enabled: true, description: '₹75 Lakh portfolio transfer delayed by 10 days.', scenario: 'Your HNW client Mr. Rakesh Kapoor initiated a ₹75 Lakh portfolio transfer that took 10 working days instead of 2 due to back-office delay. Market rallied 4.5%. Client demands meeting.', wrongResponse: `Mr. Kapoor, thank you for coming in. Look, I understand you're upset...`, sectionAPrompt: 'Write the EXACT words you say to open this meeting with Mr. Kapoor.', checklist: [] },
        { id: 'mgr-sr6', module: 'mgr-situation-room', title: 'The Multi-Team Outage Conflict', enabled: true, description: 'System outage blamestorming between Ops and IT.', scenario: 'During morning opening hours, 45 trade orders failed. Operations blames IT for server misconfiguration; IT blames Operations for bad batch files.', wrongResponse: 'Alright, shut the door. What was that embarrassing display out on the floor?...', sectionAPrompt: 'Write your EXACT opening words in the next 60 seconds.', checklist: [] },
        { id: 'mgr-sr7', module: 'mgr-situation-room', title: 'The Rejected Sell Order — Escalated Twice', enabled: true, description: 'Escalation-tier dispute over a correctly rejected sell order, complicated by a recording customer and a stale-data display bug.', scenario: 'A 9-year, ₹1.2 Crore client has been transferred to you after two agents already dismissed his complaint about a rejected Infosys sell order. The rejection was correct (his own margin shortfall) but a cosmetic app bug makes his confusion genuine, and he says he is recording the call.', checklist: [] },
        { id: 'mgr-sr8', module: 'mgr-situation-room', title: 'The Surveillance Hold During a Volatile Session', enabled: true, description: 'A client demands answers about an account block you are legally barred from fully explaining.', scenario: 'A client lost ₹1.8L in missed exits during an account block he was given two contradictory explanations for. The real cause is a SEBI-mandated surveillance review you cannot disclose.', checklist: [] },
        { id: 'mgr-sr9', module: 'mgr-situation-room', title: 'The Refund Threshold Dilemma', enabled: true, description: 'A high-value client demands a refund above your approval authority while your manager is unreachable.', scenario: 'A ₹40L client threatens to leave and post negative reviews unless refunded ₹12,000 — ₹7,000 above your ₹5,000 approval authority, with your manager unreachable.', checklist: [] },

        // ── Transcript Autopsy
        { id: 'mgr-ta1', module: 'mgr-transcript-autopsy', title: 'SIP Debit With No Unit Allotment — 22 Min Call', enabled: true, description: 'Analyse a difficult inbound call with 8+ coaching opportunities across all key service competencies.', scenario: `BACKGROUND: Preethi Mehta is calling Broker support for the third time about her SIP not being processed. The ₹10,000 monthly SIP was debited from her bank on the 2nd but units were never allotted. She raised ticket TKT-88244 three weeks ago — it was marked "resolved" without any resolution. This is a critical coaching opportunity with 8+ identifiable mistakes.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hello, Broker support, how can I help?

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

Minimum 250 words.`, checklist: [] },
        { id: 'mgr-ta2', module: 'mgr-transcript-autopsy', title: 'Mutual Fund Redemption Blocked — 26 Min Call', enabled: true, description: 'A high-frustration escalation call with 9+ coaching opportunities across service quality dimensions.', scenario: `BACKGROUND: Vikram Shetty called to redeem ₹2,50,000 from his liquid fund after an emergency medical need. The redemption request was placed 45 days ago and has still not been credited. He has called 4 times and received different explanations each time. This transcript contains 9+ coaching opportunities across multiple skill areas.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hi, support, tell me your problem.

VIKRAM: Good morning. My name is Vikram Shetty. I placed a redemption request 45 days ago for ₹2,50,000 from my Broker Coin liquid fund. The money has still not hit my bank account. This is extremely urgent — I needed this for a medical emergency and I have been borrowing from relatives in the meantime.

AGENT: What is your account?

VIKRAM: ZC-4421-88. The redemption request number is RED-20240813-7741. I have called four times already. Each time I get a different explanation.

AGENT: Let me pull up your account. [1 min 34 sec silence — no explanation given to customer]

AGENT: Okay I see it.

VIKRAM: Great. What is the status of RED-20240813-7741?

AGENT: It looks like there might be a KYC issue.

VIKRAM: A KYC issue? I have been investing on Broker for six years. My KYC was verified when I opened the account. Why would it be an issue now?

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

AGENT: Thank you for calling Broker. Have a wonderful day. [Disconnects]

─── END OF TRANSCRIPT ──────────────────────────────────────────

YOUR TASK: Write a full coaching analysis for this 26-minute call. Identify a minimum of 8 coaching opportunities — including at least one each from: Call Opening, Information Verification, Hold Procedure, Empathy, Problem Ownership, Escalation Process, and Call Closing. For each opportunity:
(a) Cite the exact transcript moment
(b) Identify which communication/service standard was violated
(c) Write the improved response the agent should have delivered

End with a "Development Priority Matrix" — rate the agent on 5 dimensions from 1 (critical gap) to 5 (competent), and identify the top 2 immediate training priorities.

Minimum 300 words.`, checklist: [] },
        { id: 'mgr-ta3', module: 'mgr-transcript-autopsy', title: 'NRI PIS Account & Currency Conversion Delay — 18 Min Call', enabled: true, description: 'Sunita Rao NRE PIS account opening delayed by 3 weeks.', scenario: `BACKGROUND: Sunita Rao (NRI based in Dubai) called Broker support regarding her NRE PIS account opening delay. She submitted documents 3 weeks ago but her account remains pending, causing her to miss a major public infrastructure bond issue. The agent makes 8 critical errors during the call.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hello, Broker support.

SUNITA: Hello, my name is Sunita Rao. I applied for an NRE PIS account 3 weeks ago. Application number PIS-88219. I was assured it would take 3-5 business days. The infrastructure bond issue I wanted to invest in closes tomorrow, and my account is still not active!

AGENT: Can I have your Client ID?

SUNITA: It's SR-9941.

AGENT: Hold on. [40-second silence with no hold request]

AGENT: The documents were rejected by the partner bank.

SUNITA: What? Rejected? Why was I not informed? I haven't received an email or SMS!

AGENT: The bank rejected it due to signature mismatch on the PIS permission letter.

SUNITA: I attested those documents at the Indian Consulate in Dubai! How could there be a signature mismatch? And why did nobody inform me for 3 weeks?

AGENT: The bank handles the PIS permission, not us. We just forward the physical copy.

SUNITA: But I paid Broker for the service! You are my broker. If there was a rejection, shouldn't your team have notified me immediately?

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
Minimum 200 words.`, checklist: [] },
        { id: 'mgr-ta4', module: 'mgr-transcript-autopsy', title: 'The Margin Call Dispute — Escalation Call', enabled: true, description: 'A margin-call square-off dispute that has already reached the escalation manager, so every mistake has nowhere further to go.', scenario: `BACKGROUND: A customer's open Nifty futures position was squared off by RMS due to a margin shortfall. He's lost ₹31,000 on the square-off and believes the system acted without warning. This call has already reached the escalation tier — the customer asked for someone senior and was connected directly to the manager below. That means every mistake in this call has no further internal escalation path left for the customer. This is a live line-by-line transcript with 8+ identifiable mistakes.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

CUSTOMER: Hello, I want to speak to someone senior. Your system squared off my position without any warning and I've lost ₹31,000.

MANAGER: Good afternoon, sir. I'm the escalation manager here. Can you tell me your client ID?

CUSTOMER: It's ZR4821. I've already given this 3 times today.

MANAGER: Okay, let me pull up your account. (30 second pause) Yes, I can see the square-off happened at 11:43 AM today.

CUSTOMER: Yes. Without any warning. I had no idea.

MANAGER: Sir, our system sends SMS and email alerts when margin falls below the required level. Did you check?

CUSTOMER: I'm telling you I got no alert.

MANAGER: It shows alerts were sent at 10:55 AM and 11:20 AM to your registered mobile number.

CUSTOMER: Then maybe it didn't come. Your system has problems.

MANAGER: Sir, the alerts are system-generated and they are recorded on our end. They would have been sent.

CUSTOMER: Are you calling me a liar?

MANAGER: No sir, I'm not saying that. I'm just saying the records show the alerts were sent.

CUSTOMER: This is ridiculous. I want my ₹31,000 back.

MANAGER: Sir, as per our policy, if margin falls below the required level, we have the right to square off positions. This is mentioned in the terms and conditions you agreed to.

CUSTOMER: I don't care about terms and conditions. I want a solution.

MANAGER: I understand, but there isn't much I can do in this case since the square-off was done as per policy. I can log a grievance if you'd like.

CUSTOMER: A grievance? I asked for someone senior and I got you. Where does this even go from here if you can't fix it?

MANAGER: I can escalate it internally, but I can't promise a different outcome — the square-off itself was correctly executed.

CUSTOMER: So what was the point of this call? You've told me nothing I didn't already hear from the first two agents.

MANAGER: I understand your frustration, sir. Is there anything else I can help you with?

CUSTOMER: No. There's clearly nothing you're willing to do. (disconnects)

─── END OF TRANSCRIPT ──────────────────────────────────────────

YOUR TASK: Write a full escalation-tier coaching analysis for this call. Identify a minimum of 8 coaching opportunities — including at least one each from: Call Opening, Information Verification, Handling the "Are you calling me a liar?" moment, Policy Communication, and Call Closing. For each opportunity:
(a) Quote the exact transcript moment
(b) Explain why this mistake is more damaging here than it would be from a frontline agent — this customer has already reached the escalation tier and has nowhere further to go internally
(c) Write the improved response the manager should have delivered

Also answer: this call ended with the customer disconnecting with no resolution and no real acknowledgment. Write the exact closing exchange — from "Sir, as per our policy…" to the end — the way it should have gone, and explain what, if anything, could realistically have been offered within policy (the square-off itself was correct; no refund is owed).

Minimum 300 words.`, checklist: [] },
        { id: 'mgr-ta5', module: 'mgr-transcript-autopsy', title: 'Dividend Credited to a Closed Bank Account — 19 Min Call', enabled: true, description: 'A repeat bank-mandate failure — the same root cause the agent claimed was already fixed three months ago.', scenario: `BACKGROUND: Ms. Kavita Desai submitted a bank account update request 6 weeks ago after closing her old HDFC account. Her mutual fund dividend of ₹18,400 was credited to the old, closed account 4 days ago because the mandate update was never applied at the fund house. This is the second time in three months this exact bank-update issue has recurred for her — a previous ticket (TKT-77120) was marked "resolved" without the fund-house-side record actually being confirmed. This transcript has 7+ identifiable mistakes.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hello, Broker support, how can I help you today?

KAVITA: Hi, this is Kavita Desai. My mutual fund dividend of ₹18,400 was paid out 4 days ago, but it went to my old HDFC account — which I closed two months ago. I submitted a bank change request for this exact reason six weeks ago.

AGENT: Okay, can I get your client ID?

KAVITA: KD-6612. I already explained the account was closed — this is not the first time this has happened either. Three months ago the same thing happened with a redemption payout.

AGENT: Let me check. [50-second silence] I can see a bank change request from 6 weeks ago, status shows "processed."

KAVITA: Then why did my dividend go to the closed account?

AGENT: Sometimes the fund house has its own separate bank record that doesn't update automatically.

KAVITA: Nobody told me I needed to update it separately with each fund house! I updated it with Broker — isn't Broker supposed to sync this?

AGENT: We send the updated bank details, but the fund house needs to process it on their end too.

KAVITA: So basically you're saying it's not your fault?

AGENT: I'm not saying that, I'm just explaining the process.

KAVITA: This happened before, three months ago, and I was told then that it was "fixed." Was it not actually fixed?

AGENT: I don't have visibility into that previous case from here.

KAVITA: Can you check the ticket? I have the number — TKT-77120.

AGENT: [40-second silence] I see it. It was closed as resolved.

KAVITA: Resolved how? The exact same problem happened again!

AGENT: The notes just say "bank details updated."

KAVITA: Updated where? With Broker or with the fund house? Can you tell the difference?

AGENT: I can't tell from these notes, ma'am.

KAVITA: Okay. So what happens to my ₹18,400 that went to a closed bank account?

AGENT: It will bounce back to the fund house since the account is closed, and then get reprocessed.

KAVITA: How long will that take?

AGENT: Usually 7 to 10 working days.

KAVITA: And will it go to the correct account this time, or the same closed one?

AGENT: It should go to whichever account is updated in our system.

KAVITA: "Should"? Can you confirm right now, with certainty, which bank account is on file with the fund house — not with Broker, with the actual fund house — for my folio?

AGENT: I don't have that visibility from this screen.

KAVITA: Then how can you promise it will work this time?

AGENT: I understand your frustration.

KAVITA: I don't need you to understand my frustration, I need this fixed. Can I speak to whoever handles fund-house bank mandate sync specifically?

AGENT: That would be a back-end team, we don't have a direct line to them.

KAVITA: Then how do I make sure this isn't a third time?

AGENT: I'll raise a ticket requesting confirmation of the fund house-side bank details.

KAVITA: What's the ticket number and when will I hear back?

AGENT: TKT-91345. You should hear back in 3 to 5 working days.

KAVITA: Please note in the ticket that this is a repeat issue, ticket TKT-77120 was falsely marked resolved, and I need explicit confirmation of the correct bank account before the reprocessed dividend is sent, not after.

AGENT: I've added a note.

KAVITA: Can you read back what you wrote?

AGENT: "Customer reports repeat bank mandate issue."

KAVITA: That's it? None of the specifics I just gave you?

AGENT: I can add more. [25-second silence] Done.

KAVITA: Is there anything else that can be done today?

AGENT: Not from my end, no.

KAVITA: Alright.

AGENT: Is there anything else I can help with?

KAVITA: No.

AGENT: Thank you for calling, have a good day. [Disconnects]

─── END OF TRANSCRIPT ──────────────────────────────────────────

YOUR TASK: Write a structured coaching report for this call. Identify a minimum of 7 coaching opportunities, including at least one on how the agent handled (or failed to handle) the fact that this is a documented repeat issue. For each opportunity:
(a) Quote the exact moment from the transcript
(b) Explain the impact on the customer's trust, given this is the second occurrence
(c) Write the improved response the agent should have delivered

Also answer: what specific, verifiable action (not a generic "I'll raise a ticket") should the agent have taken to make sure this cannot recur a third time?

Minimum 250 words.`, checklist: [] },
        { id: 'mgr-ta6', module: 'mgr-transcript-autopsy', title: 'Suspicious Activity Freeze During a Market Rally — 21 Min Call', enabled: true, description: 'A regulatory surveillance freeze during a live rally, handled with no real explanation and no urgency from the agent.', scenario: `BACKGROUND: Mr. Faisal Ahmed's trading account was frozen for a "suspicious activity review" two days ago, in the middle of a Nifty rally, and he has been unable to exit positions that have since given back their gains — an estimated ₹58,000 in unrealized profit he could not lock in. The actual cause is a routine SEBI-mandated surveillance flag triggered by his own unusually high-frequency trading pattern — nothing improper, just a review that takes time — but the agent never manages to explain this clearly or usefully. This transcript has 8+ identifiable mistakes.

─── CALL TRANSCRIPT ─────────────────────────────────────────────

AGENT: Hello, Broker support.

FAISAL: Hi, my account has been frozen for two days now — I can't place any trades. My client ID is FA-3391. This happened right during the Nifty rally and I've lost close to ₹58,000 in gains I could have booked.

AGENT: Let me check. [35-second silence] I see a hold on your account.

FAISAL: Why? Nobody told me anything. I just tried to sell my position and got an error.

AGENT: It says "under review."

FAISAL: Review for what? I haven't done anything wrong.

AGENT: I can't see the specific reason from here.

FAISAL: Then who can? This is costing me real money every hour it stays frozen.

AGENT: It might be related to KYC.

FAISAL: My KYC is fully done, I've been trading for 4 years.

AGENT: Sometimes it's re-verification.

FAISAL: Is it KYC or not? You said "sometimes."

AGENT: I'm not 100% sure, let me check again. [45-second silence] Actually it looks like a surveillance flag.

FAISAL: What does that mean? Am I being accused of something?

AGENT: It's usually for high-frequency trading patterns.

FAISAL: I trade actively, that's my strategy! Is active trading illegal now?

AGENT: No sir, it's just a standard review.

FAISAL: Then why can't you unfreeze it right now if it's just "standard"?

AGENT: These reviews take time to clear.

FAISAL: How much time? I'm losing money every single hour!

AGENT: I don't have an exact timeline.

FAISAL: Give me an estimate then.

AGENT: Maybe 3 to 5 working days.

FAISAL: Three to five days? In a volatile market? That could cost me lakhs!

AGENT: I understand, but this process is regulatory, we can't skip it.

FAISAL: I'm not asking you to skip it, I'm asking for a status update and a real explanation of why I specifically got flagged.

AGENT: I can raise a query with the surveillance team.

FAISAL: Has anyone already raised this in the last two days? I never got a call.

AGENT: I don't see any outbound call logged.

FAISAL: So for two days nobody was even working on this?

AGENT: I can't confirm that.

FAISAL: Can I speak to the surveillance team directly?

AGENT: They don't take direct calls, only email queries.

FAISAL: What's the email?

AGENT: [20-second silence] It's the compliance team address — I'd need to check the exact one.

FAISAL: You don't know your own compliance team's email?

AGENT: I'll get the correct one added to your ticket.

FAISAL: What ticket? Is there already one open?

AGENT: I'll create one now. TKT-64210.

FAISAL: Please note: two-day freeze during a live rally, no prior communication, unrealized gains lost, and I need a specific timeline, not "3 to 5 days maybe."

AGENT: Noted.

FAISAL: Read it back to me.

AGENT: "Customer account frozen, requesting update."

FAISAL: That's not what I said at all.

AGENT: I'll expand it. [30-second silence] Updated.

FAISAL: Is there truly nothing that can be done today?

AGENT: Not from my side, no.

FAISAL: Fine.

AGENT: Anything else?

FAISAL: No.

AGENT: Thank you, have a nice day. [Disconnects]

─── END OF TRANSCRIPT ──────────────────────────────────────────

YOUR TASK: Write a structured coaching report identifying a minimum of 7 coaching opportunities across: Call Opening, Explaining the Freeze, Handling "Am I being accused of something?", Urgency/Financial Impact, Escalation Access, and Call Closing. For each:
(a) Quote the exact transcript moment
(b) Explain the impact on the customer
(c) Write the improved response

Also answer: this agent never actually explained, in plain terms, why a surveillance-driven freeze cannot be rushed even though it is "standard." Write the exact explanation the agent should have given — one that is honest about the timeline while still being genuinely useful about the financial impact.

Minimum 250 words.`, checklist: [] },

        // ── Mock Call (Paper Trade)
        { id: 'mgr-mc1', module: 'mgr-mock-call', title: 'C-Suite Escalation — Contract at Final Risk', enabled: true, description: 'Handle a furious C-suite client call where the relationship is at final breaking point.', scenario: `You are the Relationship Manager for Altus Capital, a ₹80 crore institutional client relationship spanning 4 years. The CFO, Priya Nair, is on the line, visibly frustrated. Three consecutive quarter-end portfolio reports were delivered late — 2 days, then 4 days, then this last one 6 days late — arriving after Altus's own board meeting where those numbers were needed. Priya already escalated once by email two weeks ago and nothing visibly changed. She opens: "I have been more than patient. This is the third quarter in a row. Our board asked me questions I could not answer because your numbers weren't in my hand. I am reviewing this relationship with my CEO tomorrow morning. Give me one reason why we should not move to a different provider."

What you know (use it): the root cause is a data-reconciliation bottleneck in your operations team, already identified, with a fix roughly 3 weeks from being fully rolled out.

Handle this call for 5-6 minutes: acknowledge the pattern (not just the latest incident), explain the specific corrective action already underway with a real timeline, propose a concrete interim safety net for the next quarter-end while the fix rolls out, and make a credible commitment Priya can actually take to her CEO tomorrow morning.`, checklist: ['Acknowledges the full pattern across all three quarters, not just the latest incident', 'Explains the specific root cause and the real timeline for the fix', 'Proposes a concrete interim safety net for the next quarter-end', 'Demonstrates understanding of the business impact on Priya\'s board reporting', 'Makes a credible, specific commitment rather than a vague apology'] },
        { id: 'mgr-mc2', module: 'mgr-mock-call', title: 'Regulatory Audit Call — Explain Team Non-Compliance', enabled: true, description: 'Handle a call from a compliance auditor who has identified systematic non-compliance in your team.', scenario: `You are on a call with Meera Krishnamurthy, the Internal Compliance Auditor, following a routine review of your team's call-closure records. Her audit sampled 40 calls from last quarter and found 11 were marked "first-call resolved" in the CRM while the customer's actual ticket remained open in the ticketing system for an average of 6 more days afterward. Two of those 11 cases involve customers who called back angry and were re-logged as fresh complaints, which also understates your team's repeat-contact rate. Meera has flagged this to your regional head and needs your explanation today — her report is due to leadership by Friday. She is procedural and fact-driven, not hostile, but will press for specifics: she wants to know if this is a training gap or a systemic process gap, and she wants a corrective action plan she can attach to her report.

Handle this call for 5-6 minutes: be transparent about what you actually know versus don't yet know, take appropriate ownership without unfairly naming individual agents before you've verified anything, and propose both an immediate fix (re-auditing last quarter's "resolved" tags) and a systemic prevention measure.`, checklist: ['Be transparent without being evasive', 'Take appropriate ownership based on actual knowledge, not guesses', 'Avoids naming or blaming individual agents before verifying', 'Proposes an immediate corrective action (re-audit) with a timeline', 'Proposes a systemic prevention measure, not just a one-time fix'] },
        { id: 'mgr-mc3', module: 'mgr-mock-call', title: 'Performance Review Call — The Defensive Underperformer', enabled: true, description: 'Conduct a formal, documented performance review with a team member who is deflecting to external factors.', scenario: `You are conducting a formal, documented performance review call with Arvind, a team member who has missed his resolution-quality target for two consecutive months (78% and 74% against an 85% target), following an informal conversation last month that didn't move the needle. He joins the call already defensive: "I know the numbers don't look good, but honestly the leads I'm getting are lower quality and the product team keeps changing workflows without telling us — I don't think the target is realistic right now."

What you know (use it): the workflow changes are real — 3 in the last 6 weeks — but every other agent on the team is still hitting 82%+ despite them, so it isn't purely an external factor.

Handle this call for 5-6 minutes: acknowledge the workflow-change pressure as real without accepting it as the sole explanation, use the team-comparison data without making Arvind feel attacked, move the conversation past blaming external factors, and close with a specific, time-bound improvement plan with agreed check-in points.`, checklist: ['Acknowledges the workflow-change pressure as genuinely real', 'Uses the team-comparison data factually, without attacking Arvind personally', 'Moves the conversation past external-factor blame to his own gap', 'Sets a specific, time-bound improvement plan', 'Agrees concrete check-in points to track progress'] },
        { id: 'mgr-mc4', module: 'mgr-mock-call', title: 'Margin Call Penalty Dispute', enabled: true, description: 'Corporate client disputing ₹1.8 Lakh margin penalty, with a genuine system-delay wrinkle you already know about.', scenario: `You are handling an inbound call from Rajesh Oberoi, a high-volume corporate trading client with a ₹12 Crore portfolio, who was just charged a ₹1.8 Lakh penalty after the automated risk-management system squared off his leveraged Nifty futures position this morning. He is furious and insists he never received a margin-call alert — he checked his phone immediately after the square-off and found nothing. Your system logs show 2 SMS alerts and 1 app push notification sent, timestamped 40 and 15 minutes before the square-off — but you also know, from an internal ops bulletin circulated this week, that the SMS gateway had a documented 20-30 minute delivery delay affecting a subset of clients yesterday and this morning, which front-line staff haven't yet been briefed to check for. Rajesh threatens to move his entire ₹12 Crore portfolio to a competitor broker by end of day unless the penalty is refunded in full right now.

Handle this call for 5-6 minutes: verify the alert timeline factually without dismissing his experience, proactively check for and disclose the SMS delay issue rather than defending an alert system you have reason to doubt, and reach a resolution within your actual authority — you can waive the penalty as a goodwill gesture pending a technical investigation, but you cannot promise reinstatement of the squared-off position since the market has moved.`, checklist: ['Verifies the alert timeline factually without dismissing the client\'s experience', 'Proactively raises the known SMS gateway delay rather than defending the system blindly', 'Distinguishes clearly between what can be waived (the penalty) and what cannot (the position)', 'Handles the ₹12 Crore relationship-loss threat without over-promising', 'Commits to a specific investigation and follow-up timeline'] },
        { id: 'mgr-mc5', module: 'mgr-mock-call', title: 'Cross-Border Regulatory Freeze', enabled: true, description: 'NRI Demat account frozen due to FATCA re-declaration, with a genuine emergency and workable alternatives you need to surface.', scenario: `You are on a call with Fatima Hussain, an NRI client based in London, whose Demat account was automatically frozen three days ago pending a mandatory FATCA re-declaration. Compliance emailed her about it, but the email went to an old address she no longer actively checks. She is currently travelling for work and cannot access her registered Indian mobile number for the OTP needed to complete the re-declaration online. She has a ₹15 Lakh medical emergency for a family member back in India and needs to liquidate holdings today. She is calm but growing more desperate as the call goes on.

What you know (use it): the freeze and OTP-verified re-declaration are non-negotiable regulatory requirements, but there are alternative verification paths front-line agents often forget to offer — a video KYC re-verification call, or a physical branch visit by a registered Power of Attorney holder in India — instead of insisting she "must complete this online."

Handle this call for 5-6 minutes: acknowledge the urgency and stakes without over-promising a same-day fix you can't guarantee, walk her through the actual alternative verification paths available, and give her a realistic timeline for each option so she can decide which to pursue.`, checklist: ['Acknowledges the medical urgency without making false promises', 'Does not simply repeat "you must do this online" without offering alternatives', 'Surfaces the video-KYC and POA-branch-visit options clearly', 'Gives a realistic timeline for each alternative path', 'Stays within regulatory limits — never suggests bypassing the FATCA requirement'] },

        // ── Feedback (Red Pen)
        { id: 'mgr-fb1', module: 'mgr-feedback', title: 'The High Performer Who Suddenly Disengaged', enabled: true, description: 'A previously high-performing report has quietly disengaged after a team move — QA and productivity have dropped and she insists she\'s fine.', scenario: `Ananya has been a consistent high performer for 8 months, but since moving to your team after a restructuring, her QA score has dropped from 94% to 79%, she's stopped participating, and no longer volunteers. When asked if she's okay, she says "Yes, I'm fine. I'll manage." Have a one-on-one conversation with her — without leading with the numbers or assuming she's become careless.`, checklist: [] },
        { id: 'mgr-fb2', module: 'mgr-feedback', title: 'I Don\'t Think There Is Anything Wrong With My Work', enabled: true, description: 'A consistent performer dismisses repeated QA feedback on tone and empathy because his numbers are good.', scenario: `Rahul meets his targets but has received repeated QA feedback on interrupting customers, a robotic tone, and missed empathy. When you raise it again, he says: "But my numbers are good. Customers are getting the right answers. I don't understand why QA keeps giving me feedback." Respond in a way that helps him see the gap between getting the job done and doing it effectively — without arguing over whether QA is fair.`, checklist: [] },
        { id: 'mgr-fb3', module: 'mgr-feedback', title: 'The Employee Who Is Doing Well but Has a Negative Attitude', enabled: true, description: 'A top performer\'s cynical comments are discouraging the team, but he believes he\'s just being honest.', scenario: `Vikram is one of your strongest performers, but he regularly makes discouraging comments in meetings ("This won't work," "We've tried this before") and influences others negatively. When you raise it, he says: "I'm only being practical. At least I'm honest. My performance is good, so I don't see the problem." Separate performance from behaviour and address the impact without making it personal.`, checklist: [] },
        { id: 'mgr-fb4', module: 'mgr-feedback', title: 'The Employee Who Keeps Making the Same Mistake', enabled: true, description: 'A repeated process error persists despite training and coaching, and the same apology each time isn\'t fixing it.', scenario: `Meera has made the same process-related error four times this month despite explanation, documentation, and coaching. Each time she says: "I'm sorry. I'll be careful next time." This time you need a different conversation — diagnose whether this is a knowledge, skill, attitude, or attention issue, and agree a specific corrective action rather than accepting another promise to be careful.`, checklist: [] },
        { id: 'mgr-fb5', module: 'mgr-feedback', title: 'The Defensive Employee', enabled: true, description: 'An agent turns defensive during call-review feedback, feeling singled out and unrecognised for his good work.', scenario: `After reviewing three of Arjun's calls, you raise that he interrupted customers, missed probing opportunities, and didn't acknowledge frustration. He becomes defensive: "The customer was being unreasonable... other agents speak like this too, why am I being singled out... you only look at my mistakes." Keep the conversation from becoming confrontational and bring it back to observable behaviour.`, checklist: [] },
        { id: 'mgr-fb6', module: 'mgr-feedback', title: 'The Employee Who Has Lost Confidence', enabled: true, description: 'A recently promoted agent has lost confidence after a few difficult calls and is avoiding complex work.', scenario: `Priya was recently promoted to handle more complex calls and performed well initially, but after negative feedback on a few difficult calls her confidence has dropped — she's slower, avoids complex calls, and keeps asking "Am I doing this correctly?" When you tell her to be more confident, she says: "I'm trying. But every time I take a difficult call, I feel I'm going to make another mistake." Coach her — this is a confidence issue, not a knowledge gap.`, checklist: [] },

        // ── Emotional Intelligence (Mirror Room)
        { id: 'mgr-eq1', module: 'mgr-eq', title: 'The Breaking Point in a Team Meeting', enabled: true, description: `Respond to a team member's public emotional breakdown with professional, human leadership.`, scenario: `During a Monday morning team meeting with 11 people present, your agent Sana suddenly says through tears: "I can't keep doing this. The pressure is impossible."`, checklist: [] },
        { id: 'mgr-eq2', module: 'mgr-eq', title: 'The Public Undermining by a Peer Manager', enabled: true, description: 'Respond to deliberate public undermining with professional self-regulation and strategic thinking.', scenario: 'In a cross-functional leadership review, a peer manager says: "I think the numbers from your team look good on paper, but the quality escalations tell a different story."', checklist: [] },
        { id: 'mgr-eq3', module: 'mgr-eq', title: 'Multi-Front Operational Crisis', enabled: true, description: 'Server crash + 3 absent leads + VP review in 15 mins.', scenario: 'It is 9:15 AM on Monday. Trade execution server crashes, 3 key leads are absent, and VP calls an emergency review in 15 minutes.', checklist: [] },
        { id: 'mgr-eq4', module: 'mgr-eq', title: 'Public Peer Challenge', enabled: true, description: 'Direct report challenging strategy in public sync.', scenario: 'During a department strategy meeting, a direct report openly challenges your roadmap in front of executive management.', checklist: [] },

        // ── Listening & Tone
        { id: 'mgr-lt1', module: 'mgr-listening-tone', title: 'Listening & Tone — Manager Email Analysis', enabled: true, description: 'Analyse the tone, subtext, and communication quality of a real manager email.', scenario: 'Read the email carefully and answer 5 analytical questions about tone, impact, and what is unsaid.', checklist: [] },

        // ── Management Skills
        { id: 'mgr-ms1', module: 'mgr-management-skills', title: '30-60-90 Day Plan for a First-Time Team Lead', enabled: true, description: 'Design a rigorous, structured development plan for a newly promoted team lead.', scenario: 'You have just promoted Kiran, your highest-performing agent, to Team Lead. She is technically outstanding but has never managed people.', checklist: [] },
        { id: 'mgr-ms2', module: 'mgr-management-skills', title: 'Change Management Brief — CRM Migration', enabled: true, description: 'Lead a high-stakes system migration after a previous failure that damaged team trust.', scenario: 'Your team of 14 agents will migrate to a new CRM system in 4 weeks.', checklist: [] }
      ];

      // One-time cleanup: the Feedback (Red Pen) module's original 4 topics
      // were replaced wholesale by the 6 richer scenarios above (from the
      // "red pen 2" content). Remove the old titles by name so they don't
      // linger next to the new set — this only touches the topic catalog
      // row, never past sessions (sessions reference topic_id with
      // ON DELETE SET NULL, so scored history is unaffected).
      const obsoleteFeedbackTitles = new Set([
        'The Burnout Star', 'The Struggling New Hire', 'The Dismissive Senior', 'The Defiant Team Lead',
      ]);

      // Versioned content refresh for Transcript Autopsy and Mock Call: like
      // the Ops Escalation scripts, _seedManagerTopics only ever INSERTS
      // missing (module,title) pairs, so an already-seeded database would
      // otherwise never receive the fuller transcripts/scenarios added
      // below. Reuses the same _refreshOpsScriptIfStale helper (it's
      // generic — module/title/description/scenario/checklist, nothing
      // ops-specific) to push the richer content onto already-seeded rows.
      const MGR_TA_CONTENT_VERSION = 2; // v1: thin one-paragraph scenarios · v2: full call transcripts (ta1-4 fleshed out, ta5/ta6 added)
      const MGR_MC_CONTENT_VERSION = 2; // v1: 1-2 sentence stubs (mc4/mc5) or short scenarios (mc1/mc2) · v2: full 5-6 min context for all topics incl. new mc3

      if (_useLocalStorage) {
        let localT = _localGetAll('topics');
        for (const t of localT) {
          if (t.module === 'mgr-feedback' && obsoleteFeedbackTitles.has(t.title)) {
            _localDel('topics', t.id);
          }
        }
        localT = _localGetAll('topics');
        try {
          await _refreshOpsScriptIfStale('mgr-transcript-autopsy', MGR_TA_CONTENT_VERSION, mgrTopics, localT);
          await _refreshOpsScriptIfStale('mgr-mock-call', MGR_MC_CONTENT_VERSION, mgrTopics, localT);
        } catch (refreshErr) {
          console.warn('[DB] Manager topic content refresh (local) skipped:', refreshErr.message || refreshErr);
        }
        localT = _localGetAll('topics');
        const have = new Set(localT.filter(t => t.module && t.module.startsWith('mgr-')).map(t => t.module + '::' + t.title));
        for (const item of mgrTopics) {
          if (!have.has(item.module + '::' + item.title)) {
            _localPut('topics', item);
          }
        }
        return;
      }

      // Real Supabase: remove the obsolete Feedback titles, then find which
      // (module, title) pairs are already present so re-running this never
      // double-inserts and always fills in gaps.
      const { error: cleanupErr } = await _sb
        .from('topics')
        .delete()
        .eq('module', 'mgr-feedback')
        .in('title', Array.from(obsoleteFeedbackTitles));
      if (cleanupErr) console.warn('[DB] Obsolete feedback topic cleanup failed:', cleanupErr.message);

      const { data: existing, error: fetchErr } = await _sb
        .from('topics')
        .select('module, title')
        .like('module', 'mgr-%');
      if (fetchErr) throw fetchErr;

      try {
        await _refreshOpsScriptIfStale('mgr-transcript-autopsy', MGR_TA_CONTENT_VERSION, mgrTopics, existing || []);
        await _refreshOpsScriptIfStale('mgr-mock-call', MGR_MC_CONTENT_VERSION, mgrTopics, existing || []);
      } catch (refreshErr) {
        console.warn('[DB] Manager topic content refresh skipped:', refreshErr.message || refreshErr);
      }

      const have = new Set((existing || []).map(t => t.module + '::' + t.title));
      const missing = mgrTopics.filter(t => !have.has(t.module + '::' + t.title));
      if (!missing.length) return; // already fully seeded

      // Only send columns that actually exist on the topics table — no
      // hand-rolled id (let Postgres generate the UUID), no wrongResponse /
      // sectionAPrompt (those live only in the manager-app.js SCENARIOS
      // constant, not in the DB).
      const payload = missing.map(t => ({
        module: t.module,
        title: t.title,
        description: t.description || '',
        scenario: t.scenario || '',
        checklist: t.checklist || [],
        enabled: t.enabled !== false,
        created_at: new Date().toISOString(),
      }));

      const { error: insertErr } = await _sb.from('topics').insert(payload);
      if (insertErr) throw insertErr;
      console.log(`[DB] Successfully seeded ${payload.length} manager topics.`);
    } catch (e) {
      console.warn('[DB] _seedManagerTopics failed:', e.message || e);
    }
  }

  // ---- put: insert or upsert a record ----
  async function put(store, data) {
    if (_useLocalStorage) {
      return _localPut(store, data);
    }

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
    if (_useLocalStorage) {
      return _localGet(store, id);
    }

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
    if (_useLocalStorage) {
      return _localGetAll(store);
    }

    // sessions uses submitted_at; everything else uses created_at
    const orderCol = store === 'sessions' ? 'submitted_at' : 'created_at';
    const { data, error } = await _sb.from(store).select('*').order(orderCol, { ascending: true });
    if (error) throw error;
    return (data || []).map(r => _fromDB(store, r));
  }

  // ---- patch: partial update (only specified columns) ----
  async function patch(store, id, data) {
    if (_useLocalStorage) {
      _localPatch(store, id, data);
      return;
    }

    const dbData = _toDB(store, data);
    const { error } = await _sb.from(store).update(dbData).eq('id', id);
    if (error) throw error;
  }

  function _localPatch(store, id, data) {
    const record = _localGet(store, id);
    if (record) {
      Object.assign(record, data);
      _localPut(store, record);
    }
  }

  // ---- del: delete a record by id ----
  async function del(store, id) {
    if (_useLocalStorage) {
      _localDel(store, id);
      return;
    }

    const { error } = await _sb.from(store).delete().eq('id', id);
    if (error) throw error;
  }

  // ---- getByIndex: filter records by a field value ----
  async function getByIndex(store, field, value) {
    if (_useLocalStorage) {
      return _localGetByIndex(store, field, value);
    }

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
  function getClient() {
    if (_useLocalStorage) {
      return {
        auth: {
          getSession: async () => ({ data: { session: null } }),
          onAuthStateChange: () => {},
          signInWithPassword: async () => { throw new Error('Offline mode: Auth not available'); },
          signUp: async () => { throw new Error('Offline mode: Auth not available'); },
          signOut: async () => {}
        }
      };
    }
    return _sb;
  }

  function isLocalStorage() {
    return _useLocalStorage;
  }

  async function forceReSeed() {
    await _seedDefaults(true);
    await _seedManagerTopics();
  }

  return { init, put, patch, get, getAll, del, getByIndex, getClient, isLocalStorage, forceReSeed, seedManagerTopics: _seedManagerTopics };
})();
