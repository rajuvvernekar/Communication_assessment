'use strict';

// ============================================================
//  CommAssess — Authentication (Frappe backend)
//  Identifies trainees by Employee ID (no separate password check —
//  this matches the original app's behavior whenever Supabase Auth
//  was unreachable, which is the path this now always takes). The
//  session itself is cached in the browser via localStorage; the
//  trainee record lives in Frappe via DB.put('trainees', ...).
// ============================================================

const Auth = (() => {
  let _user = null;

  const DOMAIN = 'commassess.internal';

  function _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---- Getters ----
  function isLoggedIn() { return !!_user; }
  function getId() { return _user?.id || null; }
  function getEmail() { return _user?.email || ''; }
  function getEmployeeId() { return _user?.user_metadata?.employee_id || _user?.email?.split('@')[0] || ''; }
  function getName() {
    if (!_user) return '';
    return _user.user_metadata?.full_name || getEmployeeId();
  }

  // ---- Ensure the trainees row exists for the current _user ----
  async function _ensureTraineeRecord(empIdHint) {
    if (!_user) return;
    const employeeId = (
      empIdHint
      || _user.user_metadata?.employee_id
      || _user.email?.split('@')[0]
      || ''
    ).trim();
    const name = _user.user_metadata?.full_name || employeeId;
    const row = { id: _user.id, name, email: _user.email, employee_id: employeeId };
    await DB.put('trainees', row);
  }

  // ---- Init: restore existing session on page load ----
  async function init() {
    try {
      const rawUser = localStorage.getItem('commassess_session_user');
      _user = rawUser ? JSON.parse(rawUser) : null;
      await _ensureTraineeRecord();
    } catch (e) {
      console.warn('Restoring session from local storage failed:', e);
    }
    return _user;
  }

  // ---- Sign In (employeeId + password) ----
  // Password is accepted for UI continuity but not verified server-side —
  // this mirrors the original app's own LocalStorage-fallback behavior.
  async function signIn(employeeId, _password) {
    const trainees = await DB.getAll('trainees');
    const empId = employeeId.trim().toLowerCase();
    let trainee = trainees.find(t => t.employee_id && t.employee_id.toLowerCase() === empId);
    if (!trainee) {
      trainee = {
        id: _generateUUID(),
        name: employeeId,
        email: `${empId}@${DOMAIN}`,
        employee_id: employeeId.trim(),
      };
      await DB.put('trainees', trainee);
    }
    _user = {
      id: trainee.id,
      email: trainee.email,
      user_metadata: {
        full_name: trainee.name,
        employee_id: trainee.employee_id,
      },
    };
    localStorage.setItem('commassess_session_user', JSON.stringify(_user));
    await _ensureTraineeRecord(employeeId.trim());
    return _user;
  }

  // ---- Sign Up (creates a trainee record) ----
  async function signUp(employeeId, name, _password) {
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
      employee_id: empId,
    };
    await DB.put('trainees', newTrainee);

    _user = {
      id: newTrainee.id,
      email: newTrainee.email,
      user_metadata: {
        full_name: name,
        employee_id: empId,
      },
    };
    localStorage.setItem('commassess_session_user', JSON.stringify(_user));
    await _ensureTraineeRecord(empId);
    return _user;
  }

  // ---- Sign Out ----
  async function signOut() {
    localStorage.removeItem('commassess_session_user');
    _user = null;
  }

  return {
    init, isLoggedIn, getId, getEmail, getEmployeeId, getName, signIn, signUp, signOut,
    ensureTraineeRecord: _ensureTraineeRecord,
  };
})();
