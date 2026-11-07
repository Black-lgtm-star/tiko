/* broker.js — optional Alpaca live trading from this tab.
   Keys live in sessionStorage only. Orders are sent only after an explicit
   confirmation, or under a live autopilot grant that is itself session-only. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var KEY = 'gt.broker.v1';
  var AUTOPILOT_KEY = 'gt.broker.autopilot.session.v1';
  var BASE = {
    live: 'https://api.alpaca.markets',
    paper: 'https://paper-api.alpaca.markets'
  };
  var MODES = ['live', 'paper'];
  var TIMEOUT = 15000;

  function storage() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function clean(v) { return typeof v === 'string' ? v.trim() : ''; }

  function normalizeKeys(input) {
    if (!input) return null;
    var mode = MODES.indexOf(input.mode) >= 0 ? input.mode : 'paper';
    var keyId = clean(input.keyId);
    var secretKey = clean(input.secretKey);
    if (!keyId || !secretKey) return null;
    if (/\s/.test(keyId) || /\s/.test(secretKey)) return null;
    return { mode: mode, keyId: keyId, secretKey: secretKey };
  }

  function read() {
    var s = storage();
    if (!s) return null;
    try {
      var raw = s.getItem(KEY);
      if (!raw) return null;
      return normalizeKeys(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function save(input) {
    var keys = normalizeKeys(input);
    var s = storage();
    if (!keys || !s) return null;
    s.setItem(KEY, JSON.stringify(keys));
    if (keys.mode !== 'live') clearAutopilot();
    return keys;
  }

  function clear() {
    var s = storage();
    if (s) s.removeItem(KEY);
    clearAutopilot();
  }

  // Autopilot is an explicit, session-only grant for live order submission.
  // It dies with the tab and is dropped on disconnect or a mode change.
  function readAutopilot() {
    var s = storage();
    var keys = read();
    if (!s || !keys || keys.mode !== 'live') return null;
    try {
      var record = JSON.parse(s.getItem(AUTOPILOT_KEY) || 'null');
      if (record && record.mode === 'live' && U.isNum(record.at)) return record;
    } catch (e) { /* ignore a corrupt grant */ }
    return null;
  }

  function grantAutopilot(now) {
    var s = storage();
    var keys = read();
    if (!s || !keys || keys.mode !== 'live') return null;
    var record = { mode: 'live', at: U.isNum(now) ? now : Date.now() };
    s.setItem(AUTOPILOT_KEY, JSON.stringify(record));
    return record;
  }

  function clearAutopilot() {
    var s = storage();
    if (s) s.removeItem(AUTOPILOT_KEY);
  }

  function base(mode) { return BASE[mode] || BASE.live; }

  function error(code, message, extra) {
    var err = new Error(message || code);
    err.code = code;
    if (extra) {
      if (extra.status != null) err.status = extra.status;
      if (extra.data != null) err.data = extra.data;
    }
    return err;
  }

  function api(keys, path, opts) {
    opts = opts || {};
    var fetchImpl = opts.fetch || (typeof window !== 'undefined' && window.fetch);
    if (!fetchImpl) return Promise.reject(error('network', 'Fetch is unavailable'));
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT) : null;
    var headers = {
      'APCA-API-KEY-ID': keys.keyId,
      'APCA-API-SECRET-KEY': keys.secretKey,
      'Accept': 'application/json'
    };
    var init = {
      method: opts.method || 'GET',
      headers: headers,
      signal: controller ? controller.signal : undefined
    };
    if (opts.body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetchImpl(base(keys.mode) + path, init).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try { data = JSON.parse(text); } catch (e) { data = null; }
        }
        if (!res.ok) {
          var detail = data && (data.message || data.error);
          var code = res.status === 401 ? 'auth' : 'http';
          throw error(code, detail || ('Alpaca returned ' + res.status), { status: res.status, data: data });
        }
        return data;
      });
    }).catch(function (err) {
      if (err && err.code) throw err;
      if (err && err.name === 'AbortError') throw error('timeout', 'Alpaca did not answer in time');
      throw error('network', 'Could not reach Alpaca');
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      return data;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function money(v) { return U.isNum(Number(v)) ? Number(v) : null; }

  function normalizeAccount(raw) {
    raw = raw || {};
    return {
      accountNumber: raw.account_number || null,
      status: raw.status || null,
      currency: raw.currency || 'USD',
      equity: money(raw.equity),
      cash: money(raw.cash),
      buyingPower: money(raw.buying_power),
      daytradeCount: U.isNum(Number(raw.daytrade_count)) ? Number(raw.daytrade_count) : null,
      tradingBlocked: !!raw.trading_blocked,
      accountBlocked: !!raw.account_blocked,
      shortingEnabled: !!raw.shorting_enabled,
      createdAt: raw.created_at || null
    };
  }

  function canTrade(account) {
    if (!account) return { ok: false, reason: 'missing' };
    if (account.status !== 'ACTIVE' || account.accountBlocked || account.tradingBlocked) {
      return { ok: false, reason: 'blocked' };
    }
    return { ok: true, reason: null };
  }

  function normalizePosition(raw) {
    raw = raw || {};
    return {
      symbol: raw.symbol || null,
      assetClass: raw.asset_class || null,
      qty: money(raw.qty),
      side: raw.side || null,
      avgEntry: money(raw.avg_entry_price),
      currentPrice: money(raw.current_price),
      marketValue: money(raw.market_value),
      unrealizedPl: money(raw.unrealized_pl),
      unrealizedPlpc: money(raw.unrealized_plpc)
    };
  }

  function normalizeOrder(raw) {
    raw = raw || {};
    return {
      id: raw.id || null,
      clientOrderId: raw.client_order_id || null,
      symbol: raw.symbol || null,
      side: raw.side || null,
      qty: money(raw.qty),
      filledQty: money(raw.filled_qty),
      type: raw.type || null,
      orderClass: raw.order_class || null,
      status: raw.status || null,
      limitPrice: money(raw.limit_price),
      stopPrice: money(raw.stop_price),
      submittedAt: raw.submitted_at || null,
      filledAvgPrice: money(raw.filled_avg_price)
    };
  }

  function account(keys, deps) {
    return api(keys, '/v2/account', deps).then(normalizeAccount);
  }

  function positions(keys, deps) {
    return api(keys, '/v2/positions', deps).then(function (list) {
      return Array.isArray(list) ? list.map(normalizePosition) : [];
    });
  }

  function openOrders(keys, deps) {
    return api(keys, '/v2/orders?status=open&limit=50&direction=desc', deps).then(function (list) {
      return Array.isArray(list) ? list.map(normalizeOrder) : [];
    });
  }

  function summary(keys, deps) {
    return Promise.all([account(keys, deps), positions(keys, deps), openOrders(keys, deps)])
      .then(function (out) {
        return { account: out[0], positions: out[1], orders: out[2] };
      });
  }

  function connect(input, deps) {
    var keys = normalizeKeys(input);
    if (!keys) return Promise.reject(error('badKeys', 'Both the key ID and secret are required'));
    return account(keys, deps).then(function (acct) {
      save(keys);
      return { mode: keys.mode, account: acct };
    });
  }

  function price(v) {
    var n = Number(v);
    if (!U.isNum(n) || n <= 0) return null;
    return n >= 1 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000;
  }

  function clientId(symbol, now) {
    var safe = String(symbol || 'order').toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    return ('tiko-' + safe + '-' + Number(now || Date.now()).toString(36)).slice(0, 48);
  }

  function buildOrder(input, now) {
    input = input || {};
    var symbol = clean(input.symbol).toUpperCase();
    if (!symbol) return { error: 'symbol' };
    if (input.assetClass !== 'stock') return { error: 'assetClass' };
    if (input.side !== 'long') return { error: 'side' };
    var entry = price(input.entry);
    var stop = price(input.stop);
    var target = price(input.target);
    if (entry == null || stop == null || target == null) return { error: 'levels' };
    if (!(stop < entry && target > entry)) return { error: 'levels' };
    var qty = Math.floor(Number(input.units));
    if (!U.isNum(qty) || qty < 1) return { error: 'size' };
    var order = {
      symbol: symbol,
      qty: String(qty),
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
      order_class: 'bracket',
      take_profit: { limit_price: String(target) },
      stop_loss: { stop_price: String(stop) },
      client_order_id: clientId(symbol, now)
    };
    return {
      order: order,
      qty: qty,
      entry: entry,
      stop: stop,
      target: target,
      risk: Math.round((entry - stop) * qty * 100) / 100
    };
  }

  function submit(keys, order, deps) {
    if (!keys) return Promise.reject(error('noKeys', 'No broker is connected'));
    if (!deps || deps.confirm !== true) {
      return Promise.reject(error('confirm', 'A live order needs explicit confirmation'));
    }
    if (!order || !order.symbol || !order.qty) return Promise.reject(error('order', 'Order is incomplete'));
    return api(keys, '/v2/orders', {
      method: 'POST',
      body: order,
      fetch: deps.fetch
    }).then(normalizeOrder);
  }

  TA.broker = {
    storageKey: KEY,
    autopilotKey: AUTOPILOT_KEY,
    modes: MODES,
    base: BASE,
    normalizeKeys: normalizeKeys,
    read: read,
    save: save,
    clear: clear,
    readAutopilot: readAutopilot,
    grantAutopilot: grantAutopilot,
    clearAutopilot: clearAutopilot,
    account: account,
    positions: positions,
    openOrders: openOrders,
    summary: summary,
    connect: connect,
    canTrade: canTrade,
    buildOrder: buildOrder,
    submit: submit
  };
})(window.TA = window.TA || {});
