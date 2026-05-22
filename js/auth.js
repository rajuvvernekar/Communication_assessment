'use strict';

// ============================================================
//  CommAssess — Authentication (Supabase Auth)
//  Uses Employee ID + Password. A synthetic email
//  ({employeeId}@commassess.internal) is used internally for
//  Supabase Auth — users never see or type their email.
// ============================================================

const Auth = (() => {
  let _user = null;

  const DOMAIN = 'commassess.internal';

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
  // Called after every signIn AND every session restore so that any manager
  // whose trainees insert silently failed at signUp() is healed automatically.
  //
  // Uses the raw Supabase client directly — no .select() chained after upsert —
  // because DB.put() appends .select('id').single() which can throw a
  // RLS-blocked-SELECT error even when the underlying INSERT succeeded, causing
  // the whole call to be caught silently and the row to never be confirmed.
  // Three strategies give maximum resilience.
  async function _ensureTraineeRecord(empIdHint) {
    if (!_user) return;
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

    // Strategy 1: direct upsert by id — no .select() so an RLS SELECT
    // restriction can never cause a false failure on the insert path.
    const { error: e1 } = await sb.from('trainees').upsert(row, { onConflict: 'id' });
    if (!e1) return;

    console.error('[Auth] Trainees upsert (S1) failed:', e1.code, e1.message);

    // Strategy 2: unique constraint on employee_id (code 23505) —
    // an orphaned row from a previous sign-up attempt is blocking the insert.
    // Delete that stale row and retry.
    if (e1.code === '23505') {
      try {
        await sb.from('trainees').delete().eq('employee_id', employeeId).neq('id', _user.id);
      } catch (_) { /* ignore delete error — may lack RLS permission */ }
      const { error: e2 } = await sb.from('trainees').upsert(row, { onConflict: 'id' });
      if (!e2) return;
      console.error('[Auth] Trainees upsert (S2 retry) failed:', e2.code, e2.message);
    }

    // Strategy 3: plain insert as last resort.
    // 23505 on id means the row already exists — that is fine.
    const { error: e3 } = await sb.from('trainees').insert(row);
    if (!e3 || e3.code === '23505') return;
    console.error('[Auth] Trainees insert (S3) failed:', e3.code, e3.message);
  }

  // ---- Init: restore existing session on page load ----
  async function init() {
    const sb = DB.getClient();
    const { data: { session } } = await sb.auth.getSession();
    _user = session?.user || null;

    // Heal any manager whose trainees row was never created at signUp.
    // This covers restored sessions — the most common case.
    await _ensureTraineeRecord();

    // Keep _user in sync when the session changes (token refresh, sign-out)
    sb.auth.onAuthStateChange((_event, sess) => {
      _user = sess?.user || null;
    });

    return _user;
  }

  // ---- Sign In (employeeId + password) ----
  async function signIn(employeeId, password) {
    const email = _toEmail(employeeId);
    const { data, error } = await DB.getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    _user = data.user;

    // Ensure trainees row exists (heals any signUp that silently missed it).
    await _ensureTraineeRecord(employeeId.trim());

    return _user;
  }

  // ---- Sign Up (creates Auth user + inserts into trainees table) ----
  async function signUp(employeeId, name, password) {
    const email = _toEmail(employeeId);
    const { data, error } = await DB.getClient().auth.signUp({
      email,
      password,
      options: { data: { full_name: name, employee_id: employeeId.trim() } },
    });
    if (error) throw error;

    _user = data.user;

    if (!data.session) {
      // Email confirmation required — disable in Supabase Auth settings for internal use
      return { needsConfirmation: true };
    }

    // Insert trainee record so the admin dashboard can list them
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
  }

  // ---- Sign Out ----
  async function signOut() {
    await DB.getClient().auth.signOut();
    _user = null;
  }

  return { init, isLoggedIn, getId, getEmail, getEmployeeId, getName, signIn, signUp, signOut,
           ensureTraineeRecord: _ensureTraineeRecord };
})();
