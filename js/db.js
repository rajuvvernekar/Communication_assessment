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

  function _seedLocalStorageDefaults() {
    const storedAdmins = _localGet('settings', 'adminUsers');
    if (!storedAdmins) {
      const defaultAdmins = [
        { username: 'admin', password: 'admin123' },
        { username: 'girish', password: 'admin123' }
      ];
      _localPut('settings', { key: 'adminUsers', value: JSON.stringify(defaultAdmins) });
    }
    const storedPwd = _localGet('settings', 'adminPassword');
    if (!storedPwd) {
      _localPut('settings', { key: 'adminPassword', value: 'admin123' });
    }
  }

  // ---- Public: initialise Supabase client ----
  async function init() {
    try {
      _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      // Quick test of connection
      const { data, error } = await _sb.from('settings').select('key').limit(1);
      if (error) throw error;

      await _seedDefaults();
      await _seedManagerTopics();
      console.log('[DB] Supabase connected successfully.');

      // Auto-migrate any local storage data to Supabase if any exists!
      await _migrateLocalStorageToSupabase();
    } catch (e) {
      console.warn('[DB] Supabase unavailable, using LocalStorage fallback:', e.message || e);
      _useLocalStorage = true;
      _seedLocalStorageDefaults();
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

  // ---- Seed default topics on first run ----
  async function _seedDefaults(force = false) {
    try {
      // Seed default admin users
      try {
        const { data: adminData } = await _sb.from('settings').select('*').eq('key', 'adminUsers');
        if (!adminData || adminData.length === 0) {
          const defaultAdmins = [
            { username: 'admin', password: 'admin123' },
            { username: 'girish', password: 'admin123' }
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
        const { data: res } = await _sb.from('topics').select('module, title');
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
          await _sb.from('topics').delete().in('title', titles);
        }
        // Refresh existing list to be empty so all default topics are re-seeded
        existing = [];
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
          await _sb.from('topics').insert(toInsert.map(t => ({ ...t, created_at: new Date().toISOString() })));
          console.log(`Seeded ${toInsert.length} new default topics.`);
        }
      }
    } catch (e) {
      console.warn('DB seed skipped:', e.message);
    }
  }

  // ---- Seed manager topics on first run ----
  async function _seedManagerTopics() {
    try {
      const { count } = await _sb.from('topics').select('*', { count: 'exact', head: true }).like('module', 'mgr-%');
      if (count > 0) return; // already seeded

      const mgrTopics = [
        // ── Situation Room (very difficult leadership scenarios)
        { module: 'mgr-situation-room', title: 'The Unexpected Resignation', enabled: true,
          description: 'A crisis scenario requiring immediate team leadership and strategic thinking.',
          scenario: 'Your top performer — handling 40% of team output — has resigned effective immediately citing burnout and poor management from you personally. The team already knows via WhatsApp. You have a leadership review call with your VP in 90 minutes.\n\nSpeak for 4-5 minutes: Your immediate 24-hour action plan, how you address the team\'s concerns directly (including the "poor management" claim), talent risk mitigation, and what you tell your VP.', checklist: [] },
        { module: 'mgr-situation-room', title: 'The Compliance Breach', enabled: true,
          description: 'A high-stakes compliance failure requiring immediate escalation and damage control.',
          scenario: 'Your two senior agents bypassed compliance protocols for 8 weeks, marking 23 customer complaints as resolved without documentation. Regulators have flagged 3 of these cases. Your CXO has been notified and wants a briefing in 2 hours.\n\nSpeak for 4-5 minutes: Your escalation approach, how you handle the agents, customer remediation plan, your accountability to senior leadership, and systemic prevention measures.', checklist: [] },
        { module: 'mgr-situation-room', title: 'The Recovery Plan Under Scrutiny', enabled: true,
          description: 'A performance recovery scenario with high leadership visibility.',
          scenario: 'Your team missed the quarterly target by 38%. Two team members have submitted transfer requests citing low morale. The Regional Director has asked you to present a recovery plan in 48 hours — in writing AND in a town hall with the full floor watching.\n\nSpeak for 4-5 minutes: Your root cause analysis (own your part), the 60-day recovery strategy, how you re-engage the team publicly, and what you need from leadership to succeed.', checklist: [] },
        { module: 'mgr-situation-room', title: 'The Whistleblower Allegation', enabled: true,
          description: 'An HR-sensitive scenario requiring careful legal, ethical and human navigation.',
          scenario: 'An anonymous complaint to HR alleges that you showed favoritism in performance ratings — specifically that you gave inflated scores to team members you are personally close with, and unfairly documented a lower-rated agent. HR has asked you to attend a meeting tomorrow. Two team members separately approach you today — one ally asking "what should I say?" and one asking to speak with HR independently.\n\nSpeak for 4-5 minutes: How you handle both conversations today, your approach to the HR meeting, what you would change about your rating process, and how you preserve team trust through the investigation.', checklist: [] },

        // ── Transcript Autopsy (long, realistic, multiple mistakes)
        { module: 'mgr-transcript-autopsy', title: 'SIP Debit With No Unit Allotment — 22 Min Call', enabled: true,
          description: 'Analyse a difficult inbound call with 8+ coaching opportunities across all key service competencies.',
          scenario: 'BACKGROUND: Preethi Mehta is calling Zerodha support for the third time. Her ₹10,000 monthly SIP was debited on the 2nd but units were never allotted. Ticket TKT-88244 (raised 3 weeks ago) was falsely marked resolved.\n\n─── CALL TRANSCRIPT ─────────────────────────\n\nAGENT: Hello, Zerodha support, how can I help?\n\nPREETHI: Hi, my name is Preethi Mehta. I have been calling for three weeks about my SIP. My ₹10,000 was debited but I have not received any units. Ticket TKT-88244 — nobody has contacted me. This money is for my daughter\'s education—\n\nAGENT: Can I have your account number please?\n\nPREETHI: XJ7743-21. As I was saying, this money is—\n\nAGENT: And your name?\n\nPREETHI: I just told you — Preethi Mehta.\n\nAGENT: One moment. [28-second silence] Okay. What is the issue exactly?\n\nPREETHI: SIP debited, no units received, ticket unresolved, three weeks.\n\nAGENT: Which fund?\n\nPREETHI: Axis Bluechip Fund — Direct Growth.\n\nAGENT: Amount?\n\nPREETHI: ₹10,000. Already stated.\n\nAGENT: Hold please. [Places on hold without asking — 3 min 12 sec]\n\nAGENT: Hello? Are you there?\n\nPREETHI: Yes, waiting. What did you find?\n\nAGENT: The debit went through on the 2nd. Units take 5 to 7 working days.\n\nPREETHI: It has been 21 days. That is not 5 to 7 working days.\n\nAGENT: Sometimes there are delays at the fund house.\n\nPREETHI: Can you confirm if units were actually allotted?\n\nAGENT: I am checking. [42-second silence] I need to check with back-end. Hold. [Second hold without asking — 4 min 48 sec]\n\nAGENT: Still there?\n\nPREETHI: Barely.\n\nAGENT: There was a NACH mandate rejection.\n\nPREETHI: What? Nobody told me this in three weeks! My money was still debited!\n\nAGENT: The automatic instruction was rejected but your bank released funds separately.\n\nPREETHI: Where is my ₹10,000 right now?\n\nAGENT: It should reverse to your bank account.\n\nPREETHI: Should? You are not certain?\n\nAGENT: It will come back. These things take time.\n\nPREETHI: How much time — specifically?\n\nAGENT: Around 7 to 10 days.\n\nPREETHI: From today or from the 2nd?\n\nAGENT: From when the reversal is processed. I cannot give an exact date.\n\nPREETHI: I want to escalate. Can I speak to a senior?\n\nAGENT: I will raise a new ticket. Cannot transfer directly.\n\nPREETHI: What happened to TKT-88244?\n\nAGENT: [23-sec silence] Marked resolved on the 9th.\n\nPREETHI: Resolved? Nobody called me! Nothing was resolved!\n\nAGENT: I cannot see who updated it. These things happen.\n\nPREETHI: I want a supervisor.\n\nAGENT: I will raise a high-priority ticket. Callback within 48 hours.\n\nPREETHI: 48 hours after three weeks?\n\nAGENT: Same-day resolution is not possible from my end.\n\nPREETHI: What can you actually guarantee?\n\nAGENT: I will mark it high priority.\n\nPREETHI: New ticket number?\n\nAGENT: [15-sec silence] TKT-99501.\n\nPREETHI: What are you documenting?\n\nAGENT: SIP debit, no unit allotment, callback requested.\n\nPREETHI: NACH rejection, three-week history, false resolution on previous ticket — is that noted?\n\nAGENT: Adding now. [38-sec silence] Done.\n\nPREETHI: Can I get an email confirmation?\n\nAGENT: We do not send email confirmations.\n\nPREETHI: Your name and employee ID?\n\nAGENT: I am Aryan. No employee ID to share.\n\nPREETHI: Is anything else possible right now?\n\nAGENT: No. We have to wait for back-end.\n\nPREETHI: [6-second silence]\n\nAGENT: Have a nice day. [Disconnects without checking if customer needs anything further]\n\n─── END OF TRANSCRIPT ─────────────────────\n\nYOUR TASK: Write a structured coaching report. Identify at minimum 6 coaching opportunities. For each: (a) cite the exact transcript moment, (b) explain the customer impact, (c) write the improved response. Also identify what (if anything) the agent did well, and provide a 3-priority development action plan. Minimum 250 words.',
          checklist: [] },
        { module: 'mgr-transcript-autopsy', title: 'Mutual Fund Redemption Blocked — 26 Min Call', enabled: true,
          description: 'A high-frustration escalation call with 9+ coaching opportunities across service quality dimensions.',
          scenario: 'BACKGROUND: Vikram Shetty has been waiting 45 days for ₹2,50,000 redemption to credit. He has called 4 times, received conflicting explanations, and has a medical emergency that forced him to borrow money from family.\n\n─── CALL TRANSCRIPT ─────────────────────────\n\nAGENT: Hi, support, tell me your problem.\n\nVIKRAM: Good morning. Vikram Shetty. Redemption request RED-20240813-7741 placed 45 days ago. ₹2,50,000 from liquid fund. Still not credited. This is for a medical emergency. I have called four times.\n\nAGENT: Account number?\n\nVIKRAM: ZC-4421-88. I also have three previous ticket numbers.\n\nAGENT: [1 min 34 sec silence — no update given]\n\nAGENT: Okay, I see it.\n\nVIKRAM: What is the status of RED-20240813-7741?\n\nAGENT: There might be a KYC issue.\n\nVIKRAM: KYC? I have invested on Zerodha for six years. KYC was verified when I opened the account.\n\nAGENT: Sometimes it needs re-verification.\n\nVIKRAM: Is it KYC or not — can you check specifically?\n\nAGENT: Checking. Actually hold on. [Places on hold without asking — 2 min 50 sec]\n\nAGENT: So actually it might be a bank mandate problem.\n\nVIKRAM: Bank? I have received dividends in this same account for years. Nothing changed.\n\nAGENT: Let me verify. [27-sec silence] Account ending 4821 — is that correct?\n\nVIKRAM: Yes. Same account I always use.\n\nAGENT: Then it is not a bank issue.\n\nVIKRAM: First KYC, then bank, now neither. What is the actual problem?\n\nAGENT: It may be a technical issue from the fund house.\n\nVIKRAM: What is being done?\n\nAGENT: I will raise a ticket.\n\nVIKRAM: There are already three tickets — TKT-11234, TKT-11509, TKT-11788. What happened?\n\nAGENT: I can see TKT-11234. I do not see the others.\n\nVIKRAM: Are tickets being deleted?\n\nAGENT: The system is slow today.\n\nVIKRAM: A previous agent said credit in 3-5 working days. That was six weeks ago.\n\nAGENT: I cannot speak to what my colleagues said.\n\nVIKRAM: When will my ₹2,50,000 be credited?\n\nAGENT: I cannot give a confirmed date.\n\nVIKRAM: My family has been borrowing money for 45 days. Can I speak to a supervisor?\n\nAGENT: Supervisors are not available for direct calls. They respond through tickets.\n\nVIKRAM: No supervisor in 45 days?\n\nAGENT: I understand this has been a long wait.\n\nVIKRAM: Is there a grievance process?\n\nAGENT: You can write to our grievance email.\n\nVIKRAM: What is that email?\n\nAGENT: [12-sec silence] I believe it is support@zerodha.com but I am not 100% certain.\n\nVIKRAM: You are not certain of your own company\'s grievance email?\n\nAGENT: Let me check. [22-sec silence] Yes, support@zerodha.com.\n\nVIKRAM: That is the general support email. Is there a specific grievance officer or a SEBI-level escalation path?\n\nAGENT: I will escalate to the senior team with highest priority. I am sorry for the trouble.\n\nVIKRAM: Your name?\n\nAGENT: Deepika.\n\nVIKRAM: Employee ID?\n\nAGENT: I am not supposed to share that.\n\nVIKRAM: Ticket for this call?\n\nAGENT: TKT-11901.\n\nVIKRAM: Please note: fifth call, three unresolved tickets, medical emergency, ₹2,50,000 outstanding 45 days.\n\nAGENT: I have noted it.\n\nVIKRAM: Is there anything that can be done TODAY?\n\nAGENT: The credit is handled by the fund house and banking system. We cannot manually push it.\n\nVIKRAM: That is your answer after 45 days?\n\nAGENT: I am sorry. Escalation will be the fastest path.\n\nVIKRAM: Fine. [Pause]\n\nAGENT: Is there anything else?\n\nVIKRAM: No.\n\nAGENT: Thank you for calling. Have a wonderful day. [Disconnects]\n\n─── END OF TRANSCRIPT ─────────────────────\n\nYOUR TASK: Identify minimum 8 coaching opportunities — at least one each from: Call Opening, Information Verification, Hold Procedure, Empathy & Acknowledgment, Problem Ownership, Knowledge Accuracy, Escalation Process, and Call Closing. For each: (a) cite the transcript, (b) name the violated standard, (c) write the improved response. End with a Development Priority Matrix: rate the agent 1-5 on five dimensions and identify top 2 training priorities. Minimum 300 words.',
          checklist: [] },

        // ── Mock Call (manager-level — very difficult)
        { module: 'mgr-mock-call', title: 'C-Suite Escalation — Contract at Final Risk', enabled: true,
          description: 'Handle a furious C-suite client call where the relationship is at final breaking point.',
          scenario: 'You are the Relationship Manager for Altus Capital, a ₹80 crore institutional client. The CFO, Priya Nair, is on the line. Three consecutive quarter-end reports were delivered late, two contained calculation errors, and one missed a regulatory deadline that caused the client a ₹12 lakh penalty. She says:\n\n"I have put forward a proposal to our board to terminate the contract. My CEO asked me to give you one final call. I am giving you exactly five minutes. Tell me why the board should reject my recommendation."\n\nHandle this call. You have 4-5 minutes. You must not be defensive, you must own the failures, and you must present a concrete recovery proposal with accountability milestones — not promises.', checklist: ['Acknowledge failures without deflection', 'Show specific corrective actions already taken', 'Propose concrete accountability milestones', 'Demonstrate understanding of client business impact', 'Make a credible commitment with a safety net offer'] },
        { module: 'mgr-mock-call', title: 'Regulatory Audit Call — Explain Your Team\'s Non-Compliance', enabled: true,
          description: 'Handle a call from a compliance auditor who has identified systematic non-compliance in your team.',
          scenario: 'You are on a call with Meera Krishnamurthy, the Internal Compliance Auditor. She has found that your team has been marking calls as "first-call resolved" when follow-up tickets were still open — inflating your FCR metric by ~18% over Q2 and Q3. This is a reportable audit finding.\n\nShe says: "I have documented 47 instances from your team over 6 months. Your team leads\' call logs show they knew. The question I need to answer in my report is: did you know, did you direct this, or did it happen without your knowledge — and what does each answer mean for our processes?"\n\nHandle this call. Be honest, professional, and solutions-focused. You have 4-5 minutes.', checklist: ['Be transparent without being evasive', 'Take appropriate ownership based on actual knowledge', 'Show immediate corrective actions', 'Do not throw team leads under the bus unfairly', 'Propose systemic fix with timeline'] },
        { module: 'mgr-mock-call', title: 'Skip-Level Performance Challenge', enabled: true,
          description: 'A skip-level call from your VP who has received complaints about your management style.',
          scenario: 'Your VP, Suresh Rao, calls you unexpectedly. He has received two anonymous feedback entries from your team members that reference: (1) your tendency to publicly call out mistakes in team meetings, (2) perceived unfairness in leave approvals, and (3) favouritism in assigning premium clients to certain agents.\n\nHe says: "I want to hear your side. But I also need to know — is there any basis to these concerns, and what does this tell you about how you are perceived as a manager?"\n\nHandle this conversation with maturity and self-awareness. You have 4-5 minutes.', checklist: ['Respond without being defensive', 'Show genuine self-awareness', 'Acknowledge any valid points', 'Present concrete changes you will make', 'Invite ongoing feedback'] },

        // ── Feedback (conversational AI — personas are hardcoded in manager-app.js)
        { module: 'mgr-feedback', title: 'The Burnout Star', enabled: true,
          description: 'Give structured feedback to a top performer whose engagement has suddenly dropped.',
          scenario: 'Rahul is your best performer — always exceeds targets. For the last 3 weeks he has been arriving late, missing standups, and being short and impatient with teammates. His output has dropped 20%.\n\nConduct a structured, empathetic feedback conversation. You must: open safely, give specific examples, explore the root cause, agree on a path forward, and maintain the relationship.', checklist: [] },
        { module: 'mgr-feedback', title: 'The Struggling New Hire', enabled: true,
          description: 'Give honest but supportive feedback to a new hire whose communication is damaging customer relationships.',
          scenario: 'Priya joined 8 weeks ago. She is technically capable but comes across as too blunt with customers. Two formal complaints have been filed. Three teammates are informally covering for her.\n\nDeliver honest feedback that protects the customer relationship AND keeps Priya engaged and developing. Avoid both being too soft (which fails the team) and too harsh (which loses her).', checklist: [] },
        { module: 'mgr-feedback', title: 'The Dismissive Senior', enabled: true,
          description: 'Challenge a high-performing but culturally toxic senior agent on behaviour that is undermining team culture.',
          scenario: 'Arjun has 5 years of experience and is technically your best agent. He dismisses new processes publicly, makes condescending comments to junior staff, and has a "I\'ve always done it this way" attitude. Two junior team members have told you privately they are considering leaving because of him.\n\nGive Arjun clear, specific, consequential feedback on the culture impact — without losing his technical contribution. This is not a soft conversation.', checklist: [] },

        // ── Emotional Intelligence (written — very difficult)
        { module: 'mgr-eq', title: 'The Breaking Point in a Team Meeting', enabled: true,
          description: 'Respond to a team member\'s public emotional breakdown with professional, human leadership.',
          scenario: 'During a Monday morning team meeting with 11 people present, your agent Sana suddenly says through tears: "I can\'t keep doing this. The pressure is impossible. I feel completely alone in this team and nobody actually helps anyone here."\n\nThere is a 5-second silence. Everyone is looking at you.\n\nWrite your response covering:\n1. What you say and do in the next 60 seconds (exact words matter)\n2. How you manage the rest of the team in that meeting and in the 24 hours after\n3. What you do privately with Sana — immediately, in 24 hours, in 7 days\n4. What this moment tells you about your team\'s health and what structural changes you will make\n5. How you prevent both over-reacting (making it bigger than it is) and under-reacting (dismissing it)\n\nMinimum 200 words. Demonstrate that you can lead with both emotional intelligence and professional composure.',
          checklist: [] },
        { module: 'mgr-eq', title: 'The Public Undermining by a Peer Manager', enabled: true,
          description: 'Respond to deliberate public undermining with professional self-regulation and strategic thinking.',
          scenario: 'In a cross-functional leadership review attended by 18 people — including your team, peer managers, and two Senior VPs — Nikhil (a peer manager you have had friction with) says:\n\n"I think we should be honest about the data. The improvement numbers from [your team] look good on paper, but the quality escalations from that floor tell a different story. Maybe the management approach is creating short-term metric performance but longer-term service issues. I\'m just raising it as a question for the room."\n\nYour team is watching you. Both SVPs look at you expectantly.\n\nWrite your response covering:\n1. What you say in that room RIGHT NOW (exact words)\n2. How you close the discussion professionally without being defensive or dismissive\n3. What you do with Nikhil privately — when, how, and what you say\n4. What you say to your team afterwards\n5. What you learn about your own emotional triggers from this situation and how you manage them\n\nMinimum 200 words. Show that you can protect your credibility without damaging relationships or escalating conflict.',
          checklist: [] },

        // ── Management Skills (written — very difficult, strategic)
        { module: 'mgr-management-skills', title: '30-60-90 Day Plan for a First-Time Team Lead', enabled: true,
          description: 'Design a rigorous, structured development plan for a newly promoted team lead.',
          scenario: 'You have just promoted Kiran, your highest-performing agent, to Team Lead. She is technically outstanding but has never managed people. She will inherit a team of 9 agents — including 2 senior agents who also applied for the role and were passed over.\n\nWrite a detailed 30-60-90 day development plan that must include:\n- Specific, measurable milestones for each phase (not vague goals)\n- How you will handle the 2 passed-over agents (name the risk explicitly)\n- Weekly check-in cadence and what you will cover in each\n- What "ready to operate independently" looks like at day 90\n- The 3 most likely failure modes for a first-time lead and how the plan prevents each\n- How you will know if she is not progressing and what you will do\n\nMinimum 250 words. This should be something you could actually hand to Kiran and your HR BP tomorrow.',
          checklist: [] },
        { module: 'mgr-management-skills', title: 'Change Management Brief — CRM Migration', enabled: true,
          description: 'Lead a high-stakes system migration after a previous failure that damaged team trust.',
          scenario: 'Your team of 14 agents will migrate to a new CRM system in 4 weeks. Context that makes this hard: (1) A similar migration 2 years ago caused 15% productivity drop for 2 months, (2) three team members were involved in that rollout and publicly blame the previous manager, (3) the vendor\'s training schedule is unrealistic (4-hour session for a complex system), and (4) two of your strongest agents have already said "last time was a disaster — I\'m not doing that again."\n\nWrite a change management brief that must include:\n- Your communication strategy (what you say, when, to whom, and in what format — be specific)\n- How you address the "last time was a disaster" sentiment directly (not just reassurance)\n- A revised training approach that actually works within your constraints\n- Your resistance handling strategy for the 2 resistant senior agents specifically\n- Productivity protection measures (what you will deprioritize during transition)\n- Success metrics with week-by-week targets\n- Your personal commitment and what you will be doing daily during the 4-week window\n\nMinimum 250 words. This should be a real brief, not a generic plan.',
          checklist: [] },

        // ── Listening & Tone (MCQ — 5 questions, auto-scored in manager-app.js)
        { module: 'mgr-listening-tone', title: 'Listening & Tone — Manager Email Analysis', enabled: true,
          description: 'Analyse the tone, subtext, and communication quality of a real manager email.',
          scenario: 'Read the email carefully and answer 5 analytical questions about tone, impact, and what is unsaid.',
          checklist: [] },
      ];

      await _sb.from('topics').insert(mgrTopics.map(t => ({ ...t, created_at: new Date().toISOString() })));
    } catch (e) {
      console.warn('Manager topic seed skipped:', e.message);
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

  return { init, put, patch, get, getAll, del, getByIndex, getClient, isLocalStorage, forceReSeed };
})();
