/* Supabase access from the browser.
 *
 * The anon key is public by design; the real gate is the `x-app-key` header,
 * which carries the SHA-256 of the user's passphrase. Postgres checks it via
 * the is_app_authorized() policy and refuses everything otherwise.
 */
var CONFIG = {
  url: 'https://catuauwklywnzccewqvt.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhdHVhdXdrbHl3bnpjY2V3cXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDI2MzQsImV4cCI6MjEwNTQ3ODYzNH0.uaMb40Xe54mpUfde7MUmBMLripglzJZBNXbK9UR914Y'
};

var APP_KEY = null;          // sha-256 hex of the passphrase, set after unlock
var STORAGE_KEY = 'vocab_app_key';

/* ---------- helpers ---------- */

function sha256Hex(text) {
  // crypto.subtle needs a secure context (https or localhost).
  if (window.crypto && window.crypto.subtle) {
    var buf = new TextEncoder().encode(text);
    return window.crypto.subtle.digest('SHA-256', buf).then(function(h) {
      var bytes = new Uint8Array(h);
      var out = '';
      for (var i = 0; i < bytes.length; i++) {
        out += ('0' + bytes[i].toString(16)).slice(-2);
      }
      return out;
    });
  }
  return Promise.reject(new Error('This page must be opened over https (or localhost).'));
}

function sbFetch(path, options) {
  options = options || {};
  var headers = options.headers || {};
  headers['apikey'] = CONFIG.anonKey;
  headers['Authorization'] = 'Bearer ' + CONFIG.anonKey;
  headers['Content-Type'] = 'application/json';
  if (APP_KEY) headers['x-app-key'] = APP_KEY;
  options.headers = headers;
  return fetch(CONFIG.url + '/rest/v1' + path, options).then(function(r) {
    if (!r.ok) {
      return r.text().then(function(t) {
        throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
      });
    }
    if (r.status === 204) return null;
    return r.text().then(function(t) { return t ? JSON.parse(t) : null; });
  });
}

/* ---------- auth ---------- */

function tryUnlock(passphrase) {
  return sha256Hex(passphrase).then(function(hash) {
    return sbFetch('/rpc/is_app_authorized', {
      method: 'POST',
      headers: { 'x-app-key': hash },
      body: JSON.stringify({})
    }).then(function(ok) {
      if (ok === true) {
        APP_KEY = hash;
        try { localStorage.setItem(STORAGE_KEY, hash); } catch (e) {}
        return true;
      }
      return false;
    });
  });
}

function restoreSession() {
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return Promise.resolve(false);
    APP_KEY = saved;
    return sbFetch('/rpc/is_app_authorized', {
      method: 'POST', body: JSON.stringify({})
    }).then(function(ok) {
      if (ok === true) return true;
      APP_KEY = null;
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }).catch(function() {
      APP_KEY = null;
      return false;
    });
  } catch (e) {
    return Promise.resolve(false);
  }
}

function lockOut() {
  APP_KEY = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}
