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

  async function _getEphemeralToken() {
    const resp = await fetch(_tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL }),
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
    let nextPlayTime = 0;
    let stopped = false;
    let setupDone = false;

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
      }
      const int16 = _base64ToInt16(base64Data);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

      const buffer = playbackCtx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
      buffer.copyToChannel(float32, 0);
      const src = playbackCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(playbackCtx.destination);
      const startAt = Math.max(playbackCtx.currentTime, nextPlayTime);
      src.start(startAt);
      nextPlayTime = startAt + buffer.duration;
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
      try {
        setState('connecting');
        const token = await _getEphemeralToken();
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

        await startMicCapture();
      } catch (e) {
        _warn('connect() failed', e);
        setState('error');
        if (onError) onError(e);
      }
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      try { if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close(); } catch (_) {}
      try { if (processorNode) { processorNode.onaudioprocess = null; processorNode.disconnect(); } } catch (_) {}
      try { if (sourceNode) sourceNode.disconnect(); } catch (_) {}
      try { if (silentGain) silentGain.disconnect(); } catch (_) {}
      try { if (micCtx) micCtx.close(); } catch (_) {}
      try { if (playbackCtx) playbackCtx.close(); } catch (_) {}
      if (micStream) micStream.getTracks().forEach(t => t.stop());
    }

    connect();
    return { stop };
  }

  return { isAvailable, startCall };
})();
