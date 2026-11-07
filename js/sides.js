/* sides.js — one analysis input, two conditional plan cases (buy and sell). */
(function (TA) {
  'use strict';
  var U = TA.util;

  function caseFor(side, plan) {
    var sc = plan.scenario || {};
    var entry = U.isNum(sc.entry) ? sc.entry : plan.entry;
    var stop = U.isNum(sc.stop) ? sc.stop : plan.stop;
    var target = U.isNum(sc.target) ? sc.target : plan.target;
    var risk = U.isNum(entry) && U.isNum(stop) ? Math.abs(entry - stop) : null;
    var reward = U.isNum(entry) && U.isNum(target) ? Math.abs(target - entry) : null;
    return {
      side: side,
      state: plan.state,
      setup: plan.setup || 'none',
      actionable: !!plan.sizeAllowed,
      hypothetical: !!sc.hypothetical,
      entry: entry,
      stop: stop,
      target: target,
      rr: U.isNum(sc.rr) ? sc.rr : null,
      gainPct: U.isNum(sc.gainPct) ? sc.gainPct : null,
      lossPct: U.isNum(sc.lossPct) ? sc.lossPct : null,
      perShareRisk: U.isNum(risk) && risk > 0 ? risk : null,
      perShareReward: U.isNum(reward) && reward > 0 ? reward : null
    };
  }

  function build(input, opts) {
    opts = opts || {};
    var asset = input && (input.asset || (input.a && input.a.asset));
    var a = input && input.a;
    if (!asset || !asset.symbol || !a || !a.facts) return null;
    var quote = input.quote || {};
    var meta = input.meta || a.meta || {};
    var lang = opts.lang || a.lang || 'en';
    var price = U.isNum(quote.price) && quote.price > 0 ? quote.price
      : (U.isNum(a.facts.price) && a.facts.price > 0 ? a.facts.price : null);
    if (!price) return null;
    var changePct = U.isNum(quote.changePct) ? quote.changePct : a.facts.changePct;
    var asOf = meta.providerUpdatedAt || meta.seriesEnd || input.asOf || null;

    function planFor(side) {
      return TA.tradeplan.build(a, {
        lang: lang,
        style: opts.style || 'swing',
        side: side,
        price: price,
        changePct: changePct,
        asOf: asOf || Date.now()
      });
    }

    return {
      symbol: asset.symbol,
      name: asset.name || asset.symbol,
      sector: asset.sector || 'Stock',
      asset: asset,
      price: price,
      changePct: U.isNum(changePct) ? changePct : null,
      lean: {
        dir: a.lean ? a.lean.dir : 'neutral',
        confidence: a.lean ? a.lean.confidence : null,
        ratio: a.lean && U.isNum(a.lean.ratio) ? a.lean.ratio : 0
      },
      buy: caseFor('long', planFor('long')),
      sell: caseFor('short', planFor('short')),
      dataMode: meta.dataMode === 'sample' ? 'sample' : 'live',
      asOf: asOf
    };
  }

  TA.sides = { build: build };
})(window.TA = window.TA || {});
