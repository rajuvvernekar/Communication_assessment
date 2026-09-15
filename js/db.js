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
  async function _migrateLocalStorageToSupabase() {
    try {
      const stores = ['trainees', 'topics', 'sessions', 'ai_audit_scores', 'settings'];
      for (const store of stores) {
        const localItems = _localGetAll(store);
        if (localItems.length === 0) continue;

        console.log(`[DB] Found ${localItems.length} unsynced items in local storage for ${store}. Migrating to Supabase...`);
        for (const item of localItems) {
          try {
            if (store === 'settings') {
              // Settings key merge (e.g. merge team assignments, avoid overwriting adminUsers entirely unless default)
              if (item.key === 'adminUsers') continue; // don't push default admins over customized cloud database admins
              await _sb.from('settings').upsert({ key: item.key, value: item.value }, { onConflict: 'key' });
            } else {
              const dbData = _toDB(store, item);
              if (item.id) {
                await _sb.from(store).upsert(dbData, { onConflict: 'id' });
              } else {
                await _sb.from(store).insert(dbData);
              }
            }
          } catch (itemErr) {
            console.warn(`[DB] Migration failed for item in ${store}:`, itemErr.message);
          }
        }
        _localClear(store);
        console.log(`[DB] Completed migration for ${store}.`);
      }
    } catch (e) {
      console.warn('[DB] Automatic migration failed:', e.message || e);
    }
  }

  // Push a topic's current seed content onto an already-seeded row of the
  // same (module,title) when the deployed version is newer than what's
  // stored — see the call site inside _seedDefaults() for the full
  // rationale. No-ops if the topic isn't seeded yet (the normal insert path
  // will create it fresh, already correct) or if it's already current.
  async function _refreshOpsScriptIfStale(module, currentVersion, defaults, existing) {
    const def = defaults.find(t => t.module === module);
    if (!def) return;
    const liveRow = existing.find(t => t.module === module && t.title === def.title);
    if (!liveRow) return;

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

    const patch = { description: def.description, scenario: def.scenario, checklist: def.checklist, bot_script: def.bot_script };
    if (_useLocalStorage) {
      const localTopics = _localGetAll('topics');
      const idx = localTopics.findIndex(t => t.module === module && t.title === def.title);
      if (idx !== -1) {
        localTopics[idx] = { ...localTopics[idx], ...patch };
        localStorage.setItem('commassess_topics', JSON.stringify(localTopics));
      }
      _localPut('settings', { key: versionKey, value: String(currentVersion) });
      console.log(`[DB] Refreshed ${module} topic content to v${currentVersion} (local).`);
    } else {
      const { error: refreshErr } = await _sb.from('topics').update(patch).eq('module', module).eq('title', def.title);
      if (refreshErr) {
        console.error(`[DB] Failed to refresh ${module} topic content:`, refreshErr);
        return; // don't bump the version marker if the update itself failed
      }
      await _sb.from('settings').upsert({ key: versionKey, value: String(currentVersion) }, { onConflict: 'key' });
      console.log(`[DB] Refreshed ${module} topic content to v${currentVersion}.`);
    }
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
        // (4 conceptual questions, AI-adaptive). Split out from the old single
        // "Operations Escalation Helpline" mega-topic, which bundled CDSL
        // Easiest/gifting, nominee, short delivery and suspended stocks into
        // one 11-question call — separated per admin request so each area is
        // its own topic. These are deliberately concept/rule questions, not
        // data-driven ones: no invented numbers or "Key details" blocks, just
        // the caller probing the agent's actual understanding of how the
        // process works.
        {
          module: 'ops-call-assessment',
          title: 'CDSL Easiest & Gifting — Transfer Rules (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of CDSL Easiest, gifting, and cross-depository transfers — no numbers or data, just the concepts and rules. 4 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A sharp, well-informed client has several conceptual questions about how CDSL Easiest, gifting, and cross-depository transfers actually work — they are not disputing a specific transaction, they want to understand the real rules so they trust your answer. Answer each of the 4 questions accurately and confidently before the caller moves to the next.',
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
            "Is there any real difference, from the depository's point of view, between a 'self transfer' — moving shares between two accounts I own — and a 'gift transfer' to someone else? Or is it just a label the app uses?"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call: Nominee Rules (Conceptual)
        {
          module: 'ops-call-assessment',
          title: 'Nominee Modification — Rules & Limits (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of nominee rules on a demat account — how many are allowed, who can be one, and what makes a minor nominee different. 4 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A client has several conceptual questions about nominee rules on their demat account — they want to understand the actual regulatory limits and requirements, not just be told "yes" or "no." Answer each of the 4 questions accurately and confidently before the caller moves to the next.',
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
            "If my mobile number isn't linked to my Aadhaar, does that block me from changing my nominee altogether, or does it just mean I have to use a different method to do it?"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call: Short Delivery & Auctions (Conceptual)
        {
          module: 'ops-call-assessment',
          title: 'Short Delivery & Auction Mechanics (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of why short delivery happens and how the auction settlement process actually works — no numbers, just the mechanics. 4 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A client wants to genuinely understand how short delivery and the auction process work — not dispute a specific number, but understand the mechanism well enough to trust the outcome next time it happens. Answer each of the 4 questions accurately and confidently before the caller moves to the next.',
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
            "Is a short-delivery penalty a fine charged to the seller, or is it compensation paid out to the buyer? Where does that money actually end up going?"
          ],
          enabled: true
        },

        // Trainee Red Pen — Operations Escalation Call: Suspended Stocks (Conceptual)
        {
          module: 'ops-call-assessment',
          title: 'Suspended Stocks — Trading Halts & Corporate Actions (Conceptual)',
          description: 'A theory-driven escalation call testing understanding of what a trading suspension actually means and how it interacts with dividends, AGMs, and buybacks. 4 tough conceptual questions in a row.',
          scenario: 'You are on an escalation helpline. A client holds a suspended stock and has several conceptual questions about what suspension actually means for their rights as a shareholder — not a specific transaction dispute, but genuine confusion about the rules. Answer each of the 4 questions accurately and confidently before the caller moves to the next.',
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
            "If my stock is suspended, can I still vote on resolutions at the company's AGM, or does the suspension affect my shareholder rights too?"
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
      const OPS_CALL_SCRIPT_VERSION    = 3; // v1: 7Q · v2: 11Q · v3: 11Q reformatted with explicit "Key details" data blocks
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
        { id: 'mgr-ta1', module: 'mgr-transcript-autopsy', title: 'SIP Debit With No Unit Allotment — 22 Min Call', enabled: true, description: 'Analyse a difficult inbound call with 8+ coaching opportunities across all key service competencies.', scenario: `BACKGROUND: Preethi Mehta is calling Zerodha support for the third time. Her ₹10,000 monthly SIP was debited on the 2nd but units were never allotted. Ticket TKT-88244 (raised 3 weeks ago) was falsely marked resolved.

YOUR TASK: Write a structured coaching report. Identify at minimum 6 coaching opportunities.`, checklist: [] },
        { id: 'mgr-ta2', module: 'mgr-transcript-autopsy', title: 'Mutual Fund Redemption Blocked — 26 Min Call', enabled: true, description: 'A high-frustration escalation call with 9+ coaching opportunities across service quality dimensions.', scenario: `BACKGROUND: Vikram Shetty has been waiting 45 days for ₹2,50,000 redemption to credit. He has called 4 times, received conflicting explanations, and has a medical emergency.

YOUR TASK: Identify minimum 8 coaching opportunities.`, checklist: [] },
        { id: 'mgr-ta3', module: 'mgr-transcript-autopsy', title: 'NRI PIS Account & Currency Conversion Delay — 18 Min Call', enabled: true, description: 'Sunita Rao NRE PIS account opening delayed by 3 weeks.', scenario: 'BACKGROUND: Sunita Rao (Dubai NRI) applied for NRE PIS account 3 weeks ago. Missed infrastructure bond issue due to bank rejection delay.', checklist: [] },
        { id: 'mgr-ta4', module: 'mgr-transcript-autopsy', title: 'The Margin Call Dispute — Escalation Call', enabled: true, description: 'A margin-call square-off dispute that has already reached the escalation manager, so every mistake has nowhere further to go.', scenario: 'BACKGROUND: A customer whose Nifty futures position was squared off for margin shortfall is escalated straight to the manager. The square-off was correct, but the handling — verification, the "are you calling me a liar" moment, policy delivery, and the close — has 8+ coaching opportunities.', checklist: [] },

        // ── Mock Call (Paper Trade)
        { id: 'mgr-mc1', module: 'mgr-mock-call', title: 'C-Suite Escalation — Contract at Final Risk', enabled: true, description: 'Handle a furious C-suite client call where the relationship is at final breaking point.', scenario: 'You are the Relationship Manager for Altus Capital, a ₹80 crore institutional client. The CFO, Priya Nair, is on the line. Three consecutive quarter-end reports were delivered late.', checklist: ['Acknowledge failures without deflection', 'Show specific corrective actions already taken', 'Propose concrete accountability milestones', 'Demonstrate understanding of client business impact', 'Make a credible commitment with a safety net offer'] },
        { id: 'mgr-mc2', module: 'mgr-mock-call', title: 'Regulatory Audit Call — Explain Team Non-Compliance', enabled: true, description: 'Handle a call from a compliance auditor who has identified systematic non-compliance in your team.', scenario: `You are on a call with Meera Krishnamurthy, the Internal Compliance Auditor. She has found that your team has been marking calls as "first-call resolved" when follow-up tickets were still open.`, checklist: ['Be transparent without being evasive', 'Take appropriate ownership based on actual knowledge', 'Show immediate corrective actions', 'Do not throw team leads under the bus unfairly', 'Propose systemic fix with timeline'] },
        { id: 'mgr-mc4', module: 'mgr-mock-call', title: 'Margin Call Penalty Dispute', enabled: true, description: 'Corporate client disputing ₹1.8 Lakh margin penalty.', scenario: 'A high-volume corporate trader calls in a rage after receiving a ₹1.8 Lakh margin penalty from auto-square-off.', checklist: [] },
        { id: 'mgr-mc5', module: 'mgr-mock-call', title: 'Cross-Border Regulatory Freeze', enabled: true, description: 'NRI Demat account frozen due to FATCA.', scenario: 'An NRI client based in London has their Demat account suddenly frozen due to pending FATCA re-declaration while travelling.', checklist: [] },

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

      if (_useLocalStorage) {
        let localT = _localGetAll('topics');
        for (const t of localT) {
          if (t.module === 'mgr-feedback' && obsoleteFeedbackTitles.has(t.title)) {
            _localDel('topics', t.id);
          }
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
