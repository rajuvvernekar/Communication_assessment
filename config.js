'use strict';

// ============================================================
//  CommAssess — Configuration
//  Fill in your own values after completing the setup guide.
// ============================================================
const CONFIG = {
  // 1. Supabase — get these from https://supabase.com → Project Settings → API
  SUPABASE_URL: 'https://kkyrrxubielpxiwjilio.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_2tj0JGEJGNbqTx5pzZXXng_-fNpeVyq',

  // 2. Cloudflare Worker — URL of your deployed worker (Step 3 in setup guide)
  //    Leave empty string '' to disable AI scoring (JS phrase analysis fallback is used)
  CLAUDE_PROXY_URL: 'https://commassess-claude.rajuvvernekar.workers.dev',
};
