'use strict';

// ============================================================
//  CommAssess — Database Layer (Supabase)
//  Drop-in replacement for the old IndexedDB-based DB module.
//  The public API (init, get, getAll, put, del, getByIndex)
//  is identical so the rest of the app needs minimal changes.
// ============================================================

const DB = (() => {
  let _sb = null; // Supabase client instance

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

  // Convert app camelCase → DB snake_case (for saves)
  function _toDB(store, data) {
    const map = store === 'sessions' ? SESSION_MAP
              : store === 'topics'   ? TOPIC_MAP
              : {};
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      // Skip raw blobs — handled separately via Storage upload
      if (k === 'recordingBlob' || k === 'callerAudioBlob') continue;
      out[map[k] || k] = v;
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
        : {};
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[reverseMap[k] || k] = v;
    }
    // Compatibility shims: old code checks .recordingBlob / .callerAudioBlob
    if (store === 'sessions') out.recordingBlob = null;
    if (store === 'topics')   out.callerAudioBlob = null;
    return out;
  }

  // ---- Upload a Blob to Supabase Storage → return public URL ----
  async function _upload(bucket, blob) {
    const ext  = blob.type.includes('webm') ? 'webm'
               : blob.type.includes('mp4')  ? 'mp4'
               : blob.type.includes('ogg')  ? 'ogg' : 'bin';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await _sb.storage.from(bucket).upload(path, blob, { contentType: blob.type });
    if (error) throw error;
    const { data } = _sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  // ---- Public: initialise Supabase client ----
  async function init() {
    _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    await _seedDefaults();
  }

  // ---- Seed default topics on first run ----
  async function _seedDefaults() {
    try {
      const { count } = await _sb.from('topics').select('*', { count: 'exact', head: true });
      if (count > 0) return; // already seeded

      const defaults = [
        // Pick & Speak — General
        { module: 'pick-speak-general', title: 'Work from Home',              description: 'Discuss the advantages and challenges of working from home in today\'s corporate world.',                                       scenario: '', checklist: [] },
        { module: 'pick-speak-general', title: 'Time Management',             description: 'How do you prioritize tasks and manage your time effectively at work? Share practical techniques.',                              scenario: '', checklist: [] },
        { module: 'pick-speak-general', title: 'Leadership vs Management',    description: 'What is the difference between a leader and a manager? Can one person be both? Give examples.',                                 scenario: '', checklist: [] },
        { module: 'pick-speak-general', title: 'Customer First Culture',      description: 'What does "putting the customer first" mean in practice? Share examples from your experience.',                                 scenario: '', checklist: [] },
        { module: 'pick-speak-general', title: 'Effective Team Collaboration',description: 'Describe how effective team collaboration leads to better outcomes. What makes a great team?',                                   scenario: '', checklist: [] },
        { module: 'pick-speak-general', title: 'Handling Workplace Conflicts',description: 'How do you handle disagreements or conflicts in a professional setting? Walk us through your approach.',                         scenario: '', checklist: [] },
        // Pick & Speak — Stock Market
        { module: 'pick-speak-stock', title: 'Bull vs Bear Market',           description: 'Explain the difference between a bull and a bear market. How should an investor adjust their strategy in each phase?',          scenario: '', checklist: [] },
        { module: 'pick-speak-stock', title: 'Importance of Diversification', description: 'Why is diversification considered a cornerstone of investing? Explain with examples of asset classes.',                         scenario: '', checklist: [] },
        { module: 'pick-speak-stock', title: 'Index Funds vs Active Investing',description: 'Compare index fund investing with actively managed funds. What are the pros and cons of each approach?',                       scenario: '', checklist: [] },
        { module: 'pick-speak-stock', title: 'How to Read a Stock Chart',     description: 'Walk through the basics of reading a stock chart — price trends, volume, and key indicators like moving averages.',             scenario: '', checklist: [] },
        { module: 'pick-speak-stock', title: 'Managing Market Volatility',    description: 'How should a long-term investor think about and respond to short-term market volatility? Share your approach.',                  scenario: '', checklist: [] },
        { module: 'pick-speak-stock', title: 'Fundamental vs Technical Analysis', description: 'What is the difference between fundamental and technical analysis? Which do you rely on more, and why?',                    scenario: '', checklist: [] },
        // Mock Call
        { module: 'mock-call', title: 'Angry Customer – Double Billing',
          description: 'A customer calls furious about being charged twice for the same service.',
          scenario: 'You receive an inbound support call. The customer says: "I\'ve been charged TWICE this month and nobody is helping me! This is completely unacceptable — I want my money back NOW!"',
          checklist: ['Greet professionally and introduce yourself','Acknowledge the frustration with empathy','Verify the account details calmly','Offer a clear resolution or escalation path','Close the call warmly and professionally'] },
        { module: 'mock-call', title: 'Service Outage – Status Call',
          description: 'Customer has had a 2-day service outage and wants a status update and compensation.',
          scenario: 'Customer says: "My internet has been down for 2 days straight. I work from home — this is costing me real clients and money. What exactly are you doing about it, and what compensation am I getting?"',
          checklist: ['Show genuine empathy for the business impact','Provide an honest and accurate status update','Offer a practical interim workaround if possible','Set realistic expectations on resolution timeline','Make a clear follow-up commitment'] },
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
        // Written Communication
        { module: 'written-comm', title: 'Project Delay Notification Email',
          description: 'Inform a client that a project will be delayed by 2 weeks due to unexpected technical issues.',
          scenario: 'To: Client (Sarah Mitchell, TechCorp)\nFrom: You\nSubject: [Write your own subject line]\n\nContext: The project was due this Friday. A critical API dependency failed late last week. The revised delivery date is 2 weeks from now.',
          checklist: ['Professional and honest subject line','Warm and professional greeting','Clear explanation without over-justifying','Revised timeline with a firm commitment','Apology that acknowledges impact on the client','Professional closing with next steps'] },
        { module: 'written-comm', title: 'Internal Escalation Memo',
          description: 'Write an internal memo escalating a recurring vendor delivery issue.',
          scenario: 'To: Your Manager (Rajesh Kumar, VP Operations)\nFrom: You\nSubject: [Write your own subject line]\n\nContext: Vendor X has missed 3 consecutive weekly deliveries. Each delay causes a 1-2 day productivity loss for your 5-person team.',
          checklist: ['Clear problem statement in the opening line','Quantified impact (time, people, cost if applicable)','Brief timeline of events and prior actions taken','Your recommendation or specific ask','Concise, professional tone throughout'] },
      ];
      await _sb.from('topics').insert(defaults.map(t => ({ ...t, created_at: new Date().toISOString() })));
    } catch (e) {
      console.warn('DB seed skipped:', e.message);
    }
  }

  // ---- put: insert or upsert a record ----
  async function put(store, data) {
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
    if (store === 'sessions' && data.recordingBlob instanceof Blob) {
      try {
        processed.recordingUrl = await _upload('recordings', data.recordingBlob);
      } catch (e) {
        console.warn('Recording upload failed (no storage policy?), saving without URL:', e.message);
      }
    }
    if (store === 'topics' && data.callerAudioBlob instanceof Blob) {
      try {
        processed.callerAudioUrl = await _upload('caller-audio', data.callerAudioBlob);
      } catch (e) {
        console.warn('Caller audio upload failed, saving without URL:', e.message);
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
    // sessions uses submitted_at; everything else uses created_at
    const orderCol = store === 'sessions' ? 'submitted_at' : 'created_at';
    const { data, error } = await _sb.from(store).select('*').order(orderCol, { ascending: true });
    if (error) throw error;
    return (data || []).map(r => _fromDB(store, r));
  }

  // ---- del: delete a record by id ----
  async function del(store, id) {
    const { error } = await _sb.from(store).delete().eq('id', id);
    if (error) throw error;
  }

  // ---- getByIndex: filter records by a field value ----
  async function getByIndex(store, field, value) {
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
  function getClient() { return _sb; }

  return { init, put, get, getAll, del, getByIndex, getClient };
})();
