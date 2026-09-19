'use strict';

// ============================================================
//  CommAssess — Authentication (Supabase Auth with LocalStorage fallback)
//  Uses Employee ID + Password. A synthetic email
//  ({employeeId}@commassess.internal) is used internally for
//  Supabase Auth — users never see or type their email.
// ============================================================

const Auth = (() => {
  let _user = null;

  const DOMAIN = 'commassess.internal';

  function _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function _toEmail(employeeId) {
    return `${employeeId.trim().toLowerCase()}@${DOMAIN}`;
  }

  // ---- Getters ----
  function isLoggedIn()    { return !!_user; }
  function getId()         { return _user?.id   || null; }
  function getEmail()      { return _user?.email || ''; }
  function getEmployeeId() { return _user?.user_metadata?.employee_id || _user?.email?.split('@')[0] || ''; }
  function getName()       {
    if (!_user) return '';
    return _user.user_metadata?.full_name || getEmployeeId();
  }

  // ---- Ensure the trainees row exists for the current _user ----
  async function _ensureTraineeRecord(empIdHint) {
    if (!_user) return;
    
    if (DB.isLocalStorage()) {
      const employeeId = (
        empIdHint
        || _user.user_metadata?.employee_id
        || _user.email?.split('@')[0]
        || ''
      ).trim();
      const name = _user.user_metadata?.full_name || employeeId;
      const row  = { id: _user.id, name, email: _user.email, employee_id: employeeId };
      await DB.put('trainees', row);
      return;
    }

    const sb = DB.getClient();
    if (!sb) return;

    const employeeId = (
      empIdHint
      || _user.user_metadata?.employee_id
      || _user.email?.split('@')[0]
      || ''
    ).trim();
    const name = _user.user_metadata?.full_name || employeeId;
    const row  = { id: _user.id, name, email: _user.email, employee_id: employeeId };

    // Strategy 1: direct upsert by id
    const { error: e1 } = await sb.from('trainees').upsert(row, { onConflict: 'id' });
    if (!e1) return;

    console.error('[Auth] Trainees upsert (S1) failed:', e1.code, e1.message);

    // Strategy 2: unique constraint on employee_id (code 23505)
    if (e1.code === '23505') {
      try {
        await sb.from('trainees').delete().eq('employee_id', employeeId).neq('id', _user.id);
      } catch (_) { /* ignore */ }
      const { error: e2 } = await sb.from('trainees').upsert(row, { onConflict: 'id' });
      if (!e2) return;
      console.error('[Auth] Trainees upsert (S2 retry) failed:', e2.code, e2.message);
    }

    // Strategy 3: plain insert as last resort
    const { error: e3 } = await sb.from('trainees').insert(row);
    if (!e3 || e3.code === '23505') return;
    console.error('[Auth] Trainees insert (S3) failed:', e3.code, e3.message);
  }

  // ---- Init: restore existing session on page load ----
  async function init() {
    if (DB.isLocalStorage()) {
      try {
        const rawUser = localStorage.getItem('commassess_session_user');
        _user = rawUser ? JSON.parse(rawUser) : null;
        await _ensureTraineeRecord();
      } catch (e) {
        console.warn('Restoring session from local storage failed:', e);
      }
      return _user;
    }

    const sb = DB.getClient();
    let session = null;
    try {
      const res = await sb.auth.getSession();
      session = res.data?.session;
    } catch (e) {
      console.warn('[Auth] Failed to get Supabase session, checking fallback:', e);
    }
    _user = session?.user || null;

    if (!_user) {
      try {
        const rawUser = localStorage.getItem('commassess_session_user');
        if (rawUser) {
          _user = JSON.parse(rawUser);
          console.log('[Auth] Restored fallback LocalStorage user session:', _user);
        }
      } catch (e) {
        console.warn('[Auth] Restoring fallback user session from local storage failed:', e);
      }
    }

    // Heal any manager whose trainees row was never created at signUp.
    await _ensureTraineeRecord();

    // Keep _user in sync when the session changes (token refresh, sign-out)
    sb.auth.onAuthStateChange((_event, sess) => {
      if (sess?.user) {
        _user = sess.user;
        localStorage.removeItem('commassess_session_user');
      } else {
        const rawUser = localStorage.getItem('commassess_session_user');
        if (rawUser) {
          try {
            _user = JSON.parse(rawUser);
          } catch (_) {
            _user = null;
          }
        } else {
          _user = null;
        }
      }
    });

    return _user;
  }

  // ---- Sign In (employeeId + password) ----
  async function signIn(employeeId, password) {
    if (DB.isLocalStorage()) {
      const trainees = await DB.getAll('trainees');
      const empId = employeeId.trim().toLowerCase();
      let trainee = trainees.find(t => t.employee_id && t.employee_id.toLowerCase() === empId);
      // Auto-create trainee in local storage mode if not registered (makes offline flow frictionless)
      if (!trainee) {
        trainee = {
          id: _generateUUID(),
          name: employeeId,
          email: `${empId}@${DOMAIN}`,
          employee_id: employeeId.trim()
        };
        await DB.put('trainees', trainee);
      }
      _user = {
        id: trainee.id,
        email: trainee.email,
        user_metadata: {
          full_name: trainee.name,
          employee_id: trainee.employee_id
        }
      };
      localStorage.setItem('commassess_session_user', JSON.stringify(_user));
      await _ensureTraineeRecord(employeeId.trim());
      return _user;
    }

    const email = _toEmail(employeeId);
    try {
      const { data, error } = await DB.getClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      _user = data.user;
      localStorage.removeItem('commassess_session_user');
      await _ensureTraineeRecord(employeeId.trim());
      return _user;
    } catch (err) {
      console.warn('[Auth] Supabase signIn failed, trying LocalStorage fallback:', err.message || err);
      const trainees = await DB.getAll('trainees');
      const empId = employeeId.trim().toLowerCase();
      let trainee = trainees.find(t => t.employee_id && t.employee_id.toLowerCase() === empId);
      if (!trainee) {
        throw err;
      }
      _user = {
        id: trainee.id,
        email: trainee.email || `${empId}@${DOMAIN}`,
        user_metadata: {
          full_name: trainee.name || employeeId,
          employee_id: trainee.employee_id
        }
      };
      localStorage.setItem('commassess_session_user', JSON.stringify(_user));
      await _ensureTraineeRecord(employeeId.trim());
      return _user;
    }
  }

  // ---- Sign Up (creates Auth user + inserts into trainees table) ----
  async function signUp(employeeId, name, password) {
    if (DB.isLocalStorage()) {
      const trainees = await DB.getAll('trainees');
      const empId = employeeId.trim();
      const existing = trainees.find(t => t.employee_id && t.employee_id.toLowerCase() === empId.toLowerCase());
      if (existing) {
        throw new Error('Employee ID already registered.');
      }
      const newTrainee = {
        id: _generateUUID(),
        name,
        email: `${empId.toLowerCase()}@${DOMAIN}`,
        employee_id: empId
      };
      await DB.put('trainees', newTrainee);

      _user = {
        id: newTrainee.id,
        email: newTrainee.email,
        user_metadata: {
          full_name: name,
          employee_id: empId
        }
      };
      localStorage.setItem('commassess_session_user', JSON.stringify(_user));
      await _ensureTraineeRecord(empId);
      return _user;
    }

    const email = _toEmail(employeeId);
    try {
      const { data, error } = await DB.getClient().auth.signUp({
        email,
        password,
        options: { data: { full_name: name, employee_id: employeeId.trim() } },
      });
      if (error) throw error;

      _user = data.user;

      if (!data.session) {
        console.log('[Auth] Supabase signUp needs confirmation, using LocalStorage fallback.');
        const mockUser = {
          id: _user?.id || _generateUUID(),
          email,
          user_metadata: {
            full_name: name,
            employee_id: employeeId.trim()
          }
        };
        _user = mockUser;
        localStorage.setItem('commassess_session_user', JSON.stringify(_user));
        await DB.put('trainees', {
          id: _user.id,
          name,
          email: _user.email,
          employee_id: employeeId.trim(),
        });
        return _user;
      }

      if (_user) {
        try {
          await DB.put('trainees', {
            id: _user.id,
            name,
            email: _user.email,
            employee_id: employeeId.trim(),
          });
        } catch (e) {
          console.warn('Trainee record insert failed (may already exist):', e.message);
        }
      }

      return _user;
    } catch (err) {
      console.warn('[Auth] Supabase signUp failed, trying LocalStorage fallback:', err.message || err);
      const trainees = await DB.getAll('trainees');
      const empId = employeeId.trim().toLowerCase();
      const existing = trainees.find(t => t.employee_id && t.employee_id.toLowerCase() === empId);
      if (existing) {
        throw new Error('Employee ID already registered.');
      }
      const mockUser = {
        id: _generateUUID(),
        email,
        user_metadata: {
          full_name: name,
          employee_id: employeeId.trim()
        }
      };
      _user = mockUser;
      localStorage.setItem('commassess_session_user', JSON.stringify(_user));
      await DB.put('trainees', {
        id: _user.id,
        name,
        email: _user.email,
        employee_id: employeeId.trim(),
      });
      return _user;
    }
  }

  // ---- Sign Out ----
  async function signOut() {
    localStorage.removeItem('commassess_session_user');
    if (DB.isLocalStorage()) {
      _user = null;
      return;
    }
    try {
      await DB.getClient().auth.signOut();
    } catch (_) {}
    _user = null;
  }

  return { init, isLoggedIn, getId, getEmail, getEmployeeId, getName, signIn, signUp, signOut,
           ensureTraineeRecord: _ensureTraineeRecord };
})();
