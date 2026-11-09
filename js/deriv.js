/* deriv.js — optional Deriv Copy connection from this tab.
   The app ID and API token live in sessionStorage only, are never written to
   localStorage, and are never logged or rendered back. Starting a copy needs an
   explicit confirmation; stopping one is allowed without it. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var KEY = 'gt.deriv.session.v1';
  var WS_BASE = 'wss://ws.derivws.com/websockets/v3?app_id=';
  var TIMEOUT = 20000;
  var TOKEN_MAX = 125;

  var state = {
    client: null,
    appId: '',
    token: '',
    account: null,
    rows: []
  };
  var Transport = null;

  function storage() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function clean(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  function fail(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  function normalizeAppId(value) {
    var s = clean(value == null ? '' : String(value));
    return /^\d{1,10}$/.test(s) ? s : '';
  }

  function normalizeToken(value) {
    var s = clean(value);
    if (!s || s.length > TOKEN_MAX || /\s/.test(s)) return '';
    return s;
  }

  function normalizeConfig(input) {
    if (!input) return null;
    var appId = normalizeAppId(input.appId);
    var token = normalizeToken(input.token);
    if (!appId || !token) return null;
    return { appId: appId, token: token };
  }

  function mask(token) {
    if (!token) return '';
    if (token.length <= 8) return '•'.repeat(token.length);
    return token.slice(0, 4) + '…' + token.slice(-4);
  }

  function read() {
    var s = storage();
    if (!s) return null;
    try {
      return normalizeConfig(JSON.parse(s.getItem(KEY) || 'null'));
    } catch (e) {
      return null;
    }
  }

  function save(config) {
    var s = storage();
    if (!s) return false;
    s.setItem(KEY, JSON.stringify({ appId: config.appId, token: config.token }));
    return true;
  }

  function forget() {
    var s = storage();
    if (s) s.removeItem(KEY);
  }

  function socketFactory() {
    return Transport || (typeof window !== 'undefined' ? window.WebSocket : null);
  }

  function createClient(config) {
    var socket = null;
    var seq = 0;
    var pending = {};
    var dead = false;

    function settle(id, ok, value) {
      var entry = pending[id];
      if (!entry) return;
      delete pending[id];
      if (entry.timer) clearTimeout(entry.timer);
      if (ok) entry.resolve(value);
      else entry.reject(value);
    }

    function onMessage(event) {
      var data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      if (!data || !data.req_id) return;
      var id = data.req_id;
      if (data.error) {
        var apiCode = String(data.error.code || 'api');
        var code = /authoriz|token|app_id|appid|permission|scope/i.test(apiCode) ? 'auth' : 'api';
        var err = fail(code, data.error.message || apiCode);
        err.apiCode = apiCode;
        settle(id, false, err);
        return;
      }
      settle(id, true, data);
    }

    function onClose() {
      dead = true;
      Object.keys(pending).forEach(function (id) {
        settle(Number(id), false, fail('offline', 'Connection closed'));
      });
    }

    function request(payload) {
      return new Promise(function (resolve, reject) {
        if (!socket || socket.readyState !== 1 || dead) {
          reject(fail('offline', 'Not connected'));
          return;
        }
        var id = ++seq;
        var timer = setTimeout(function () {
          settle(id, false, fail('timeout', 'Request timed out'));
        }, TIMEOUT);
        pending[id] = { resolve: resolve, reject: reject, timer: timer };
        try {
          socket.send(JSON.stringify(Object.assign({ req_id: id }, payload)));
        } catch (e) {
          settle(id, false, fail('network', 'Could not send the request'));
        }
      });
    }

    function open() {
      return new Promise(function (resolve, reject) {
        var WS = socketFactory();
        if (typeof WS !== 'function') {
          reject(fail('offline', 'WebSocket is not available'));
          return;
        }
        try {
          socket = new WS(WS_BASE + encodeURIComponent(config.appId));
        } catch (e) {
          reject(fail('network', 'Could not open the connection'));
          return;
        }
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          close();
          reject(fail('timeout', 'Connection timed out'));
        }, TIMEOUT);

        function done(err, account) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (err) reject(err);
          else resolve(account);
        }

        socket.onmessage = onMessage;
        socket.onerror = function () {};
        socket.onclose = function () {
          onClose();
          done(fail('offline', 'Connection failed'));
        };
        socket.onopen = function () {
          request({ authorize: config.token }).then(function (data) {
            var auth = (data && data.authorize) || {};
            if (!auth.loginid) {
              done(fail('auth', 'Unexpected authorization response'));
              return;
            }
            var scopes = Array.isArray(auth.scopes) ? auth.scopes.map(String) : [];
            done(null, {
              loginId: String(auth.loginid),
              currency: auth.currency || '',
              balance: U.isNum(auth.balance) ? auth.balance : null,
              isVirtual: auth.is_virtual === 1 || auth.is_virtual === true,
              scopes: scopes,
              canList: scopes.indexOf('admin') >= 0,
              canTrade: scopes.indexOf('trade') >= 0
            });
          }, function (err) {
            done(err);
          });
        };
      });
    }

    function close() {
      var sock = socket;
      socket = null;
      if (sock && sock.close) {
        try { sock.close(); } catch (e) { /* ignore a socket already closing */ }
      }
      onClose();
    }

    return { open: open, request: request, close: close };
  }

  function numberOrNull(value) {
    if (U.isNum(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && isFinite(Number(value))) return Number(value);
    return null;
  }

  function rowFor(kind, raw) {
    raw = raw || {};
    return {
      kind: kind,
      loginId: clean(raw.copier_loginid || raw.trader_loginid || raw.loginid || raw.login_id || ''),
      appId: raw.app_id == null ? '' : String(raw.app_id),
      since: U.isNum(raw.created_at) ? raw.created_at : null,
      minStake: numberOrNull(raw.min_trade_stake),
      maxStake: numberOrNull(raw.max_trade_stake),
      assets: Array.isArray(raw.assets) ? raw.assets.join(', ') : '',
      tradeTypes: Array.isArray(raw.trade_types) ? raw.trade_types.join(', ') : '',
      token: clean(raw.copier_token || raw.trader_token || raw.token || '')
    };
  }

  function publicRows() {
    return state.rows.map(function (row) {
      return {
        kind: row.kind,
        loginId: row.loginId,
        appId: row.appId,
        since: row.since,
        minStake: row.minStake,
        maxStake: row.maxStake,
        assets: row.assets,
        tradeTypes: row.tradeTypes,
        canStop: !!row.token
      };
    });
  }

  function publicState() {
    return {
      connected: !!state.account,
      appId: state.appId,
      tokenMasked: mask(state.token),
      account: state.account,
      copies: publicRows()
    };
  }

  function clearState() {
    if (state.client) state.client.close();
    state.client = null;
    state.appId = '';
    state.token = '';
    state.account = null;
    state.rows = [];
  }

  function disconnect() {
    clearState();
    forget();
    return publicState();
  }

  function connect(input) {
    var config = normalizeConfig(input);
    if (!config) return Promise.reject(fail('badConfig', 'Enter the app ID and API token'));
    disconnect();
    var client = createClient(config);
    return client.open().then(function (account) {
      state.client = client;
      state.appId = config.appId;
      state.token = config.token;
      state.account = account;
      state.rows = [];
      save(config);
      return publicState();
    }, function (err) {
      client.close();
      throw err;
    });
  }

  function listCopies() {
    if (!state.client || !state.account) return Promise.reject(fail('offline', 'Connect to Deriv first'));
    if (!state.account.canList) return Promise.reject(fail('scope', 'The token needs the admin scope to list copies'));
    return state.client.request({ copytrading_list: 1 }).then(function (data) {
      var list = (data && data.copytrading_list) || {};
      var copiers = Array.isArray(list.copiers) ? list.copiers : [];
      var traders = Array.isArray(list.traders) ? list.traders : [];
      state.rows = copiers.map(function (raw) { return rowFor('copier', raw); })
        .concat(traders.map(function (raw) { return rowFor('trader', raw); }));
      return publicState();
    });
  }

  function symbolList(value) {
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    return String(value || '').split(/[\s,]+/).map(clean).filter(Boolean);
  }

  function startCopy(input, opts) {
    if (!opts || opts.confirm !== true) return Promise.reject(fail('confirm', 'Confirmation required'));
    if (!state.client || !state.account) return Promise.reject(fail('offline', 'Connect to Deriv first'));
    if (!state.account.canTrade) return Promise.reject(fail('scope', 'The token needs the trade scope to start copying'));
    var token = normalizeToken(input && input.token);
    if (!token) return Promise.reject(fail('badToken', 'Enter the trader copy token'));
    var min = input.minStake == null || input.minStake === '' ? null : Number(input.minStake);
    var max = input.maxStake == null || input.maxStake === '' ? null : Number(input.maxStake);
    if (!(max > 0) || !isFinite(max)) return Promise.reject(fail('badStake', 'Set a max stake above zero'));
    if (min != null && (!(min > 0) || !isFinite(min))) return Promise.reject(fail('badStake', 'Min stake must be above zero'));
    if (min != null && min > max) return Promise.reject(fail('badStake', 'Min stake cannot exceed the max stake'));

    var request = { copy_start: token, max_trade_stake: max };
    if (min != null) request.min_trade_stake = min;
    var assets = symbolList(input.assets);
    if (assets.length) request.assets = assets;
    var tradeTypes = symbolList(input.tradeTypes);
    if (tradeTypes.length) request.trade_types = tradeTypes;

    return state.client.request(request).then(function (data) {
      var ack = data && data.copy_start ? data.copy_start : data;
      if (!state.account.canList) return ack;
      return listCopies().then(function () { return ack; }, function () { return ack; });
    });
  }

  function stopCopyAt(index) {
    if (!state.client || !state.account) return Promise.reject(fail('offline', 'Connect to Deriv first'));
    if (!state.account.canTrade) return Promise.reject(fail('scope', 'The token needs the trade scope to stop copying'));
    var row = state.rows[index];
    if (!row) return Promise.reject(fail('badRow', 'That copy is no longer listed'));
    if (!row.token) return Promise.reject(fail('noToken', 'This copy has no token here; stop it on Deriv'));
    return state.client.request({ copy_stop: row.token }).then(function () {
      state.rows.splice(index, 1);
      if (!state.account.canList) return publicState();
      return listCopies().catch(function () { return publicState(); });
    });
  }

  var PROBE_TIMEOUT = 6000;
  var PROBE_TTL = 5 * 60 * 1000;
  var probeCache = { status: 'unknown', at: 0, pending: null };

  function probe(opts) {
    var force = !!(opts && opts.force);
    var now = Date.now();
    if (!force && probeCache.status !== 'unknown' && now - probeCache.at < PROBE_TTL) {
      return Promise.resolve(probeCache.status);
    }
    if (probeCache.pending) return probeCache.pending;

    probeCache.status = 'checking';
    probeCache.at = now;
    probeCache.pending = new Promise(function (resolve) {
      var settled = false;
      var sock = null;
      var timer = null;

      function done(status) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        probeCache.status = status;
        probeCache.at = Date.now();
        probeCache.pending = null;
        if (sock && sock.close && sock.readyState === 1) {
          try { sock.close(); } catch (e) { /* ignore a socket already closing */ }
        }
        resolve(status);
      }

      var WS = socketFactory();
      if (typeof WS !== 'function') { done('down'); return; }
      timer = setTimeout(function () { done('down'); }, PROBE_TIMEOUT);
      try {
        sock = new WS(WS_BASE + '1');
      } catch (e) {
        done('down');
        return;
      }
      sock.onopen = function () { done('up'); };
      sock.onerror = function () { done('down'); };
      sock.onclose = function () { done('down'); };
    });
    return probeCache.pending;
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', function () {
      if (state.client) state.client.close();
    });
  }

  TA.deriv = {
    connect: connect,
    disconnect: disconnect,
    list: listCopies,
    start: startCopy,
    stopAt: stopCopyAt,
    probe: probe,
    probeState: function () {
      return { status: probeCache.status, checkedAt: probeCache.at || null };
    },
    state: publicState,
    read: read,
    mask: mask,
    normalizeAppId: normalizeAppId,
    normalizeToken: normalizeToken,
    _installTransport: function (ctor) { Transport = ctor || null; }
  };
})(window.TA = window.TA || {});
