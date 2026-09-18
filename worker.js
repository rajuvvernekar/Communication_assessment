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
 *   POST /tts          → ElevenLabs TTS (returns audio/mpeg)
 *   POST /live-token   → mints a short-lived Gemini Live API token so the
 *                        browser can open its own WebSocket straight to
 *                        Google without ever seeing GEMINI_API_KEY itself.
 *                        See https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
 *
 * NOTE ON GEMINI_API_KEY: never paste a real key into this file or into any
 * chat/file that ends up in git — it belongs ONLY in this Worker's own
 * Settings → Variables & Secrets panel, entered directly by you. If a key
 * was ever pasted anywhere else (a chat, a text file, a screenshot), treat
 * it as compromised and generate a fresh one in Google AI Studio instead.
 */

const ANTHROPIC_API        = 'https://api.anthropic.com/v1/messages';
const ELEVENLABS_VOICE     = 'ErXwobaYiN019PkySvjV'; // Antoni — warm, natural male
const GEMINI_TOKEN_API     = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const GEMINI_LIVE_MODEL    = 'models/gemini-3.8-live';

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

      let body;
      try { body = await request.text(); } catch { return new Response('Bad Request', { status: 400 }); }

      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key':   env.ELEVENLABS_API_KEY,
            'Accept':        'audio/mpeg',
          },
          body,
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
          liveConnectConstraints: {
            model: GEMINI_LIVE_MODEL,
            config: { responseModalities: ['AUDIO'] },
          },
        }),
      });

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
