/* recommend.js — deterministic ranking of rule-based stock setups.
   Pure: it scores the same analysis + plan inputs the rest of the app already
   produces. No forecasts, no personalized advice, no network. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var VERSION = 1;
  var MIN_SCORE = 45;
  var MAX_PER_SECTOR = 2;

  // The plan state is the strongest single input: an active or triggered setup
  // is closer to actionable than a pullback still waiting for its trigger.
  var STATE_POINTS = {
    in_play: 15,
    triggered: 12,
    wait: 10,
    practice: 9,
    no_edge: 3,
    extended: 0,
    invalidated: 0
  };

  function validLevels(side, entry, stop, target) {
    if (!U.isNum(entry) || !U.isNum(stop) || !U.isNum(target)) return false;
    if (entry <= 0 || stop <= 0 || target <= 0) return false;
    return side === 'long' ? stop < entry && target > entry : stop > entry && target < entry;
  }

  function confWeight(confidence) {
    return confidence === 'high' ? 1 : confidence === 'medium' ? 0.82 : 0.55;
  }

  function scoreInput(input) {
    var asset = input && input.asset;
    var a = input && input.a;
    var plan = input && input.plan;
    var meta = (input && input.meta) || {};
    if (!asset || !asset.symbol || !a || !plan) return null;
    if (plan.side !== 'long' && plan.side !== 'short') return null;
    if (!validLevels(plan.side, plan.entry, plan.stop, plan.target)) return null;

    var side = plan.side;
    var sample = meta.dataMode === 'sample' || plan.state === 'practice';
    var state = plan.state === 'practice' ? 'practice' : (plan.state || 'no_edge');
    var facts = a.facts || {};
    var lean = a.lean || {};
    var trend = a.trend || {};
    var liquidity = a.liquidity || {};
    var volatility = a.volatility || {};

    /* ---- directional evidence (0-30) ---- */
    var ratio = U.isNum(lean.ratio) ? Math.abs(lean.ratio) : 0;
    var edge = U.clamp(6 + ratio * 58, 0, 30) * confWeight(lean.confidence);

    /* ---- trend alignment with the chosen side (0-20) ---- */
    var rawTrend = U.isNum(trend.score) ? trend.score : 0;
    var align = side === 'long' ? rawTrend : -rawTrend;
    var trendPts = U.clamp((align + 0.5) / 4, 0, 1) * 20;

    /* ---- reward-to-risk (0-18) ---- */
    var rrPts = U.isNum(plan.rr) ? U.clamp((plan.rr - 1.2) / 1.8, 0, 1) * 18 : 0;

    /* ---- setup state (0-15) ---- */
    var statePts = STATE_POINTS[state] == null ? 0 : STATE_POINTS[state];

    /* ---- liquidity (0-8) ---- */
    var liqPts = liquidity.key === 'liq.deep' ? 8
      : liquidity.key === 'liq.moderate' ? 5
        : liquidity.key === 'liq.thin' ? 0 : 3;

    /* ---- volume confirmation (0-5) ---- */
    var relVol = U.isNum(facts.relVol) ? facts.relVol : null;
    var volPts = relVol == null ? 0 : relVol >= 1.1 ? 5 : relVol >= 0.9 ? 3 : 0;

    /* ---- confirmation checks (0-4) ---- */
    var checks = Array.isArray(plan.checks) ? plan.checks : [];
    var passed = checks.filter(function (c) { return c && c.ok; }).length;
    var checkPts = checks.length ? passed / checks.length * 4 : 0;

    var score = edge + trendPts + rrPts + statePts + liqPts + volPts + checkPts;

    /* ---- risk penalties ---- */
    if (sample) score -= 8;
    if (state === 'extended') score -= 8;
    if (state === 'invalidated') score -= 15;
    if (volatility.key === 'vol.high') score -= 6;
    else if (volatility.key === 'vol.elevated') score -= 2;
    if (liquidity.key === 'liq.thin') score -= 4;
    if (lean.confidence === 'low') score -= 4;
    if (U.isNum(facts.rsi)) {
      if (side === 'long' && facts.rsi >= 72) score -= 6;
      if (side === 'short' && facts.rsi <= 28) score -= 6;
    }

    score = U.round(U.clamp(score, 0, 100), 1);

    var decision = TA.bot && TA.bot.decide
      ? TA.bot.decide(a, plan)
      : { action: 'skip', reason: 'noEdge' };
    var evidence = a.evidence ? (side === 'long' ? a.evidence.bull : a.evidence.bear) : [];
    var reasons = (Array.isArray(evidence) ? evidence : []).slice(0, 2).map(function (e) {
      return { key: e.key, params: e.params || {} };
    });
    var warnings = Array.isArray(plan.warnings) ? plan.warnings.slice(0, 2) : [];

    return {
      symbol: asset.symbol,
      name: asset.name || asset.symbol,
      sector: asset.sector || (asset.isEtf ? 'ETF' : 'Stock'),
      assetClass: asset.assetClass || 'stock',
      asset: asset,
      side: side,
      setup: plan.setup || 'none',
      state: state,
      action: decision.action,
      actionReason: decision.reason,
      tier: score >= 72 ? 'strong' : score >= 58 ? 'solid' : score >= MIN_SCORE ? 'watch' : 'weak',
      score: score,
      scoreParts: {
        edge: U.round(edge, 1),
        trend: U.round(trendPts, 1),
        reward: U.round(rrPts, 1),
        state: statePts,
        liquidity: liqPts,
        volume: volPts,
        checks: U.round(checkPts, 1)
      },
      entry: plan.entry,
      stop: plan.stop,
      target: plan.target,
      rr: U.isNum(plan.rr) ? U.round(plan.rr, 2) : null,
      price: U.isNum(input.price) ? input.price : (U.isNum(facts.price) ? facts.price : plan.entry),
      confidence: lean.confidence || null,
      checks: { passed: passed, total: checks.length },
      reasons: reasons,
      warnings: warnings,
      riskKey: riskKeyFor(a, plan, sample),
      dataMode: sample ? 'sample' : 'live',
      executable: !sample && decision.action === 'open',
      asOf: meta.providerUpdatedAt || meta.seriesEnd || (input.meta && input.meta.retrievedAt) || null
    };
  }

  function riskKeyFor(a, plan, sample) {
    if (sample) return 'ideas.risk.sample';
    if (plan.state === 'extended') return 'ideas.risk.extended';
    if (plan.state === 'invalidated') return 'ideas.risk.invalidated';
    if (a.volatility && a.volatility.key === 'vol.high') return 'ideas.risk.volatile';
    if (plan.side === 'long' && U.isNum(a.facts && a.facts.rsi) && a.facts.rsi >= 72) return 'ideas.risk.stretch';
    if (plan.side === 'short' && U.isNum(a.facts && a.facts.rsi) && a.facts.rsi <= 28) return 'ideas.risk.stretch';
    if (a.lean && a.lean.confidence === 'low') return 'ideas.risk.thinEvidence';
    if (a.liquidity && a.liquidity.key === 'liq.thin') return 'ideas.risk.liquidity';
    if (plan.state === 'wait') return 'ideas.risk.notTriggered';
    return 'ideas.risk.normal';
  }

  function byRank(x, y) {
    if (y.score !== x.score) return y.score - x.score;
    if ((y.rr || 0) !== (x.rr || 0)) return (y.rr || 0) - (x.rr || 0);
    return x.symbol.localeCompare(y.symbol);
  }

  // Rank every valid input, then keep the shortlist diversified so one hot
  // sector cannot fill the page. Deferred ideas stay available for callers.
  function rank(inputs, opts) {
    opts = opts || {};
    var max = U.isNum(opts.max) && opts.max > 0 ? Math.floor(opts.max) : 6;
    var minScore = U.isNum(opts.minScore) ? opts.minScore : MIN_SCORE;
    var perSector = U.isNum(opts.maxPerSector) ? Math.max(1, Math.floor(opts.maxPerSector)) : MAX_PER_SECTOR;
    var scored = [];
    (inputs || []).forEach(function (input) {
      var idea = scoreInput(input);
      if (idea) scored.push(idea);
    });
    scored.sort(byRank);

    var eligible = scored.filter(function (idea) {
      return idea.score >= minScore && idea.state !== 'extended' && idea.state !== 'invalidated';
    });
    var sectorCount = {};
    var ideas = [];
    var deferred = [];
    eligible.forEach(function (idea) {
      var used = sectorCount[idea.sector] || 0;
      if (ideas.length < max && used < perSector) {
        sectorCount[idea.sector] = used + 1;
        ideas.push(idea);
      } else {
        deferred.push(idea);
      }
    });
    ideas.forEach(function (idea, i) { idea.rank = i + 1; });

    return {
      at: U.isNum(opts.now) ? opts.now : Date.now(),
      ideas: ideas,
      deferred: deferred,
      scoredCount: scored.length,
      eligibleCount: eligible.length,
      sampleCount: scored.filter(function (idea) { return idea.dataMode === 'sample'; }).length,
      liveCount: scored.filter(function (idea) { return idea.dataMode === 'live'; }).length,
      minScore: minScore
    };
  }

  function universe() {
    return TA.catalog && TA.catalog.stocks ? TA.catalog.stocks() : [];
  }

  TA.recommend = {
    version: VERSION,
    minScore: MIN_SCORE,
    maxPerSector: MAX_PER_SECTOR,
    score: scoreInput,
    rank: rank,
    universe: universe
  };
})(window.TA = window.TA || {});
