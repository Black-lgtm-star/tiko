/* tradeplan.js — conditional, rule-based action plan from the analysis facts.
   Deterministic: same facts + same live price produce the same plan. No LLM. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var STOP_MIN_ATR = 0.9;
  var STOP_MAX_ATR = 1.5;
  var PULLBACK_STOP_ATR = 1.2;
  var EXTENDED_ATR = 2;

  function fmtP(v, lang) { return U.fmtPrice(v, '$', lang); }
  function atrDist(v, atr) { return v / atr; }

  function longStop(trigger, support, atr) {
    if (!U.isNum(support)) return trigger - atr * PULLBACK_STOP_ATR;
    return Math.min(
      Math.max(support, trigger - atr * STOP_MAX_ATR),
      trigger - atr * STOP_MIN_ATR
    );
  }

  function shortStop(trigger, resistance, atr) {
    if (!U.isNum(resistance)) return trigger + atr * PULLBACK_STOP_ATR;
    return Math.max(
      Math.min(resistance, trigger + atr * STOP_MAX_ATR),
      trigger + atr * STOP_MIN_ATR
    );
  }

  function pickTarget(side, entry, stop, candidate) {
    var risk = Math.abs(entry - stop);
    if (!(risk > 0)) return null;
    if (side === 'long') {
      if (U.isNum(candidate) && candidate - entry >= risk * 1.3) return candidate;
      return entry + risk * 2;
    }
    if (U.isNum(candidate) && entry - candidate >= risk * 1.3) return candidate;
    return entry - risk * 2;
  }

  function pctDist(price, level) {
    if (!U.isNum(price) || !U.isNum(level) || !price) return null;
    return Math.abs(level / price - 1) * 100;
  }

  function build(a, opts) {
    opts = opts || {};
    var f = a.facts || {};
    var lang = opts.lang || a.lang || 'en';
    var price = U.isNum(opts.price) && opts.price > 0 ? opts.price : f.price;
    var atr = U.isNum(f.atr) && f.atr > 0 ? f.atr : Math.max(price * 0.015, 1e-9);
    var s1 = a.nearestSupport ? a.nearestSupport.price : null;
    var r1 = a.nearestResistance ? a.nearestResistance.price : null;
    var s2 = a.nextSupport ? a.nextSupport.price : null;
    var r2 = a.nextResistance ? a.nextResistance.price : null;
    var relVol = U.isNum(f.relVol) ? f.relVol : null;
    var rsi = U.isNum(f.rsi) ? f.rsi : null;
    var sample = a.meta && a.meta.dataMode === 'sample';
    var live = !!opts.live && a.asset && a.asset.assetClass === 'crypto';
    var lean = a.lean ? a.lean.dir : 'neutral';
    var side = lean === 'bull' ? 'long' : lean === 'bear' ? 'short' : 'none';

    // A live break can define a direction the last full-bar lean did not.
    if (side === 'none' && U.isNum(s1) && price < s1 * 0.999) side = 'short';
    else if (side === 'none' && U.isNum(r1) && price > r1 * 1.001) side = 'long';

    var plan = {
      side: side,
      setup: 'none',
      state: 'no_edge',
      live: live,
      sample: sample,
      price: price,
      priceText: fmtP(price, lang),
      atr: atr,
      atrText: U.isNum(f.atr) ? f.atrText : fmtP(atr, lang),
      changePct: U.isNum(opts.changePct) ? opts.changePct : f.changePct,
      s1: s1, r1: r1, s2: s2, r2: r2,
      s1Text: U.isNum(s1) ? fmtP(s1, lang) : '—',
      r1Text: U.isNum(r1) ? fmtP(r1, lang) : '—',
      s2Text: U.isNum(s2) ? fmtP(s2, lang) : '—',
      r2Text: U.isNum(r2) ? fmtP(r2, lang) : '—',
      trigger: null, stop: null, target: null, entry: null,
      entryText: '—', triggerText: '—', stopText: '—', targetText: '—',
      rr: null, rrText: '—',
      entryBasis: 'trigger',
      sizeAllowed: false,
      sizeHiddenKey: null,
      actionKey: 'plan.act.noEdge',
      actionParams: { s: U.isNum(s1) ? fmtP(s1, lang) : '—', r: U.isNum(r1) ? fmtP(r1, lang) : '—' },
      reasons: [],
      checks: [],
      warnings: [],
      asOf: opts.asOf || (a.meta && (a.meta.providerUpdatedAt || a.meta.seriesEnd)) || Date.now(),
      dataKey: sample ? 'plan.data.sample' : (a.meta && a.meta.delayNote && a.asset.assetClass === 'stock' ? 'plan.data.eod' : (live ? 'plan.data.live' : 'plan.data.last')),
      style: opts.style || null
    };

    function setLevels(trigger, stop, target, entryBasis) {
      plan.trigger = trigger;
      plan.stop = stop;
      plan.target = target;
      plan.entry = entryBasis === 'last' ? price : trigger;
      plan.entryBasis = entryBasis;
      plan.triggerText = fmtP(trigger, lang);
      plan.stopText = fmtP(stop, lang);
      plan.targetText = U.isNum(target) ? fmtP(target, lang) : '—';
      plan.entryText = fmtP(plan.entry, lang);
      var risk = Math.abs(plan.entry - stop);
      if (risk > 0 && U.isNum(target)) {
        plan.rr = Math.abs(target - plan.entry) / risk;
        plan.rrText = plan.rr.toFixed(1) + ' : 1';
      }
    }

    if (side === 'long') {
      if (U.isNum(s1) && price < s1 * 0.999) {
        plan.setup = 'breakout';
        var invStop = longStop(s1, s2, atr);
        setLevels(s1, invStop, pickTarget('long', s1, invStop, r1), 'trigger');
        plan.state = 'invalidated';
        plan.sizeHiddenKey = 'plan.size.hidden.invalidated';
        plan.actionKey = 'plan.act.invalidatedLong';
        plan.actionParams = { s: plan.s1Text };
      } else if (U.isNum(r1) && price > r1 * 1.001) {
        plan.setup = 'breakout';
        var bStop = longStop(r1, s1, atr);
        if (price > r1 + atr * EXTENDED_ATR) {
          plan.state = 'extended';
          setLevels(r1, bStop, pickTarget('long', price, bStop, r2), 'last');
          plan.sizeHiddenKey = 'plan.size.hidden.extended';
          plan.actionKey = 'plan.act.extended';
          plan.actionParams = { t: plan.triggerText };
        } else if (relVol != null && relVol >= 1.1) {
          plan.state = 'in_play';
          setLevels(r1, bStop, pickTarget('long', price, bStop, r2), 'last');
          plan.sizeAllowed = true;
          plan.actionKey = 'plan.act.inPlay';
          plan.actionParams = { s: plan.stopText };
        } else {
          plan.state = 'triggered';
          setLevels(r1, bStop, pickTarget('long', price, bStop, r2), 'last');
          plan.actionKey = 'plan.act.triggered';
          plan.actionParams = { t: plan.triggerText };
        }
      } else if (U.isNum(r1) && r1 - price <= atr) {
        plan.setup = 'breakout';
        var wStop = longStop(r1, s1, atr);
        setLevels(r1, wStop, pickTarget('long', r1, wStop, r2), 'trigger');
        plan.state = 'wait';
        plan.sizeAllowed = true;
        plan.actionKey = 'plan.act.wait.breakoutLong';
        plan.actionParams = { t: plan.triggerText };
      } else if (U.isNum(s1) && price - s1 <= atr * 0.75 && (!U.isNum(r1) || r1 - price > atr * 1.5)) {
        plan.setup = 'pullback';
        var pStop = s1 - atr * PULLBACK_STOP_ATR;
        setLevels(s1, pStop, pickTarget('long', s1, pStop, r1), 'trigger');
        plan.state = 'wait';
        plan.sizeAllowed = true;
        plan.actionKey = 'plan.act.wait.pullbackLong';
        plan.actionParams = { s: plan.triggerText };
      } else {
        plan.state = 'no_edge';
        plan.sizeHiddenKey = 'plan.size.hidden.noEdge';
        plan.actionKey = 'plan.act.noEdge';
        plan.actionParams = {
          s: U.isNum(s1) ? fmtP(s1, lang) : '—',
          r: U.isNum(r1) ? fmtP(r1, lang) : '—'
        };
      }
    } else if (side === 'short') {
      if (U.isNum(r1) && price > r1 * 1.001) {
        plan.setup = 'breakout';
        var invStopS = shortStop(r1, r2, atr);
        setLevels(r1, invStopS, pickTarget('short', r1, invStopS, s1), 'trigger');
        plan.state = 'invalidated';
        plan.sizeHiddenKey = 'plan.size.hidden.invalidated';
        plan.actionKey = 'plan.act.invalidatedShort';
        plan.actionParams = { r: plan.r1Text };
      } else if (U.isNum(s1) && price < s1 * 0.999) {
        plan.setup = 'breakout';
        var dStop = shortStop(s1, r1, atr);
        if (price < s1 - atr * EXTENDED_ATR) {
          plan.state = 'extended';
          setLevels(s1, dStop, pickTarget('short', price, dStop, s2), 'last');
          plan.sizeHiddenKey = 'plan.size.hidden.extended';
          plan.actionKey = 'plan.act.extended';
          plan.actionParams = { t: plan.triggerText };
        } else if (relVol != null && relVol >= 1.1) {
          plan.state = 'in_play';
          setLevels(s1, dStop, pickTarget('short', price, dStop, s2), 'last');
          plan.sizeAllowed = true;
          plan.actionKey = 'plan.act.inPlay';
          plan.actionParams = { s: plan.stopText };
        } else {
          plan.state = 'triggered';
          setLevels(s1, dStop, pickTarget('short', price, dStop, s2), 'last');
          plan.actionKey = 'plan.act.triggered';
          plan.actionParams = { t: plan.triggerText };
        }
      } else if (U.isNum(s1) && price - s1 <= atr) {
        plan.setup = 'breakout';
        var wStopS = shortStop(s1, r1, atr);
        setLevels(s1, wStopS, pickTarget('short', s1, wStopS, s2), 'trigger');
        plan.state = 'wait';
        plan.sizeAllowed = true;
        plan.actionKey = 'plan.act.wait.breakoutShort';
        plan.actionParams = { t: plan.triggerText };
      } else if (U.isNum(r1) && r1 - price <= atr * 0.75 && (!U.isNum(s1) || price - s1 > atr * 1.5)) {
        plan.setup = 'pullback';
        var pStopS = r1 + atr * PULLBACK_STOP_ATR;
        setLevels(r1, pStopS, pickTarget('short', r1, pStopS, s1), 'trigger');
        plan.state = 'wait';
        plan.sizeAllowed = true;
        plan.actionKey = 'plan.act.wait.pullbackShort';
        plan.actionParams = { s: plan.triggerText };
      } else {
        plan.state = 'no_edge';
        plan.sizeHiddenKey = 'plan.size.hidden.noEdge';
        plan.actionKey = 'plan.act.noEdge';
        plan.actionParams = {
          s: U.isNum(s1) ? fmtP(s1, lang) : '—',
          r: U.isNum(r1) ? fmtP(r1, lang) : '—'
        };
      }
    } else {
      plan.state = 'no_edge';
      plan.side = 'none';
      plan.sizeHiddenKey = 'plan.size.hidden.noEdge';
      plan.actionKey = 'plan.act.noEdge';
      plan.actionParams = {
        s: U.isNum(s1) ? fmtP(s1, lang) : '—',
        r: U.isNum(r1) ? fmtP(r1, lang) : '—'
      };
    }

    if (sample && plan.state !== 'invalidated') {
      plan.state = 'practice';
      plan.sizeAllowed = false;
      plan.sizeHiddenKey = 'plan.size.hidden.practice';
      plan.actionKey = 'plan.act.practice';
      plan.actionParams = {};
    }

    if (plan.state === 'wait' || plan.state === 'triggered' || plan.state === 'in_play') {
      plan.sizeAllowed = true;
    } else {
      plan.sizeAllowed = false;
    }

    /* ---------------- reasons ---------------- */
    var trendUp = U.isNum(f.sma20) ? price >= f.sma20 : null;
    var trendKey = trendUp === null ? 'plan.reason.trendNone' : trendUp ? 'plan.reason.trendUp' : 'plan.reason.trendDown';
    plan.reasons.push({
      key: trendKey,
      params: { sma: f.sma20Text || '—', d: U.isNum(f.sma20) && f.sma20 ? U.fmtPct(Math.abs(price / f.sma20 - 1) * 100, { sign: false }) : '—' }
    });

    var momKey = (U.isNum(f.ret20) && f.ret20 > 0) ? 'plan.reason.momentumUp'
      : (U.isNum(f.ret20) && f.ret20 < 0) ? 'plan.reason.momentumDown'
        : 'plan.reason.momentumFlat';
    plan.reasons.push({ key: momKey, params: { ret: f.ret20Text || '—', rsi: f.rsiText || '—' } });

    if (plan.state === 'no_edge' && U.isNum(s1) && U.isNum(r1)) {
      plan.reasons.push({
        key: 'plan.reason.midRange',
        params: {
          ds: atrDist(price - s1, atr).toFixed(1),
          dr: atrDist(r1 - price, atr).toFixed(1)
        }
      });
    } else if (U.isNum(plan.trigger)) {
      plan.reasons.push({
        key: 'plan.reason.location',
        params: {
          d: Math.abs(atrDist(plan.trigger - price, atr)).toFixed(1),
          lvl: plan.triggerText
        }
      });
    }

    /* ---------------- confirmation checks ---------------- */
    if (side !== 'none') {
      var wantLong = side === 'long';
      plan.checks = [
        {
          key: 'plan.check.trend',
          ok: U.isNum(f.sma20) ? (wantLong ? price >= f.sma20 : price <= f.sma20) : false,
          params: { sma: f.sma20Text || '—' }
        },
        {
          key: 'plan.check.momentum',
          ok: U.isNum(rsi) ? (wantLong ? rsi >= 45 : rsi <= 55) : false,
          params: { rsi: f.rsiText || '—' }
        },
        {
          key: 'plan.check.volume',
          ok: relVol != null ? relVol >= 1.1 : false,
          params: { rv: f.relVolText || '—' }
        },
        {
          key: 'plan.check.rr',
          ok: U.isNum(plan.rr) ? plan.rr >= 1.5 : false,
          params: { rr: plan.rrText }
        }
      ];
    }

    /* ---------------- warnings ---------------- */
    if (sample) plan.warnings.push('plan.warn.sample');
    if (a.lean && a.lean.confidence === 'low') plan.warnings.push('plan.warn.lowConf');
    if (a.volatility && (a.volatility.key === 'vol.high')) {
      plan.warnings.push('plan.warn.vol');
    }
    if (a.liquidity && a.liquidity.key === 'liq.thin') plan.warnings.push('plan.warn.thin');
    if (side === 'long' && U.isNum(rsi) && rsi >= 72) plan.warnings.push('plan.warn.stretchLong');
    if (side === 'short' && U.isNum(rsi) && rsi <= 28) plan.warnings.push('plan.warn.stretchShort');

    plan.distToTriggerPct = U.isNum(plan.trigger) ? pctDist(price, plan.trigger) : null;
    plan.triggerText = U.isNum(plan.trigger) ? plan.triggerText : '—';

    return plan;
  }

  function size(plan, settings) {
    if (!plan || !plan.sizeAllowed || !U.isNum(plan.entry) || !U.isNum(plan.stop)) return null;
    var s = settings || TA.store.settings();
    var account = Number(s.accountSize);
    var riskPct = Number(s.riskPct);
    if (!(account > 0) || !(riskPct > 0)) return null;
    var perUnit = Math.abs(plan.entry - plan.stop);
    if (!(perUnit > 0)) return null;
    var maxLoss = account * riskPct / 100;
    var units = maxLoss / perUnit;
    var notional = units * plan.entry;
    var capped = false;
    if (notional > account) {
      capped = true;
      units = account / plan.entry;
      notional = account;
      maxLoss = units * perUnit;
    }
    return {
      account: account,
      riskPct: riskPct,
      maxLoss: maxLoss,
      units: units,
      notional: notional,
      perUnit: perUnit,
      capped: capped
    };
  }

  TA.tradeplan = { build: build, size: size };
})(window.TA = window.TA || {});
