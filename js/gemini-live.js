'use strict';

// ============================================================================
//  GeminiLive — Google Gemini 3.8 Live speech-to-speech integration (BETA)
//  Added 2026-09-18.
//
//  This is a genuinely different architecture from the rest of the app's AI
//  calling flow. Everywhere else, a call/chat turn is: browser records audio
//  → Web Speech API (or nothing) transcribes it to text → a text LLM (Claude,
//  via claude.js) replies with text → the browser plays a scripted line or
//  reads text aloud. Gemini's Live API instead keeps one persistent WebSocket
//  open for the whole call: raw microphone audio streams to Google in real
//  time, and Google streams raw spoken audio straight back — there is no
//  separate transcribe-then-generate-then-speak step on our side.
//
//  Because of that, this module owns its own mic capture and audio playback
//  (it does NOT reuse Recorder/SpeechEngine) and talks directly to Google's
//  servers from the browser once it has a short-lived ("ephemeral") token.
//  That token is minted by our Cloudflare Worker (see worker.js's
//  `/live-token` route) using a GEMINI_API_KEY secret that never reaches the
//  browser — only the one-time-use, short-expiry token does.
//
//  Protocol reference (Google's Live API over WebSocket,
//  BidiGenerateContent): https://ai.google.dev/api/live
//  Ephemeral tokens: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
//
//  IMPORTANT — this has not been exercised against the real Gemini Live API
//  yet (the sandboxed environment this was written in cannot grant a browser
//  microphone permission at all, so live end-to-end testing has to happen on
//  a real device). The message shapes below are built directly from Google's
//  published schema, but Google could tweak field names on their side; if a
//  call fails, check the browser console first — every inbound/outbound
//  message is logged there with a `[GeminiLive]` prefix to make that easy.
// ============================================================================

const GeminiLive = (() => {
  // Model + voice are centralized here so they're easy to bump later without
  // hunting through the rest of the file.
  const MODEL = 'models/gemini-3.8-live';
  const VOICE_NAME = 'Kore';
  const INPUT_SAMPLE_RATE = 16000;   // required by the Live API for mic input
  const OUTPUT_SAMPLE_RATE = 24000;  // fixed rate the Live API sends audio back at

  // Google recycles the underlying WebSocket connection roughly every 10
  // minutes and expects a "session resumption" reconnect to carry on past
  // that point (see https://ai.google.dev/gemini-api/docs/live-session).
  // This module doesn't implement resumption, so instead of risking an
  // ungraceful mid-sentence drop right around the 10-minute mark, every call
  // is proactively wrapped up a little earlier, at 9 minutes.
  const MAX_CALL_MS = 9 * 60 * 1000;

  // Candidate MediaRecorder mime types for the local call recording, best
  // first. Not every browser supports every type (notably Safari doesn't do
  // webm), so we probe with MediaRecorder.isTypeSupported and fall back down
  // the list, then to the browser's own default if none report as supported.
  const RECORDING_MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  function _log(...args) { console.log('[GeminiLive]', ...args); }
  function _warn(...args) { console.warn('[GeminiLive]', ...args); }

  function _tokenUrl() {
    const base = (typeof CONFIG !== 'undefined' && CONFIG.CLAUDE_PROXY_URL) || '';
    if (!base) return '';
    return base.replace(/\/+$/, '') + '/live-token';
  }

  function isAvailable() {
    const url = _tokenUrl();
    return !!url
      && !url.includes('YOUR_WORKER')
      && typeof WebSocket !== 'undefined'
      && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      && !!(window.AudioContext || window.webkitAudioContext);
  }

  // ---- PCM / base64 helpers ------------------------------------------------

  function _floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function _int16ToBase64(int16) {
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function _base64ToInt16(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  // Plain linear-interpolation resampler. Good enough for speech at these
  // rates; not meant to be hi-fi.
  function _resample(float32, fromRate, toRate) {
    if (fromRate === toRate) return float32;
    const ratio = fromRate / toRate;
    const newLen = Math.max(1, Math.round(float32.length / ratio));
    const result = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0 + 1, float32.length - 1);
      const frac = srcIdx - i0;
      result[i] = float32[i0] * (1 - frac) + float32[i1] * frac;
    }
    return result;
  }

  // ---- Ephemeral token ------------------------------------------------------

  async function _getEphemeralToken(systemInstruction) {
    const resp = await fetch(_tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `system` added 2026-09-20: the Worker bakes this into the ephemeral
      // token's own bidiGenerateContentSetup. Previously this call sent only
      // { model }, so every Live call's token carried NO systemInstruction --
      // the persona/scenario brief this module's own `connect()` sends later
      // in the WebSocket `setup` message was silently not honoured, because
      // the "Constrained" token variant scopes the session to whatever was
      // present in the token at mint time. That's why Red Pen's Voice AI
      // (Beta) was falling back to a generic, unscripted conversation
      // instead of roleplaying the actual employee persona.
      body: JSON.stringify({ model: MODEL, system: systemInstruction }),
    });
    const raw = await resp.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) { /* leave {} */ }
    if (!resp.ok) {
      throw new Error((data.error && data.error.message) || `Voice AI token request failed (${resp.status})`);
    }
    // Google's docs describe the token value under `name`; fall back to a
    // couple of other plausible field names in case the exact shape differs.
    const token = data.name || data.token || (data.authToken && data.authToken.name);
    if (!token) {
      _warn('Unexpected token response shape:', data);
      throw new Error('Voice AI token response did not include a usable token');
    }
    return token;
  }

  // ---- Main call session -----------------------------------------------------

  // options:
  //   systemInstruction (string, required) — persona + scenario prompt
  //   onStateChange(state)  — 'connecting' | 'listening' | 'speaking' | 'error' | 'ended'
  //   onTurn({ role, text }) — role is 'bot' (the AI customer) or 'trainee'
  //   onError(err)
  // returns { stop() }
  function startCall({ systemInstruction, onStateChange, onTurn, onError }) {
    let ws = null;
    let micStream = null;
    let micCtx = null;
    let sourceNode = null;
    let processorNode = null;
    let silentGain = null;
    let playbackCtx = null;
    let playbackRecordDest = null;
    let micRecordDest = null;
    let nextPlayTime = 0;
    let stopped = false;
    let setupDone = false;
    let durationTimer = null;

    // ---- Local call recording (mic + AI voice, mixed) -----------------------
    // Purely client-side: mixes the trainee's mic stream with the audio
    // actually being played back for the AI customer into one MediaStream via
    // a small dedicated AudioContext, then records that with MediaRecorder.
    // None of this touches the Gemini WebSocket or makes any extra API call,
    // so it has no effect on Live API rate limits/quota — it's just capturing
    // audio that's already flowing through the browser.
    let recMixCtx = null;
    let recMediaRecorder = null;
    let recChunks = [];
    let recMimeType = '';
    let recStarted = false;
    let recordingDonePromise = null;
    let recordingResolve = null;
    let recSetupPromise = null;

    let curBotText = '';
    let curTraineeText = '';

    function setState(s) { if (onStateChange && !stopped) onStateChange(s); }
    function emitTurn(role, text) {
      if (text && text.trim() && onTurn && !stopped) onTurn({ role, text: text.trim() });
    }

    function playAudioChunk(base64Data) {
      if (stopped) return;
      if (!playbackCtx) {
        playbackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
        nextPlayTime = playbackCtx.currentTime;
        // A second, silent tap of everything played back — feeds the call
        // recording without altering what actually comes out of the speaker.
        playbackRecordDest = playbackCtx.createMediaStreamDestination();
        _startRecordingIfReady();
      }
      const int16 = _base64ToInt16(base64Data);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

      const buffer = playbackCtx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
      buffer.copyToChannel(float32, 0);
      const src = playbackCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(playbackCtx.destination);
      if (playbackRecordDest) src.connect(playbackRecordDest);
      const startAt = Math.max(playbackCtx.currentTime, nextPlayTime);
      src.start(startAt);
      nextPlayTime = startAt + buffer.duration;
    }

    // Starts the mixed call recording once both audio sources — the trainee's
    // mic and the AI's spoken output — are available. Safe to call multiple
    // times; only actually starts once. Never throws: a recording failure
    // (unsupported browser, permissions quirk, etc.) should never break the
    // call itself, so any error here is logged and swallowed.
    //
    // IMPORTANT: this deliberately does NOT hand the raw `micStream` (the
    // actual getUserMedia hardware track, already consumed by `sourceNode`
    // in `micCtx` for the send-to-Gemini path) to a second AudioContext.
    // Attaching one live hardware MediaStreamTrack to source nodes in two
    // different AudioContexts at once is a known-flaky pattern — several
    // browsers silently deliver silence to the second consumer instead of
    // erroring. Instead, `micRecordDest` (set up in startMicCapture) taps
    // the mic via the SAME `sourceNode`/`micCtx` that's already reliably
    // capturing it, producing a synthetic MediaStream; only that synthetic
    // stream (and the equivalent `playbackRecordDest` one for the AI's
    // voice) ever crosses into this recording-only context. Bridging two
    // contexts via a destination-node's stream feeding a source-node in
    // another context is the standard, well-supported way to connect
    // separate Web Audio graphs — unlike re-tapping one hardware track twice.
    function _startRecordingIfReady() {
      if (recStarted || stopped) return;
      if (!micRecordDest || !playbackRecordDest) return;
      recStarted = true; // lock immediately — setup below is async and this can be called from two call sites in quick succession
      if (typeof MediaRecorder === 'undefined') {
        _warn('MediaRecorder not supported in this browser — call will not be recorded');
        recordingDonePromise = Promise.resolve(null);
        return;
      }
      recSetupPromise = (async () => {
        try {
          recMixCtx = new (window.AudioContext || window.webkitAudioContext)();
          // A context with no audible output of its own (nothing here ever
          // reaches actual speakers) can be left "suspended" by the browser
          // rather than auto-starting — if so, nothing would flow through
          // this graph and the recording would come out silent. Force it.
          if (recMixCtx.state === 'suspended') {
            try { await recMixCtx.resume(); } catch (_) {}
          }
          if (stopped) { try { recMixCtx.close(); } catch (_) {} recordingDonePromise = Promise.resolve(null); return; }

          const micSrc = recMixCtx.createMediaStreamSource(micRecordDest.stream);
          const botSrc = recMixCtx.createMediaStreamSource(playbackRecordDest.stream);
          const mixDest = recMixCtx.createMediaStreamDestination();
          micSrc.connect(mixDest);
          botSrc.connect(mixDest);

          recMimeType = RECORDING_MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
          recMediaRecorder = recMimeType ? new MediaRecorder(mixDest.stream, { mimeType: recMimeType }) : new MediaRecorder(mixDest.stream);
          recChunks = [];
          recMediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
          recordingDonePromise = new Promise((resolve) => { recordingResolve = resolve; });
          recMediaRecorder.onstop = () => {
            try { if (recMixCtx) recMixCtx.close(); } catch (_) {}
            const blob = recChunks.length ? new Blob(recChunks, { type: recMimeType || 'audio/webm' }) : null;
            if (recordingResolve) recordingResolve(blob);
          };
          recMediaRecorder.start(1000); // 1s timeslices so we always have flushed data if the tab is killed abruptly
          _log('call recording started (mic + AI voice, mixed) —', recMimeType || 'browser default format');
          if (stopped) { try { recMediaRecorder.stop(); } catch (_) {} } // call ended in the brief window while this was setting up
        } catch (e) {
          _warn('could not start call recording — continuing without one', e);
          recordingDonePromise = Promise.resolve(null);
        }
      })();
    }

    // Resolves to the recorded call audio (Blob) once recording has been
    // stopped and flushed, or null if no recording was ever started (or it
    // failed to set up). Waits for `_startRecordingIfReady`'s async setup to
    // finish first, so a call ended within that brief window still resolves
    // correctly instead of racing ahead of it.
    function getRecording() {
      if (!recStarted) return Promise.resolve(null);
      return Promise.resolve(recSetupPromise).then(() => recordingDonePromise || Promise.resolve(null));
    }

    function handleServerMessage(msg) {
      if (msg.setupComplete) {
        setupDone = true;
        _log('setup complete — sending opening prompt so the AI customer speaks first');
        // The Live API otherwise waits for the trainee to speak first; this
        // app's whole call format has the "customer" open every call, so we
        // kick it off with a synthetic user turn instructing it to begin.
        try {
          ws.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: '(The call has just connected. Begin speaking now as the customer.)' }] }],
              turnComplete: true,
            },
          }));
        } catch (e) { _warn('Failed to send opening prompt', e); }
        setState('listening');
        return;
      }

      const sc = msg.serverContent;
      if (!sc) {
        if (msg.error) _warn('server error message:', msg.error);
        return;
      }

      if (sc.interrupted) {
        // Trainee started talking over the AI — drop whatever's still queued.
        if (playbackCtx) nextPlayTime = playbackCtx.currentTime;
      }

      if (sc.outputTranscription && sc.outputTranscription.text) {
        curBotText += sc.outputTranscription.text;
        setState('speaking');
      }
      if (sc.inputTranscription && sc.inputTranscription.text) {
        curTraineeText += sc.inputTranscription.text;
      }

      const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          playAudioChunk(part.inlineData.data);
        }
      }

      if (sc.turnComplete) {
        if (curBotText) { emitTurn('bot', curBotText); curBotText = ''; }
        if (curTraineeText) { emitTurn('trainee', curTraineeText); curTraineeText = ''; }
        setState('listening');
      }
    }

    async function startMicCapture() {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopped) { micStream.getTracks().forEach(t => t.stop()); return; }
      micCtx = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = micCtx.createMediaStreamSource(micStream);
      // ScriptProcessorNode is deprecated in favor of AudioWorklet, but it
      // remains the simplest way to tap raw PCM samples with broad browser
      // support, which matters more than modernity for a beta feature.
      processorNode = micCtx.createScriptProcessor(4096, 1, 1);
      // Some browsers only fire onaudioprocess once the node is connected to
      // a destination; route through a silent gain node so the trainee never
      // hears their own mic echoed back.
      silentGain = micCtx.createGain();
      silentGain.gain.value = 0;
      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      silentGain.connect(micCtx.destination);
      // A second, silent tap of the SAME already-working sourceNode/micCtx —
      // feeds the call recording without ever handing the raw hardware
      // stream to a different AudioContext (see the note on
      // _startRecordingIfReady for why that matters).
      micRecordDest = micCtx.createMediaStreamDestination();
      sourceNode.connect(micRecordDest);
      _startRecordingIfReady();

      processorNode.onaudioprocess = (e) => {
        if (stopped || !setupDone || !ws || ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const resampled = _resample(input, micCtx.sampleRate, INPUT_SAMPLE_RATE);
        const pcm16 = _floatTo16BitPCM(resampled);
        const b64 = _int16ToBase64(pcm16);
        try {
          ws.send(JSON.stringify({
            realtimeInput: { audio: { mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`, data: b64 } },
          }));
        } catch (e2) { /* socket likely closing; ignore */ }
      };
    }

    async function connect() {
      // Start the 9-minute safety cap from the moment the call is initiated
      // (not from when the socket finishes connecting), so the trainee-facing
      // call duration is predictable regardless of connection latency.
      durationTimer = setTimeout(() => {
        if (stopped) return;
        _log('reached the 9-minute call cap — wrapping up before Google\'s ~10-minute connection recycle');
        if (onStateChange) onStateChange('time-limit'); // fire before stop() flips `stopped`, so this isn't swallowed by setState's guard
        stop();
      }, MAX_CALL_MS);

      try {
        setState('connecting');
        const token = await _getEphemeralToken(systemInstruction);
        if (stopped) return;

        // NOTE (2026-09-19): the plain "BidiGenerateContent" method rejects
        // an ephemeral token with a 1008 close ("Method doesn't allow
        // unregistered callers"). Ephemeral tokens are only accepted by the
        // "Constrained" variant of this method — confirmed by testing
        // directly against the live API, which returned a real
        // `setupComplete` only once this suffix was added. This also
        // happens to be Google's documented secure pattern for a
        // browser-exposed token, since the Constrained endpoint won't let
        // the client override session config the server-side token was
        // scoped to.
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          _log('socket open, sending setup');
          if (stopped) { ws.close(); return; }
          ws.send(JSON.stringify({
            setup: {
              model: MODEL,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
                // Lowered from the (implicit ~1.0) default -- reported failure
                // mode was the model ignoring a caller's fixed, verbatim
                // script/systemInstruction and inventing its own unrelated
                // scenario or breaking role entirely. A lower temperature
                // trades away some of the phrasing variety the prompts ask
                // for (e.g. varied acknowledgment lines) for closer
                // adherence to the given script -- the right direction for
                // every caller of this shared module (Paper Trade, Red Pen,
                // and the trainee's Voice AI Mock Call all give it a fixed
                // brief it's meant to follow, not to improvise beyond).
                // Not a guaranteed fix: a live model can still drift.
                temperature: 0.4,
              },
              systemInstruction: { parts: [{ text: systemInstruction }] },
              realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }));
        };

        ws.onmessage = async (event) => {
          try {
            const text = (event.data instanceof Blob) ? await event.data.text() : event.data;
            const msg = JSON.parse(text);
            handleServerMessage(msg);
          } catch (e) {
            _warn('could not parse server message', e);
          }
        };

        ws.onerror = (e) => {
          _warn('WebSocket error', e);
          if (onError && !stopped) onError(new Error('Voice AI connection error — check the browser console for details'));
        };

        ws.onclose = (e) => {
          _log('socket closed', e.code, e.reason);
          if (!stopped) setState('ended');
        };

        await startMicCapture(); // also starts the recording tap once the mic side is ready — see startMicCapture()
      } catch (e) {
        _warn('connect() failed', e);
        setState('error');
        if (onError) onError(e);
      }
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (durationTimer) { clearTimeout(durationTimer); durationTimer = null; }
      // Stop the recorder first so it flushes whatever's been captured so
      // far, before the audio sources it depends on (mic track, playback
      // context) get torn down below.
      try { if (recMediaRecorder && recMediaRecorder.state !== 'inactive') recMediaRecorder.stop(); } catch (_) {}
      try { if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close(); } catch (_) {}
      try { if (processorNode) { processorNode.onaudioprocess = null; processorNode.disconnect(); } } catch (_) {}
      try { if (sourceNode) sourceNode.disconnect(); } catch (_) {}
      try { if (silentGain) silentGain.disconnect(); } catch (_) {}
      try { if (micRecordDest) micRecordDest.disconnect(); } catch (_) {}
      try { if (micCtx) micCtx.close(); } catch (_) {}
      try { if (playbackCtx) playbackCtx.close(); } catch (_) {}
      if (micStream) micStream.getTracks().forEach(t => t.stop());
    }

    connect();
    return { stop, getRecording };
  }

  // ==========================================================================
  //  Gemini text-generation employee turn — added 2026-09-20 for Red Pen.
  //
  //  This is a deliberately DIFFERENT, much simpler code path from startCall()
  //  above: one scoped request/response text completion per conversational
  //  turn, not a continuous audio WebSocket. Red Pen needs the employee to
  //  react authentically to whatever the manager actually said, so a fully
  //  fixed script (the fix used for Paper Trade) doesn't fit here — but a
  //  single short generateContent call, grounded on every turn by the same
  //  strict persona + situation + conversation-so-far, is far easier to keep
  //  on-script than the continuous Live/duplex model, which is what actually
  //  drifted (role reversal, script abandonment, language switching) in
  //  testing for Paper Trade and Red Pen's own Gemini Live (Beta) option
  //  above. The manager's spoken response is still captured and transcribed
  //  the normal way (Recorder + SpeechEngine, in manager-app.js) — only the
  //  employee's reply text is generated here; it's then spoken with
  //  ElevenLabs TTS via the Worker's existing /tts route, exactly like Paper
  //  Trade's _speakPtCustomer.
  //
  //  Routed through the Worker's /gemini-generate route (see worker.js) so
  //  GEMINI_API_KEY never reaches the browser — same reasoning as the
  //  /live-token route used by startCall() above.
  // ==========================================================================
  const TEXT_MODEL = 'models/gemini-3.6-flash'; // was gemini-2.5-flash -- Google retired it for new usage (2026-09-20), see worker.js's GEMINI_TEXT_MODEL for the matching server-side default

  function _generateUrl() {
    const base = (typeof CONFIG !== 'undefined' && CONFIG.CLAUDE_PROXY_URL) || '';
    if (!base) return '';
    return base.replace(/\/+$/, '') + '/gemini-generate';
  }

  function isTextAvailable() {
    const url = _generateUrl();
    return !!url && !url.includes('YOUR_WORKER');
  }

  // Mirrors ClaudeEvaluator.callAiEmployee's signature exactly (see
  // js/claude.js) so the two are interchangeable at the call site in
  // manager-app.js's _endManagerFbTurn().
  async function callEmployeeTurn(scenario, empName, empPersona, messages, turnNumber, maxTurns) {
    const url = _generateUrl();
    if (!url) throw new Error('Gemini text-generation proxy not configured');

    const isLast = turnNumber >= maxTurns;
    const system = `You are roleplaying as ${empName}, an employee in a one-on-one feedback conversation with your manager.

SITUATION: ${scenario}

YOUR CHARACTER: ${empPersona}

HOW TO BEHAVE:
- React authentically based on HOW the manager delivers feedback, exactly as your character description above directs.
- Show realistic emotional progression — don't change stance too suddenly.
- React specifically to what the manager just said — don't repeat yourself.${isLast ? `\n- This is the FINAL turn (${turnNumber} of ${maxTurns}). Give a realistic closing line — partially accepting, resistant-but-polite, or genuinely receptive, depending on how the conversation went.` : ''}

ABSOLUTE RULES:
- Stay in character as ${empName} for the entire reply — never break the fourth wall, never mention that you are an AI, a model, a script, grading, evaluation criteria, or a training exercise.
- Speak ONLY in English, regardless of what language the manager used.
- Reply in 2-4 sentences MAXIMUM — short, real, conversational.
- Do NOT narrate, add stage directions, or start with your own name.
- Return ONLY the employee's spoken dialogue, nothing else.`;

    const contents = messages.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:           TEXT_MODEL,
        system,
        contents,
        temperature:     0.5,
        // Raised from 200 -- was leaving almost no budget for the actual
        // reply once the model's internal "thinking" pass ate into it (see
        // worker.js's /gemini-generate handler, which now also disables
        // thinking outright via thinkingConfig.thinkingBudget: 0). Keeping
        // this higher too is just a safety margin in case that budget is
        // ever re-enabled server-side.
        maxOutputTokens: 350,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error ${resp.status}`);
    }
    const data = await resp.json();
    // Concatenate every non-"thought" text part rather than trusting
    // parts[0] alone -- when a model does emit thinking output alongside
    // its answer, the answer isn't always the first part, and grabbing only
    // parts[0] is what produced garbled, mid-sentence fragments (e.g.
    // ", double down on being 'the") that were actually a truncated thought
    // segment, not the employee's real line.
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts;
    const text = Array.isArray(parts)
      ? parts.filter(p => p && p.text && !p.thought).map(p => p.text).join(' ').trim()
      : '';
    if (!text) throw new Error('Gemini returned no text');
    return text.trim();
  }

  // ---- Paper Trade's per-turn AI customer (fixed question list, reactive) ---
  // Added 2026-09-20. Mirrors callEmployeeTurn above exactly (same
  // /gemini-generate route, same thinking-disabled/maxOutputTokens-350
  // server config, same multi-part text extraction) but for Paper Trade's
  // "normal" (non-Live-duplex) recorded flow: the manager-supplied question
  // list is fixed and must be asked in order, but the customer should react
  // to what the manager actually said on the previous turn before asking
  // the next required question, instead of always prepending one of a
  // handful of canned transition phrases regardless of the answer. This is
  // a separate function from callEmployeeTurn (Red Pen) on purpose, so Red
  // Pen's prompt/behaviour is completely untouched by this addition.
  //   background   — the scenario's background context (string)
  //   nextQuestion — the exact next question from the manager's fixed list
  //   messages     — [{role:'assistant'|'user', content}] turn history so far
  //   turnNumber, maxTurns — 1-based current turn / total questions
  async function callCustomerTurn(background, nextQuestion, messages, turnNumber, maxTurns) {
    const url = _generateUrl();
    if (!url) throw new Error('Gemini text-generation proxy not configured');

    const isLast = turnNumber >= maxTurns;
    const system = `You are roleplaying as a customer calling Zerodha's support line, working through a fixed set of questions with the support manager you're speaking to.

BACKGROUND (for your own understanding only — never say this aloud): ${background}

YOU MUST ASK THIS EXACT QUESTION NEXT (question ${turnNumber} of ${maxTurns}) — adapt it only lightly into natural spoken language, keeping its exact specific point/complaint intact; do not skip it, do not merge it with another question, do not invent a different question: "${nextQuestion}"

HOW TO RESPOND:
- First, react specifically to what the manager just said in their last reply — a short, natural spoken acknowledgment (a few words to one short sentence) that shows you actually listened (for example: "I hear what you're saying, but..." / "Okay, fair enough — let me ask you this..." / "Right, well here's the thing..." — vary the phrasing each time, never repeat the same one twice).
- Then ask the required question above, keeping its specific point intact.${isLast ? `\n- This is your FINAL question (${turnNumber} of ${maxTurns}). After asking it, do not add anything else.` : ''}

RULES:
- You are the CUSTOMER — stay in character at all times, never break the fourth wall, never mention that you are an AI, a script, grading, evaluation criteria, or a training exercise.
- Speak ONLY in English.
- Reply in 2-4 sentences MAXIMUM — short, real, conversational.
- Do NOT narrate or add stage directions.
- Return ONLY the customer's spoken dialogue, nothing else.`;

    const contents = messages.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:           TEXT_MODEL,
        system,
        contents,
        temperature:     0.5,
        maxOutputTokens: 350,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error ${resp.status}`);
    }
    const data = await resp.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts;
    const text = Array.isArray(parts)
      ? parts.filter(p => p && p.text && !p.thought).map(p => p.text).join(' ').trim()
      : '';
    if (!text) throw new Error('Gemini returned no text');
    return text.trim();
  }

  // ---- The Mirror Room's per-turn AI counterpart (EQ roleplay) ---
  // Added 2026-09-20, completing the Mirror Room conversion to voice --
  // manager-app.js's _endManagerEqTurn already calls this (and its Claude
  // fallback, callAiEqTurn, in js/claude.js) but neither existed yet. A
  // separate function from callEmployeeTurn (Red Pen) and callCustomerTurn
  // (Paper Trade) on purpose, so neither of those is touched by this
  // addition. Mirror Room's counterparts aren't always a direct report in a
  // feedback conversation -- they can be a junior dealer, a client, a peer
  // -- so the wording here is intentionally generic to "a counterpart in a
  // real-time workplace situation" rather than assuming a feedback frame.
  async function callEqTurn(scenario, cpName, cpPersona, messages, turnNumber, maxTurns) {
    const url = _generateUrl();
    if (!url) throw new Error('Gemini text-generation proxy not configured');

    const isLast = turnNumber >= maxTurns;
    const system = `You are roleplaying as ${cpName}, a counterpart of the manager's in a real-time workplace situation.

SITUATION: ${scenario}

YOUR CHARACTER: ${cpPersona}

HOW TO BEHAVE:
- React authentically and specifically to what the manager just said or did, exactly as your character description above directs.
- Show realistic emotional progression -- don't change stance too suddenly.
- Don't repeat yourself.${isLast ? `\n- This is the FINAL turn (${turnNumber} of ${maxTurns}). Give a realistic closing line that reflects how the manager handled the situation overall.` : ''}

ABSOLUTE RULES:
- Stay in character as ${cpName} for the entire reply -- never break the fourth wall, never mention that you are an AI, a model, a script, grading, evaluation criteria, or a training exercise.
- Speak ONLY in English, regardless of what language the manager used.
- Reply in 2-4 sentences MAXIMUM -- short, real, conversational.
- Do NOT narrate, add stage directions, or start with your own name.
- Return ONLY the counterpart's spoken dialogue, nothing else.`;

    const contents = messages.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:           TEXT_MODEL,
        system,
        contents,
        temperature:     0.5,
        maxOutputTokens: 350,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error ${resp.status}`);
    }
    const data = await resp.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts;
    const text = Array.isArray(parts)
      ? parts.filter(p => p && p.text && !p.thought).map(p => p.text).join(' ').trim()
      : '';
    if (!text) throw new Error('Gemini returned no text');
    return text.trim();
  }

  return { isAvailable, startCall, isTextAvailable, callEmployeeTurn, callCustomerTurn, callEqTurn };
})();
