/* auth.js — on-device accounts. Credentials never leave this browser:
   passwords are stretched with PBKDF2-SHA256 and only the hash is stored. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var USERS_KEY = 'gt.auth.users.v1';
  var SESSION_KEY = 'gt.auth.session.v1';
  var THROTTLE_KEY = 'gt.auth.throttle.v1';
  var LANG_KEY = 'gt.auth.lang.v1';

  var ITERATIONS = 600000;
  var SESSION_DAYS = 30;
  var MIN_PASSWORD = 8;
  var MAX_FAILS = 5;
  var BASE_LOCK_MS = 60000;
  var MAX_LOCK_MS = 900000;

  var users = U.loadJSON(USERS_KEY, []);
  if (!Array.isArray(users)) users = [];
  var session = readSession();
  var mode = 'signin';

  function now() { return Date.now(); }

  function readSessionStorage(key) {
    try {
      var value = sessionStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) { return null; }
  }

  function removeSessionStorage(key) {
    try { sessionStorage.removeItem(key); } catch (e) {}
  }

  function normalizeEmail(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function secure() {
    return typeof crypto !== 'undefined' && crypto && crypto.subtle && typeof TextEncoder !== 'undefined';
  }

  function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
  }

  function fromHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function randomSalt() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }

  function derive(password, saltHex, iterations) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits({
          name: 'PBKDF2',
          salt: fromHex(saltHex),
          iterations: iterations || ITERATIONS,
          hash: 'SHA-256'
        }, key, 256);
      })
      .then(function (bits) { return toHex(new Uint8Array(bits)); });
  }

  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function findUser(email) {
    var target = normalizeEmail(email);
    for (var i = 0; i < users.length; i++) {
      if (normalizeEmail(users[i].email) === target) return users[i];
    }
    return null;
  }

  function saveUsers() { U.saveJSON(USERS_KEY, users); }

  function readSession() {
    var raw = U.loadJSON(SESSION_KEY, null);
    if (!raw) {
      // Adopt a session written by a tab-scoped build, then persist it.
      var tab = readSessionStorage(SESSION_KEY);
      if (tab && tab.uid) {
        raw = { uid: tab.uid, email: tab.email, exp: tab.exp };
        U.saveJSON(SESSION_KEY, raw);
        removeSessionStorage(SESSION_KEY);
      }
    }
    if (!raw || !raw.uid) return null;
    if (!raw.exp || raw.exp < now()) { U.remove(SESSION_KEY); removeSessionStorage(SESSION_KEY); return null; }
    var known = users.some(function (u) { return u.uid === raw.uid; });
    if (!known) { U.remove(SESSION_KEY); removeSessionStorage(SESSION_KEY); return null; }
    return raw;
  }

  function startSession(user) {
    session = {
      uid: user.uid,
      email: user.email,
      exp: now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    };
    U.saveJSON(SESSION_KEY, session);
    removeSessionStorage(SESSION_KEY);
    return session;
  }

  function namespace() {
    return session && session.uid ? 'gt.u.' + session.uid + '.' : 'gt.';
  }

  function throttleFor(email) {
    var map = U.loadJSON(THROTTLE_KEY, {});
    return map && map[normalizeEmail(email)] ? map[normalizeEmail(email)] : null;
  }

  function setThrottle(email, record) {
    var map = U.loadJSON(THROTTLE_KEY, {}) || {};
    if (!record) delete map[normalizeEmail(email)];
    else map[normalizeEmail(email)] = record;
    U.saveJSON(THROTTLE_KEY, map);
  }

  function registerThrottleFailure(email) {
    var target = normalizeEmail(email);
    var previous = throttleFor(target) || { fails: 0, until: 0, blocks: 0 };
    var fails = previous.fails + 1;
    var record = { fails: fails, until: 0, blocks: previous.blocks || 0 };
    if (fails >= MAX_FAILS) {
      record.blocks = record.blocks + 1;
      record.until = now() + Math.min(BASE_LOCK_MS * Math.pow(2, record.blocks - 1), MAX_LOCK_MS);
      record.fails = 0;
    }
    setThrottle(target, record);
    return record;
  }

  /* ---------------- actions ---------------- */

  function signUp(input) {
    var name = String((input && input.name) || '').trim();
    var email = normalizeEmail(input && input.email);
    var password = String((input && input.password) || '');
    var confirm = String((input && input.confirm) || '');

    if (!secure()) return Promise.resolve({ ok: false, error: 'auth.error.insecure' });
    if (!validEmail(email)) return Promise.resolve({ ok: false, error: 'auth.error.email' });
    if (password.length < MIN_PASSWORD) return Promise.resolve({ ok: false, error: 'auth.error.password' });
    if (password !== confirm) return Promise.resolve({ ok: false, error: 'auth.error.confirm' });
    if (findUser(email)) return Promise.resolve({ ok: false, error: 'auth.error.exists' });

    var salt = randomSalt();
    return derive(password, salt).then(function (hash) {
      var user = {
        uid: U.uid(),
        email: email,
        name: name || email.split('@')[0],
        salt: salt,
        hash: hash,
        iter: ITERATIONS,
        createdAt: now()
      };
      users.push(user);
      saveUsers();
      startSession(user);
      return { ok: true, user: publicUser(user) };
    });
  }

  function signIn(input) {
    var email = normalizeEmail(input && input.email);
    var password = String((input && input.password) || '');

    if (!secure()) return Promise.resolve({ ok: false, error: 'auth.error.insecure' });
    if (!validEmail(email)) return Promise.resolve({ ok: false, error: 'auth.error.email' });

    var gate = throttleFor(email);
    if (gate && gate.until > now()) {
      return Promise.resolve({ ok: false, error: 'auth.error.throttled', waitMs: gate.until - now() });
    }

    var user = findUser(email);
    if (!user) return Promise.resolve({ ok: false, error: 'auth.error.invalid' });

    return derive(password, user.salt, user.iter).then(function (hash) {
      if (!safeEqual(hash, user.hash)) {
        var record = registerThrottleFailure(email);
        if (record.until > now()) {
          return { ok: false, error: 'auth.error.throttled', waitMs: record.until - now() };
        }
        return { ok: false, error: 'auth.error.invalid' };
      }
      var upgrade = user.iter < ITERATIONS
        ? (function () {
            var salt = randomSalt();
            return derive(password, salt, ITERATIONS).then(function (strongerHash) {
              user.salt = salt;
              user.hash = strongerHash;
              user.iter = ITERATIONS;
              saveUsers();
            }).catch(function () {});
          })()
        : Promise.resolve();
      return upgrade.then(function () {
        setThrottle(email, null);
        startSession(user);
        return { ok: true, user: publicUser(user) };
      });
    });
  }

  function signOut() {
    session = null;
    removeSessionStorage(SESSION_KEY);
    U.remove(SESSION_KEY);
  }

  function publicUser(user) {
    return user ? { uid: user.uid, email: user.email, name: user.name, createdAt: user.createdAt } : null;
  }

  function current() { return publicUser(users.filter(function (u) { return session && u.uid === session.uid; })[0]); }

  /* ---------------- screen ---------------- */

  function T(key, vars) { return TA.i18n.t(key, vars); }

  function field(id, labelKey, type, autocomplete, extra) {
    return '<div class="field auth-field">' +
      '<label for="' + id + '">' + U.esc(T(labelKey)) + '</label>' +
      '<input id="' + id + '" class="input" type="' + type + '" autocomplete="' + autocomplete + '" ' +
        'spellcheck="false" required ' + (extra || '') + ' />' +
      '</div>';
  }

  function formHtml() {
    var signup = mode === 'signup';
    return '<form class="auth-form" data-auth-form novalidate>' +
      (signup ? field('auth-name', 'auth.name', 'text', 'name', 'maxlength="80"') : '') +
      field('auth-email', 'auth.email', 'email', 'username') +
      field('auth-password', 'auth.password', 'password', signup ? 'new-password' : 'current-password') +
      (signup ? field('auth-confirm', 'auth.confirm', 'password', 'new-password') : '') +
      '<div class="auth-error" data-auth-error role="alert" aria-live="assertive"></div>' +
      '<button class="btn btn-primary auth-submit" type="submit" data-auth-submit>' +
        U.esc(T(signup ? 'auth.create' : 'auth.signin')) + '</button>' +
      '<button class="auth-switch" type="button" data-auth-switch>' +
        U.esc(T(signup ? 'auth.have_account' : 'auth.no_account')) + '</button>' +
      '</form>';
  }

  function startClock(root) {
    var el = root.querySelector('[data-auth-clock]');
    if (!el) return;
    var text = el.querySelector('[data-auth-clock-text]');
    function tick() {
      if (!el.isConnected) {
        window.clearInterval(root.__authClockTimer);
        root.__authClockTimer = null;
        return;
      }
      var now = new Date();
      var locale = TA.i18n.get();
      var date = new Intl.DateTimeFormat(locale, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }).format(now);
      var time = new Intl.DateTimeFormat(locale, {
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(now);
      text.textContent = date + ' · ' + time;
      el.dateTime = now.toISOString();
      el.setAttribute('aria-label', date + ', ' + time);
    }
    tick();
    root.__authClockTimer = window.setInterval(tick, 15000);
  }

  function mount(root) {
    var lang = U.loadJSON(LANG_KEY, null);
    var stored = TA.store && TA.store.settings ? TA.store.settings().language : null;
    TA.i18n.set(stored || lang || 'en');
    document.documentElement.lang = TA.i18n.get();
    document.title = T('auth.title') + ' · ' + T('app.name');
    if (root.__authClockTimer) {
      window.clearInterval(root.__authClockTimer);
      root.__authClockTimer = null;
    }

    root.innerHTML =
      '<div class="auth-screen">' +
        '<div class="auth-card">' +
          '<div class="auth-brand">' +
            '<span class="brand-mark">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M12 2.4 21 7.4v9.2L12 21.6 3 16.6V7.4Z" stroke="#ff2fd0" stroke-width="1.5"/>' +
                '<path d="M3 7.4 12 12.4l9-5" stroke="#29e0ff" stroke-width="1.5"/>' +
                '<path d="M12 12.4v9.2" stroke="#29e0ff" stroke-width="1.5"/></svg>' +
            '</span>' +
            '<span class="brand-name">' + U.esc(T('app.name')) + '</span>' +
          '</div>' +
          '<time class="auth-clock" data-auth-clock datetime="">' +
            '<span class="auth-clock-icon" aria-hidden="true">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
                '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
            '</span>' +
            '<span data-auth-clock-text></span>' +
          '</time>' +
          '<h1 class="auth-title">' + U.esc(T(mode === 'signup' ? 'auth.signup_title' : 'auth.title')) + '</h1>' +
          '<p class="auth-lede">' + U.esc(T('auth.lede')) + '</p>' +
          '<div data-auth-body>' + formHtml() + '</div>' +
          '<p class="auth-note">' + U.esc(T('auth.note')) + '</p>' +
          '<div class="auth-lang">' +
            TA.i18n.langs.map(function (l) {
              var on = TA.i18n.get() === l.code;
              return '<button type="button" class="auth-lang-btn" data-auth-lang="' + U.attr(l.code) + '" ' +
                'aria-pressed="' + (on ? 'true' : 'false') + '">' + U.esc(l.label) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';

    bind(root);
    startClock(root);
  }

  function setError(root, key, vars) {
    var box = root.querySelector('[data-auth-error]');
    if (!box) return;
    box.textContent = key ? T(key, vars) : '';
    box.classList.toggle('is-on', !!key);
  }

  function setBusy(root, busy) {
    var btn = root.querySelector('[data-auth-submit]');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? T('auth.working') : T(mode === 'signup' ? 'auth.create' : 'auth.signin');
  }

  function bind(root) {
    var form = root.querySelector('[data-auth-form]');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = root.querySelector('#auth-email');
        var pass = root.querySelector('#auth-password');
        var confirm = root.querySelector('#auth-confirm');
        var name = root.querySelector('#auth-name');
        var payload = {
          email: email ? email.value : '',
          password: pass ? pass.value : '',
          confirm: confirm ? confirm.value : '',
          name: name ? name.value : ''
        };
        setError(root, null);
        setBusy(root, true);
        var run = mode === 'signup' ? signUp(payload) : signIn(payload);
        run.then(function (res) {
          if (res.ok) {
            location.reload();
            return;
          }
          setBusy(root, false);
          setError(root, res.error, res.waitMs ? { s: Math.ceil(res.waitMs / 1000) } : null);
          if (pass) pass.select();
        }).catch(function () {
          setBusy(root, false);
          setError(root, 'auth.error.failed');
        });
      });
    }

    var toggle = root.querySelector('[data-auth-switch]');
    if (toggle) {
      toggle.addEventListener('click', function () {
        mode = mode === 'signup' ? 'signin' : 'signup';
        mount(root);
      });
    }

    U.$$('[data-auth-lang]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-auth-lang');
        U.saveJSON(LANG_KEY, code);
        if (TA.store && TA.store.updateSettings) TA.store.updateSettings({ language: code });
        TA.i18n.set(code);
        mount(root);
      });
    });
  }

  TA.auth = {
    mount: mount,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    current: current,
    session: function () { return session ? { uid: session.uid, email: session.email, exp: session.exp } : null; },
    namespace: namespace,
    normalizeEmail: normalizeEmail,
    validEmail: validEmail,
    MIN_PASSWORD: MIN_PASSWORD,
    MAX_FAILS: MAX_FAILS
  };
})(window.TA = window.TA || {});
