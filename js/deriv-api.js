/* deriv-api.js — read-only Deriv account view on the current Deriv API.
   The app ID, personal access token and account id live in sessionStorage only.
   The token is sent only to api.derivws.com, is never logged and is never
   rendered back. This module never places, closes or modifies a trade. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var BASE = 'https://api.derivws.com';
  var KEY = 'gt.deriv.api.session.v1';
  var TIMEOUT = 20000;
  var TOKEN_MAX = 512;

  var state = {
    client: null,
    appId: '',
    token: '',
    account: null,
    contracts: [],
    positionsOk: true
  };
  var Fetch = null;
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

  function normalizeAccountId(value) {
    var s = clean(value == null ? '' : String(value));
    return /^[A-Za-z0-9_-]{3,32}$/.test(s) ? s : '';
  }

  function normalizeConfig(input) {
    if (!input) return null;
    var appId = normalizeAppId(input.appId);
    var token = normalizeToken(input.token);
    var accountId = normalizeAccountId(input.accountId);
    if (!appId || !token) return null;
    if (clean(input.accountId) && !accountId) return null;
    return { appId: appId, token: token, accountId: accountId };
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
    s.setItem(KEY, JSON.stringify({
      appId: config.appId,
      token: config.token,
      accountId: config.accountId
    }));
    return true;
  }

  function forget() {
    var s = storage();
    if (s) s.removeItem(KEY);
  }

  function fetchImpl() {
    if (Fetch) return Fetch;
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') return window.fetch.bind(window);
    return null;
  }

  function socketFactory() {
    return Transport || (typeof window !== 'undefined' ? window.WebSocket : null);
  }

  function headers(config) {
    return {
      'Authorization': 'Bearer ' + config.token,
      'Deriv-App-ID': config.appId,
      'Accept': 'application/json'
    };
  }

  function httpError(status, body) {
    var apiCode = '';
    var message = '';
    if (body && Array.isArray(body.errors) && body.errors.length) {
      apiCode = String(body.errors[0].code || '');
      message = String(body.errors[0].message || '');
    }
    var code = 'api';
    if (status === 401 || status === 403) code = 'auth';
    else if (status === 404) code = 'account';
    else if (status === 429) code = 'rate';
    else if (/validation/i.test(apiCode)) code = 'account';
    var err = fail(code, message || 'HTTP ' + status);
    err.status = status;
    err.apiCode = apiCode;
    return err;
  }

  function request(path, init) {
    var doFetch = fetchImpl();
    if (!doFetch) return Promise.reject(fail('network', 'Could not reach Deriv'));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var opts = Object.assign({ credentials: 'omit', cache: 'no-store' }, init);
    if (controller) opts.signal = controller.signal;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, TIMEOUT);

    return doFetch(BASE + path, opts).then(function (res) {
      return res.text().then(function (text) {
        clearTimeout(timer);
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
        if (!res.ok) throw httpError(res.status, body);
        return body;
      });
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') throw fail('timeout', 'Deriv did not answer in time');
      throw fail('network', 'Could not reach Deriv');
    });
  }

  function accountIdOf(raw) {
    return clean(raw.account_id || raw.accountId || raw.loginid || raw.login_id);
  }

  function accountTypeOf(raw) {
    var type = clean(raw.account_type || raw.accountType);
    if (type) return type.toLowerCase();
    if (raw.is_virtual === 1 || raw.is_virtual === true) return 'demo';
    if (raw.is_virtual === 0 || raw.is_virtual === false) return 'real';
    return '';
  }

  function accountRow(raw) {
    raw = raw || {};
    return {
      accountId: accountIdOf(raw),
      loginId: accountIdOf(raw),
      currency: clean(raw.currency),
      balance: U.isNum(raw.balance) ? raw.balance : null,
      type: accountTypeOf(raw),
      status: clean(raw.status)
    };
  }

  function pickAccount(list, wanted) {
    var rows = list.map(accountRow).filter(function (row) { return !!row.accountId; });
    if (!rows.length) return null;
    if (wanted) {
      var upper = wanted.toUpperCase();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].accountId.toUpperCase() === upper) return rows[i];
      }
      return null;
    }
    var active = rows.filter(function (row) { return row.status.toLowerCase() === 'active'; });
    var pool = active.length ? active : rows;
    var real = pool.filter(function (row) { return row.type === 'real'; });
    return real[0] || pool[0];
  }

  function numberOrNull(value) {
    if (U.isNum(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && isFinite(Number(value))) return Number(value);
    return null;
  }

  function contractRow(raw) {
    raw = raw || {};
    var start = U.isNum(raw.date_start) ? raw.date_start : null;
    if (start == null && U.isNum(raw.purchase_time)) start = raw.purchase_time;
    return {
      id: raw.contract_id == null ? '' : String(raw.contract_id),
      type: clean(raw.contract_type),
      symbol: clean(raw.underlying_symbol || raw.symbol),
      buyPrice: numberOrNull(raw.buy_price),
      payout: numberOrNull(raw.payout),
      currency: clean(raw.currency),
      start: start,
      expiry: U.isNum(raw.expiry_time) ? raw.expiry_time : null,
      longcode: clean(raw.longcode)
    };
  }

  function validSocketUrl(url) {
    return typeof url === 'string' &&
      /^wss:\/\/api\.derivws\.com\/trading\/v1\/options\/ws\/[a-z]+(?:\?[^\s]*)?$/i.test(url);
  }

  function createClient(url) {
    var socket = null;
    var seq = 0;
    var pending = {};
    var dead = false;
    var live = false;

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
        var code = /authoriz|token|permission|scope|credential/i.test(apiCode) ? 'auth' : 'api';
        var err = fail(code, data.error.message || apiCode);
        err.apiCode = apiCode;
        settle(id, false, err);
        return;
      }
      settle(id, true, data);
    }

    function onClose() {
      dead = true;
      live = false;
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
          socket = new WS(url);
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

        function done(err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        }

        socket.onmessage = onMessage;
        socket.onerror = function () {};
        socket.onclose = function () {
          onClose();
          done(fail('offline', 'Connection failed'));
        };
        socket.onopen = function () {
          live = true;
          done(null);
        };
      });
    }

    function close() {
      var sock = socket;
      socket = null;
      live = false;
      if (sock && sock.close) {
        try { sock.close(); } catch (e) { /* ignore a socket already closing */ }
      }
      onClose();
    }

    return {
      open: open,
      request: request,
      close: close,
      isOpen: function () { return live && !dead; }
    };
  }

  function contractsFrom(body) {
    var list = body && body.portfolio && Array.isArray(body.portfolio.contracts)
      ? body.portfolio.contracts
      : [];
    return list.map(contractRow);
  }

  function publicContracts() {
    return state.contracts.map(function (row) {
      return {
        id: row.id,
        type: row.type,
        symbol: row.symbol,
        buyPrice: row.buyPrice,
        payout: row.payout,
        currency: row.currency,
        start: row.start,
        expiry: row.expiry,
        longcode: row.longcode
      };
    });
  }

  function publicState() {
    return {
      connected: !!state.account && !!state.client && state.client.isOpen(),
      appId: state.appId,
      tokenMasked: mask(state.token),
      accountId: state.account ? state.account.accountId : '',
      account: state.account ? {
        accountId: state.account.accountId,
        loginId: state.account.loginId,
        currency: state.account.currency,
        balance: state.account.balance,
        type: state.account.type,
        status: state.account.status
      } : null,
      contracts: publicContracts(),
      positionsOk: state.positionsOk
    };
  }

  function clearState() {
    if (state.client) state.client.close();
    state.client = null;
    state.appId = '';
    state.token = '';
    state.account = null;
    state.contracts = [];
    state.positionsOk = true;
  }

  function disconnect() {
    clearState();
    forget();
    return publicState();
  }

  function withBalance(account, body) {
    var bal = body && body.balance;
    if (!bal) throw fail('api', 'Unexpected balance response');
    return {
      accountId: account.accountId,
      loginId: bal.loginid ? String(bal.loginid) : account.loginId,
      currency: clean(bal.currency) || account.currency,
      balance: U.isNum(bal.balance) ? bal.balance : null,
      type: account.type,
      status: account.status
    };
  }

  function connect(input) {
    var config = normalizeConfig(input);
    if (!config) return Promise.reject(fail('badConfig', 'Enter the app ID, token and account id'));
    disconnect();

    return request('/trading/v1/options/accounts', {
      method: 'GET',
      headers: headers(config)
    }).then(function (body) {
      var list = body && Array.isArray(body.data) ? body.data : [];
      if (!list.length) throw fail('account', 'No trading accounts on this token');
      var account = pickAccount(list, config.accountId);
      if (!account) throw fail('account', 'That account id is not on this token');
      return request('/trading/v1/options/accounts/' + encodeURIComponent(account.accountId) + '/otp', {
        method: 'POST',
        headers: headers(config)
      }).then(function (otp) {
        var url = otp && otp.data && otp.data.url;
        if (!validSocketUrl(url)) throw fail('url', 'Unexpected websocket URL');
        return { account: account, url: url };
      });
    }).then(function (found) {
      var client = createClient(found.url);
      return client.open().then(function () {
        return client.request({ balance: 1 }).then(function (body) {
          var account = withBalance(found.account, body);
          return client.request({ portfolio: 1 }).then(function (portfolio) {
            return { client: client, account: account, contracts: contractsFrom(portfolio), positionsOk: true };
          }, function () {
            return { client: client, account: account, contracts: [], positionsOk: false };
          });
        });
      }).then(function (result) {
        state.client = result.client;
        state.appId = config.appId;
        state.token = config.token;
        state.account = result.account;
        state.contracts = result.contracts;
        state.positionsOk = result.positionsOk;
        save({
          appId: config.appId,
          token: config.token,
          accountId: result.account.accountId
        });
        return publicState();
      }, function (err) {
        client.close();
        throw err;
      });
    });
  }

  function refresh() {
    if (!state.client || !state.client.isOpen() || !state.account) {
      return Promise.reject(fail('offline', 'Connect to Deriv first'));
    }
    return state.client.request({ balance: 1 }).then(function (body) {
      state.account = withBalance(state.account, body);
      return state.client.request({ portfolio: 1 }).then(function (portfolio) {
        state.contracts = contractsFrom(portfolio);
        state.positionsOk = true;
        return publicState();
      }, function () {
        state.positionsOk = false;
        return publicState();
      });
    });
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', function () {
      if (state.client) state.client.close();
    });
  }

  TA.derivApi = {
    connect: connect,
    disconnect: disconnect,
    refresh: refresh,
    state: publicState,
    read: read,
    mask: mask,
    normalizeAppId: normalizeAppId,
    normalizeToken: normalizeToken,
    normalizeAccountId: normalizeAccountId,
    _installFetch: function (fn) { Fetch = fn || null; },
    _installTransport: function (ctor) { Transport = ctor || null; }
  };
})(window.TA = window.TA || {});
