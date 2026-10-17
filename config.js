'use strict';

// ============================================================
//  CommAssess — Configuration
//  Fill in your own values after completing the setup guide.
// ============================================================
const CONFIG = {
  // 1. Supabase — get these from https://supabase.com → Project Settings → API
  SUPABASE_URL: 'https://idfusdrqdntjynjysgvz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkZnVzZHJxZG50anluanlzZ3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMDg1MzYsImV4cCI6MjEwNzc4NDUzNn0.uWpGMh7DC0usLVimp0Xa4vrT_tI0CeZ1gR9coDOgJhs',

  // 2. Cloudflare Worker — URL of your deployed worker (Step 3 in setup guide)
  //    Leave empty string '' to disable AI scoring (JS phrase analysis fallback is used)
  CLAUDE_PROXY_URL: 'https://commassess-claude.rajuvvernekar.workers.dev',
};
