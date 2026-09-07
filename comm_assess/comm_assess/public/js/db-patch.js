'use strict';
// db-patch.js v2 — strips botScriptAudio before DB.put to prevent PostgREST error.
// NOTE: DB is declared with `const` in db.js so window.DB is undefined — use typeof check.
(function () {
  try {
    // eslint-disable-next-line no-undef
    if (typeof DB === 'undefined' || typeof DB.put !== 'function') return;
    const _origPut = DB.put;
    DB.put = async function (store, data) {
      if (store === 'topics' && data && typeof data === 'object' && 'botScriptAudio' in data) {
        const safe = Object.assign({}, data);
        delete safe.botScriptAudio;
        return _origPut.call(DB, store, safe);
      }
      return _origPut.call(DB, store, data);
    };
  } catch (e) { console.warn('db-patch init failed:', e); }
})();
