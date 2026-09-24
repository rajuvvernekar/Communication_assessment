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
  // Every public data method now calls `await init()` itself (see getAll()
  // below), so on any page that fires several of them at once via
  // Promise.race-less parallel calls (admin.js's initApp() does exactly
  // this on every load), init() would otherwise run its full body --
  // create a NEW Supabase client, ping it, and reseed everything --
  // concurrently once per caller. _initPromise makes every concurrent
  // caller await the SAME single in-flight attempt instead.
  let _initPromise = null;
  function init() {
    if (_dbInitialized) return Promise.resolve();
    if (_initPromise) return _initPromise;
    _initPromise = _doInit().finally(() => { _initPromise = null; });
    return _initPromise;
  }
  async function _doInit() {
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
  // Guard against concurrent invocation: _seedManagerTopics() runs on
  // every Topics-tab render (see the comment at its call site), and with
  // no lock here, two overlapping calls (e.g. the tab's initial render
  // plus a near-simultaneous filter-tab click) could both query "what's
  // missing", both see the same row as missing, and both insert it --
  // producing exact duplicate topic cards. This is exactly what happened
  // in production: the 4 new Transcript Autopsy / Paper Trade titles each
  // got inserted twice. All callers while a seed is already in flight
  // just await that same in-flight run instead of starting a new one.
  let _seedManagerTopicsInFlight = null;
  async function _seedManagerTopics() {
    if (_seedManagerTopicsInFlight) return _seedManagerTopicsInFlight;
    _seedManagerTopicsInFlight = _seedManagerTopicsImpl().finally(() => {
      _seedManagerTopicsInFlight = null;
    });
    return _seedManagerTopicsInFlight;
  }

  // De-duplicate the topics table: a companion fix to the concurrency
  // guard above. The guard stops NEW duplicates from being created, but
  // does nothing about duplicate rows that already exist in an
  // already-affected database from before this fix. Runs on every seed
  // pass (cheap -- one query) so any duplicate, from this race or any
  // other cause, is self-healed the next time the Topics tab loads --
  // no manual cleanup step needed. Keeps the oldest row per (module,
  // title) and deletes the rest; safe because sessions reference
  // topic_id with ON DELETE SET NULL, so no scored history is affected.
  async function _dedupeTopics() {
    try {
      const dedupeIds = (rows) => {
        const seen = new Set();
        const toDelete = [];
        [...rows]
          .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
          .forEach(t => {
            const key = (t.module || '') + '::' + (t.title || '');
            if (seen.has(key)) toDelete.push(t.id);
            else seen.add(key);
          });
        return toDelete;
      };

      if (_useLocalStorage) {
        const toDelete = dedupeIds(_localGetAll('topics'));
        toDelete.forEach(id => _localDel('topics', id));
        if (toDelete.length) console.log(`[DB] Removed ${toDelete.length} duplicate topic row(s) (local).`);
        return;
      }

      const { data: allTopics, error } = await _sb.from('topics').select('id, module, title, created_at');
      if (error) { console.warn('[DB] Dedupe fetch failed:', error.message); return; }
      const toDelete = dedupeIds(allTopics || []);
      if (toDelete.length) {
        const { error: delErr } = await _sb.from('topics').delete().in('id', toDelete);
        if (delErr) console.warn('[DB] Duplicate topic cleanup failed:', delErr.message);
        else console.log(`[DB] Removed ${toDelete.length} duplicate topic row(s).`);
      }
    } catch (e) {
      console.warn('[DB] _dedupeTopics failed:', e.message || e);
    }
  }

  async function _seedManagerTopicsImpl() {
    try {
      await _dedupeTopics();
      const mgrTopics = [
        // ── Situation Room (5 scenarios — Order Execution Failure, Unauthorized Trade
        // Dispute, RMS Auto Square-Off, KYC Freeze, Trading App Outage). Manager UI
        // reads these from the hardcoded SCENARIOS constant in manager-app.js, not
        // from this table — these DB rows exist only for admin-panel listing
        // consistency; editing/toggling them here has no effect on what managers see.
        { id: "mgr-sr1", module: "mgr-situation-room", title: "Order Execution Failure During a Market Crash", enabled: true, description: "Order Execution Failure During a Market Crash", scenario: "A high-net-worth client placed a large sell order on a volatile derivatives position during a sharp intraday market crash. The order failed to execute due to a system slowdown during peak load. By the time it went through manually, the client had lost ₹8.4 lakh more than if the order had executed on time. The client has called the branch manager directly, furious.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.\n\n─── THE WRONG RESPONSE (given to the manager to critique) ───\n\n\"Sir, I understand markets crashed today, these things happen during high volatility, it's not really something we could have controlled. Our system did process your order, just with some delay because of the load — that's normal during a crash like this. I can see you're upset about the ₹8.4 lakh, but honestly, if the market hadn't moved against you in that window it wouldn't even be an issue, so it's really just bad timing. I can log a technical complaint if you want, but I can't promise anything will come of it since the system did technically work, just slower than usual.\"", checklist: [] },
        { id: "mgr-sr2", module: "mgr-situation-room", title: "Unauthorized Trade Dispute", enabled: true, description: "Unauthorized Trade Dispute", scenario: "A client discovers three trades in their account they insist they never placed — all executed on the same day the market moved sharply against those positions, resulting in a loss of ₹3.1 lakh. The client suspects either a system glitch attributed the trades wrongly, or unauthorized access. They are alleging fraud.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.\n\n─── THE WRONG RESPONSE (given to the manager to critique) ───\n\n\"Ma'am, I can see three trades on your account, so somebody must have placed them — our systems don't just execute trades on their own. Are you sure nobody else has access to your login, maybe a family member? I'm not saying you're lying, but fraud is a serious word and without clear proof of unauthorized access there's not much we can do on our end beyond noting it down. I'll flag this to our security team, though these investigations usually take a few weeks and don't always come back with a clear answer.\"", checklist: [] },
        { id: "mgr-sr3", module: "mgr-situation-room", title: "RMS Auto Square-Off During Margin Shortfall", enabled: true, description: "RMS Auto Square-Off During Margin Shortfall", scenario: "A client's leveraged intraday position was auto-squared-off by the Risk Management System after a sudden margin shortfall triggered by a gap-down opening. The client was travelling and unreachable for the margin call SMS/call. The square-off locked in a loss of ₹5.6 lakh, and the client believes that had it not been squared off, the position would have recovered by market close (it did, in hindsight). The client is irate.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.\n\n─── THE WRONG RESPONSE (given to the manager to critique) ───\n\n\"Sir, the square-off is completely standard procedure when there's a margin shortfall, we sent the required alerts as per policy, so from our side everything was done correctly. I understand the market recovered afterward, but honestly that's just how trading works sometimes — you can't blame the system for a call that in hindsight didn't need to be made, we can't predict the market any better than you can. If you're travelling, that's really something you need to plan around when you're holding leveraged positions, we can't be responsible for that.\"", checklist: [] },
        { id: "mgr-sr4", module: "mgr-situation-room", title: "KYC Freeze Blocking an Urgent Withdrawal", enabled: true, description: "KYC Freeze Blocking an Urgent Withdrawal", scenario: "A client's trading account and linked funds were frozen for a mandatory periodic KYC re-verification, flagged as overdue by compliance. The client had a ₹12 lakh withdrawal pending to cover a personal emergency (a family medical situation) and only discovered the freeze when the withdrawal failed. The client is distressed and angry, not at the requirement itself but at the timing and lack of warning.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.\n\n─── THE WRONG RESPONSE (given to the manager to critique) ───\n\n\"Sir, KYC re-verification is a regulatory requirement, it's not something we can waive, and we did send a notice about it. I understand there's a medical emergency, but the process still has to be followed properly — I can't make exceptions just because the timing is bad for you. Once you complete the re-verification the freeze will lift, so I'd suggest doing that as soon as possible so we can move forward. Is there anything else I can help with?\"", checklist: [] },
        { id: "mgr-sr5", module: "mgr-situation-room", title: "Trading App Outage During a Volatile Session", enabled: true, description: "Trading App Outage During a Volatile Session", scenario: "During a session with unusually high volatility around a major macroeconomic announcement, the trading app crashed for approximately 40 minutes for a segment of users, including this client, who was holding an open leveraged position and unable to exit. When the app came back, the position had moved sharply against the client, resulting in a ₹6.7 lakh loss the client believes was entirely avoidable had they been able to exit when they tried. The client is threatening to go public.\n\nPart A — What Would You Say? Write your full verbal response, opening to close.\nPart B — The Wrong Response: A flawed manager reply to this situation follows below. Identify every error, explain the impact of each, and rewrite the response correctly.\n\n─── THE WRONG RESPONSE (given to the manager to critique) ───\n\n\"I hear you, outages happen sometimes with high traffic during volatile sessions, it's an unfortunate coincidence that it happened while you had an open position. Technically the loss happened because of how the market moved, not directly because of the outage, so I'm not sure compensation is really justified here. Go ahead and post about it if you feel you need to — we stand by our system uptime record overall, this was a one-off. I can log a technical ticket, but I wouldn't expect much beyond an apology from that.\"", checklist: [] },

        // ── The Transcript Autopsy (5 scenarios — Brokerage & Charges Dispute, IPO
        // Allotment Display Error, DP/Demat Block, Algo/API Order Duplication,
        // Senior Citizen Product-Suitability Complaint). Live-read from this table.
        { id: "mgr-ta1", module: "mgr-transcript-autopsy", title: "The Panicked SIP Investor", enabled: true, description: "The Panicked SIP Investor", scenario: "BACKGROUND: A client calls saying their monthly SIP of ₹10,000 in a midcap mutual fund was deducted from their bank account 3 days ago but has not reflected in their portfolio. The bank statement clearly shows the debit. This is their first SIP investment, and they are not familiar with the process. They are becoming increasingly anxious that their money is lost.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"Hello, I need urgent help. My SIP of ₹10,000 was deducted from my bank account 5 days ago, but it's not showing in my portfolio at all. I'm very worried.\"\n\nMANAGER: \"Ma'am, SIP processing takes time. It will show up eventually. Nothing to worry about.\"\n\nCLIENT: \"But it's been 5 days. My bank statement clearly shows the money is gone. Can you at least check what's happening?\"\n\nMANAGER: \"It depends on the fund house. Sometimes it takes 3 days or more.\"\n\nCLIENT: \"That doesn't explain why MY money specifically hasn't shown up. I've already called my bank — they confirmed the debit.\"\n\nMANAGER: \"Ma'am, I can see your account, but I don't see any issue from our side. You should call the fund house or your bank and check with them.\"\n\nCLIENT: \"I've already done that! Why are you asking me to run around when you're supposed to help me? I'm really stressed about this.\"\n\nMANAGER: \"Ma'am, we only process the SIP instruction. What happens after that is between your bank and the AMC.\"\n\nCLIENT: \"This is ridiculous. I want this resolved today. What are you actually going to do about it?\"\n\nMANAGER: \"I'll raise a ticket, but these things take 7 to 10 working days. Please check your portfolio after that.\"", checklist: [] },
        { id: "mgr-ta2", module: "mgr-transcript-autopsy", title: "The Wrong Brokerage Charged", enabled: true, description: "The Wrong Brokerage Charged", scenario: "BACKGROUND: A client on a flat ₹20 per order brokerage plan notices they were charged ₹40 on an intraday Nifty futures trade. This is the second billing discrepancy in three months. They want an immediate refund and a written explanation.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"I've been charged ₹40 brokerage on a single trade. My plan clearly says ₹20 flat per order. This is the second time this has happened.\"\n\nMANAGER: \"Sir, brokerage is calculated by the system automatically, based on the trade type.\"\n\nCLIENT: \"I don't care what the system does. I want to know why I was charged double, and I want it refunded.\"\n\nMANAGER: \"Sir, you should have checked the support portal details before trading in F&O. The ₹20 plan may not apply at all times.\"\n\nCLIENT: \"I've been trading F&O on this plan for over a year. It has always been ₹20. Are you saying this is my fault?\"\n\nMANAGER: \"I can't confirm it's our error without the billing team reviewing it. I'll raise a ticket — it will take 3-4 working days.\"\n\nCLIENT: \"3 to 4 days for a refund of money you wrongly took? And this happened before too — what's being done about that?\"\n\nMANAGER: \"Sir, I don't have information about your previous complaint. That would be a separate ticket.\"\n\nCLIENT: \"This is completely unacceptable. I'm going to file a complaint with SEBI.\"\n\nMANAGER: \"Sir, that is your choice. But SEBI will also ask for the backend team's review before taking any action, so the timeline will be the same either way.\"", checklist: [] },
        { id: "mgr-ta3", module: "mgr-transcript-autopsy", title: "The Bonus Share Discrepancy", enabled: true, description: "The Bonus Share Discrepancy", scenario: "BACKGROUND: A company announced a 1:1 bonus issue. The client holds 200 shares and expected 200 bonus shares. Only 180 have been credited. The client has the official exchange announcement and their demat statement showing 200 shares before the record date. They want the missing 20 shares credited or a written explanation.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"I was supposed to get 200 bonus shares in the 1:1 issue. Only 180 have been credited. I have the exchange announcement and my demat statement as proof.\"\n\nMANAGER: \"Sir, bonus shares are credited by the depository. We don't handle that directly. You'll need to contact CDSL or NSDL.\"\n\nCLIENT: \"You're my broker. Why should I contact CDSL? Can't you check this from your end?\"\n\nMANAGER: \"Sir, we can see your holdings but the bonus credit is done by the registrar based on their records. Maybe there's a difference in how many shares you held on the record date.\"\n\nCLIENT: \"I have my demat statement right here showing 200 shares before the record date. There's no discrepancy on my end.\"\n\nMANAGER: \"Sir, sometimes shares that are in the settlement pipeline on the record date are not counted. Maybe some of your shares were in T+1 settlement. That could explain the 20 share difference.\"\n\nCLIENT: \"I bought all these shares 3 months ago. They are fully settled. This is not a settlement issue.\"\n\nMANAGER: \"Sir, I understand but we cannot confirm or deny on behalf of the registrar. You'll need to raise a dispute with them directly. I can give you their contact details.\"\n\nCLIENT: \"I've been with this Zerodha for 4 years, and this is how you handle it? Just give me a contact number and goodbye?\"\n\nMANAGER: \"Sir, I'm sorry but this is really outside our control. The registrar is responsible. If you want, I can raise a ticket on your behalf, but I can't guarantee anything.\"", checklist: [] },
        { id: "mgr-ta4", module: "mgr-transcript-autopsy", title: "The Unauthorised Transaction Allegation", enabled: true, description: "The Unauthorised Transaction Allegation", scenario: "BACKGROUND: A client calls in a highly agitated state. They have found a sell transaction of 50 shares of HDFC Bank worth ₹85,000 on their statement that they say they did not place. The transaction was 3 days ago. They are alleging account compromise or internal fraud, demanding a reversal and written explanation. They mention police and SEBI if not resolved today.\n\n─── CALL TRANSCRIPT ─────────────────────────────────────────────\n\nCLIENT: \"There is a sell transaction on my account for 50 shares of HDFC Bank worth ₹85,000 that I never placed. I want to know who did this and I want it reversed immediately.\"\n\nMANAGER: \"Sir, all transactions require your login credentials. An unauthorised transaction is not possible on our platform. Our security systems are very strong.\"\n\nCLIENT: \"I don't care about your security systems. I am looking at a transaction I did not place. Are you calling me a liar?\"\n\nMANAGER: \"Sir, I'm not calling you a liar. Maybe you placed the order and forgot. These things happen. Please check your email for the trade confirmation that was sent to you.\"\n\nCLIENT: \"I have checked my email. There is a confirmation there, but I did not place this order. Someone else placed it. I want my account frozen right now.\"\n\nMANAGER: \"Sir, we cannot freeze accounts based on a verbal request. You'll need to submit a written complaint first. I can give you our grievance email address.\"\n\nCLIENT: \"You want me to send an email while someone might be trading in my account right now? This is unbelievable.\"\n\nMANAGER: \"Sir, please calm down. I understand you're upset, but we have procedures we need to follow. I'll raise a ticket and our security team will look into it. It will take 48 hours.\"\n\nCLIENT: \"48 hours? Someone has stolen ₹85,000 from me, and you want me to wait a day? I'm calling the police and SEBI right now.\"\n\nMANAGER: \"Sir, that is your right. But please be aware that investigations take time even with SEBI. The process will be the same. Please wait for our security team to review.\"", checklist: [] },

        // ── The Paper Trade (5 scenarios — Failed Stop-Loss, Suspected Account Access
        // Breach, Forced Liquidation of Pledged Shares, Wrong Brokerage Plan, Loss on
        // an Advisory-Recommended Stock). Live-read from this table.
        { id: "mgr-mc1", module: "mgr-mock-call", title: "Unlisted Share Transfer & Regulatory Intimation", enabled: true, description: "Unlisted Share Transfer & Regulatory Intimation", scenario: "A partner of a client company executed a transfer of unlisted shares to another individual through the offline DIS (Delivery Instruction Slip) mode via your brokerage firm. Under NSDL regulations, any transfer of unlisted securities must be intimated to the company secretary of the issuing company by the broker. However, your firm operates under CDSL (Central Depository Services Limited) — not NSDL — and CDSL does not mandate any such intimation requirement for unlisted share transfers through the DIS mode. The transfer was therefore processed without notifying the company secretary, which was correct procedure under CDSL rules.\n\nThe company secretary is now calling support desk, agitated and demanding to know why they were not informed of this transfer. They believe a regulatory breach has occurred. They may cite NSDL guidelines, threaten to escalate to SEBI, or demand the transfer be reversed. The manager must handle this call with complete composure, accurate regulatory knowledge, clarity of explanation, and firm but respectful ownership.\n\nThe client opens the call by saying:\n\n\"I am the company secretary of Arvind Precision Tools Private Limited. One of our partners has transferred unlisted shares of our company to an external individual through your brokerage firm via an offline DIS, and we were never informed about this. As per regulatory requirements, the broker is obligated to intimate the company secretary of any such transfer. This is a serious compliance lapse and I need an explanation immediately.\"\n\nEscalation beats the client will raise if your handling doesn't already address them: (1) \"I have the NSDL circular in front of me. It clearly states that for any transfer of unlisted securities, the depository participant is required to send an intimation to the company. Are you telling me your firm was not aware of this circular? Because if that's the case, that's an even bigger problem.\" (2) \"Fine, let's say what you're telling me about CDSL is correct. But your firm still had a moral and professional obligation to inform us as the issuing company. Unlisted shares are sensitive — they affect our cap table, shareholding structure, and future fundraising. The fact that you hid behind a technicality and didn't think to inform us is irresponsible. I want a written apology from your compliance team.\" (3) \"I am going to file a complaint with SEBI today citing this as a regulatory breach by your firm. I am also going to instruct our legal counsel to send a notice to your compliance officer. I want the name and direct contact of your compliance officer right now.\" (4) \"Alright. I'm willing to hear your explanation formally. But I want everything you've just told me in writing — the CDSL operating instructions you're citing, the specific clause that exempts your firm from intimation, and a record of the transfer details including date, parties involved, and number of shares. Can your firm provide all of that?\" (5) \"I want to make something very clear. Our firm has significant assets and several partners who trade through brokers. If this matter is not handled correctly and transparently, we will be reviewing our relationship with your firm and advising our partners to move their accounts. I hope you understand the gravity of what I'm saying.\"\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },
        { id: "mgr-mc2", module: "mgr-mock-call", title: "Minor to Major Account Conversion — Premature Block & Compensation Demand", enabled: true, description: "Minor to Major Account Conversion — Premature Block & Compensation Demand", scenario: "A client holds a minor account for their child who was turning 18 on 23rd June 2026. As part of the Zerodha's policy, the minor account was blocked 15 days prior — on 8th June 2026 — to initiate the minor-to-major account upgradation process. The client was contacted on 12th June 2026 and informed about the block. However, since the minor had not yet turned 18, they did not have the required documents for the major account conversion (such as a fresh KYC, PAN update, signature, etc.). As a result, the account remained blocked.\n\nDespite follow-ups, the account was still not unblocked even after a week — now bringing us to approximately 19th–20th June 2026, with the minor's 18th birthday still 3–4 days away. The client is now on an escalation call, extremely agitated. They are arguing on two fronts: (1) the block was premature — the minor had not yet turned 18 and the firm had no right to block the account before the actual date of majority, and (2) compensation demand — they have missed trading opportunities during this blocked period and want financial compensation.\n\nThe client opens the call by saying:\n\n\"I want to speak to the most senior person available. My child's account was blocked on 8th June. She doesn't turn 18 until 23rd June. You had absolutely no right to block a functioning account before she is legally a major. On top of that, your team called me on 12th June asking for documents — documents that don't even exist yet because she hasn't turned 18. It's been a week and the account is still blocked. She has missed multiple trading opportunities in this market. I want the account unblocked today and I want compensation for the losses we've suffered.\"\n\nEscalation beats the client will raise if your handling doesn't already address them: (1) \"Your own website says the account is valid until the minor turns 18. Nowhere does it say you will block the account 15 days before the birthday. This was done without any proper notice and without any legal basis. My daughter had active holdings and watchlists she was tracking. You disrupted everything. Can you show me anywhere in writing where it says you can block the account 15 days early?\" (2) \"I don't care about your internal policy. The fact is the account is blocked right now and she is still legally a minor for 3 more days. So either you unblock it now and let her trade as a minor until the 23rd, or you explain to me in plain language why a minor account — which is perfectly valid — is being held hostage by your upgrade process. Which is it?\" (3) \"Between 8th June and today that's almost two weeks of blocked trading. My daughter had identified specific exit points in two holdings that she had been tracking for months. She missed both of them. One of them has already dropped 14% since she wanted to exit. That's a direct financial loss caused by your firm's unilateral decision to block her account without warning. I want compensation for this. If you don't agree, I'll take this to SEBI and the consumer court.\" (4) \"Fine. Let's say you unblock it today. What happens on the 23rd when she actually turns 18? Will the account be blocked again? What documents do you need, how long will the conversion take, and will she be able to trade on her birthday itself or will there be another blackout period? I need a complete answer because I don't want to be in this situation again.\" (5) \"I want everything discussed on this call in writing. The reason for the block, the policy you're citing, what you're doing to unblock it today, the timeline for conversion after the 23rd, and your firm's final position on compensation. I also want your name and direct contact. If this is not resolved by end of day today I will be filing complaints everywhere.\"\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },
        { id: "mgr-mc3", module: "mgr-mock-call", title: "Kill Switch Malfunction — Technical Breach & Compensation Demand", enabled: true, description: "Kill Switch Malfunction — Technical Breach & Compensation Demand", scenario: "A client activated the Kill Switch on their trading account at 9:30 AM for the NSE F&O segment. The Kill Switch is a feature that, once enabled, immediately blocks all trades in the selected segment. As per standard protocol, once the Kill Switch is activated, no orders should go through for 12 hours, and the segment can only be reactivated after that.\n\nAt 10:00 AM — 30 minutes after activating the Kill Switch — the client placed orders in NSE F&O. The first order was rejected with an error message citing insufficient balance. Critically, the rejection reason shown was insufficient balance — not Kill Switch active — which was itself a system anomaly. The client, rather than calling support to verify why the order was rejected or to confirm the Kill Switch status, placed further orders from 10:05 AM onwards. These subsequent orders went through and were executed — a clear technical malfunction, as the Kill Switch should have prevented all executions.\n\nThe client suffered losses on these executed trades and is now on an escalation call demanding full compensation, arguing that the system allowed trades to go through despite an active Kill Switch and that the firm is therefore liable for the losses.\n\nThe client opens the call by saying:\n\n\"I enabled the Kill Switch at 9:30 this morning specifically because I did not want to trade NSE F&O today. That is the entire purpose of the Kill Switch — to block trades. At 10 AM I accidentally placed an order and it was rejected. Fine. But then from 10:05 AM my orders started going through. Your system allowed me to trade in a segment that I had explicitly locked. I made losses on those trades. Your system failed. Zerodha owes me compensation. I want to know what you're going to do about this.\"\n\nEscalation beats the client will raise if your handling doesn't already address them: (1) \"And before you say anything — I know what you're going to tell me. You're going to say I should have called when the first order was rejected. But why would I call? The rejection message said insufficient balance. It did not say Kill Switch active. So naturally I assumed the Kill Switch issue was resolved and I had a balance problem. I topped up my balance and placed the next order — which then went through. Your system gave me the wrong rejection message. That is your fault, not mine.\" (2) \"Let me be very direct. I used your Kill switch exactly as intended. Your system confirmed it was active. Your system then failed to enforce it. And your system gave me a false rejection reason that led me to believe the Kill Switch was no longer in effect. Every single failure here is on your side. I did nothing wrong. The losses I made are entirely because of your technical breakdown. How can you possibly argue that I bear any responsibility here?\" (3) \"I want the following from you right now. First, a written acknowledgement that your Kill Switch system malfunctioned today. Second, the exact timestamp logs showing when my Kill Switch was activated, when the first order was rejected, and when subsequent orders went through. Third, a written explanation of why the rejection message showed insufficient balance instead of Kill Switch active. And fourth, I want this escalated to your technical and compliance teams today — not in 5 to 7 days. I'm a lawyer and I know exactly what to do with this documentation.\" (4) \"I lost ₹47,000 on those trades. That is a direct, quantifiable loss caused entirely by your system allowing trades that should never have been executed. I'm not asking for goodwill. I'm not asking for brokerage credits. I'm asking you to make me whole for a loss your system caused. If you tell me you can't compensate me I want that in writing too — because that response will be exhibit A in my consumer court filing.\" (5) \"I want to know what your firm is going to do about this. Not about my compensation — I've heard your answer on that. I mean what are you doing to make sure this doesn't happen to someone else? What is the process for investigating this technical failure? Who is accountable? And will I be informed of the findings? Because if this is a known bug and your firm has been sitting on it, that changes everything.\"\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },
        { id: "mgr-mc4", module: "mgr-mock-call", title: "Outdated App NAV Display — Mutual Fund Redemption Loss & Media Threat", enabled: true, description: "Outdated App NAV Display — Mutual Fund Redemption Loss & Media Threat", scenario: "A client holds mutual fund units through the firm's Coin application — a mutual fund investment platform. The client had not updated the Coin app for an extended period. Due to the outdated app version, the NAV displayed on the client's screen was ₹35 — the NAV as of 25th November 2025 — which was clearly date-stamped on the redemption page as a historical figure, not the current NAV.\n\nOn 3rd March 2026, the client placed a redemption order for their mutual fund units. By this date, due to a significant market correction, the actual NAV of the fund had fallen to ₹25. The client, without checking the date on the NAV displayed or verifying the current NAV independently, assumed the NAV was still ₹35 and proceeded with the redemption. The redemption was executed at the prevailing NAV of ₹25 — not ₹35 — resulting in a loss of approximately ₹1 lakh compared to the client's expectation.\n\nThe client is now on an escalation call, blaming the platform for displaying a wrong NAV and demanding full compensation of ₹1 lakh. The client is the owner of a local Hindi news channel and is making explicit threats to run a negative story about the firm on their channel, leveraging their media influence as pressure.\n\nThe client opens the call by saying:\n\n\"I'll come straight to the point. I saw NAV of ₹35 on your Coin app. I placed a redemption on 3rd March. I found out the actual NAV was ₹25. I lost one lakh. Your coin shows the wrong NAV. I own a Hindi news channel. If I'm not heard on this call today, tomorrow morning your company's full story will run on my channel. Prime time. Now tell me — what will you do?\"\n\nEscalation beats the client will raise if your handling doesn't already address them: (1) \"Your app showed me ₹35. I placed my order based on what your app showed me. How is that my mistake? You are a financial platform. You are supposed to show me accurate, real-time data. If your app cannot show the correct NAV, then you should not be in this business. I trusted your platform with my money, and your platform gave me wrong information.\" (2) \"You're telling me I should have checked the date on the NAV. But when I open a financial app and see a number, I trust that number is current. No common person reads the fine print on every screen. You are taking advantage of the fact that I didn't update the app to escape your responsibility. The app should have shown me a warning — 'your app is outdated, NAV may not be current.' Did your app show me any such warning? No. So the fault is yours.\" (3) \"I am giving you a last chance. I have suffered a loss of one lakh. I am an influential person in this city. 2 lakh people watch my channel daily. Tomorrow I will run an investigative story — 'How this stockbroking firm is looting retail investors.' I will broadcast your name, your company's name, and this entire conversation. There is still time — return one lakh and this matter is over.\" (4) \"Fine. Apart from my channel — I also know people at SEBI. I will file a complaint stating your platform deliberately showed outdated NAV to mislead investors into making transactions. That is mis-selling. That is a regulatory offence. And I will also file in consumer court for ₹1 lakh plus damages plus mental harassment. Let's see how your firm handles that.\" (5) \"I want three things before I hang up. One — your full name and employee ID. Two — a written statement from your firm saying the NAV shown was correct and the client is responsible. Three — the name and number of your CEO or MD. If you give me these three things I will decide my next step. If you don't, I'll take that as confirmation that your firm is hiding something.\"\n\nHandle this call for 5-6 minutes: acknowledge the issue and the client's frustration without over-explaining excuses, take clear ownership of what your organization controls, respond to each escalation beat as it comes up, and close with a resolution that is realistic and within your actual authority.", checklist: [] },

        // ── The Red Pen (5 profile cards — Mis-Selling Pattern, Skipped Compliance
        // Replaced 2026-09-24 (per "red pen (2).docx"): the previous 5 rows here
        // (Mis-Selling Pattern, Skipped Compliance Disclosures, Declining Call
        // Quality, Chronic SLA Breaches, Trade Without Verbal Confirmation) were
        // themselves stale from an even earlier iteration and didn't match the
        // real 6 people-management cases (Ananya/Rahul/Vikram/Meera/Arjun/Priya)
        // that manager-app.js's SCENARIOS['mgr-feedback'] has actually used since
        // 2026-09-20 -- same category of drift as the EQ "Cascade Set" rows fixed
        // earlier today. Manager UI still reads the live scenario from the
        // hardcoded SCENARIOS/FB_EMPLOYEES constants in manager-app.js, not from
        // this table; these DB rows exist only so admin's Topics -> Feedback page
        // shows the real, current content (situation + "Think About" prompts),
        // same embedding pattern as Situation Room/EQ above.
        { id: "mgr-fb1", module: "mgr-feedback", title: "The High Performer Who Suddenly Disengaged", enabled: true, description: "The High Performer Who Suddenly Disengaged", scenario: "Employee: Ananya — a consistent high performer for the last 8 months (QA regularly above 90%, active in meetings, supportive of new team members, often volunteers for extra responsibilities). She moved to your team after a recent restructuring.\\n\\nSituation: Over the last month her QA score has dropped from 94% to 79%, her productivity has reduced, she rarely participates in discussions, no longer volunteers for activities, seems distracted during meetings, and has become less communicative with peers. When you ask if everything is okay, she simply says: \"Yes, I'm fine. I'll manage.\"\\n\\nThink About:\\n- How will you start?\\n- Will you talk about the numbers first or understand what has changed?\\n- What questions will you ask?\\n- How will you avoid assuming that she has become careless?\\n- How will you create a safe environment for her to speak?\\n- How will you conclude with an action plan?", checklist: [] },
        { id: "mgr-fb2", module: "mgr-feedback", title: "\"I Don't Think There Is Anything Wrong With My Work\"", enabled: true, description: "\"I Don't Think There Is Anything Wrong With My Work\"", scenario: "Employee: Rahul — two years' tenure, consistently meets his productivity targets but has received repeated feedback on communication.\\n\\nSituation: His recent QA feedback flags interrupting customers, not acknowledging customer concerns, a robotic tone, technically correct but poorly structured responses, and missed opportunities to show empathy. You have discussed this with him twice already. In this session he says: \"But my numbers are good. Customers are getting the right answers. I don't understand why QA keeps giving me feedback.\"\\n\\nThink About:\\n- How will you acknowledge his strengths?\\n- How will you explain the difference between getting the job done and doing it effectively?\\n- How will you use examples instead of general statements?\\n- How will you prevent the conversation from becoming an argument?\\n- How will you get Rahul to identify the gap himself?", checklist: [] },
        { id: "mgr-fb3", module: "mgr-feedback", title: "The Employee Who Is Doing Well but Has a Negative Attitude", enabled: true, description: "The Employee Who Is Doing Well but Has a Negative Attitude", scenario: "Employee: Vikram — one of the team's strongest performers (excellent productivity, consistently high QA, good attendance, positive customer feedback).\\n\\nSituation: In team meetings he frequently makes negative comments (\"This won't work,\" \"We've tried this before,\" \"Why are we doing this again?\"), discourages new team members from participating, and has started influencing others negatively. When you speak to him, he says: \"I'm only being practical. At least I'm honest. My performance is good, so I don't see the problem.\"\\n\\nThink About:\\n- Can a high performer still have a behavioural gap?\\n- How will you separate performance from behaviour?\\n- How will you explain the impact of his behaviour on the team?\\n- How will you avoid making it personal?\\n- What expectations will you set going forward?", checklist: [] },
        { id: "mgr-fb4", module: "mgr-feedback", title: "The Employee Who Keeps Making the Same Mistake", enabled: true, description: "The Employee Who Keeps Making the Same Mistake", scenario: "Employee: Meera — has been making the same process-related error repeatedly despite the process being explained, documentation shared, a coaching session held, and feedback given after previous errors.\\n\\nSituation: The same mistake has occurred four times in the last month. During the feedback discussion, Meera says: \"I'm sorry. I'll be careful next time.\" — a response you have heard from her several times before.\\n\\nThink About:\\n- Is this a knowledge, skill, attitude, or attention issue?\\n- What probing questions would you ask?\\n- How will you identify why the mistake is happening?\\n- How will you avoid simply saying, \"Be more careful\"?\\n- What specific corrective action will you agree on?\\n- How will you measure improvement?", checklist: [] },
        { id: "mgr-fb5", module: "mgr-feedback", title: "The Defensive Employee", enabled: true, description: "The Defensive Employee", scenario: "Employee: Arjun — you are giving him feedback after reviewing three of his calls, highlighting that he interrupted customers, missed probing opportunities, became impatient in tone in one interaction, and did not acknowledge the customer's frustration.\\n\\nSituation: Arjun immediately becomes defensive: \"But the customer was being unreasonable.\" Then: \"Other agents speak like this too. Why am I being singled out?\" And finally: \"You only look at my mistakes. Nobody talks about the calls where I did well.\"\\n\\nThink About:\\n- How will you handle defensiveness?\\n- Will you defend your feedback or explore his perspective?\\n- How will you acknowledge his point without agreeing with the behaviour?\\n- How will you bring the conversation back to observable behaviour?\\n- How will you end the conversation positively?", checklist: [] },
        { id: "mgr-fb6", module: "mgr-feedback", title: "The Employee Who Has Lost Confidence", enabled: true, description: "The Employee Who Has Lost Confidence", scenario: "Employee: Priya — recently promoted to handle more complex customer interactions. She performed well initially, but after receiving negative feedback on a few difficult calls, her confidence has dropped.\\n\\nSituation: She is taking longer to respond, frequently seeks help for routine situations, avoids taking complex calls, her productivity has reduced, and she keeps asking, \"Am I doing this correctly?\" When you tell her she needs to be more confident, she says: \"I'm trying. But every time I take a difficult call, I feel I'm going to make another mistake.\"\\n\\nThink About:\\n- Is this a performance problem or a confidence problem?\\n- How will you rebuild her confidence?\\n- What positive reinforcement can you provide?\\n- How will you create small wins?\\n- What support or practice would you provide?\\n- How will you measure progress?", checklist: [] },

        // ── The Mirror Room (2 cases — The Allocation Floor, The Pushback Day).
        // Replaced 2026-09-24: the manager's 2 sequential 3-section cases,
        // same pattern as Situation Room's Part A/B embedding above -- the
        // live assessment itself is driven by the hardcoded
        // SCENARIOS['mgr-eq'] in manager-app.js (each section runs its own
        // conversational-AI counterpart), so these rows exist purely so
        // admin's Topics -> EQ page shows the real, current content instead
        // of the old stale "Cascade Set" written-cascade rows they replace.
        { id: "mgr-eq1", module: "mgr-eq", title: "The Allocation Floor", enabled: true, description: "The Allocation Floor", scenario: "One workday told across 3 linked sections, each with its own conversational-AI counterpart.\\n\\n─── SECTION A — The Allocation Fight (counterpart: Vikram) ───\\n\\nAs you enter the office, you notice two senior dealers, Vikram and Rohit, in a loud disagreement over a personal issue — right in the middle of the trading floor, in front of junior staff and visiting guests.\\n\\nAs a manager, how would you handle this case?\\n\\n─── SECTION B — Repeated Basic Query (counterpart: Arun) ───\\n\\nSoon after you resolve the dispute between the two dealers, within the first hour, Arun approaches you with a very basic question: why a GTT order was triggered but not executed. You have already clearly guided Arun on GTT scenarios more than five times.\\n\\n─── SECTION C — Escalated HNI Client Call (counterpart: Mr. Kapoor) ───\\n\\nDuring your call turn, a High-Net-Worth (HNI) client calls in furious about portfolio losses during a volatile week. The client is shouting and personally insulting the Relationship Manager, Arun, who reports to you. Arun has transferred the call to you.", checklist: [] },
        { id: "mgr-eq2", module: "mgr-eq", title: "The Pushback Day", enabled: true, description: "The Pushback Day", scenario: "One workday told across 3 linked sections, each with its own conversational-AI counterpart.\\n\\n─── SECTION A — Pushback in Team Huddle (counterpart: Sachin) ───\\n\\nDuring a morning team huddle, you explain new operational expectations — that agents will need to handle both tickets and calls, along with a few changes to quality parameters. Sachin, an experienced agent, interrupts you.\\n\\n─── SECTION B — Resignation Threat from Top Performer (counterpart: Sachin) ───\\n\\nRight after the team meeting, Sachin approaches you saying he would like to resign due to the pressure from all these recent changes. He is a top performer who has never received more than two Customer Escalations (CEs) in a year throughout his entire career.\\n\\n─── SECTION C — AVP Performance Escalation (counterpart: Deepak, AVP) ───\\n\\nMeanwhile, your AVP calls to inform you that your team has missed targets for two consecutive quarters. The AVP is asking pointed questions, and your own Performance Incentive (PI) will likely take a hit.", checklist: [] },

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
      const MGR_TA_CONTENT_VERSION = 5; // v5 (2026-09-24): rewrote the 4 transcripts so each has exactly 5 manager turns -- opening, acknowledgment, empathy, ownership, closing, each its own distinct blunder -- to match the new per-turn correction UI (see manager-app.js's Transcript Autopsy rewrite)
      const MGR_MC_CONTENT_VERSION = 4; // v4 (2026-09-20): full replace with the exact 4 cases from the manager training doc (Unlisted Share Transfer & Regulatory Intimation, Minor to Major Account Conversion, Kill Switch Malfunction, Outdated App NAV Display)
      const MGR_SR_CONTENT_VERSION = 1; // v1 (2026-09-20): scenario text now embeds "THE WRONG RESPONSE" (Part B's flawed sample reply) so admin's Topics tab shows it -- it was previously saved only in manager-app.js's hardcoded SCENARIOS constant, invisible anywhere in the admin panel

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
          await _refreshOpsScriptIfStale('mgr-situation-room', MGR_SR_CONTENT_VERSION, mgrTopics, localT);
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
        await _refreshOpsScriptIfStale('mgr-situation-room', MGR_SR_CONTENT_VERSION, mgrTopics, existing || []);
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
    await init(); // see getAll() below for why every public method self-inits
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
    await init();
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
  // Every public data method here now starts with `await init()`: init()
  // itself is idempotent (returns immediately once _dbInitialized is true),
  // but several admin.js callers (generateAllAgentsReport, loadDashboard,
  // loadTrainees, loadMgrAssessments, ...) call getAll() directly on
  // initApp() without ever awaiting DB.init() first, all fired off as
  // parallel fire-and-forget calls. Only renderTopicsList() happened to
  // await DB.init() itself, and even that isn't awaited by its caller, so
  // it never actually blocked the others. On a fresh page load this was
  // usually masked by other work delaying the race just enough -- but on
  // refreshing an already-logged-in admin session, initApp() fires
  // immediately and these hit `_sb.from(...)` while `_sb` is still null
  // (init() hasn't finished its Supabase connectivity check yet), throwing
  // "Cannot read properties of null (reading 'from')". Self-initializing
  // here fixes it at the root for every caller instead of patching each one.
  async function getAll(store) {
    await init();
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
    await init();
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
    await init();
    if (_useLocalStorage) {
      _localDel(store, id);
      return;
    }

    const { error } = await _sb.from(store).delete().eq('id', id);
    if (error) throw error;
  }

  // ---- getByIndex: filter records by a field value ----
  async function getByIndex(store, field, value) {
    await init();
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
