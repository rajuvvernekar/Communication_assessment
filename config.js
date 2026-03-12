'use strict';

// ============================================================
//  CommAssess — Configuration
//  Fill in your own values after completing the setup guide.
// ============================================================
const CONFIG = {
  // 1. Supabase — get these from https://supabase.com → Project Settings → API
  SUPABASE_URL: 'https://xnsmsrjbfjjzivuvicko.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuc21zcmpiZmpqeml2dXZpY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzU4NTcsImV4cCI6MjA4ODgxMTg1N30.4WDDkA4JIQdjTNx1xq4DxKIUj1TXcJNZfLOi70QNDpc',

  // 2. Cloudflare Worker — URL of your deployed worker (Step 3 in setup guide)
  //    Leave empty string '' to disable AI scoring (JS phrase analysis fallback is used)
  CLAUDE_PROXY_URL: 'https://commassess-claude.rajuvvernekar.workers.dev',
};
