/**
 * CommAssess — Cloudflare Worker: Claude API Proxy + ElevenLabs TTS Proxy
 *                                 + Gemini Live ephemeral token minting
 *
 * Deploy steps (free, ~5 minutes):
 *  1. Sign up at https://dash.cloudflare.com  (free account)
 *  2. Workers & Pages → Create → Worker → name it "commassess-claude"
 *  3. Paste this file into the editor and click Deploy
 *  4. Settings → Variables & Secrets → add Secrets:
 *       Name:  CLAUDE_API_KEY       Value: sk-ant-api03-...  (your Anthropic key)
 *       Name:  ELEVENLABS_API_KEY   Value: (your ElevenLabs key)
 *       Name:  GEMINI_API_KEY       Value: (your Google AI / Gemini key, for
 *                                          the Voice AI (Beta) mode — see
 *                                          js/gemini-live.js on the client)
 *  5. Copy the worker URL (e.g. https://commassess-claude.YOURNAME.workers.dev)
 *     and paste it into config.js → CLAUDE_PROXY_URL
 *
 * Routes:
 *   POST /             → Anthropic Claude API (existing)
 *   POST /tts          → ElevenLabs TTS (returns audio/mpeg). Accepts an
 *                        optional "voice_id" field in the JSON body to
 *                        override the default voice per request (added
 *                        2026-09-20 for Red Pen's male/female employee
 *                        personas — see js/manager-app.js's
 *                        _speakFeedbackEmployee); omit it to get the
 *                        Worker-wide default voice below, unchanged for
 *                        every existing caller.
 *   POST /gemini-tts   → Gemini native TTS (returns audio/wav). Added
 *                        2026-09-24 as the new PRIMARY voice for every
 *                        call/conversation module (Red Pen, Mirror Room,
 *                        Mock Call, Paper Trade) after the ElevenLabs
 *                        account ran out of credits — see each client call
 *                        site's fallback chain: Gemini TTS → ElevenLabs →
 *                        browser speechSynthesis. Accepts an optional
 *                        "voice_name" field (a Gemini prebuilt voice, e.g.
 *                        "Kore"/"Puck") and optional "model" override.
 *   POST /live-token   → mints a short-lived Gemini Live API token so the
 *                        browser can open its own WebSocket straight to
 *                        Google without ever seeing GEMINI_API_KEY itself.
 *                        See https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
 *   POST /gemini-generate → single-shot Gemini text generation (NOT the
 *                        Live/duplex API above) — added 2026-09-20 for Red
 *                        Pen's per-turn employee replies (see
 *                        js/gemini-live.js's callEmployeeTurn). Keeps
 *                        GEMINI_API_KEY server-side exactly like /live-token.
 *
 * NOTE ON GEMINI_API_KEY: never paste a real key into this file or into any
 * chat/file that ends up in git — it belongs ONLY in this Worker's own
 * Settings → Variables & Secrets panel, entered directly by you. If a key
 * was ever pasted anywhere else (a chat, a text file, a screenshot), treat
 * it as compromised and generate a fresh one in Google AI Studio instead.
 */

const ANTHROPIC_API        = 'https://api.anthropic.com/v1/messages';
const ELEVENLABS_VOICE     = 'EXAVITQu4vr4xnSDxMaL'; // Bella — natural, warm female (usable on Free plan; Rachel is API-gated to paid plans)
const GEMINI_TOKEN_API     = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const GEMINI_LIVE_MODEL    = 'models/gemini-3.8-live';
const GEMINI_GENERATE_API  = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TEXT_MODEL    = 'models/gemini-3.6-flash'; // plain text generateContent -- NOT a Live model id. Was gemini-2.5-flash, which Google retired for new usage (2026-09-20: /gemini-generate started 404ing with 'no longer available to new users, use models/gemini-3.6-flash')
const GEMINI_TTS_MODEL     = 'gemini-3.8-flash-tts';    // native single-shot TTS (2026-09-24) -- replaces ElevenLabs as the primary voice once its account ran out of credits
const GEMINI_TTS_VOICE     = 'Kore';                    // default prebuilt voice when a caller doesn't ask for a specific one
const GEMINI_TTS_SAMPLE_RATE = 24000;                   // Gemini TTS's fixed PCM output rate when the response's mimeType doesn't spell one out

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // ---- CORS preflight ----
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // ---- ElevenLabs TTS route (/tts) ----
    if (url.pathname.endsWith('/tts')) {
      if (!env.ELEVENLABS_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: 'ELEVENLABS_API_KEY secret not set on the Worker.' } }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      let payload;
      try { payload = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

      // Optional per-request voice override (added 2026-09-20 for Red Pen --
      // see the route comment at the top of this file). Not forwarded to
      // ElevenLabs itself since it's not one of their request fields.
      const voiceId = payload.voice_id || ELEVENLABS_VOICE;
      delete payload.voice_id;

      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key':   env.ELEVENLABS_API_KEY,
            'Accept':        'audio/mpeg',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!upstream.ok) {
        const err = await upstream.text();
        return new Response(err, {
          status: upstream.status,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const audioData = await upstream.arrayBuffer();
      return new Response(audioData, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg', ...CORS_HEADERS },
      });
    }

    // ---- Gemini native TTS route (/gemini-tts) ----
    // Single-shot text -> speech via Gemini's own TTS model, kept
    // server-side so GEMINI_API_KEY never reaches the browser (same
    // reasoning as /live-token and /gemini-generate below). Added
    // 2026-09-24 to replace ElevenLabs as the primary voice for every
    // call/conversation module once that account ran out of credits --
    // each client call site tries this route first and only falls back to
    // /tts (ElevenLabs) if this fails.
    if (url.pathname.endsWith('/gemini-tts')) {
      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: 'GEMINI_API_KEY secret not set on the Worker.' } }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      let payload;
      try { payload = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      if (!payload.text) return new Response('Bad Request: "text" is required', { status: 400 });

      const model     = payload.model || GEMINI_TTS_MODEL;
      const voiceName = payload.voice_name || GEMINI_TTS_VOICE;

      const upstream = await fetch(
        `${GEMINI_GENERATE_API}/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: payload.text }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        }
      );

      if (!upstream.ok) {
        const err = await upstream.text();
        return new Response(err, {
          status: upstream.status,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      let data;
      try { data = await upstream.json(); }
      catch {
        return new Response(
          JSON.stringify({ error: { message: 'Gemini TTS returned a non-JSON response.' } }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inline || !inline.data) {
        return new Response(
          JSON.stringify({ error: { message: 'Gemini TTS response had no audio data.' } }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      // Gemini's TTS models return raw 16-bit PCM with no container (unlike
      // ElevenLabs' /tts route above, which already returns a playable MP3
      // file) -- an <audio> element can't play raw PCM directly, so wrap it
      // in a minimal WAV header here, once, server-side, rather than
      // teaching every client call site to do it.
      const sampleRate = _pcmSampleRateFromMimeType(inline.mimeType) || GEMINI_TTS_SAMPLE_RATE;
      const wavBytes = _pcmToWav(_base64ToBytes(inline.data), sampleRate);

      return new Response(wavBytes, {
        status: 200,
        headers: { 'Content-Type': 'audio/wav', ...CORS_HEADERS },
      });
    }

    // ---- Gemini Live ephemeral token route (/live-token) ----
    // Mints a short-lived, single-use token scoped to the Live API so the
    // browser can connect directly to Google's WebSocket endpoint without
    // GEMINI_API_KEY itself ever reaching client-side code.
    if (url.pathname.endsWith('/live-token')) {
      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: 'GEMINI_API_KEY secret not set on the Worker.' } }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      let body = {};
      try { body = await request.json(); } catch (_) { /* no body sent -- systemInstruction stays unset */ }

      const now = Date.now();
      const expireTime = new Date(now + 30 * 60 * 1000).toISOString();            // token itself valid 30 min
      const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();   // must open the session within 2 min

      // NOTE (2026-09-19): Google's own ephemeral-tokens guide shows this
      // constrained under a "liveConnectConstraints" field, but the live API
      // actually rejects that field name ("Unknown name liveConnectConstraints
      // at 'auth_token'") — confirmed by testing against the real endpoint.
      // The AuthToken resource's real REST field (per
      // https://ai.google.dev/api/rest/v1beta/AuthToken) is
      // "bidiGenerateContentSetup", taking a full BidiGenerateContentSetup
      // object — the same shape used for the WebSocket setup message in
      // gemini-live.js. Trust this over the guide's example if Google's docs
      // drift again.
      const upstream = await fetch(GEMINI_TOKEN_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          uses: 1,
          expireTime,
          newSessionExpireTime,
          bidiGenerateContentSetup: {
            model: GEMINI_LIVE_MODEL,
            generationConfig: { responseModalities: ['AUDIO'] },
            // Added 2026-09-20: the client (gemini-live.js) now sends the
            // roleplay persona/scenario brief as `system` in the token
            // request body so it can be baked into the token itself. This
            // matters because ephemeral tokens minted via the "Constrained"
            // BidiGenerateContent variant scope the session to the config
            // present in the token at mint time -- a systemInstruction the
            // client only sends later, in its own WebSocket `setup` message,
            // is not honoured by that variant (confirmed: Red Pen's Voice AI
            // (Beta) was falling back to a generic, un-scripted persona
            // because the token carried no systemInstruction at all, even
            // though the client's ws setup message included one).
            systemInstruction: body.system ? { parts: [{ text: body.system }] } : undefined,
          },
        }),
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // ---- Gemini text-generation route (/gemini-generate) ----
    // A single-shot generateContent call -- NOT the Live/bidi WebSocket API
    // above. Added 2026-09-20 for Red Pen's per-turn employee replies (see
    // js/gemini-live.js's callEmployeeTurn); reused as-is (unchanged here)
    // from 2026-09-20 onward by Paper Trade's per-turn AI customer too (see
    // js/gemini-live.js's callCustomerTurn) -- each call is one short,
    // tightly scoped completion grounded by the persona/scenario +
    // conversation so far, kept server-side so GEMINI_API_KEY never reaches
    // the browser.
    if (url.pathname.endsWith('/gemini-generate')) {
      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: 'GEMINI_API_KEY secret not set on the Worker.' } }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }

      let payload;
      try { payload = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

      const model = payload.model || GEMINI_TEXT_MODEL;
      const upstream = await fetch(
        `${GEMINI_GENERATE_API}/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: payload.contents,
            systemInstruction: payload.system ? { parts: [{ text: payload.system }] } : undefined,
            generationConfig: {
              temperature:     payload.temperature != null ? payload.temperature : 0.5,
              maxOutputTokens: payload.maxOutputTokens || 300,
              // Added 2026-09-20: this route's only caller (Red Pen's
              // per-turn employee reply, see js/gemini-live.js's
              // callEmployeeTurn) was coming back with short, garbled,
              // mid-sentence fragments (e.g. ", double down on being 'the").
              // Root cause: newer Gemini models spend part of
              // maxOutputTokens on an internal "thinking" pass before
              // writing the visible reply, so a small token budget (200)
              // was being eaten by that invisible reasoning, leaving almost
              // nothing left for the actual dialogue line. Turning thinking
              // off entirely is correct here -- this call only ever needs a
              // short, in-character line, not multi-step reasoning.
              thinkingConfig:  { thinkingBudget: 0 },
            },
          }),
        }
      );

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // ---- Claude API route (default) ----
    if (!env.CLAUDE_API_KEY) {
      return new Response(
        JSON.stringify({ error: { message: 'CLAUDE_API_KEY secret not set on the Worker.' } }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    let body;
    try {
      body = await request.text();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    const text = await upstream.text();

    return new Response(text, {
      status:  upstream.status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });
  },
};

// ---- Gemini TTS helpers (/gemini-tts route above) ----

function _base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function _pcmSampleRateFromMimeType(mimeType) {
  if (!mimeType) return null;
  const m = /rate=(\d+)/.exec(mimeType);
  return m ? parseInt(m[1], 10) : null;
}

// Wraps raw 16-bit mono PCM samples in a standard 44-byte WAV header so any
// <audio> element (and js/recorder.js's Recorder.addAudioSource, which taps
// an <audio> element's output into the saved recording) can play/capture it
// exactly like the ElevenLabs MP3s the rest of this Worker returns.
function _pcmToWav(pcmBytes, sampleRate, numChannels = 1, bitsPerSample = 16) {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate   = sampleRate * blockAlign;
  const dataSize   = pcmBytes.length;
  const buffer     = new ArrayBuffer(44 + dataSize);
  const view       = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);   // fmt chunk size
  view.setUint16(20, 1, true);    // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcmBytes);
  return buffer;
}
