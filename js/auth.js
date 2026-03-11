'use strict';

// ============================================================
//  CommAssess — Authentication (Supabase Auth)
//  Wraps Supabase Auth so the rest of the app never touches
//  the Supabase client directly.
// ============================================================

const Auth = (() => {
  let _user = null;

  // ---- Getters ----
  function isLoggedIn() { return !!_user; }
  function getId()      { return _user?.id   || null; }
  function getEmail()   { return _user?.email || ''; }
  function getName()    {
    if (!_user) return '';
    return _user.user_metadata?.full_name || _user.email.split('@')[0];
  }

  // ---- Init: restore existing session on page load ----
  async function init() {
    const sb = DB.getClient();
    const { data: { session } } = await sb.auth.getSession();
    _user = session?.user || null;

    // Keep _user in sync when the session changes (token refresh, sign-out)
    sb.auth.onAuthStateChange((_event, sess) => {
      _user = sess?.user || null;
    });

    return _user;
  }

  // ---- Sign In (email + password) ----
  async function signIn(email, password) {
    const { data, error } = await DB.getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    _user = data.user;
    return _user;
  }

  // ---- Sign Up (creates Auth user + inserts into trainees table) ----
  async function signUp(email, password, name) {
    const { data, error } = await DB.getClient().auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;

    _user = data.user;

    if (!data.session) {
      // Email confirmation required (Supabase default — disable in Auth settings for internal use)
      return { needsConfirmation: true };
    }

    // Insert trainee record so the admin dashboard can list them
    if (_user) {
      try {
        await DB.put('trainees', { id: _user.id, name, email: _user.email });
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

  return { init, isLoggedIn, getId, getEmail, getName, signIn, signUp, signOut };
})();
