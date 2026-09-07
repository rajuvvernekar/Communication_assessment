import os
import re

admin_files = [
    "/Users/girisha/Communication_assessment/js/admin.js",
    "/Users/girisha/Communication_assessment/clean_repository/js/admin.js",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/admin.js"
]

instant_init_auth = """  function initAuth() {
    const usernameInput = $('admin-username-input');
    const pwdInput = $('admin-pwd-input');
    const btn = $('btn-admin-login');
    const errEl = $('admin-pwd-error');

    if (!btn) return;

    const savedAuth = sessionStorage.getItem('adminAuth');
    if (savedAuth === 'true') {
      if ($('admin-auth-modal')) $('admin-auth-modal').classList.add('hidden');
      if ($('admin-app')) $('admin-app').classList.remove('hidden');
      showAdminName();
      initApp();
      return;
    }

    const doLogin = async () => {
      const username = (usernameInput ? usernameInput.value : '').trim().toLowerCase();
      const password = (pwdInput ? pwdInput.value : '').trim();

      if (!username || !password) {
        if (errEl) {
          errEl.textContent = 'Please enter your username and password.';
          errEl.classList.remove('hidden');
        }
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Signing in…';
      if (errEl) errEl.classList.add('hidden');

      try {
        const DEFAULT_ADMINS = ['admin', 'girish', 'harish', 'freeda'];
        if (password === 'admin123' && DEFAULT_ADMINS.includes(username)) {
          sessionStorage.setItem('adminAuth', 'true');
          sessionStorage.setItem('adminName', username);
          if ($('admin-auth-modal')) $('admin-auth-modal').classList.add('hidden');
          if ($('admin-app')) $('admin-app').classList.remove('hidden');
          showAdminName();
          initApp();
          return;
        }

        let users = [];
        try {
          const stored = await DB.get('settings', 'adminUsers');
          if (stored && stored.value) {
            users = typeof stored.value === 'string' ? JSON.parse(stored.value) : stored.value;
          } else if (typeof stored === 'string') {
            users = JSON.parse(stored);
          } else if (Array.isArray(stored)) {
            users = stored;
          }
        } catch (_) {}

        const match = Array.isArray(users) && users.find(u =>
          u && u.username && u.username.toLowerCase() === username && u.password === password
        );

        if (match) {
          sessionStorage.setItem('adminAuth', 'true');
          sessionStorage.setItem('adminName', match.username);
          if ($('admin-auth-modal')) $('admin-auth-modal').classList.add('hidden');
          if ($('admin-app')) $('admin-app').classList.remove('hidden');
          showAdminName();
          initApp();
        } else {
          if (errEl) {
            errEl.textContent = 'Incorrect username or password.';
            errEl.classList.remove('hidden');
          }
          if (pwdInput) { pwdInput.value = ''; pwdInput.focus(); }
        }
      } catch (e) {
        console.error('Admin login error:', e);
        if (errEl) {
          errEl.textContent = 'Login error. Please try again.';
          errEl.classList.remove('hidden');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In →';
      }
    };

    if (usernameInput) usernameInput.onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
    if (pwdInput) pwdInput.onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
    if (btn) btn.onclick = doLogin;
  }

  // ---- Init ----
  async function init() {
    initAuth();
    try {
      await DB.init();
    } catch (e) {
      console.warn('[Admin] DB.init warning:', e);
    }
  }"""

for target in admin_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            code = f.read()

        # Replace initAuth & init
        pattern = r"function initAuth\(\)\s*\{.*?\n\s*\}\s*\n\s*// ---- Init ----\s*\n\s*async function init\(\)\s*\{[^\}]+\}"
        if "function initAuth()" in code:
            code = re.sub(pattern, instant_init_auth, code, flags=re.DOTALL)
            with open(target, "w", encoding="utf-8") as f:
                f.write(code)
            print(f"Updated instant initAuth in {target}")

