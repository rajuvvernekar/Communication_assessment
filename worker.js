/**
 * CommAssess — Cloudflare Worker: Claude API Proxy + ElevenLabs TTS Proxy
 *
 * Deploy steps (free, ~5 minutes):
 *  1. Sign up at https://dash.cloudflare.com  (free account)
 *  2. Workers & Pages → Create → Worker → name it "commassess-claude"
 *  3. Paste this file into the editor and click Deploy
 *  4. Settings → Variables & Secrets → add Secrets:
 *       Name:  CLAUDE_API_KEY       Value: sk-ant-api03-...  (your Anthropic key)
 *       Name:  ELEVENLABS_API_KEY   Value: (your ElevenLabs key)
 *  5. Copy the worker URL (e.g. https://commassess-claude.YOURNAME.workers.dev)
 *     and paste it into config.js → CLAUDE_PROXY_URL
 *
 * Routes:
 *   POST /        → Anthropic Claude API (existing)
 *   POST /tts     → ElevenLabs TTS (returns audio/mpeg)
 */

const ANTHROPIC_API      = 'https://api.anthropic.com/v1/messages';
const ELEVENLABS_VOICE   = 'pNInz6obpgDQGcFmaJgB'; // Adam — deep, professional male

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
