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
const GEMINI_TEXT_MODEL    = 'models/gemini-2.5-flash'; // plain text generateContent -- NOT a Live model id

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
    // js/gemini-live.js's callEmployeeTurn): each call is one short, tightly
    // scoped completion grounded by the persona + conversation so far, kept
    // server-side so GEMINI_API_KEY never reaches the browser.
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
              maxOutputTokens: payload.maxOutputTokens || 200,
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
