'use strict';

// ============================================================
//  CommAssess — Configuration
//  Backend: Frappe (training360.nvi.frappe.cloud)
// ============================================================
const CONFIG = {
  // 1. Frappe site — the live site the app talks to.
  FRAPPE_SITE_URL: 'https://training360.nvi.frappe.cloud',

  // 2. Frappe API key/secret — ONLY needed for calls made with elevated
  //    (non-guest) access; trainee-facing reads/writes run allow_guest
  //    server-side, same trust model as the old Supabase anon key.
  //    ⚠️ Do NOT put your real API secret here if this file is served
  //    publicly (e.g. GitHub Pages) — anyone viewing page source could
  //    read it and use it to write to your Frappe site. See the note
  //    I'll send separately about safer options before filling these in.
  FRAPPE_API_KEY: '',
  FRAPPE_API_SECRET: '',

  // 3. Cloudflare Worker — URL of your deployed worker (AI scoring proxy)
  //    Leave empty string '' to disable AI scoring (JS phrase analysis fallback is used)
  CLAUDE_PROXY_URL: 'https://commassess-claude.rajuvvernekar.workers.dev',
};
