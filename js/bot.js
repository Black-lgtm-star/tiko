/* bot.js — deterministic paper-trading loop. Live orders live in broker.js and always need confirmation. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var VERSION = 1;
  var MAX_LOG = 200;
  var MAX_CLOSED = 120;
  var MAX_EQUITY = 120;
  var POSITION_LIMITS = [2, 3, 5];
  var MIN_RR = 1.3;
  var OPEN_STATES = ['in_play', 'triggered'];

  function create() {
    return {
      version: VERSION,
      enabled: false,
      maxPositions: 3,
      startEquity: null,
      positions: [],
      closed: [],
      log: [],
      scans: 0,
      lastScanAt: null,
      lastScan: null,
      startedAt: null,
      realized: 0,
      equity: []
    };
  }

  function positive(v) { return U.isNum(v) && v > 0 ? v : null; }

  function validLevels(side, entry, stop, target) {
    if (!positive(entry) || !positive(stop) || !positive(target)) return false;
    return side === 'long' ? stop < entry && target > entry : stop > entry && target < entry;
  }

  function validPosition(p) {
    return !!(p && p.symbol && (p.side === 'long' || p.side === 'short') &&
      validLevels(p.side, p.entry, p.stop, p.target) && positive(p.units) && U.isNum(p.riskAmount));
  }

  function validClosed(c) {
    return validPosition(c) && positive(c.exit) && U.isNum(c.pnl) && U.isNum(c.r);
  }

  function normalize(raw) {
    var state = create();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
    Object.keys(state).forEach(function (key) {
      if (raw[key] !== undefined) state[key] = raw[key];
    });
    state.version = VERSION;
    state.enabled = !!state.enabled;
    state.maxPositions = POSITION_LIMITS.indexOf(Number(state.maxPositions)) >= 0 ? Number(state.maxPositions) : 3;
    state.startEquity = positive(state.startEquity);
    state.startedAt = U.isNum(state.startedAt) ? state.startedAt : null;
    state.scans = U.isNum(state.scans) && state.scans > 0 ? Math.floor(state.scans) : 0;
    state.lastScanAt = U.isNum(state.lastScanAt) ? state.lastScanAt : null;
    state.realized = U.isNum(state.realized) ? state.realized : 0;
    state.positions = Array.isArray(state.positions)
      ? state.positions.filter(validPosition).map(function (p) { return Object.assign({}, p); })
      : [];
    state.closed = Array.isArray(state.closed)
      ? state.closed.filter(validClosed).slice(0, MAX_CLOSED).map(function (c) { return Object.assign({}, c); })
      : [];
    state.log = Array.isArray(state.log) ? state.log.filter(function (e) {
      return e && e.type && U.isNum(e.ts);
    }).slice(0, MAX_LOG).map(function (e) { return Object.assign({}, e); }) : [];
    state.equity = Array.isArray(state.equity) ? state.equity.filter(function (e) {
      return e && U.isNum(e.v) && U.isNum(e.t);
    }).slice(-MAX_EQUITY).map(function (e) { return { t: e.t, v: e.v }; }) : [];
    state.lastScan = state.lastScan && Array.isArray(state.lastScan.decisions)
      ? { at: U.isNum(state.lastScan.at) ? state.lastScan.at : null, decisions: state.lastScan.decisions.slice(0, 20) }
      : null;
    return state;
  }

  function start(raw, settings, now) {
    var state = normalize(raw);
    var account = Number(settings && settings.accountSize);
    state.enabled = true;
    state.startedAt = state.startedAt || now || Date.now();
    if (!state.startEquity) state.startEquity = account > 0 ? account : 10000;
    return state;
  }

  function stop(raw) {
    var state = normalize(raw);
    state.enabled = false;
    return state;
  }

  function decide(a, plan) {
    if (!plan || (plan.side !== 'long' && plan.side !== 'short')) {
      return { action: 'skip', side: null, reason: 'noSide' };
    }
    if (plan.state === 'extended') return { action: 'skip', side: plan.side, reason: 'extended' };
    if (plan.state === 'invalidated') return { action: 'skip', side: plan.side, reason: 'invalidated' };
    if (plan.state === 'wait') return { action: 'watch', side: plan.side, reason: 'wait' };
    if (OPEN_STATES.indexOf(plan.state) < 0) return { action: 'skip', side: plan.side, reason: 'noEdge' };
    if (!validLevels(plan.side, plan.entry, plan.stop, plan.target)) {
      return { action: 'skip', side: plan.side, reason: 'badLevels' };
    }
    var confidence = a && a.lean ? a.lean.confidence : null;
    if (confidence === 'low') return { action: 'watch', side: plan.side, reason: 'lowConfidence' };
    if (!U.isNum(plan.rr) || plan.rr < MIN_RR) return { action: 'watch', side: plan.side, reason: 'lowReward' };
    return { action: 'open', side: plan.side, reason: 'ready' };
  }

  function buildPosition(input, settings, now) {
    var asset = input.asset;
    var a = input.a;
    var plan = input.plan;
    var sized = TA.tradeplan.size({
      entry: plan.entry,
      stop: plan.stop,
      target: plan.target,
      sizeAllowed: true
    }, settings);
    if (!sized) return null;
    var riskAmount = Math.abs(plan.entry - plan.stop) * sized.units;
    if (!(riskAmount > 0)) return null;
    return {
      id: 'p-' + asset.symbol + '-' + now,
      symbol: asset.symbol,
      name: asset.name || asset.symbol,
      assetClass: asset.assetClass || 'crypto',
      coingeckoId: asset.coingeckoId || null,
      exchange: asset.exchange || null,
      side: plan.side,
      entry: plan.entry,
      stop: plan.stop,
      target: plan.target,
      units: sized.units,
      notional: sized.notional,
      riskAmount: riskAmount,
      rr: plan.rr,
      openedAt: now,
      confidence: a && a.lean ? a.lean.confidence : null,
      planState: plan.state,
      dataMode: (input.meta && input.meta.dataMode) || 'sample',
      last: positive(input.price) || plan.entry,
      lastAt: now
    };
  }

  function exitFor(pos, input) {
    var price = input.price;
    if (!positive(price)) return null;
    if (pos.side === 'long') {
      if (price <= pos.stop) return { price: Math.min(pos.stop, price), reason: 'stop' };
      if (price >= pos.target) return { price: pos.target, reason: 'target' };
    } else {
      if (price >= pos.stop) return { price: Math.max(pos.stop, price), reason: 'stop' };
      if (price <= pos.target) return { price: pos.target, reason: 'target' };
    }
    var plan = input.plan;
    if (plan && ((pos.side === 'long' && plan.side === 'short') || (pos.side === 'short' && plan.side === 'long'))) {
      return { price: price, reason: 'flip' };
    }
    return null;
  }

  function settle(pos, exitPrice, reason, now) {
    var sign = pos.side === 'long' ? 1 : -1;
    var pnl = (exitPrice - pos.entry) * pos.units * sign;
    return Object.assign({}, pos, {
      exit: exitPrice,
      closedAt: now,
      reason: reason,
      pnl: U.round(pnl, 2),
      r: pos.riskAmount > 0 ? U.round(pnl / pos.riskAmount, 4) : 0
    });
  }

  function unrealized(positions) {
    return (positions || []).reduce(function (sum, pos) {
      var price = positive(pos.last) || pos.entry;
      return sum + (price - pos.entry) * pos.units * (pos.side === 'long' ? 1 : -1);
    }, 0);
  }

  function equityOf(state, settings) {
    var account = Number(settings && settings.accountSize);
    var base = positive(state.startEquity) || (account > 0 ? account : 0);
    return base + (state.realized || 0) + unrealized(state.positions);
  }

  function scan(rawState, inputs, opts) {
    opts = opts || {};
    var now = U.isNum(opts.now) ? opts.now : Date.now();
    var settings = opts.settings || (TA.store ? TA.store.settings() : {});
    var state = normalize(rawState);
    var events = [];
    var decisions = [];
    var bySymbol = {};
    (inputs || []).forEach(function (input) {
      if (input && input.asset && input.asset.symbol) bySymbol[input.asset.symbol] = input;
    });

    var closedThisScan = {};
    var remaining = [];

    state.positions.forEach(function (pos) {
      var input = bySymbol[pos.symbol];
      if (!input || !positive(input.price)) { remaining.push(pos); return; }
      pos.last = input.price;
      pos.lastAt = now;
      var exit = exitFor(pos, input);
      if (!exit) { remaining.push(pos); return; }
      var closed = settle(pos, exit.price, exit.reason, now);
      state.closed.unshift(closed);
      state.realized += closed.pnl;
      closedThisScan[pos.symbol] = true;
      events.push({
        ts: now, type: 'close', symbol: pos.symbol, side: pos.side,
        price: exit.price, reason: exit.reason, pnl: closed.pnl, r: closed.r
      });
    });
    state.positions = remaining;
    state.closed = state.closed.slice(0, MAX_CLOSED);

    var candidates = [];
    (inputs || []).forEach(function (input) {
      var asset = input && input.asset;
      var plan = input && input.plan;
      if (!asset || !plan) return;
      var decision = decide(input.a, plan);
      var row = {
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        assetClass: asset.assetClass || 'crypto',
        side: decision.side,
        state: plan.state || null,
        action: decision.action,
        reason: decision.reason,
        price: positive(input.price) || (input.a && input.a.facts ? input.a.facts.price : null),
        stop: positive(plan.stop),
        target: positive(plan.target),
        rr: U.isNum(plan.rr) ? plan.rr : null,
        confidence: input.a && input.a.lean ? input.a.lean.confidence : null,
        dataMode: (input.meta && input.meta.dataMode) || 'sample'
      };
      decisions.push(row);
      if (row.action === 'open') candidates.push({ input: input, row: row });
    });

    if (state.enabled) {
      candidates.sort(function (x, y) { return (y.row.rr || 0) - (x.row.rr || 0); });
      candidates.forEach(function (item) {
        var asset = item.input.asset;
        item.row.action = 'skip';
        if (closedThisScan[asset.symbol]) { item.row.reason = 'flipped'; return; }
        var held = state.positions.some(function (p) { return p.symbol === asset.symbol; });
        if (held) { item.row.action = 'watch'; item.row.reason = 'alreadyOpen'; return; }
        if (state.positions.length >= state.maxPositions) { item.row.reason = 'maxPositions'; return; }
        var pos = buildPosition(item.input, settings, now);
        if (!pos) { item.row.reason = 'noSize'; return; }
        state.positions.push(pos);
        item.row.action = 'open';
        item.row.reason = 'ready';
        item.row.entry = pos.entry;
        item.row.units = pos.units;
        events.push({
          ts: now, type: 'open', symbol: pos.symbol, side: pos.side,
          price: pos.entry, reason: pos.planState, rr: pos.rr
        });
      });
    }

    state.scans += 1;
    state.lastScanAt = now;
    state.lastScan = { at: now, decisions: decisions };
    state.log = events.slice().reverse().concat(state.log).slice(0, MAX_LOG);
    state.equity.push({ t: now, v: U.round(equityOf(state, settings), 2) });
    if (state.equity.length > MAX_EQUITY) state.equity = state.equity.slice(-MAX_EQUITY);

    return { state: state, events: events, decisions: decisions };
  }

  function stats(rawState, settings) {
    var state = normalize(rawState);
    settings = settings || (TA.store ? TA.store.settings() : {});
    var account = Number(settings.accountSize);
    var startEquity = positive(state.startEquity) || (account > 0 ? account : 0);
    var realized = state.realized || 0;
    var open = unrealized(state.positions);
    var equity = startEquity + realized + open;
    var wins = 0, losses = 0, grossWin = 0, grossLoss = 0, totalR = 0;
    var bestR = null, worstR = null;
    state.closed.forEach(function (c) {
      if (c.pnl > 0) { wins += 1; grossWin += c.pnl; }
      else if (c.pnl < 0) { losses += 1; grossLoss += Math.abs(c.pnl); }
      totalR += c.r;
      if (bestR == null || c.r > bestR) bestR = c.r;
      if (worstR == null || c.r < worstR) worstR = c.r;
    });
    var decided = wins + losses;
    return {
      startEquity: startEquity,
      equity: equity,
      realized: realized,
      unrealized: open,
      returnPct: startEquity > 0 ? (equity / startEquity - 1) * 100 : null,
      openCount: state.positions.length,
      openRisk: state.positions.reduce(function (sum, p) { return sum + p.riskAmount; }, 0),
      closedCount: state.closed.length,
      wins: wins,
      losses: losses,
      winRate: decided ? wins / decided * 100 : null,
      totalR: totalR,
      avgR: state.closed.length ? totalR / state.closed.length : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      bestR: bestR,
      worstR: worstR
    };
  }

  TA.bot = {
    version: VERSION,
    positionLimits: POSITION_LIMITS,
    minRR: MIN_RR,
    create: create,
    normalize: normalize,
    start: start,
    stop: stop,
    decide: decide,
    buildPosition: buildPosition,
    exitFor: exitFor,
    scan: scan,
    stats: stats
  };
})(window.TA = window.TA || {});
