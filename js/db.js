'use strict';

// ============================================================
//  CommAssess — Database Layer (Frappe Framework backend)
//  Drop-in replacement for the old Supabase-backed DB module.
//  The public API (init, get, getAll, put, patch, del, getByIndex,
//  getClient, isLocalStorage, forceReSeed, seedManagerTopics) is
//  identical so app.js / admin.js / manager-app.js need ZERO changes.
// ============================================================

const DB = (() => {
  let _dbInitialized = false;
  let _online = false;

  function _base() {
    const url = (CONFIG.FRAPPE_SITE_URL || '').replace(/\/+$/, '');
    if (!url || url.includes('YOUR_FRAPPE')) {
      throw new Error('FRAPPE_SITE_URL is not configured in config.js');
    }
    return url;
  }

  // ---- Base URL actually used for fetch() calls ----
  // The Frappe Cloud site's CORS config only allows requests from its own
  // origin, so the GitHub Pages frontend (a different origin) gets a
  // "Failed to fetch" on every direct call. When CONFIG.FRAPPE_PROXY_URL is
  // set (the Cloudflare Worker's /frappe route), route calls through it
  // instead — the Worker talks to Frappe server-to-server (no CORS there)
  // and attaches its own permissive CORS headers on the way back to the
  // browser. Falls back to a direct call if no proxy URL is configured.
  function _fetchBase() {
    const proxy = (CONFIG.FRAPPE_PROXY_URL || '').replace(/\/+$/, '');
    if (proxy) return proxy;
    return _base();
  }

  function _headers(withAuth) {
    const h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    // Only attach the API key/secret for calls that need elevated (non-guest)
    // access. Trainee-facing reads/writes run allow_guest server-side, same
    // trust model as the old Supabase anon key.
    if (withAuth && CONFIG.FRAPPE_API_KEY && CONFIG.FRAPPE_API_SECRET) {
      h['Authorization'] = `token ${CONFIG.FRAPPE_API_KEY}:${CONFIG.FRAPPE_API_SECRET}`;
    }
    return h;
  }

  async function _call(method, params = {}, withAuth = false) {
    const res = await fetch(`${_fetchBase()}/api/method/comm_assess.frappe_db.${method}`, {
      method: 'POST',
      headers: _headers(withAuth),
      body: JSON.stringify(params),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (json && (json.exception || json._server_messages)) || `${method} failed (${res.status})`;
      throw new Error(msg);
    }
    return json.message;
  }

  // ---- Upload a Blob into Frappe's File Manager → return public URL ----
  async function _upload(blob, folder, filename) {
    const fd = new FormData();
    fd.append('file', blob, filename || 'recording.webm');
    if (folder) fd.append('folder', folder);
    const res = await fetch(`${_fetchBase()}/api/method/comm_assess.frappe_db.db_upload`, {
      method: 'POST',
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.message) throw new Error('Upload failed');
    return json.message.file_url;
  }

  // ---- Public: verify the Frappe site is reachable ----
  async function init() {
    if (_dbInitialized) return;
    try {
      await _call('db_init');
      _online = true;
      console.log('[DB] Frappe backend connected.');
    } catch (e) {
      _online = false;
      console.warn('[DB] Frappe backend unreachable, data will not persist:', e.message || e);
    }
    _dbInitialized = true;
  }

  // ---- put: insert or upsert a record ----
  async function put(store, data) {
    const processed = { ...data };
    if (store === 'topics') delete processed.botScriptAudio;

    if (store === 'sessions' && data.recordingBlob instanceof Blob) {
      try {
        processed.recordingUrl = await _upload(data.recordingBlob, 'recordings');
      } catch (e) {
        console.warn('Recording upload failed, saving without URL:', e.message);
      }
      delete processed.recordingBlob;
    }
    if (store === 'topics' && data.callerAudioBlob instanceof Blob) {
      try {
        processed.callerAudioUrl = await _upload(data.callerAudioBlob, 'caller-audio');
      } catch (e) {
        console.warn('Caller audio upload failed, saving topic without audio URL:', e.message);
      }
      delete processed.callerAudioBlob;
    }

    return _call('db_put', { store, data: processed }, true);
  }

  // ---- get: fetch a single record by id (or key for settings) ----
  async function get(store, id) {
    if (store === 'settings') return _call('db_get', { store, key: id });
    return _call('db_get', { store, id });
  }

  // ---- getAll: fetch all records in a store ----
  async function getAll(store) {
    const rows = await _call('db_get_all', { store });
    return rows || [];
  }

  // ---- patch: partial update (only specified fields) ----
  async function patch(store, id, data) {
    if (store === 'settings') {
      await _call('db_patch', { store, key: id, data }, true);
      return;
    }
    await _call('db_patch', { store, id, data }, true);
  }

  // ---- del: delete a record by id ----
  async function del(store, id) {
    if (store === 'settings') {
      await _call('db_del', { store, key: id }, true);
      return;
    }
    await _call('db_del', { store, id }, true);
  }

  // ---- getByIndex: filter records by a field value ----
  async function getByIndex(store, field, value) {
    const rows = await _call('db_get_by_index', { store, field, value });
    return rows || [];
  }

  // ---- Auth compatibility shim ----
  // auth.js's DB.isLocalStorage() branch never actually used Supabase Auth
  // (it identifies trainees purely by employee ID via DB.put/getAll), so
  // there is nothing here that needs a real backend session client.
  function getClient() {
    return null;
  }

  function isLocalStorage() {
    return !_online;
  }

  // ---- Reseed hooks ----
  // Default topic content now lives server-side (run the Frappe app's seed
  // script via `bench --site <site> execute comm_assess.seeds.seed_data.seed_all`,
  // or add/edit topics directly from the Admin portal). These are kept as
  // no-ops so any existing call site doesn't throw.
  async function forceReSeed() {
    console.warn('[DB] forceReSeed: run the Frappe-side seed script instead (see comm_assess/seeds/seed_data.py).');
  }
  async function seedManagerTopics() {
    console.warn('[DB] seedManagerTopics: run the Frappe-side seed script instead (see comm_assess/seeds/seed_data.py).');
  }

  return { init, get, getAll, put, patch, del, getByIndex, getClient, isLocalStorage, forceReSeed, seedManagerTopics };
})();
