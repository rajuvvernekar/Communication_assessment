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
  // Three bugs fixed here (2026-09-16), found while investigating ~15
  // trainees whose completed assessments never showed up in admin after a
  // Supabase project pause, and then a wave of duplicated topics reported
  // in admin (66 titles, 2-5 copies each, dating back to June):
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
  //
  // 3. `topics` is catalog/reference content seeded by _seedDefaults(), not
  //    trainee- or session-scoped data — every browser that ever ran the
  //    LocalStorage fallback got its own full local copy of the topic
  //    catalog (via _seedLocalStorageDefaults), each item tagged with a
  //    throwaway `local-xxxx` id. This function used to migrate `topics`
  //    exactly like any other store: `upsert(dbData, {onConflict:'id'})`.
  //    Since a `local-xxxx` id never matches any real UUID already in the
  //    `topics` table, that "upsert" always inserted a brand-new row — so
  //    every reconnect after an outage re-seeded the ENTIRE topic catalog
  //    as duplicates. `topics` is now matched by its real natural key
  //    (module + title) against what's already live, instead of by id:
  //    a match is skipped (the content already exists — _seedDefaults'
  //    versioned refresh keeps it current, this function's job is only to
  //    not blow away trainee/session data), and only a genuinely new title
  //    is inserted, with a fresh server-generated id rather than the local
  //    placeholder one.
  async function _migrateLocalStorageToSupabase() {
    try {
      const stores = ['trainees', 'topics', 'sessions', 'ai_audit_scores', 'settings'];
      for (const store of stores) {
        const localItems = _localGetAll(store);
        if (localItems.length === 0) continue;

        console.log(`[DB] Found ${localItems.length} unsynced items in local storage for ${store}. Migrating to Supabase...`);
        const failedItems = [];

        // Catalog content: match by (module, title), never by the local
        // placeholder id — see note (3) above. Fetch what's already live
        // once, up front, rather than per item.
        let liveTopicKeys = null;
        if (store === 'topics') {
          const { data: liveTopics, error: liveErr } = await _sb.from('topics').select('module, title');
          if (liveErr) {
            console.warn('[DB] Could not read live topics for dedup check; skipping topic migration this run:', liveErr.message || liveErr);
          } else {
            liveTopicKeys = new Set((liveTopics || []).map(t => `${t.module}:${t.title}`));
          }
        }

        for (const item of localItems) {
          try {
            if (store === 'settings') {
              // Settings key merge (e.g. merge team assignments, avoid overwriting adminUsers entirely unless default)
              if (item.key === 'adminUsers') continue; // don't push default admins over customized cloud database admins
              const { error } = await _sb.from('settings').upsert({ key: item.key, value: item.value }, { onConflict: 'key' });
              if (error) throw error;
            } else if (store === 'topics') {
              if (!liveTopicKeys) {
                // Couldn't verify what's already live this run — leave the
                // item in local storage and retry on the next load rather
                // than risk inserting a duplicate blind.
                failedItems.push(item);
                continue;
              }
              const key = `${item.module}:${item.title}`;
              if (liveTopicKeys.has(key)) {
                // Already present in Supabase (seeded there directly, or
                // migrated from another browser already) — nothing to do.
                continue;
              }
              const dbData = _toDB('topics', item);
              delete dbData.id; // never write the local-xxxx placeholder id — let Postgres generate a real one
              const { error } = await _sb.from('topics').insert(dbData);
              if (error) throw error;
              liveTopicKeys.add(key); // avoid re-inserting the same new title twice within this same run
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

      // 2026-09-18: Pick & Speak (General/Stock), Mock Call, Role Play, Group
      // Discussion, and Written Comm were removed from this seed list at
      // admin's request — the platform is scoped down to Ops Escalation
      // Call/Writing (below) plus the Manager modules (seeded separately by
      // _seedManagerTopics(), untouched). Removing them here (not just
      // deleting the live rows in Supabase) matters: this function re-adds
      // any (module,title) pair that's "missing" from the live table on
      // every successful DB.init(), so leaving those defaults in place would
      // have silently reseeded every deleted topic back the next time
      // anyone loaded the app. If any of these modules are ever needed
      // again, their original content is in git history on this file.
      const defaults = [
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
        },

        // Trainee Red Pen — Operations Escalation Writing: CDSL Easiest & Gifting
        // (4 conceptual questions). Mirrors the ops-call-assessment conceptual
        // split above, but as a written ticket and trimmed to 4 questions
        // (writing a full reply per turn takes longer than answering on a
        // call, so this uses half the question count of the 8Q call version).
        // Deliberately concept/rule questions, not data-driven ones: no
        // invented numbers or "Key details" blocks.
        {
          module: 'ops-writing-assessment',
          title: 'CDSL Easiest & Gifting — Transfer Rules (Conceptual)',
          description: 'A theory-driven written escalation ticket testing understanding of CDSL Easiest, gifting, and cross-depository transfers — no numbers or data, just the concepts and rules. 4 tough conceptual questions, one at a time.',
          scenario: 'A client has written in with several conceptual questions about how CDSL Easiest, gifting, and cross-depository transfers actually work — they are not disputing a specific transaction, they want to understand the real rules well enough to trust your written answer. Reply to each of the 4 questions accurately and professionally before the client raises the next one.',
          checklist: [
            "Explain the actual underlying rule or process correctly, not a guess or a half-remembered version",
            "Clearly distinguish what is a technology/app step from what is a genuine regulatory or depository requirement",
            "Correct any wrong assumption in the client's message rather than agreeing with it",
            "Use plain, precise written language a non-technical client can actually follow",
            "Keep a professional, confident tone throughout the written reply, even if the client pushes back"
          ],
          bot_script: [
            "Hi, I always thought CDSL Easiest was only for gifting shares within family. Can I actually use it to transfer shares to a friend, or to move shares to my own account at a completely different broker? I don't want to submit the wrong kind of request.",
            "Thanks for that. One more thing — is there any real difference, from the depository's point of view, between a 'self transfer' (moving shares between two accounts I own) and a 'gift transfer' to someone else? Or is that just a label the app uses internally?",
            "I also noticed the app mentions a 'Trusted Account' option and a separate 'Account of Choice' option for transfers. Why would one of those be capped at a handful of accounts while the other needs a digital signature certificate? What's actually different between them?",
            "Last question on this — if I do end up gifting some shares to my brother, does he have to pay any tax on receiving them, or is tax only something I need to worry about if I gift shares to someone who isn't a relative? Please confirm clearly since I want to close this ticket today."
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Writing: Nominee Rules (Conceptual)
        {
          module: 'ops-writing-assessment',
          title: 'Nominee Modification — Rules & Limits (Conceptual)',
          description: 'A theory-driven written escalation ticket testing understanding of nominee rules on a demat account — how many are allowed, who can be one, and what verification is required. 4 tough conceptual questions, one at a time.',
          scenario: 'A client has written in with several conceptual questions about nominee rules on their demat account — they want to understand the actual regulatory limits and requirements, not just be told "yes" or "no" in writing. Reply to each of the 4 questions accurately and professionally before the client raises the next one.',
          checklist: [
            "State the actual rule or limit correctly rather than guessing or making one up",
            "Clearly explain WHY a rule exists where relevant (e.g. extra verification for a minor), not just that it exists",
            "Correct any wrong assumption in the client's message rather than agreeing with it",
            "Use plain, precise written language a non-technical client can actually follow",
            "Keep a professional, confident tone throughout the written reply, even if the client pushes back"
          ],
          bot_script: [
            "Hi, I'd like to understand the nominee rules on my demat account before I make any changes. How many nominees am I actually allowed to add, and is there a rule about how the percentage share has to be split between them?",
            "That's helpful. Can a nominee be someone who isn't a blood relative — like a close friend or a business partner — or does the rule restrict nominees to family only?",
            "My registered mobile number isn't linked to my Aadhaar. Does that block me from changing my nominee altogether, or does it just mean I have to use a different method to submit the request?",
            "Last thing — why would the process ask for both a physically signed form AND a digital eSign on top of it? Isn't a digital signature alone enough to make this legally valid these days? Please explain clearly so I know exactly what to send you."
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Writing: Short Delivery & Auctions (Conceptual)
        {
          module: 'ops-writing-assessment',
          title: 'Short Delivery & Auction Mechanics (Conceptual)',
          description: 'A theory-driven written escalation ticket testing understanding of why short delivery happens and how the auction settlement process actually works — no numbers, just the mechanics. 4 tough conceptual questions, one at a time.',
          scenario: 'A client has written in wanting to genuinely understand how short delivery and the auction process work — not dispute a specific number, but understand the mechanism well enough to trust the outcome next time it happens. Reply to each of the 4 questions accurately and professionally before the client raises the next one.',
          checklist: [
            "Explain the actual mechanism correctly rather than a simplified or incorrect version",
            "Be clear about whose responsibility short delivery and its cost actually is, and why",
            "Correct any wrong assumption in the client's message rather than agreeing with it",
            "Use plain, precise written language a non-technical client can actually follow",
            "Keep a professional, confident tone throughout the written reply, even if the client pushes back"
          ],
          bot_script: [
            "Hi, can you explain in plain terms why a short delivery even happens in the first place? Is it always the seller's fault, or can it happen for reasons completely outside their control?",
            "Understood. Is a short-delivery penalty a fine charged to the seller, or is it compensation paid out to the buyer? Where does that money actually end up going?",
            "Why would a stock being in the trade-to-trade category, or being under a corporate action, change how a shortage gets settled instead of just running the normal auction like any other stock?",
            "One last question — when the exchange can only buy back part of the missing shares in the auction and has to close out the rest in cash, how is the final price worked out for everyone? Is it two separate prices, or one blended rate applied to the whole quantity? Please confirm in writing so I can close this out."
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Writing: Suspended Stocks (Conceptual)
        {
          module: 'ops-writing-assessment',
          title: 'Suspended Stocks — Trading Halts & Corporate Actions (Conceptual)',
          description: 'A theory-driven written escalation ticket testing understanding of what a trading suspension actually means and how it interacts with dividends, AGMs, and off-market transfers. 4 tough conceptual questions, one at a time.',
          scenario: 'A client holds a suspended stock and has written in with several conceptual questions about what suspension actually means for their rights as a shareholder — not a specific transaction dispute, but genuine confusion about the rules. Reply to each of the 4 questions accurately and professionally before the client raises the next one.',
          checklist: [
            "Explain the actual distinction between suspension, delisting and similar terms correctly, not loosely or interchangeably",
            "Be clear about what a suspension does and does NOT freeze (e.g. corporate actions vs trading itself)",
            "Correct any wrong assumption in the client's message rather than agreeing with it",
            "Use plain, precise written language a non-technical client can actually follow",
            "Keep a professional, confident tone throughout the written reply, even if the client pushes back"
          ],
          bot_script: [
            "Hi, what's the actual difference between a stock being 'suspended' and being 'delisted'? I keep hearing both terms used and I'm not sure if they mean the same thing.",
            "Okay, that makes sense. Can a company still pay a dividend, or run a buyback, while its own stock is suspended from trading? I would have assumed a suspension freezes everything about the company.",
            "Does a stock being suspended stop me from transferring it off-market to someone else or gifting it, or is buying and selling on the exchange the only thing that's actually blocked?",
            "Last question — what's genuinely different between a company going through insolvency resolution and a stock that's simply suspended for something like a compliance lapse? Do both restrict me the exact same way? Please lay it out clearly so I can close this ticket."
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
      const OPS_WRITING_SCRIPT_VERSION = 2; // v1: original 4Q · v2: reformatted with explicit "Key details" data blocks · added 4 new conceptual writing topics (CDSL, Nominee, Short Delivery, Suspended) at 4Q each alongside the original numeric ticket — no version bump needed since these are new (module,title) pairs, not edits to an existing one
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
        // ── Situation Room (5 scenarios — Order Execution Failure, Unauthorized Trade
        // Dispute, RMS Auto Square-Off, KYC Freeze, Trading App Outage). Manager UI
        // reads these from the hardcoded SCENARIOS constant in manager-app.js, not
        // from this table — these DB rows exist only for admin-panel listing
        // consistency; editing/toggling them here has no effect on what managers see.
        { id: "mgr-sr1", module: "mgr-situation-room", title: "Order Execution Failure During a Market Crash", enabled: true, description: "Order Execution Failure During a Market Crash", scenario: "A high-net-worth client placed a large sell order on a volatile derivatives position during a sharp intraday market crash. The order failed to execute due to a system slowdown during peak load. By the time it went through manually, the client had lost ₹8.4 lakh more than if the order had executed on time. The client has called the branch manager directly, furious.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.", checklist: [] },
        { id: "mgr-sr2", module: "mgr-situation-room", title: "Unauthorized Trade Dispute", enabled: true, description: "Unauthorized Trade Dispute", scenario: "A client discovers three trades in their account they insist they never placed — all executed on the same day the market moved sharply against those positions, resulting in a loss of ₹3.1 lakh. The client suspects either a system glitch attributed the trades wrongly, or unauthorized access. They are alleging fraud.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.", checklist: [] },
        { id: "mgr-sr3", module: "mgr-situation-room", title: "RMS Auto Square-Off During Margin Shortfall", enabled: true, description: "RMS Auto Square-Off During Margin Shortfall", scenario: "A client's leveraged intraday position was auto-squared-off by the Risk Management System after a sudden margin shortfall triggered by a gap-down opening. The client was travelling and unreachable for the margin call SMS/call. The square-off locked in a loss of ₹5.6 lakh, and the client believes that had it not been squared off, the position would have recovered by market close (it did, in hindsight). The client is irate.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.", checklist: [] },
        { id: "mgr-sr4", module: "mgr-situation-room", title: "KYC Freeze Blocking an Urgent Withdrawal", enabled: true, description: "KYC Freeze Blocking an Urgent Withdrawal", scenario: "A client's trading account and linked funds were frozen for a mandatory periodic KYC re-verification, flagged as overdue by compliance. The client had a ₹12 lakh withdrawal pending to cover a personal emergency (a family medical situation) and only discovered the freeze when the withdrawal failed. The client is distressed and angry, not at the requirement itself but at the timing and lack of warning.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.", checklist: [] },
        { id: "mgr-sr5", module: "mgr-situation-room", title: "Trading App Outage During a Volatile Session", enabled: true, description: "Trading App Outage During a Volatile Session", scenario: "During a session with unusually high volatility around a major macroeconomic announcement, the trading app crashed for approximately 40 minutes for a segment of users, including this client, who was holding an open leveraged position and unable to exit. When the app came back, the position had moved sharply against the client, resulting in a ₹6.7 lakh loss the client believes was entirely avoidable had they been able to exit when they tried. The client is threatening to go public.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.", checklist: [] },

        // ── The Transcript Autopsy (5 scenarios — Brokerage & Charges Dispute, IPO
        // Allotment Display Error, DP/Demat Block, Algo/API Order Duplication,
        // Senior Citizen Product-Suitability Complaint). Live-read from this table.
        { id: "mgr-ta1", module: "mgr-transcript-autopsy", title: "Brokerage & Charges Dispute", enabled: true, description: "Brokerage & Charges Dispute", scenario: "BACKGROUND: A high-value client disputes ~₹42,000 in brokerage and fees never explained at onboarding, escalating when offered a tariff-sheet PDF instead of an explanation.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"I just reconciled my account statement for the last quarter and I've been charged nearly ₹42,000 more in brokerage and fees than what was quoted to me when I opened this account. This is unacceptable.\"\n\nMANAGER: \"Sir, brokerage charges are clearly mentioned in the account opening documents you signed. If you didn't read them carefully, that's not really something we can help with now.\"\n\nCLIENT: \"I did read them. I was quoted a flat rate, and I'm seeing multiple additional charges I was never told about — STT, exchange fees, stamp duty, and something called 'transaction charges' stacked on top.\"\n\nMANAGER: \"Those are statutory and exchange-level charges, sir, every broker charges them, it's not specific to us. I don't understand why this is a surprise to you at this point.\"\n\nCLIENT: \"It's a surprise because nobody explained the full cost breakdown to me when I signed up. I feel like I was misled into this account.\"\n\nMANAGER: \"We never mislead clients. All charges are disclosed in the tariff sheet on our website. You could have checked it any time in the last eight months.\"\n\nCLIENT: \"So you're telling me it's my fault for not double-checking your website after your own team quoted me a number?\"\n\nMANAGER: \"I'm just saying the information was available, sir. I can send you the tariff sheet again if that helps.\"\n\nCLIENT: \"I don't want a PDF, I want someone to explain why what I was told at onboarding doesn't match what I'm being charged, and I want to know what you're going to do about the difference.\"\n\nMANAGER: \"There isn't really a 'difference' to correct, sir — the charges are accurate as per our published rates. I can raise a general feedback ticket about the onboarding conversation if you'd like.\"\n\nCLIENT: \"A feedback ticket? I'm talking about forty-two thousand rupees and eight months of being charged incorrectly by your team's own account, and you're offering a feedback ticket?\"\n\nMANAGER: \"I understand you're upset, but without a recording of that original onboarding call, there's no way to verify what was actually said to you.\"\n\nCLIENT: \"So now you're saying I'm lying about what your representative told me.\"\n\nMANAGER: \"I'm not saying that, sir, I'm just saying we can't act on it without proof. I can escalate this to my senior if you want, but I don't think the outcome will be different.\"\n\nCLIENT: \"This is exactly why I'm moving my account elsewhere and posting a review about this exact conversation.\"", checklist: [] },
        { id: "mgr-ta2", module: "mgr-transcript-autopsy", title: "IPO Allotment Display Error", enabled: true, description: "IPO Allotment Display Error", scenario: "BACKGROUND: A client's app briefly showed 400 IPO shares allotted, then zero — the manager insists it's someone else's problem at every turn.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"Your app showed me IPO allotment confirmed on Tuesday morning — 400 shares. Now today it shows zero allotment. What happened?\"\n\nMANAGER: \"Sir, that must have been a display glitch on your end. Our backend never confirms allotment before the registrar's official file is processed.\"\n\nCLIENT: \"It wasn't a glitch, I have a screenshot with a timestamp. It clearly said 'Allotted: 400 shares' with a congratulatory banner.\"\n\nMANAGER: \"Even if the app showed that, it's not something we can act on — allotment is decided by the registrar and the exchange, not us.\"\n\nCLIENT: \"I understand the registrar decides allotment, but your platform told me I got it, and I made plans — I told my family, I was counting on the listing gains you people market so heavily.\"\n\nMANAGER: \"We can't be responsible for plans you made based on an app screen, sir. These things happen sometimes with high demand IPOs.\"\n\nCLIENT: \"So a technical error on your platform is just something I have to absorb with no accountability from your side?\"\n\nMANAGER: \"I mean, technically the error is on the display layer, not the actual allotment process, so there's no financial loss to compensate for.\"\n\nCLIENT: \"There's no financial loss because I never got the shares I was told I had — but there's real damage to my trust in this platform, and I want to know how this happened.\"\n\nMANAGER: \"I can log a technical complaint, but I can't promise you any explanation timeline. These backend sync issues are handled by a different team entirely.\"\n\nCLIENT: \"This is the third time I'm being told 'a different team handles that.' At some point someone in front of me has to actually own this.\"\n\nMANAGER: \"I understand your frustration, sir, but I genuinely don't have visibility into what caused the display error. I can only pass this along.\"\n\nCLIENT: \"Then pass it along with urgency, because I am seriously considering filing a complaint with the exchange about misleading allotment information.\"\n\nMANAGER: \"You're welcome to do that, sir, that's entirely your choice. I've noted your complaint on our end as well.\"\n\nCLIENT: \"This entire conversation has told me you have no real answers and no real ownership of your own platform's mistakes.\"", checklist: [] },
        { id: "mgr-ta3", module: "mgr-transcript-autopsy", title: "DP/Demat Block Before a Board Announcement", enabled: true, description: "DP/Demat Block Before a Board Announcement", scenario: "BACKGROUND: A client's shares were blocked in demat right before a board announcement that later moved the stock 14%, and the manager cannot explain why or who is responsible.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"I tried to sell my entire holding in [Company] yesterday morning before the board meeting outcome, and the sell order failed because my shares showed as 'blocked' in demat. Why?\"\n\nMANAGER: \"Sometimes shares get blocked if there's a pending pledge or a previous instruction not yet processed, sir. It's a system-level thing.\"\n\nCLIENT: \"I never pledged these shares. I've held them for two years, untouched. Can you tell me exactly why they were blocked at that specific moment?\"\n\nMANAGER: \"I'd have to check the DP logs for that, but honestly this kind of thing is common and usually resolves itself within a day or two.\"\n\nCLIENT: \"A day or two was too late — the board announcement came out and the stock dropped 14% right after. I lost the entire window because of your block.\"\n\nMANAGER: \"I understand that's frustrating, but demat blocks aren't something the trading desk controls, it's a depository-level issue, completely separate from us.\"\n\nCLIENT: \"You're the broker I trusted with this account. I don't care how many departments are involved internally — I need someone to explain what actually happened.\"\n\nMANAGER: \"I hear you, sir, but I genuinely can't speak to depository-side processing, that's outside what I can access from here.\"\n\nCLIENT: \"So who can? Because right now I've lost a significant amount of money and all I'm getting is 'not my department.'\"\n\nMANAGER: \"I can raise a ticket to our demat operations team, but resolution and root cause usually takes several working days to come back.\"\n\nCLIENT: \"Several working days for an explanation of something that cost me money in a matter of hours. Do you understand how that sounds?\"\n\nMANAGER: \"I do understand, sir, and I'm sorry you're going through this, but I can't speed up an internal investigation just because it's urgent for you.\"\n\nCLIENT: \"This isn't just urgent for me, it should be urgent for you — your operational failure potentially cost me lakhs.\"\n\nMANAGER: \"I've logged your concern, sir. Once operations reverts with the root cause, we'll let you know what corrective steps, if any, are appropriate.\"\n\nCLIENT: \"'If any' is exactly the problem. I want a commitment that this gets investigated properly, not passed around until I give up.\"", checklist: [] },
        { id: "mgr-ta4", module: "mgr-transcript-autopsy", title: "Algo/API Order Duplication Fault", enabled: true, description: "Algo/API Order Duplication Fault", scenario: "BACKGROUND: A client's automated trading script fired the same order 11 times after a delayed API acknowledgment — with logs proving the delay originated server-side.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"Your API fired the same buy order eleven times in ninety seconds this morning. I ended up with eleven times the position I intended, and I had to unwind it all at a loss.\"\n\nMANAGER: \"API issues are usually on the client's script side, sir — did you check your own order logic for a retry loop?\"\n\nCLIENT: \"I've run this exact script for six months with no issues. This morning your API acknowledgment response was delayed, which is what triggered my system's retry logic to fire again.\"\n\nMANAGER: \"If it's a delayed acknowledgment issue, that's still technically a network-level thing, could be your internet, could be ours, hard to say without a deep investigation.\"\n\nCLIENT: \"I have the request and response logs with timestamps showing the delay originated on your servers, not mine. I'm not asking you to guess — I'm asking you to look at the actual data.\"\n\nMANAGER: \"Sir, we get a lot of these claims and in most cases it turns out to be client-side. I'm not saying that's definitely the case here, but statistically that's usually how it goes.\"\n\nCLIENT: \"I'm not most cases. I'm telling you I have logs. This cost me close to nine lakh rupees in an unintended position I had to exit at a loss.\"\n\nMANAGER: \"I can forward the logs to our tech team for review, but I want to set expectations — even if it is confirmed as a server-side delay, compensation isn't guaranteed.\"\n\nCLIENT: \"I'm not even asking about compensation yet. I'm asking for someone to actually investigate before jumping to 'compensation isn't guaranteed.'\"\n\nMANAGER: \"Understood, sir, I just wanted to be upfront so there's no misunderstanding later. I'll forward what you have.\"\n\nCLIENT: \"It would help if the first thing I heard from you was 'let's look into this properly' instead of managing my expectations downward before you've even seen the evidence.\"\n\nMANAGER: \"Fair point, sir. Send over the logs and I'll get the technical review started today.\"\n\nCLIENT: \"I sent them to your support email an hour before I called you. Nobody has acknowledged them yet.\"\n\nMANAGER: \"Let me check on that and make sure it's been picked up. I'll call you back by end of day with a status, not a resolution, just a status.\"\n\nCLIENT: \"That's the first useful thing I've heard in this entire call.\"", checklist: [] },
        { id: "mgr-ta5", module: "mgr-transcript-autopsy", title: "Senior Citizen Product-Suitability Complaint", enabled: true, description: "Senior Citizen Product-Suitability Complaint", scenario: "BACKGROUND: A 72-year-old pensioner was activated for leveraged F&O trading and lost ₹6 lakh — his son calls, and every answer deflects to 'a different team' or 'he signed a form.'\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCALLER: \"My father is 72 years old, retired, living on a fixed pension, and somehow your team sold him futures and options trading with leverage. He's lost almost ₹6 lakh of his retirement savings. How did this happen?\"\n\nMANAGER: \"Sir, every client signs a risk disclosure document before F&O activation, so legally he consented to the risk involved.\"\n\nCALLER: \"He barely understands what F&O even stands for. Did anyone actually assess whether this was suitable for a 72-year-old pensioner before activating it?\"\n\nMANAGER: \"There's a standard suitability questionnaire, but ultimately it's self-declared by the client, we can't force someone to answer honestly.\"\n\nCALLER: \"So you're saying it's his fault for not filling out a form correctly, when he didn't understand what the form was even asking?\"\n\nMANAGER: \"I'm not blaming him, sir, I'm just explaining the process. If he had concerns he could have asked before trading.\"\n\nCALLER: \"He trusted whoever called him and told him this could 'boost his returns.' That's what he told me. Was he cold-called about this product?\"\n\nMANAGER: \"I don't have visibility into individual sales calls, sir, that would be a different team's outreach.\"\n\nCALLER: \"This is my father's life savings we're discussing, and every answer I get is 'different team' or 'he signed a form.' I need someone to actually take this seriously.\"\n\nMANAGER: \"I do take it seriously, sir, but without evidence of specific misrepresentation, there isn't much action we can take beyond noting your concern.\"\n\nCALLER: \"The evidence is that a 72-year-old pensioner with zero trading history suddenly has an active F&O account and a six lakh rupee loss within two months. That pattern should be evidence enough.\"\n\nMANAGER: \"I understand it looks concerning, but I'm not in a position to make a suitability judgment call over the phone. I can log this as a complaint.\"\n\nCALLER: \"Log it as more than a complaint. I want to know if this is a broader pattern with elderly clients, because if it is, I am taking this to SEBI directly.\"\n\nMANAGER: \"You're free to do that, sir. I'll make sure the complaint is recorded accurately on our end.\"\n\nCALLER: \"'Recorded accurately' isn't what I came here for. I came here for someone to say this was wrong and commit to actually looking into it.\"", checklist: [] },

        // ── The Paper Trade (5 scenarios — Failed Stop-Loss, Suspected Account Access
        // Breach, Forced Liquidation of Pledged Shares, Wrong Brokerage Plan, Loss on
        // an Advisory-Recommended Stock). Live-read from this table.
        { id: "mgr-mc1", module: "mgr-mock-call", title: "Failed Stop-Loss During a Gap-Down", enabled: true, description: "Failed Stop-Loss During a Gap-Down", scenario: "The customer's stop-loss order on a large equity position failed to trigger during a sharp gap-down opening due to a liquidity gap at that price level, resulting in a much larger loss than the stop-loss was meant to protect against. The customer wants immediate compensation for the difference.\\n\\nThe customer opens the call by saying:\\n\\n\"My stop-loss was supposed to protect me from exactly this. It didn't trigger, and now I'm down four times what I should have lost. I want the difference compensated, today.\"\\n\\nEscalation beats the customer will raise if your handling doesn't already address them: (1) \"A stop-loss is a promise, isn't it? Otherwise what's the point of offering it?\" (2) \"I don't care about liquidity gaps, that's your platform's problem to solve, not mine.\" (3) \"If you can't compensate me, tell me exactly who can, right now.\"\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },
        { id: "mgr-mc2", module: "mgr-mock-call", title: "Suspected Account Access Breach", enabled: true, description: "Suspected Account Access Breach", scenario: "The customer noticed a login from an unrecognized device and location in their account activity log, alongside two small unfamiliar orders that were later reversed by risk monitoring before settlement. The customer is alarmed about a possible security breach and is considering going to the media.\\n\\nThe customer opens the call by saying:\\n\\n\"Someone accessed my trading account from a device and city I've never used. There were unauthorized orders. I want to know right now how secure my money actually is with you, or I'm going to the press about this.\"\\n\\nEscalation beats the customer will raise if your handling doesn't already address them: (1) \"How do I know this hasn't happened before without me noticing?\" (2) \"I want my account frozen and a full security audit, not a generic 'we take security seriously' line.\" (3) \"If this becomes public and your stock or reputation takes a hit, that's on you, not me.\"\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },
        { id: "mgr-mc3", module: "mgr-mock-call", title: "Forced Liquidation of Pledged Shares", enabled: true, description: "Forced Liquidation of Pledged Shares", scenario: "The customer had pledged shares against a loan facility; a sudden fall in the pledged stock's value triggered a margin call that the customer missed (traveling internationally), leading to forced liquidation of the pledged shares at a steep loss. The customer says they never received adequate notice.\\n\\nThe customer opens the call by saying:\\n\\n\"You sold my pledged shares while I was on a flight with no signal. I got one SMS and that was it. That's not a fair warning process for something this serious.\"\\n\\nEscalation beats the customer will raise if your handling doesn't already address them: (1) \"One SMS is not 'reasonable notice' for liquidating my holdings.\" (2) \"Why wasn't there an email, a call, anything with more than one attempt?\" (3) \"I'm not asking you to reverse it, I'm asking why your notice process is this thin for something irreversible.\"\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },
        { id: "mgr-mc4", module: "mgr-mock-call", title: "Wrong Brokerage Plan Applied", enabled: true, description: "Wrong Brokerage Plan Applied", scenario: "The customer was onboarded onto a higher-cost brokerage plan due to an internal error, despite having requested and been verbally confirmed for a discount plan at account opening. This has been ongoing for five months, and the customer wants both a correction going forward and retroactive reimbursement.\\n\\nThe customer opens the call by saying:\\n\\n\"I specifically asked for the discount brokerage plan when I opened this account, and I was told yes. Five months later I find out I've been on the standard plan this whole time. I want this fixed and I want back what I overpaid.\"\\n\\nEscalation beats the customer will raise if your handling doesn't already address them: (1) \"This isn't a small amount over five months, it adds up.\" (2) \"I have no way to prove what was said on that call, but I remember it clearly — are you saying I'm making it up?\" (3) \"If you can fix it going forward but not reimburse the past five months, explain to me why that's fair.\"\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },
        { id: "mgr-mc5", module: "mgr-mock-call", title: "Loss on an Advisory-Recommended Stock", enabled: true, description: "Loss on an Advisory-Recommended Stock", scenario: "The customer subscribed to the firm's premium advisory service and acted on a strong \"buy\" recommendation that subsequently fell sharply after adverse company-specific news. The customer feels the recommendation was reckless and wants both the advisory subscription fee refunded and accountability for the loss.\\n\\nThe customer opens the call by saying:\\n\\n\"Your advisory team told me this stock was a strong buy with high conviction. I trusted that recommendation and put in a large amount. It's down thirty percent. I want my advisory fee refunded at the very least.\"\\n\\nEscalation beats the customer will raise if your handling doesn't already address them: (1) \"What's the point of paying for advisory if the calls are this wrong?\" (2) \"Was this recommendation based on real research, or just pushed to hit some target?\" (3) \"I'm not asking you to cover my trading loss, I'm asking why I should keep paying for advice that did this to me.\"\\n\\nHandle this call for 5-6 minutes: acknowledge the issue and the customer's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },

        // ── The Red Pen (5 profile cards — Mis-Selling Pattern, Skipped Compliance
        // Disclosures, Declining Call Quality, Chronic SLA Breaches, Trade Without
        // Verbal Confirmation). Manager UI reads these from the hardcoded SCENARIOS/
        // FB_EMPLOYEES constants in manager-app.js, not from this table — these DB rows
        // exist only for admin-panel listing consistency (see Situation Room note above).
        { id: "mgr-fb1", module: "mgr-feedback", title: "Mis-Selling Pattern Under Target Pressure", enabled: true, description: "Mis-Selling Pattern Under Target Pressure", scenario: "Employee: Relationship Manager, 2.3 years tenure, consistently in the top quartile for new account activations.\\n\\nSituation: Call audits over the last month show a repeated pattern of pushing high-margin F&O and derivative products to clients with clearly conservative risk profiles, without adequately explaining the risk, in order to hit a quarterly activation target.", checklist: [] },
        { id: "mgr-fb2", module: "mgr-feedback", title: "Skipped Mandatory Compliance Disclosures", enabled: true, description: "Skipped Mandatory Compliance Disclosures", scenario: "Employee: Senior Dealer, 4 years tenure, generally strong performer.\\n\\nSituation: Random call monitoring found that in 6 of the last 20 sampled calls, the mandatory risk disclosure script for leveraged products was skipped or rushed through inaudibly before order confirmation — a direct compliance and regulatory exposure.", checklist: [] },
        { id: "mgr-fb3", module: "mgr-feedback", title: "Declining Call Quality & Client Complaints", enabled: true, description: "Declining Call Quality & Client Complaints", scenario: "Employee: Customer Service Executive, 1.5 years tenure.\\n\\nSituation: Client satisfaction scores for this employee have dropped from 4.3 to 2.8 over two months, with three specific written complaints about curt, dismissive tone during high-value client interactions.", checklist: [] },
        { id: "mgr-fb4", module: "mgr-feedback", title: "Chronic SLA Breaches on Client Callbacks", enabled: true, description: "Chronic SLA Breaches on Client Callbacks", scenario: "Employee: Support Team Lead, 3 years tenure, previously a strong performer.\\n\\nSituation: Callback SLA (client escalations to be returned within 4 business hours) has been breached in 40% of cases over the last six weeks, several involving time-sensitive trading issues where delay caused real client financial impact.", checklist: [] },
        { id: "mgr-fb5", module: "mgr-feedback", title: "Trade Executed Without Proper Verbal Confirmation", enabled: true, description: "Trade Executed Without Proper Verbal Confirmation", scenario: "Employee: Dealer, 5 years tenure, high trust and seniority on the floor.\\n\\nSituation: A recorded call shows a large trade executed based on an ambiguous client instruction, without the mandatory verbal reconfirmation of quantity and price before execution — a serious protocol and compliance breach, even though this particular trade did not result in client loss.", checklist: [] },

        // ── The Mirror Room (5 cascade sets — Volatile Morning, System Failure Day,
        // Personal Attack Day, Compliance Crisis, Public Pressure Day). Live-read from
        // this table.
        { id: "mgr-eq1", module: "mgr-eq", title: "Cascade Set 1 — The Volatile Morning", enabled: true, description: "Cascade Set 1 — The Volatile Morning", scenario: "Situation 1: The market gaps down 4% at the open. Five high-value clients are calling in simultaneously, all demanding personal intervention on RMS auto square-offs happening in real time, and your support queue is already jammed.\\n\\nSituation 2: While still handling that, your compliance officer calls: a surprise regulatory inspection team is arriving in 20 minutes and needs files you have not prepared.\\n\\nSituation 3: One of the clients from situation 1 calls back — this time on speakerphone with a journalist friend listening in — saying they intend to publish the recording of this call.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)", checklist: [] },
        { id: "mgr-eq2", module: "mgr-eq", title: "Cascade Set 2 — The System Failure Day", enabled: true, description: "Cascade Set 2 — The System Failure Day", scenario: "Situation 1: The trading platform crashes fleet-wide for 15 minutes during F&O expiry, the highest-volume window of the month.\\n\\nSituation 2: Immediately after, a member of your team breaks down in visible distress at their desk, overwhelmed by the complaint volume, in front of the rest of the floor.\\n\\nSituation 3: Your regional head calls, demanding to know within the next 10 minutes why complaint numbers have spiked, ahead of a leadership review call.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)", checklist: [] },
        { id: "mgr-eq3", module: "mgr-eq", title: "Cascade Set 3 — The Personal Attack Day", enabled: true, description: "Cascade Set 3 — The Personal Attack Day", scenario: "Situation 1: A client screams abusive language at you directly over the phone and threatens to \"make sure you lose your job\" over a trading loss.\\n\\nSituation 2: Minutes later, you learn a formal complaint naming you personally — not just the branch — has been filed, alleging negligence.\\n\\nSituation 3: A peer manager quietly mentions they've heard the complaint may come up in your upcoming promotion review.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)", checklist: [] },
        { id: "mgr-eq4", module: "mgr-eq", title: "Cascade Set 4 — The Compliance Crisis", enabled: true, description: "Cascade Set 4 — The Compliance Crisis", scenario: "Situation 1: You discover evidence suggesting a member of your team may have front-run a large client order — a serious integrity and regulatory breach.\\n\\nSituation 2: Before you can act on it, the client involved calls in, unaware, casually praising that same team member's service.\\n\\nSituation 3: HR calls to inform you the team member has just submitted an immediate, effective-today resignation.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)", checklist: [] },
        { id: "mgr-eq5", module: "mgr-eq", title: "Cascade Set 5 — The Public Pressure Day", enabled: true, description: "Cascade Set 5 — The Public Pressure Day", scenario: "Situation 1: A negative post about your branch is trending on social media with hundreds of comments, referencing a client incident you have not yet been briefed on.\\n\\nSituation 2: Your manager calls, visibly stressed, demanding a response statement within 15 minutes.\\n\\nSituation 3: An unrelated client calls in, visibly anxious after seeing the post, asking whether their money is safe with the firm.\\n\\nAfter EACH situation below, before moving to the next, answer the same three questions:\\nQ1 — Self-Awareness: What's your gut reaction, and can you name it clearly?\\nQ2 — Impulse Control: What is your first action — and is it composed and deliberate, or reactive?\\nQ3 — Empathy & Consistency: How are you managing your own emotional state before responding to the people involved?\\n\\nWrite your full response covering all three situations in sequence — do not skip ahead or answer them as one combined situation; treat each as a fresh escalation layered on top of the last. (Min 300 words)", checklist: [] },

        // ── Listening & Tone
        { id: 'mgr-lt1', module: 'mgr-listening-tone', title: 'Listening & Tone — Manager Email Analysis', enabled: true, description: 'Analyse the tone, subtext, and communication quality of a real manager email.', scenario: 'Read the email carefully and answer 5 analytical questions about tone, impact, and what is unsaid.', checklist: [] },

        // ── Management Skills
        { id: 'mgr-ms1', module: 'mgr-management-skills', title: '30-60-90 Day Plan for a First-Time Team Lead', enabled: true, description: 'Design a rigorous, structured development plan for a newly promoted team lead.', scenario: 'You have just promoted Kiran, your highest-performing agent, to Team Lead. She is technically outstanding but has never managed people.', checklist: [] },
        { id: 'mgr-ms2', module: 'mgr-management-skills', title: 'Change Management Brief — CRM Migration', enabled: true, description: 'Lead a high-stakes system migration after a previous failure that damaged team trust.', scenario: 'Your team of 14 agents will migrate to a new CRM system in 4 weeks.', checklist: [] }
      ];

      // One-time cleanup (2026-09-19): all 5 doc-driven modules' topic banks
      // were replaced wholesale — Situation Room, Transcript Autopsy, Paper
      // Trade (mgr-mock-call), Red Pen (mgr-feedback), and Mirror Room
      // (mgr-eq) — with the 25 scenarios from the "Manager Assessment
      // Scenario Bank & Evaluation Parameters" doc. _seedManagerTopics only
      // ever INSERTS missing (module,title) pairs, so an already-seeded
      // database would otherwise keep every old title stacked alongside the
      // new ones forever. Prune any row in these 5 modules whose title
      // isn't in the current mgrTopics list for that module — self-healing
      // for any future wholesale replacement, not just this one. This only
      // touches the topic catalog row, never past sessions (sessions
      // reference topic_id with ON DELETE SET NULL, so scored history is
      // unaffected).
      const REPLACED_MGR_MODULES = ['mgr-situation-room', 'mgr-transcript-autopsy', 'mgr-mock-call', 'mgr-feedback', 'mgr-eq'];
      const _currentTitlesByModule = {};
      REPLACED_MGR_MODULES.forEach(m => {
        _currentTitlesByModule[m] = new Set(mgrTopics.filter(t => t.module === m).map(t => t.title));
      });

      // Versioned content refresh: like the Ops Escalation scripts,
      // _seedManagerTopics only ever INSERTS missing (module,title) pairs,
      // so an already-seeded database wouldn't otherwise pick up a content
      // tweak that keeps the same title. Reuses the same
      // _refreshOpsScriptIfStale helper (generic — module/title/description/
      // scenario/checklist) for the rare case a title survives a reseed
      // unchanged but its scenario text was revised.
      const MGR_TA_CONTENT_VERSION = 3; // v3 (2026-09-19): full replace — 5 new scenarios (Brokerage Dispute, IPO Allotment, DP/Demat Block, Algo/API Duplication, Senior Citizen Suitability)
      const MGR_MC_CONTENT_VERSION = 3; // v3 (2026-09-19): full replace — 5 new scenarios (Failed Stop-Loss, Account Access Breach, Forced Liquidation, Wrong Brokerage Plan, Advisory Loss)

      if (_useLocalStorage) {
        let localT = _localGetAll('topics');
        for (const t of localT) {
          if (REPLACED_MGR_MODULES.includes(t.module) && !_currentTitlesByModule[t.module].has(t.title)) {
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

      // Real Supabase: prune stale titles in the 5 replaced modules, then
      // find which (module, title) pairs are already present so re-running
      // this never double-inserts and always fills in gaps.
      const { data: existingMgrRows, error: existingFetchErr } = await _sb
        .from('topics')
        .select('id, module, title')
        .in('module', REPLACED_MGR_MODULES);
      if (existingFetchErr) {
        console.warn('[DB] Could not fetch existing manager topics for cleanup:', existingFetchErr.message);
      } else if (existingMgrRows && existingMgrRows.length) {
        const staleIds = existingMgrRows
          .filter(r => !_currentTitlesByModule[r.module].has(r.title))
          .map(r => r.id);
        if (staleIds.length) {
          const { error: cleanupErr } = await _sb.from('topics').delete().in('id', staleIds);
          if (cleanupErr) console.warn('[DB] Obsolete manager topic cleanup failed:', cleanupErr.message);
          else console.log(`[DB] Removed ${staleIds.length} obsolete manager topic row(s).`);
        }
      }

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
