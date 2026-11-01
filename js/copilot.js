/* copilot.js — on-device chart copilot.
   Deterministic: every answer is composed from the analysis facts and the
   action plan that are already on the page. No model call, no network. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var PROMPTS = ['setup', 'levels', 'risk', 'trend', 'volatility', 'data', 'scenario'];
  var INTENTS = ['setup', 'levels', 'risk', 'trend', 'volatility', 'volume', 'scenario', 'evidence', 'chart', 'data', 'summary'];
  var CITES = ['plan', 'snapshot', 'context', 'cases', 'levels', 'scenarios', 'risks', 'sources'];

  var RULES = [
    { id: 'data', re: /\b(data|datos|source|sources|fuente|fuentes|fresh|fresc\w*|updated?|actualiz\w*|live|sample|de muestra|delay\w*|retras\w*|feed|retrieved|proveedor)\b/ },
    { id: 'volume', re: /\b(volume|volumen|liquidity|liquidez|participation|participacion)\b/ },
    { id: 'volatility', re: /\b(volatil\w*|atr|range|rango|move|movimiento|amplitud)\b/ },
    { id: 'risk', re: /\b(risks?|riesgos?|invalidat\w*|invalid\w*|stop|downside|wrong|perder|perdida|protege?|proteccion)\b/ },
    { id: 'scenario', re: /\b(scenarios?|simulation|simulate|outcomes?|escenarios?|simulacion|simular|resultados|breakout|break|ruptura|rompe|if)\b/ },
    { id: 'levels', re: /\b(levels?|niveles?|support|soporte|resistance|resistencia)\b/ },
    { id: 'trend', re: /\b(trend|tendencia|direction|direccion|bull\w*|bear\w*|alcista|bajista|momentum|impulso)\b/ },
    { id: 'setup', re: /\b(setup|situacion|plan|trade|entry|entrada|enter|buy|comprar|sell|vender|long|corto|largo|short|action|accion)\b/ },
    { id: 'evidence', re: /\b(evidence|evidencia|why|por que|reason|razon|case|caso)\b/ },
    { id: 'chart', re: /\b(chart|graph|grafico|grafica)\b/ },
    { id: 'summary', re: /\b(summary|resumen|brief|overview|quick|recap|breve|general)\b/ }
  ];

  function T(key, params) { return TA.i18n.t(key, params); }
  function lang() { return TA.i18n.get(); }
  function fmtP(v) { return U.fmtPrice(v, '$', lang()); }
  function fmtPct(v, sign) { return U.fmtPct(v, { sign: sign !== false }); }
  function atrDist(v, atr) {
    return U.isNum(v) && U.isNum(atr) && atr > 0 ? (Math.abs(v) / atr).toFixed(1) : '—';
  }
  function levelText(l) { return l && l.priceText ? l.priceText : '—'; }
  function levelDist(l) { return l && l.distText ? l.distText : '—'; }

  function normalize(q) {
    var s = String(q == null ? '' : q).toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    return s;
  }

  function detect(q) {
    var s = normalize(q);
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(s)) return RULES[i].id;
    }
    return 'fallback';
  }

  function headlineFor(a, plan) {
    var p = plan || {};
    if (p.sample || p.state === 'practice') {
      return { key: 'copilot.brief.practice', params: {} };
    }
    if (p.state === 'invalidated') {
      return p.side === 'long'
        ? { key: 'copilot.brief.invalidatedLong', params: { s: p.s1Text } }
        : { key: 'copilot.brief.invalidatedShort', params: { r: p.r1Text } };
    }
    if (p.state === 'extended') {
      return { key: 'copilot.brief.extended', params: { t: p.triggerText } };
    }
    if (p.state === 'in_play') {
      return {
        key: 'copilot.brief.inPlay',
        params: { t: p.triggerText, s: p.stopText }
      };
    }
    if (p.state === 'triggered') {
      return { key: 'copilot.brief.triggered', params: { t: p.triggerText } };
    }
    if (p.state === 'wait') {
      return {
        key: 'copilot.brief.wait',
        params: { lv: p.triggerText, st: p.stopText, tg: p.targetText }
      };
    }
    if (p.state === 'no_edge') {
      return { key: 'copilot.brief.noEdge', params: { r: p.r1Text, s: p.s1Text } };
    }
    return { key: 'copilot.brief.none', params: {} };
  }

  function prompts() {
    return PROMPTS.map(function (id) {
      return { id: id, key: 'copilot.q.' + id, text: T('copilot.q.' + id) };
    });
  }

  function scenarioLine(plan) {
    var s = plan && plan.scenario;
    if (!s) return null;
    return T('copilot.a.setup.scenario', {
      entry: s.entryText,
      target: s.targetText,
      gain: U.fmtPct(s.gainPct, { sign: true }),
      stop: s.stopText,
      loss: U.fmtPct(-s.lossPct, { sign: true }),
      rr: U.isNum(s.rr) ? s.rr.toFixed(1) + ' : 1' : '—'
    });
  }

  function simulationSummary(plan) {
    var s = plan && plan.simulation;
    if (!s || s.error) return null;
    return T('copilot.a.simulation.summary', {
      side: T(s.side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell'),
      n: s.paths,
      h: s.horizon,
      interval: T('an.interval.' + (s.interval === 'intraday' ? 'intraday' : 'daily')),
      p10: fmtPct(s.p10.movePct),
      median: fmtPct(s.median.movePct),
      p90: fmtPct(s.p90.movePct),
      target: s.hasTarget ? U.fmtPct(s.targetFirstPct, { sign: false }) : T('sim.notSet'),
      stop: s.hasStop ? U.fmtPct(s.stopFirstPct, { sign: false }) : T('sim.notSet')
    });
  }

  function brief(a, plan) {
    a = a || {};
    var f = a.facts || {};
    var p = plan || {};
    var head = headlineFor(a, p);
    var reads = [
      { id: 'trend', labelKey: 'copilot.read.trend', value: T(a.trend ? a.trend.key : 'trend.mixed') },
      {
        id: 'location',
        labelKey: 'copilot.read.location',
        value: T('copilot.read.locationValue', {
          s: levelText(a.nearestSupport),
          r: levelText(a.nearestResistance)
        })
      },
      {
        id: 'momentum',
        labelKey: 'copilot.read.momentum',
        value: T('copilot.read.momentumValue', { rsi: f.rsiText || '—', ret: f.ret20Text || '—' })
      },
      {
        id: 'vol',
        labelKey: 'copilot.read.vol',
        value: T('copilot.read.volValue', { vol: f.vol30Text || '—', atr: f.atrText || '—' })
      }
    ];
    reads.forEach(function (r) { r.label = T(r.labelKey); });

    var points = [];
    function point(key, params) {
      points.push({ key: key, params: params, text: T(key, params) });
    }
    if (a.lean) {
      point('copilot.brief.conf', {
        lean: T('an.lean.' + a.lean.dir),
        conf: T('an.conf.' + a.lean.confidence)
      });
    }
    if (U.isNum(f.relVol)) point('copilot.brief.volume', { rv: f.relVolText });
    if (a.risks && a.risks.length) point('copilot.brief.risk', { risk: T(a.risks[0].key) });

    return {
      headlineKey: head.key,
      headlineParams: head.params,
      headline: T(head.key, head.params),
      tone: p.side === 'long' ? 'up' : p.side === 'short' ? 'down' : 'flat',
      reads: reads,
      points: points.slice(0, 3),
      prompts: prompts()
    };
  }

  /* ---------------- answers ---------------- */

  function setupAnswer(a, plan) {
    var p = plan || {};
    var paragraphs = [];
    var hasSetup = p.setup && p.setup !== 'none';
    paragraphs.push(T(hasSetup ? 'copilot.a.setup.stateSetup' : 'copilot.a.setup.state', {
      state: T('plan.state.' + (p.state || 'no_edge')),
      side: T('plan.side.' + (p.side || 'none')),
      setup: T('plan.setup.' + (p.setup || 'none'))
    }));
    paragraphs.push(T(p.actionKey || 'plan.act.noEdge', p.actionParams || {}));
    if (U.isNum(p.entry) && U.isNum(p.stop) && p.state !== 'no_edge' && p.state !== 'invalidated') {
      paragraphs.push(T('copilot.a.setup.levels', {
        e: p.entryText, s: p.stopText, t: p.targetText, rr: p.rrText
      }));
    }
    if (scenarioLine(p)) paragraphs.push(scenarioLine(p));
    if (simulationSummary(p)) paragraphs.push(simulationSummary(p));
    if (p.checks && p.checks.length) {
      var ok = p.checks.filter(function (c) { return c.ok; }).length;
      paragraphs.push(T('copilot.a.setup.checks', { ok: ok, n: p.checks.length }));
    }
    if (p.warnings && p.warnings.length) {
      paragraphs.push(p.warnings.map(function (k) { return T(k); }).join(' '));
    }
    return { paragraphs: paragraphs, cites: ['plan', 'levels'], followups: ['risk', 'levels'] };
  }

  function levelsAnswer(a, plan) {
    var f = a.facts || {};
    var p = plan || {};
    var s = a.nearestSupport, r = a.nearestResistance;
    var paragraphs = [
      T('copilot.a.levels.nearest', {
        s: levelText(s), sd: levelDist(s),
        sa: atrDist(f.price - (s && s.price), f.atr),
        r: levelText(r), rd: levelDist(r),
        ra: atrDist((r && r.price) - f.price, f.atr)
      }),
      T('copilot.a.levels.next', {
        s2: levelText(a.nextSupport),
        r2: levelText(a.nextResistance)
      })
    ];
    if (U.isNum(f.posInRange)) {
      paragraphs.push(T('copilot.a.levels.range', {
        pos: Math.round(f.posInRange), n: f.windowBars,
        lo: f.rangeLowText, hi: f.rangeHighText
      }));
    }
    if (U.isNum(p.trigger)) {
      paragraphs.push(T('copilot.a.levels.plan', { t: p.triggerText, e: p.entryText }));
    }
    return { paragraphs: paragraphs, cites: ['levels', 'plan'], followups: ['risk', 'setup'] };
  }

  function riskAnswer(a, plan) {
    var p = plan || {};
    var paragraphs = [];
    (a.risks || []).slice(0, 2).forEach(function (r) {
      paragraphs.push(T(r.key) + '. ' + T(r.key + '.d', r.params));
    });
    if (!paragraphs.length) paragraphs.push(T('copilot.a.risk.none'));
    if (U.isNum(p.stop) && p.state !== 'no_edge' && p.state !== 'invalidated') {
      paragraphs.push(T('copilot.a.risk.invalidation', { s: p.stopText }));
    } else {
      paragraphs.push(T('copilot.a.risk.noInvalidation'));
    }
    if (a.volatility && a.liquidity) {
      paragraphs.push(T('copilot.a.risk.vol', {
        vol: T(a.volatility.key),
        liq: T(a.liquidity.key)
      }));
    }
    return { paragraphs: paragraphs, cites: ['risks', 'plan', 'context'], followups: ['setup', 'volatility'] };
  }

  function trendAnswer(a, plan) {
    var f = a.facts || {};
    var paragraphs = [];
    if (U.isNum(f.sma20) && U.isNum(f.price)) {
      paragraphs.push(T('copilot.a.trend.label', {
        trend: T(a.trend ? a.trend.key : 'trend.mixed'),
        d: fmtPct((f.price / f.sma20 - 1) * 100, true),
        sma: f.sma20Text
      }));
    } else {
      paragraphs.push(T('copilot.a.trend.none'));
    }
    if (U.isNum(f.sma20) && U.isNum(f.sma50)) {
      paragraphs.push(T('copilot.a.trend.ma', {
        p20: f.sma20Text, p50: f.sma50Text,
        d20: fmtPct((f.price / f.sma20 - 1) * 100, true),
        d50: fmtPct((f.price / f.sma50 - 1) * 100, true)
      }));
    }
    if (a.momentum) {
      paragraphs.push(T('copilot.a.trend.momentum', {
        mom: T(a.momentum.key), ret: f.ret20Text || '—', rsi: f.rsiText || '—'
      }));
    }
    if (a.lean) {
      paragraphs.push(T('an.lean.' + a.lean.dir + '.' + a.lean.confidence));
    }
    return { paragraphs: paragraphs, cites: ['context', 'cases'], followups: ['levels', 'evidence'] };
  }

  function volatilityAnswer(a, plan) {
    var f = a.facts || {};
    var paragraphs = [];
    if (a.volatility) {
      paragraphs.push(T('copilot.a.vol.regime', {
        key: T(a.volatility.key), vol: f.vol30Text || '—',
        atr: f.atrText || '—', pct: f.atrPctText || '—'
      }));
    }
    if (U.isNum(f.vol30)) {
      paragraphs.push(T('copilot.a.vol.range', {
        range: f.typicalRangeText || '—', move: f.expectedMoveText || '—',
        lo: f.moveLoText || '—', hi: f.moveHiText || '—'
      }));
    }
    if (U.isNum(f.atr)) paragraphs.push(T('copilot.a.vol.stop', { atr: f.atrText }));
    return { paragraphs: paragraphs, cites: ['context', 'risks'], followups: ['risk', 'setup'] };
  }

  function volumeAnswer(a, plan) {
    var f = a.facts || {};
    var p = plan || {};
    var paragraphs = [];
    if (U.isNum(f.relVol)) {
      paragraphs.push(T('copilot.a.volume.rel', { rv: f.relVolText }));
    } else {
      paragraphs.push(T('copilot.a.volume.none'));
    }
    var check = (p.checks || []).filter(function (c) { return c.key === 'plan.check.volume'; })[0];
    if (check) {
      paragraphs.push(T('copilot.a.volume.confirm', {
        state: T(check.ok ? 'copilot.a.volume.yes' : 'copilot.a.volume.no')
      }));
    }
    return { paragraphs: paragraphs, cites: ['snapshot', 'plan'], followups: ['setup', 'risk'] };
  }

  function scenarioAnswer(a, plan) {
    var p = plan || {};
    var paragraphs = (a.scenarios || []).map(function (sc) {
      return T('copilot.a.scenario.line', {
        name: T(sc.titleKey, sc.params),
        trigger: T(sc.triggerKey, sc.params2),
        invalid: T(sc.invalidKey, sc.params2)
      });
    });
    if (!paragraphs.length) paragraphs.push(T('copilot.a.scenario.none'));
    if (simulationSummary(p)) paragraphs.push(simulationSummary(p));
    return { paragraphs: paragraphs, cites: ['scenarios'], followups: ['risk', 'levels'] };
  }

  function evidenceAnswer(a, plan) {
    var p = plan || {};
    var paragraphs = [];
    if (a.lean) paragraphs.push(T('an.lean.' + a.lean.dir + '.' + a.lean.confidence));
    if (scenarioLine(p)) paragraphs.push(scenarioLine(p));
    var bull = ((a.evidence && a.evidence.bull) || []).map(function (e) { return T(e.key, e.params); }).join(' · ');
    var bear = ((a.evidence && a.evidence.bear) || []).map(function (e) { return T(e.key, e.params); }).join(' · ');
    paragraphs.push(T('copilot.a.evidence.bull', { list: bull || '—' }));
    paragraphs.push(T('copilot.a.evidence.bear', { list: bear || '—' }));
    return { paragraphs: paragraphs, cites: ['cases'], followups: ['trend', 'risk'] };
  }

  function chartAnswer(a, plan) {
    var f = a.facts || {};
    var m = a.meta || {};
    var chart = a.chart || {};
    var closes = chart.closes || [];
    var lastClose = closes.length ? closes[closes.length - 1] : null;
    function lastValid(values) {
      values = values || [];
      for (var i = values.length - 1; i >= 0; i--) if (U.isNum(values[i])) return values[i];
      return null;
    }
    function relation(value, average) {
      if (!U.isNum(value) || !U.isNum(average)) return T('copilot.a.chart.notComparable');
      var delta = Math.abs(value / average - 1);
      if (delta < 0.0005) return T('copilot.a.chart.near');
      return T(value > average ? 'copilot.a.chart.above' : 'copilot.a.chart.below');
    }
    var interval = T('an.interval.' + (m.interval === 'intraday' ? 'intraday' : 'daily'));
    var paragraphs = [
      T('copilot.a.chart.window', { n: m.barCount, interval: interval, price: U.isNum(lastClose) ? fmtP(lastClose) : (f.priceText || fmtP(f.price)) }),
      T('copilot.a.chart.range', {
        lo: f.rangeLowText || '—', hi: f.rangeHighText || '—',
        dd: f.drawdownText || '—', fromLow: f.fromLowText || '—'
      }),
      T('copilot.a.chart.lines', {
        sma20: f.sma20Text || '—', sma50: f.sma50Text || '—',
        n: (a.levels || []).length
      })
    ];
    if (U.isNum(lastClose)) {
      paragraphs.push(T('copilot.a.chart.barClose', { close: fmtP(lastClose) }));
      var quote = U.isNum(f.price) ? f.price : null;
      var difference = quote && lastClose ? Math.abs(quote / lastClose - 1) * 100 : 0;
      if (difference >= 0.05) {
        paragraphs.push(T('copilot.a.chart.quoteGap', {
          quote: fmtP(quote), close: fmtP(lastClose), diff: fmtPct(difference, false)
        }));
      }
      var sma20 = lastValid(chart.sma20);
      var sma50 = lastValid(chart.sma50);
      if (U.isNum(sma20) && U.isNum(sma50)) {
        paragraphs.push(T('copilot.a.chart.maRead', {
          close: fmtP(lastClose), vs20: relation(lastClose, sma20), sma20: U.isNum(sma20) ? fmtP(sma20) : '—',
          vs50: relation(lastClose, sma50), sma50: U.isNum(sma50) ? fmtP(sma50) : '—'
        }));
      }
    }
    if (a.chart && a.chart.sample) paragraphs.push(T('copilot.a.chart.sample'));
    return { paragraphs: paragraphs, cites: ['snapshot', 'levels'], followups: ['levels', 'trend'] };
  }

  function dataAnswer(a, plan) {
    var p = plan || {};
    var m = a.meta || {};
    var paragraphs = [
      T('copilot.a.data.source', {
        provider: T('src.' + (m.provider || 'sample') + '.name'),
        time: U.fmtDateTime(m.retrievedAt, lang())
      }),
      T('copilot.a.data.mode', { mode: T(p.dataKey || 'plan.data.last') }),
      T('copilot.a.data.series', {
        time: U.fmtDateTime(m.seriesEnd, lang()),
        n: m.barCount, grain: m.grainNote || '—'
      })
    ];
    if (p.sample) paragraphs.push(T('copilot.a.data.sample'));
    return { paragraphs: paragraphs, cites: ['sources'], followups: ['chart', 'setup'] };
  }

  function summaryAnswer(a, plan) {
    var p = plan || {};
    var b = brief(a, p);
    var paragraphs = [b.headline];
    if (U.isNum(p.entry) && U.isNum(p.stop) && p.state !== 'no_edge' && p.state !== 'invalidated') {
      paragraphs.push(T('copilot.a.summary.levels', {
        sup: levelText(a.nearestSupport),
        res: levelText(a.nearestResistance),
        ent: p.entryText, stop: p.stopText, tgt: p.targetText
      }));
    }
    if (a.lean) paragraphs.push(T('an.lean.' + a.lean.dir + '.' + a.lean.confidence));
    return { paragraphs: paragraphs, cites: ['snapshot', 'plan', 'risks'], followups: ['setup', 'risk'] };
  }

  function fallbackAnswer() {
    return {
      paragraphs: [T('copilot.fallback')],
      cites: [],
      followups: ['summary', 'levels', 'risk']
    };
  }

  var RESOLVERS = {
    setup: setupAnswer,
    levels: levelsAnswer,
    risk: riskAnswer,
    trend: trendAnswer,
    volatility: volatilityAnswer,
    volume: volumeAnswer,
    scenario: scenarioAnswer,
    evidence: evidenceAnswer,
    chart: chartAnswer,
    data: dataAnswer,
    summary: summaryAnswer,
    fallback: fallbackAnswer
  };

  function answer(q, a, plan, opts) {
    var id = detect(q);
    var res = RESOLVERS[id](a || {}, plan || {}, opts || {});
    return {
      id: id,
      titleKey: 'copilot.intent.' + id,
      title: T('copilot.intent.' + id),
      paragraphs: res.paragraphs.filter(function (p) { return !!p; }),
      cites: res.cites || [],
      followups: res.followups || []
    };
  }

  TA.copilot = {
    brief: brief,
    answer: answer,
    detect: detect,
    question: function (id) { return T('copilot.q.' + id); },
    PROMPTS: PROMPTS,
    INTENTS: INTENTS,
    CITES: CITES
  };
})(window.TA = window.TA || {});
