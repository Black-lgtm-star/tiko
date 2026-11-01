/* simulation.js — historical block-bootstrap outcome scenarios, not a forecast. */
(function (TA) {
  'use strict';
  var U = TA.util;

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var index = (sorted.length - 1) * q;
    var lo = Math.floor(index), hi = Math.ceil(index);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  }

  function run(a, plan, opts) {
    opts = opts || {};
    var horizon = [5, 10, 20].indexOf(Number(opts.horizon)) >= 0 ? Number(opts.horizon) : 10;
    var closes = a && a.chart && Array.isArray(a.chart.closes) ? a.chart.closes : [];
    closes = closes.filter(function (v) { return U.isNum(v) && v > 0; }).slice(-121);
    var returns = [];
    for (var i = 1; i < closes.length; i++) {
      var r = Math.log(closes[i] / closes[i - 1]);
      if (isFinite(r)) returns.push(r);
    }
    if (returns.length < 20) return { error: 'sim.insufficient', horizon: horizon, historyCount: returns.length };

    var side = plan && plan.side;
    if (side !== 'long' && side !== 'short') return { error: 'sim.chooseSideError', horizon: horizon, historyCount: returns.length };
    var sign = side === 'long' ? 1 : -1;
    var entry = plan && U.isNum(plan.entry) && plan.entry > 0 ? plan.entry : (plan && plan.price);
    if (!U.isNum(entry) || entry <= 0) return { error: 'sim.insufficient', horizon: horizon, historyCount: returns.length };
    var stop = plan && plan.stop;
    var target = plan && plan.target;
    var hasStop = U.isNum(stop) && (side === 'long' ? stop < entry : stop > entry);
    var hasTarget = U.isNum(target) && (side === 'long' ? target > entry : target < entry);
    var paths = 1000;
    var outcomes = [];
    var targetFirst = 0, stopFirst = 0, neither = 0;
    var seed = U.hashStr([
      a.asset && a.asset.symbol, side, entry, hasStop ? stop : '-', hasTarget ? target : '-',
      horizon, closes[closes.length - 1], returns.length
    ].join('|'));
    var rng = U.mulberry32(seed);
    var blockSize = Math.min(4, horizon);

    for (var p = 0; p < paths; p++) {
      var price = entry;
      var firstHit = null;
      var step = 0;
      while (step < horizon) {
        var start = Math.floor(rng() * returns.length);
        for (var b = 0; b < blockSize && step < horizon; b++) {
          var sample = returns[start + b];
          if (!U.isNum(sample)) break;
          price *= Math.exp(sample);
          step++;
          if (hasStop && (side === 'long' ? price <= stop : price >= stop)) {
            firstHit = 'stop';
            break;
          }
          if (hasTarget && (side === 'long' ? price >= target : price <= target)) {
            firstHit = 'target';
            break;
          }
        }
        if (firstHit) break;
      }
      if (firstHit === 'stop') stopFirst++;
      else if (firstHit === 'target') targetFirst++;
      else neither++;
      outcomes.push({ movePct: sign * (price / entry - 1) * 100, endPrice: price });
    }

    outcomes.sort(function (x, y) { return x.movePct - y.movePct; });
    function band(q) {
      var pct = quantile(outcomes.map(function (x) { return x.movePct; }), q);
      var index = Math.round((outcomes.length - 1) * q);
      return { movePct: pct, endPrice: outcomes[index].endPrice };
    }
    return {
      side: side,
      horizon: horizon,
      paths: paths,
      historyCount: returns.length,
      interval: a.meta && a.meta.interval || 'daily',
      sample: !!(a.meta && a.meta.dataMode === 'sample'),
      hypotheticalEntry: !(plan && U.isNum(plan.entry) && plan.entry > 0),
      entry: entry,
      p10: band(0.10),
      median: band(0.50),
      p90: band(0.90),
      hasStop: hasStop,
      hasTarget: hasTarget,
      stopFirstPct: stopFirst / paths * 100,
      targetFirstPct: targetFirst / paths * 100,
      neitherPct: neither / paths * 100
    };
  }

  TA.simulation = { run: run };
})(window.TA = window.TA || {});
