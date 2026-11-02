/* copilot.js — on-device chart copilot.
   Deterministic: every answer is composed from the analysis facts and the
   action plan that are already on the page. No model call, no network. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var PROMPTS = ['buySell', 'setup', 'actions', 'exits', 'levels', 'risk', 'trend', 'volatility', 'data', 'scenario', 'simple'];
  var INTENTS = ['buySell', 'setup', 'actions', 'exits', 'levels', 'risk', 'trend', 'volatility', 'volume', 'scenario', 'evidence', 'chart', 'image', 'data', 'summary', 'simple'];
  var CITES = ['plan', 'snapshot', 'context', 'cases', 'levels', 'scenarios', 'risks', 'sources'];

  var RULES = [
    {
      id: 'buySell',
      words: ['buy', 'sell', 'long', 'short', 'comprar', 'vender', 'corto', 'largo'],
      phrases: [
        'should i buy or sell', 'buy or sell', 'should i buy', 'should i sell',
        'should i go long', 'should i go short', 'is it a buy', 'is it a sell',
        'long or short',
        'debo comprar o vender', 'compro o vendo', 'comprar o vender',
        'debo comprar', 'debo vender', 'largo o corto', 'es compra', 'es venta'
      ]
    },
    {
      id: 'actions',
      words: ['steps', 'checklist', 'manage', 'managing', 'management', 'execute', 'execution', 'siguiente', 'siguientes', 'pasos', 'gestionar', 'ejecutar', 'ejecucion', 'hacer'],
      phrases: [
        'what should i do', 'what do i do next', 'what next', 'next steps', 'trade actions',
        'on this side', 'for this side', 'if i buy', 'if i sell', 'if i go long', 'if i go short',
        'after i buy', 'after i sell', 'what happens after i',
        'que hago', 'que deberia hacer', 'si compro', 'si vendo', 'acciones a tomar',
        'pasos siguientes', 'despues de comprar', 'despues de vender', 'mis pasos'
      ]
    },
    {
      id: 'data',
      words: ['data', 'datos', 'source', 'sources', 'fuente', 'fuentes', 'fresh', 'freshness', 'fresco', 'frescos', 'fresca', 'frescas', 'updated', 'update', 'actualizado', 'actualizada', 'live', 'sample', 'sampled', 'synthetic', 'sintetico', 'delayed', 'delay', 'retraso', 'retrasado', 'feed', 'retrieved', 'provider', 'proveedor', 'stale', 'realtime', 'antiguo', 'antiguedad'],
      phrases: ['how fresh', 'data source', 'que tan frescos', 'de donde salen']
    },
    {
      id: 'volume',
      words: ['volume', 'volumen', 'liquidity', 'liquidez', 'participation', 'participacion', 'relvol'],
      phrases: ['relative volume']
    },
    {
      id: 'volatility',
      words: ['volatility', 'volatilidad', 'volatile', 'volatil', 'atr', 'range', 'rango', 'amplitud', 'swing', 'vix'],
      phrases: ['how much does it move']
    },
    {
      id: 'exits',
      words: ['stop', 'stops', 'loss', 'losses', 'take', 'profit', 'profits', 'objetivo', 'objetivos', 'meta', 'metas', 'target', 'targets', 'exit', 'exits', 'salida', 'salidas', 'ganancia', 'ganancias', 'beneficio', 'beneficios', 'trailing', 'rr'],
      phrases: ['stop loss', 'take profit', 'profit target', 'reward to risk', 'risk reward', 'perdida maxima']
    },
    {
      id: 'risk',
      words: ['risk', 'risks', 'riesgo', 'riesgos', 'invalidate', 'invalidates', 'invalidated', 'invalidation', 'invalidaria', 'invalidar', 'downside', 'wrong', 'perder', 'perdida', 'protection', 'proteccion', 'danger', 'peligro', 'unprotected'],
      phrases: ['what could go wrong', 'how much can i lose']
    },
    {
      id: 'scenario',
      words: ['scenario', 'scenarios', 'escenario', 'escenarios', 'simulation', 'simulate', 'simulacion', 'simular', 'outcome', 'outcomes', 'resultado', 'resultados', 'breakout', 'break', 'breaks', 'breaking', 'ruptura', 'rompe', 'romper', 'path', 'paths', 'camino', 'probability', 'probabilidad'],
      phrases: ['what if', 'what happens if', 'if price', 'if it', 'que pasa si', 'si rompe', 'break out', 'breaks out']
    },
    {
      id: 'levels',
      words: ['level', 'levels', 'nivel', 'niveles', 'support', 'soporte', 'supports', 'resistance', 'resistencia', 'zone', 'zona', 'floor', 'ceiling'],
      phrases: ['key levels', 'niveles clave']
    },
    {
      id: 'trend',
      words: ['trend', 'trends', 'tendencia', 'tendencias', 'direction', 'direccion', 'bullish', 'alcista', 'bearish', 'bajista', 'momentum', 'impulso', 'sma', 'ema', 'average', 'averages', 'media', 'moving', 'slope', 'uptrend', 'downtrend'],
      phrases: ['higher highs', 'lower lows', 'moving average']
    },
    {
      id: 'setup',
      words: ['setup', 'situacion', 'plan', 'trade', 'entry', 'entrada', 'enter', 'buy', 'comprar', 'sell', 'vender', 'long', 'corto', 'largo', 'short', 'action', 'accion', 'position', 'posicion'],
      phrases: ['should i', 'what now', 'what do i do', 'set up']
    },
    {
      id: 'evidence',
      words: ['evidence', 'evidencia', 'why', 'reason', 'reasons', 'razon', 'razones', 'case', 'cases', 'caso', 'casos', 'justify', 'rationale', 'justificacion', 'explanation', 'explicacion'],
      phrases: ['por que']
    },
    {
      id: 'chart',
      words: ['chart', 'charts', 'graph', 'graphs', 'grafico', 'grafica', 'graficos', 'plot', 'candle', 'candles', 'vela', 'velas', 'series', 'serie'],
      phrases: ['what does the chart']
    },
    {
      id: 'image',
      words: ['screenshot', 'screenshots', 'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'upload', 'uploaded', 'uploads', 'attach', 'attached', 'attachment', 'captura', 'imagen', 'imagenes', 'foto', 'fotos', 'scan', 'scanned', 'escanear'],
      phrases: ['sent you', 'i sent', 'this screenshot', 'this image', 'my screenshot', 'my chart', 'te envie', 'te mando', 'read this chart']
    },
    {
      id: 'summary',
      words: ['summary', 'resumen', 'brief', 'overview', 'quick', 'recap', 'tldr', 'breve', 'general', 'summarize', 'resumir', 'panorama'],
      phrases: ['big picture', 'bottom line']
    },
    {
      id: 'simple',
      words: ['simplify', 'simplified', 'simpler', 'simply', 'brevemente', 'sencillo', 'sencilla', 'simplifica', 'simplificado', 'eli5'],
      phrases: [
        'in simple terms', 'keep it simple', 'simple answer', 'simple version', 'plain english',
        'explain this simply', 'explain simply', 'in one sentence', 'explain like i m five',
        'sin complicaciones', 'en simple', 'en palabras sencillas', 'de forma sencilla',
        'explica simple', 'explicalo simple', 'explicamelo simple',
        'responde simple', 'mas simple', 'lo mas simple'
      ]
    }
  ];

  var SIMPLE_RULE = RULES[RULES.length - 1];

  function wantsSimple(q) {
    var s = normalize(q);
    var tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
    return scoreRule(SIMPLE_RULE, tokens, ' ' + tokens.join(' ') + ' ') > 0;
  }

  var DETECT_CACHE = Object.create(null);
  var DETECT_CACHE_SIZE = 0;

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

  function lemma(tok, word) {
    if (tok === word) return true;
    if (tok.length < 5) return false;
    var bases = [tok];
    if (/ies$/.test(tok)) bases.push(tok.slice(0, -3) + 'y');
    if (/es$/.test(tok)) bases.push(tok.slice(0, -2));
    if (/s$/.test(tok)) bases.push(tok.slice(0, -1));
    if (/ed$/.test(tok)) bases.push(tok.slice(0, -2), tok.slice(0, -1));
    if (/ing$/.test(tok)) bases.push(tok.slice(0, -3), tok.slice(0, -3) + 'e');
    if (/ions$/.test(tok)) bases.push(tok.slice(0, -4), tok.slice(0, -4) + 'e');
    else if (/ion$/.test(tok)) bases.push(tok.slice(0, -3), tok.slice(0, -3) + 'e');
    for (var i = 0; i < bases.length; i++) if (bases[i] === word) return true;
    return false;
  }

  function editDistance(a, b) {
    var prev = [];
    var i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function fuzzy(tok, word) {
    if (tok.length < 6 || word.length < 6) return false;
    if (Math.abs(tok.length - word.length) > 1) return false;
    return editDistance(tok, word) === 1;
  }

  function scoreRule(rule, tokens, padded) {
    var score = 0;
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var hit = 0;
      for (var j = 0; j < rule.words.length; j++) {
        var word = rule.words[j];
        if (lemma(tok, word)) { hit = 1; break; }
        if (fuzzy(tok, word)) { hit = 1; break; }
      }
      score += hit;
    }
    for (var k = 0; k < rule.phrases.length; k++) {
      if (padded.indexOf(' ' + rule.phrases[k] + ' ') >= 0) score += 2;
    }
    return score;
  }

  function detect(q) {
    var s = normalize(q);
    var hit = DETECT_CACHE[s];
    if (hit) return hit;
    var tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
    var padded = ' ' + tokens.join(' ') + ' ';
    var best = 'fallback';
    var bestScore = 0;
    for (var i = 0; i < RULES.length; i++) {
      var score = scoreRule(RULES[i], tokens, padded);
      if (score > bestScore) {
        bestScore = score;
        best = RULES[i].id;
      }
    }
    // "Simple" is a request for a shorter answer, not a topic. When another
    // rule also matches a word, prefer that topic and let the answer shrink.
    if (best === 'simple') {
      var topic = 'simple';
      var topicScore = 0;
      for (var t = 0; t < RULES.length - 1; t++) {
        var s = scoreRule(RULES[t], tokens, padded);
        if (s > topicScore) { topicScore = s; topic = RULES[t].id; }
      }
      if (topicScore >= 2 || topicScore >= bestScore) best = topic;
    }
    var out = bestScore >= 1 ? best : 'fallback';
    if (DETECT_CACHE_SIZE > 80) { DETECT_CACHE = Object.create(null); DETECT_CACHE_SIZE = 0; }
    DETECT_CACHE[s] = out;
    DETECT_CACHE_SIZE++;
    return out;
  }

  var BRIEF_CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
  var ANSWER_CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;

  function nested(root, a, plan, key, build) {
    if (!root) return build();
    var perA = root.get(a);
    if (!perA) { perA = new WeakMap(); root.set(a, perA); }
    var bucket = perA.get(plan);
    if (!bucket) { bucket = Object.create(null); perA.set(plan, bucket); }
    if (Object.prototype.hasOwnProperty.call(bucket, key)) return bucket[key];
    var value = build();
    bucket[key] = value;
    return value;
  }

  function scanDir(scan) { return T('copilot.scan.dir.' + (scan && scan.direction ? scan.direction : 'flat')); }
  function scanType(scan) { return T('copilot.scan.type.' + (scan && scan.chartType ? scan.chartType : 'line')); }
  function scanConf(scan) { return Math.round(clampPct((scan && scan.confidence || 0) * 100)); }
  function clampPct(v) { return v < 0 ? 0 : v > 100 ? 100 : v; }

  function scanSignature(scan) {
    if (!scan || !scan.ok) return '';
    var lv = scan.levels || {};
    return [
      scan.chartType, scan.direction, scan.positionPct, scan.spanPct,
      scan.volatilityPct, scan.confidence,
      lv.supportPct, lv.resistancePct, lv.supportTouches, lv.resistanceTouches,
      scan.trend && scan.trend.r2
    ].join('|');
  }

  function simSignature(sim) {
    if (!sim) return '';
    if (sim.error) return 'e:' + sim.error + '|' + sim.horizon;
    return [
      sim.side, sim.horizon, sim.paths, sim.entry,
      sim.p10 && sim.p10.movePct, sim.median && sim.median.movePct, sim.p90 && sim.p90.movePct,
      sim.hasTarget, sim.hasStop, sim.targetFirstPct, sim.stopFirstPct, sim.neitherPct
    ].join('|');
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
    plan = plan || {};
    return nested(BRIEF_CACHE, a, plan, 'brief|' + lang(), function () {
    var f = a.facts || {};
    var p = plan;
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
    });
  }

  /* ---------------- answers ---------------- */

  function buySellAnswer(a, plan) {
    var p = plan || {};
    var lean = a.lean || {};
    var leanDir = lean.dir || 'neutral';
    var conf = lean.confidence || 'low';
    var ev = a.evidence || {};
    var paragraphs = [
      T('copilot.a.buySell.lean', {
        lean: T('an.lean.' + leanDir),
        conf: T('an.conf.' + conf),
        bull: U.isNum(ev.bullScore) ? ev.bullScore : '—',
        bear: U.isNum(ev.bearScore) ? ev.bearScore : '—'
      })
    ];

    var side = p.side === 'long' || p.side === 'short' ? p.side : null;
    if (side) {
      var sideLabel = T(side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell');
      if (p.state === 'extended') {
        paragraphs.push(T('copilot.a.buySell.extended', {
          side: sideLabel,
          d: U.isNum(p.distToTriggerPct) ? U.fmtPct(p.distToTriggerPct, { sign: false }) : '—',
          t: p.triggerText
        }));
      } else if (p.state === 'invalidated') {
        paragraphs.push(T('copilot.a.buySell.invalidated', {
          side: sideLabel,
          lv: side === 'long' ? p.s1Text : p.r1Text
        }));
      } else if (p.state === 'no_edge') {
        paragraphs.push(T('copilot.a.buySell.noEdge', {
          p: p.priceText, s: p.s1Text, r: p.r1Text
        }));
      } else if (p.state === 'practice') {
        paragraphs.push(T('copilot.a.buySell.practice'));
        if (U.isNum(p.entry) && U.isNum(p.stop)) {
          paragraphs.push(T('copilot.a.setup.levels', {
            e: p.entryText, s: p.stopText, t: p.targetText, rr: p.rrText
          }));
        }
      } else if (U.isNum(p.entry) && U.isNum(p.stop)) {
        paragraphs.push(T(p.state === 'wait' ? 'copilot.a.buySell.wait' : 'copilot.a.buySell.active', {
          side: sideLabel,
          setup: T('plan.setup.' + (p.setup || 'none')),
          state: T('plan.state.' + (p.state || 'no_edge')),
          t: p.triggerText, e: p.entryText, s: p.stopText,
          tg: p.targetText, rr: rrText(p.rr)
        }));
        var sz = TA.store && TA.tradeplan && TA.tradeplan.size
          ? TA.tradeplan.size(p, TA.store.settings())
          : null;
        if (sz) {
          paragraphs.push(T('copilot.a.actions.size', {
            loss: U.fmtPrice(sz.maxLoss, '$', lang()),
            units: U.fmtNum(sz.units, lang(), sz.units >= 1 ? 2 : 6),
            notional: U.fmtPrice(sz.notional, '$', lang())
          }));
        }
      }
      if (p.checks && p.checks.length) {
        paragraphs.push(T('copilot.a.buySell.checks', {
          list: p.checks.map(function (c) {
            return T(c.ok ? 'copilot.a.buySell.pass' : 'copilot.a.buySell.fail', {
              check: T(c.key, c.params)
            });
          }).join(' · ')
        }));
      }
    } else {
      paragraphs.push(T('copilot.a.buySell.noSide'));
      var suggestion = TA.tradeplan.exits(a, { lang: lang(), side: null });
      if (suggestion && suggestion.maps && suggestion.maps.length === 2) {
        suggestion.maps.forEach(function (map) {
          paragraphs.push(T('copilot.a.buySell.both', {
            side: T(map.side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell'),
            p: suggestion.priceText,
            s: map.stopText,
            loss: U.fmtPct(-map.lossPct, { sign: true }),
            t: map.targetText,
            gain: U.fmtPct(map.gainPct, { sign: true }),
            rr: rrText(map.rr)
          }));
        });
      }
    }

    var bull = (ev.bull || []).map(function (e) { return T(e.key, e.params); }).join(' · ');
    var bear = (ev.bear || []).map(function (e) { return T(e.key, e.params); }).join(' · ');
    if (bull) paragraphs.push(T('copilot.a.evidence.bull', { list: bull }));
    if (bear) paragraphs.push(T('copilot.a.evidence.bear', { list: bear }));

    if (U.isNum(p.s1) || U.isNum(p.r1)) {
      paragraphs.push(T('copilot.a.buySell.flip', { r: p.r1Text, s: p.s1Text }));
    }
    if (p.warnings && p.warnings.length) {
      paragraphs.push(p.warnings.map(function (k) { return T(k); }).join(' '));
    }
    paragraphs.push(T('copilot.a.buySell.caveat'));
    return {
      paragraphs: paragraphs,
      cites: ['plan', 'levels', 'cases'],
      followups: ['actions', 'exits', 'risk']
    };
  }

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

  function rrText(value) {
    return U.isNum(value) ? value.toFixed(1) + ' : 1' : '—';
  }

  function actionsAnswer(a, plan, opts) {
    var p = plan || {};
    var side = p.side === 'long' || p.side === 'short' ? p.side : null;
    if (!side) {
      return {
        paragraphs: [T('copilot.a.actions.noSide')],
        cites: ['plan'],
        followups: ['setup', 'exits']
      };
    }

    var sim = (opts && opts.simulation) || p.simulation;
    if (sim && (sim.error || sim.side !== side)) sim = null;

    var actionable = (p.state === 'wait' || p.state === 'triggered' || p.state === 'in_play') &&
      U.isNum(p.entry) && U.isNum(p.stop);
    var paragraphs = [
      T('copilot.a.actions.side', {
        side: T(side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell'),
        state: T('plan.state.' + (p.state || 'no_edge')),
        setup: T('plan.setup.' + (p.setup || 'none'))
      }),
      T(p.actionKey || 'plan.act.noEdge', p.actionParams || {})
    ];

    if (actionable) {
      var steps = [];
      if (p.state === 'wait' && U.isNum(p.trigger)) {
        steps.push(T('copilot.a.actions.wait', { t: p.triggerText, e: p.entryText }));
      } else {
        steps.push(T('copilot.a.actions.active', { e: p.entryText }));
      }
      steps.push(T('copilot.a.actions.enter', { s: p.stopText }));
      if (U.isNum(p.target) && U.isNum(p.entry)) {
        steps.push(T('copilot.a.actions.target', {
          t: p.targetText,
          gain: U.fmtPct(Math.abs((p.target / p.entry - 1) * 100), { sign: true }),
          rr: rrText(p.rr)
        }));
      }
      var sz = TA.store && TA.tradeplan && TA.tradeplan.size
        ? TA.tradeplan.size(p, TA.store.settings())
        : null;
      if (sz) {
        steps.push(T('copilot.a.actions.size', {
          loss: U.fmtPrice(sz.maxLoss, '$', lang()),
          units: U.fmtNum(sz.units, lang(), sz.units >= 1 ? 2 : 6),
          notional: U.fmtPrice(sz.notional, '$', lang())
        }));
      }
      paragraphs.push(steps.join(' '));
      if (p.checks && p.checks.length) {
        var ok = p.checks.filter(function (c) { return c.ok; }).length;
        paragraphs.push(T('copilot.a.setup.checks', { ok: ok, n: p.checks.length }));
      }
    }

    if (sim) {
      paragraphs.push(T('copilot.a.actions.outcomes', {
        n: sim.paths, h: sim.horizon,
        interval: T('an.interval.' + (sim.interval === 'intraday' ? 'intraday' : 'daily')),
        side: T(side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell'),
        entry: U.fmtPrice(sim.entry, '$', lang()),
        p10: U.fmtPct(sim.p10.movePct),
        median: U.fmtPct(sim.median.movePct),
        p90: U.fmtPct(sim.p90.movePct)
      }));
      var hits = [];
      if (sim.hasTarget) hits.push(T('sim.targetFirst', { pct: U.fmtPct(sim.targetFirstPct, { sign: false }) }));
      if (sim.hasStop) hits.push(T('sim.stopFirst', { pct: U.fmtPct(sim.stopFirstPct, { sign: false }) }));
      hits.push(T('sim.neither', { pct: U.fmtPct(sim.neitherPct, { sign: false }) }));
      paragraphs.push(hits.join(' · ') + '.');
      if (sim.hypotheticalEntry) paragraphs.push(T('sim.hypothetical'));
      if (sim.sample) paragraphs.push(T('sim.sample'));
    } else {
      var sc = p.scenario;
      if (!sc && U.isNum(p.entry) && U.isNum(p.stop)) {
        sc = {
          entryText: p.entryText,
          stopText: p.stopText,
          targetText: p.targetText,
          gainPct: U.isNum(p.target) ? Math.abs((p.target / p.entry - 1) * 100) : null,
          lossPct: Math.abs((p.stop / p.entry - 1) * 100),
          rr: p.rr
        };
      }
      if (sc) {
        paragraphs.push(T('copilot.a.actions.levels', {
          e: sc.entryText,
          t: sc.targetText,
          gain: U.fmtPct(sc.gainPct, { sign: true }),
          s: sc.stopText,
          loss: U.isNum(sc.lossPct) ? U.fmtPct(-sc.lossPct, { sign: true }) : '—',
          rr: rrText(sc.rr)
        }));
        if (actionable) paragraphs.push(T('copilot.a.actions.runSim'));
      }
    }

    paragraphs.push(T('copilot.a.actions.caveat'));
    return {
      paragraphs: paragraphs,
      cites: sim ? ['plan', 'scenarios'] : ['plan'],
      followups: ['exits', 'scenario', 'risk']
    };
  }

  function exitsAnswer(a, plan) {
    var p = plan || {};
    var paragraphs = [];
    var hasLevels = U.isNum(p.entry) && U.isNum(p.stop) && U.isNum(p.target) &&
      p.state !== 'no_edge' && p.state !== 'invalidated';

    if (hasLevels) {
      paragraphs.push(T('copilot.a.exits.plan', {
        side: T('plan.side.' + (p.side || 'none')),
        e: p.entryText,
        s: p.stopText,
        loss: U.fmtPct(-Math.abs((p.stop / p.entry - 1) * 100), { sign: true }),
        t: p.targetText,
        gain: U.fmtPct(Math.abs((p.target / p.entry - 1) * 100), { sign: true }),
        rr: p.rrText
      }));
      if (p.state === 'wait' && U.isNum(p.trigger)) {
        paragraphs.push(T('copilot.a.exits.trigger', { t: p.triggerText, e: p.entryText }));
      }
    } else {
      var suggestion = TA.tradeplan.exits(a, {
        lang: lang(),
        side: p.side === 'long' || p.side === 'short' ? p.side : null
      });
      if (!suggestion) {
        paragraphs.push(T('copilot.a.exits.none'));
      } else if (suggestion.maps.length === 1) {
        var one = suggestion.maps[0];
        paragraphs.push(T('copilot.a.exits.one', {
          p: suggestion.priceText,
          side: T('plan.side.' + one.side),
          s: one.stopText,
          loss: U.fmtPct(-one.lossPct, { sign: true }),
          atr: U.isNum(one.stopAtr) ? one.stopAtr.toFixed(1) : '—',
          t: one.targetText,
          gain: U.fmtPct(one.gainPct, { sign: true }),
          rr: rrText(one.rr)
        }));
      } else {
        paragraphs.push(T('copilot.a.exits.both', { p: suggestion.priceText }));
        suggestion.maps.forEach(function (map) {
          paragraphs.push(T('copilot.a.exits.' + map.side, {
            s: map.stopText,
            loss: U.fmtPct(-map.lossPct, { sign: true }),
            t: map.targetText,
            gain: U.fmtPct(map.gainPct, { sign: true }),
            rr: rrText(map.rr)
          }));
        });
      }
      paragraphs.push(T('copilot.a.exits.method'));
    }

    if (p.sample) paragraphs.push(T('copilot.a.exits.sample'));
    paragraphs.push(T('copilot.a.exits.caveat'));
    return { paragraphs: paragraphs, cites: ['plan', 'levels'], followups: ['setup', 'risk'] };
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

  function imageAnswer(a, plan, opts) {
    var scan = opts && opts.chartScan;
    if (!scan || !scan.ok) {
      return { paragraphs: [T('copilot.a.image.none')], cites: [], followups: ['chart', 'levels'] };
    }
    var lv = scan.levels || {};
    var trend = scan.trend || {};
    var paragraphs = [
      T('copilot.a.image.shape', {
        type: scanType(scan),
        dir: scanDir(scan),
        pos: Math.round(clampPct(scan.positionPct)),
        conf: scanConf(scan)
      }),
      T('copilot.a.image.levels', {
        r: Math.round(clampPct(lv.resistancePct)),
        rt: lv.resistanceTouches || 0,
        s: Math.round(clampPct(lv.supportPct)),
        st: lv.supportTouches || 0
      }),
      T('copilot.a.image.vol', {
        vol: U.fmtPct(scan.volatilityPct || 0, { sign: false }),
        r2: U.isNum(trend.r2) ? trend.r2.toFixed(2) : '—'
      })
    ];
    if (scan.confidence < 0.45) paragraphs.push(T('copilot.a.image.low'));
    paragraphs.push(T('copilot.a.image.caveat'));
    return { paragraphs: paragraphs, cites: [], followups: ['chart', 'risk'] };
  }

  function chartAnswer(a, plan, opts) {
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
    var scan = opts && opts.chartScan;
    if (scan && scan.ok) {
      paragraphs.push(T('copilot.a.chart.scan', {
        dir: scanDir(scan),
        pos: Math.round(clampPct(scan.positionPct)),
        conf: scanConf(scan)
      }));
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

  /* ---------------- simplified answers ---------------- */

  function simpleLevels(a) {
    return T('copilot.a.simple.levels', {
      s: levelText(a.nearestSupport),
      r: levelText(a.nearestResistance)
    });
  }

  function simpleSide(p) {
    return T(p.side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell');
  }

  function simpleLean(a) {
    var lean = a.lean || {};
    return T('copilot.a.simple.lean', {
      lean: T('an.lean.' + (lean.dir || 'neutral')),
      conf: T('an.conf.' + (lean.confidence || 'low'))
    });
  }

  function simplePlanExits(p) {
    if (!U.isNum(p.entry) || !U.isNum(p.stop) || !U.isNum(p.target)) return null;
    if (p.state === 'no_edge' || p.state === 'invalidated') return null;
    return T('copilot.a.simple.exits', {
      e: p.entryText, s: p.stopText, t: p.targetText, rr: rrText(p.rr)
    });
  }

  function simpleGeneric(a, plan) {
    return {
      paragraphs: [brief(a, plan).headline, simpleLevels(a)],
      cites: ['snapshot', 'levels'],
      followups: ['buySell', 'actions', 'risk']
    };
  }

  var SIMPLE_RESOLVERS = {
    buySell: function (a, plan) {
      var p = plan || {};
      var lean = a.lean || {};
      var out = [simpleLean(a)];
      if (p.side === 'long' || p.side === 'short') {
        out.push(T('copilot.a.simple.side', {
          side: simpleSide(p),
          action: T(p.actionKey || 'plan.act.noEdge', p.actionParams || {})
        }));
        var exits = simplePlanExits(p);
        if (exits) out.push(exits);
      } else {
        out.push(T('copilot.a.simple.buySellNeutral'));
      }
      out.push(T('copilot.a.simple.caveat'));
      return { paragraphs: out, cites: ['plan', 'levels', 'cases'], followups: ['actions', 'exits', 'risk'] };
    },
    setup: function (a, plan) {
      return {
        paragraphs: [brief(a, plan).headline, simpleLevels(a)],
        cites: ['plan', 'levels'],
        followups: ['actions', 'risk']
      };
    },
    actions: function (a, plan) {
      var p = plan || {};
      if (p.side !== 'long' && p.side !== 'short') {
        return {
          paragraphs: [T('copilot.a.simple.buySellNeutral')],
          cites: ['plan'],
          followups: ['buySell', 'setup']
        };
      }
      var out = [T(p.actionKey || 'plan.act.noEdge', p.actionParams || {})];
      var exits = simplePlanExits(p);
      if (exits) out.push(exits);
      out.push(T('copilot.a.simple.caveat'));
      return { paragraphs: out, cites: ['plan'], followups: ['exits', 'risk'] };
    },
    exits: function (a, plan) {
      var p = plan || {};
      var exits = simplePlanExits(p);
      if (exits) {
        return { paragraphs: [exits], cites: ['plan'], followups: ['risk', 'setup'] };
      }
      var suggestion = TA.tradeplan.exits(a, {
        lang: lang(),
        side: p.side === 'long' || p.side === 'short' ? p.side : null
      });
      var out = [];
      if (suggestion && suggestion.maps) {
        suggestion.maps.forEach(function (map) {
          out.push(T('copilot.a.exits.' + map.side, {
            s: map.stopText,
            loss: U.fmtPct(-map.lossPct, { sign: true }),
            t: map.targetText,
            gain: U.fmtPct(map.gainPct, { sign: true }),
            rr: rrText(map.rr)
          }));
        });
      }
      if (!out.length) out.push(T('copilot.a.exits.none'));
      return { paragraphs: out, cites: ['levels', 'plan'], followups: ['risk', 'setup'] };
    },
    levels: function (a) {
      var f = a.facts || {};
      var out = [simpleLevels(a)];
      if (U.isNum(f.posInRange)) {
        out.push(T('copilot.a.levels.range', {
          pos: Math.round(f.posInRange), n: f.windowBars,
          lo: f.rangeLowText, hi: f.rangeHighText
        }));
      }
      return { paragraphs: out, cites: ['levels'], followups: ['setup', 'risk'] };
    },
    risk: function (a, plan) {
      var p = plan || {};
      if (!U.isNum(p.stop) || p.state === 'no_edge' || p.state === 'invalidated') {
        return {
          paragraphs: [T('copilot.a.simple.riskNone')],
          cites: ['plan'],
          followups: ['setup', 'actions']
        };
      }
      var top = a.risks && a.risks.length ? T(a.risks[0].key) : null;
      return {
        paragraphs: [top
          ? T('copilot.a.simple.risk', { s: p.stopText, risk: top })
          : T('copilot.a.simple.riskOnly', { s: p.stopText })],
        cites: ['plan', 'risks'],
        followups: ['setup', 'actions']
      };
    },
    trend: function (a) {
      var f = a.facts || {};
      if (!U.isNum(f.sma20) || !U.isNum(f.price)) {
        return { paragraphs: [T('copilot.a.trend.none')], cites: ['context'], followups: ['levels', 'risk'] };
      }
      return {
        paragraphs: [T('copilot.a.simple.trend', {
          trend: T(a.trend ? a.trend.key : 'trend.mixed'),
          d: fmtPct((f.price / f.sma20 - 1) * 100, true),
          sma: f.sma20Text,
          rsi: f.rsiText || '—'
        })],
        cites: ['context'],
        followups: ['levels', 'risk']
      };
    },
    volatility: function (a) {
      var f = a.facts || {};
      return {
        paragraphs: [T('copilot.a.simple.vol', {
          vol: f.vol30Text || '—',
          atr: f.atrText || '—',
          range: f.typicalRangeText || '—'
        })],
        cites: ['context'],
        followups: ['risk', 'setup']
      };
    },
    volume: function (a, plan) {
      var f = a.facts || {};
      var check = ((plan && plan.checks) || []).filter(function (c) { return c.key === 'plan.check.volume'; })[0];
      return {
        paragraphs: [U.isNum(f.relVol)
          ? T('copilot.a.simple.volume', {
            rv: f.relVolText,
            state: check
              ? T(check.ok ? 'copilot.a.volume.yes' : 'copilot.a.volume.no')
              : T('sim.notSet')
          })
          : T('copilot.a.volume.none')],
        cites: ['snapshot', 'plan'],
        followups: ['setup', 'risk']
      };
    },
    scenario: function (a) {
      var list = (a.scenarios || []).map(function (sc) {
        return T(sc.titleKey, sc.params);
      }).join('; ');
      return {
        paragraphs: [list ? T('copilot.a.simple.scenario', { list: list }) : T('copilot.a.scenario.none')],
        cites: ['scenarios'],
        followups: ['risk', 'levels']
      };
    },
    evidence: function (a) {
      var ev = a.evidence || {};
      var out = [];
      if (a.lean) out.push(simpleLean(a));
      out.push(T('copilot.a.evidence.bull', {
        list: (ev.bull || []).slice(0, 1).map(function (e) { return T(e.key, e.params); }).join(' · ') || '—'
      }));
      out.push(T('copilot.a.evidence.bear', {
        list: (ev.bear || []).slice(0, 1).map(function (e) { return T(e.key, e.params); }).join(' · ') || '—'
      }));
      return { paragraphs: out, cites: ['cases'], followups: ['buySell', 'risk'] };
    },
    chart: function (a) {
      var m = a.meta || {};
      var f = a.facts || {};
      var chart = a.chart || {};
      var closes = chart.closes || [];
      var lastClose = closes.length ? closes[closes.length - 1] : null;
      var out = [
        T('copilot.a.chart.window', {
          n: m.barCount,
          interval: T('an.interval.' + (m.interval === 'intraday' ? 'intraday' : 'daily')),
          price: U.isNum(lastClose) ? fmtP(lastClose) : (f.priceText || fmtP(f.price))
        }),
        T('copilot.a.chart.range', {
          lo: f.rangeLowText || '—', hi: f.rangeHighText || '—',
          dd: f.drawdownText || '—', fromLow: f.fromLowText || '—'
        })
      ];
      return { paragraphs: out, cites: ['snapshot', 'levels'], followups: ['levels', 'trend'] };
    },
    image: function (a, plan, opts) {
      var scan = opts && opts.chartScan;
      if (!scan || !scan.ok) {
        return { paragraphs: [T('copilot.a.image.none')], cites: [], followups: ['chart', 'levels'] };
      }
      var lv = scan.levels || {};
      return {
        paragraphs: [
          T('copilot.a.image.shape', {
            type: scanType(scan),
            dir: scanDir(scan),
            pos: Math.round(clampPct(scan.positionPct)),
            conf: scanConf(scan)
          }),
          T('copilot.a.image.levels', {
            r: Math.round(clampPct(lv.resistancePct)),
            rt: lv.resistanceTouches || 0,
            s: Math.round(clampPct(lv.supportPct)),
            st: lv.supportTouches || 0
          })
        ],
        cites: [],
        followups: ['chart', 'risk']
      };
    },
    data: function (a, plan) {
      var p = plan || {};
      var m = a.meta || {};
      return {
        paragraphs: [
          T('copilot.a.data.source', {
            provider: T('src.' + (m.provider || 'sample') + '.name'),
            time: U.fmtDateTime(m.retrievedAt, lang())
          }),
          T('copilot.a.data.mode', { mode: T(p.dataKey || 'plan.data.last') })
        ],
        cites: ['sources'],
        followups: ['chart', 'setup']
      };
    },
    summary: function (a, plan) {
      var p = plan || {};
      var out = [brief(a, p).headline, simpleLevels(a)];
      if (p.side === 'long' || p.side === 'short') {
        out.push(T(p.actionKey || 'plan.act.noEdge', p.actionParams || {}));
      }
      return { paragraphs: out, cites: ['snapshot', 'plan', 'levels'], followups: ['buySell', 'risk'] };
    },
    simple: simpleGeneric,
    fallback: simpleGeneric
  };

  var RESOLVERS = {
    buySell: buySellAnswer,
    setup: setupAnswer,
    actions: actionsAnswer,
    exits: exitsAnswer,
    levels: levelsAnswer,
    risk: riskAnswer,
    trend: trendAnswer,
    volatility: volatilityAnswer,
    volume: volumeAnswer,
    scenario: scenarioAnswer,
    evidence: evidenceAnswer,
    chart: chartAnswer,
    image: imageAnswer,
    data: dataAnswer,
    summary: summaryAnswer,
    fallback: fallbackAnswer
  };

  function answer(q, a, plan, opts) {
    a = a || {};
    plan = plan || {};
    opts = opts || {};
    var id = detect(q);
    var simple = id === 'simple' || wantsSimple(q);
    var simKey = id === 'actions' ? simSignature(opts.simulation || plan.simulation)
      : id === 'scenario' ? simSignature(plan.simulation) : '';
    var key = id + '|' + (simple ? 's' : 'n') + '|' + lang() + '|' + scanSignature(opts.chartScan) + '|' + simKey;
    return nested(ANSWER_CACHE, a, plan, key, function () {
      var res = simple ? SIMPLE_RESOLVERS[id](a, plan, opts) : RESOLVERS[id](a, plan, opts);
      var baseTitleKey = 'copilot.intent.' + id;
      var titleKey = simple && id !== 'simple' ? 'copilot.simple.title' : baseTitleKey;
      return {
        id: id,
        titleKey: titleKey,
        title: T(titleKey, titleKey === 'copilot.simple.title' ? { title: T(baseTitleKey) } : {}),
        paragraphs: res.paragraphs.filter(function (p) { return !!p; }),
        cites: res.cites || [],
        followups: res.followups || []
      };
    });
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
