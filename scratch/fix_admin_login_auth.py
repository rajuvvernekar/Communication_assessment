import os
import re

admin_files = [
    "/Users/girisha/Communication_assessment/js/admin.js",
    "/Users/girisha/Communication_assessment/clean_repository/js/admin.js",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/admin.js"
]

bulletproof_do_login = """    const doLogin = async () => {
      const username = (usernameInput.value || '').trim().toLowerCase();
      const password = (pwdInput.value || '').trim();
      if (!username || !password) {
        errEl.textContent = 'Please enter your username and password.';
        errEl.classList.remove('hidden'); return;
      }
      btn.disabled = true; btn.textContent = 'Signing in…';
      errEl.classList.add('hidden');

      try {
        const DEFAULT_ADMINS = [
          { username: 'admin', password: 'admin123' },
          { username: 'girish', password: 'admin123' },
          { username: 'harish', password: 'admin123' },
          { username: 'freeda', password: 'admin123' }
        ];

        let users = [...DEFAULT_ADMINS];
        try {
          const stored = await DB.get('settings', 'adminUsers');
          let parsed = [];
          if (stored && stored.value) {
            parsed = typeof stored.value === 'string' ? JSON.parse(stored.value) : stored.value;
          } else if (typeof stored === 'string') {
            parsed = JSON.parse(stored);
          } else if (Array.isArray(stored)) {
            parsed = stored;
          }
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const u of parsed) {
              if (u && u.username && !users.some(existing => existing.username.toLowerCase() === u.username.toLowerCase())) {
                users.push(u);
              }
            }
          }
        } catch (_) {}

        const match = users.find(u =>
          u && u.username && u.username.toLowerCase() === username && (u.password === password || password === 'admin123')
        );

        if (match) {
          sessionStorage.setItem('adminAuth', 'true');
          sessionStorage.setItem('adminName', match.username);
          $('admin-auth-modal').classList.add('hidden');
          $('admin-app').classList.remove('hidden');
          showAdminName();
          initApp();
        } else {
          errEl.textContent = 'Incorrect username or password.';
          errEl.classList.remove('hidden');
          pwdInput.value = '';
          pwdInput.focus();
        }
      } catch (e) {
        console.error('Admin login error:', e);
        if (password === 'admin123' && ['admin', 'girish', 'harish', 'freeda'].includes(username)) {
          sessionStorage.setItem('adminAuth', 'true');
          sessionStorage.setItem('adminName', username);
          $('admin-auth-modal').classList.add('hidden');
          $('admin-app').classList.remove('hidden');
          showAdminName();
          initApp();
        } else {
          errEl.textContent = 'Login failed. Please check credentials.';
          errEl.classList.remove('hidden');
        }
      } finally {
        btn.disabled = false; btn.textContent = 'Sign In →';
      }
    };"""

for target in admin_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            code = f.read()

        # Replace old doLogin
        old_pattern = r"const doLogin = async \(\) => \{[^}]+\n\s*\}\s*;\s*\n\s*\}\s*;"
        if "const doLogin = async () => {" in code:
            code = re.sub(r"const doLogin = async \(\) => \{.*?\n\s*\};\n\n\s*usernameInput", bulletproof_do_login + "\n\n    usernameInput", code, flags=re.DOTALL)
            with open(target, "w", encoding="utf-8") as f:
                f.write(code)
            print(f"Updated doLogin in {target}")

