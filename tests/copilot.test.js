'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const ctx = { console, window: { TA: {} } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
['js/util.js', 'js/i18n.js', 'js/tradeplan.js', 'js/copilot.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;

const RETAINED = Date.UTC(2026, 9, 31, 0, 0, 0);
const SERIES_END = Date.UTC(2026, 9, 30, 0, 0, 0);

const BASE = {
  asset: {
    assetClass: 'crypto', symbol: 'BTC', name: 'Bitcoin', currency: 'USD',
    exchange: 'Crypto · 24/7', barsPerYear: 365
  },
  facts: {
    price: 100, priceText: '$ 100.00', changePct: 0.5, changeText: '+0.50%', changeWindow: '1d',
    dayHigh: 101, dayLow: 98.5, dayHighText: '$ 101.00', dayLowText: '$ 98.50',
    prevCloseText: '$ 99.50', volumeText: '1.2M', marketCapText: null, turnoverText: null,
    dollarVolumeText: '$ 1.0B',
    sma20: 98, sma50: 96, longSma: 90, longLen: 200,
    sma20Text: '$ 98.00', sma50Text: '$ 96.00', longSmaText: '$ 90.00',
    rsi: 55, rsiText: '55', slope20: 0.5, ret20: 2, ret20Text: '+2.00%', ret60: 5,
    vol30: 40, vol30Text: '40%', volPctRank: 0.5, volPctText: '50',
    atr: 2, atrPctNum: 2, atrText: '$ 2.00', atrPctText: '2.00%',
    relVol: 1.2, relVolText: '1.20×', drawdownText: '−5.00%', fromLowText: '+12.00%',
    rangeHighText: '$ 110.00', rangeLowText: '$ 90.00', windowBars: 120, posInRange: 50,
    typicalRangeText: '$ 2.00', typicalRangePctText: '2.00%', expectedMoveText: '$ 10.00',
    moveLoText: '$ 90.00', moveHiText: '$ 110.00', nearestDistText: '5.00%',
    barsPerYear: 365, intraday: false, grainText: 'Daily closes'
  },
  trend: { key: 'trend.up', score: 2, strengthPct: 60, noteParams: { d: '+4.17%' } },
  momentum: { key: 'momentum.positive', rsi: 55, ret20: 2, noteParams: { ret: '+2.00%', rsi: '55' } },
  volatility: {
    key: 'vol.normal', vol: 40, pctRank: 0.5, atrPct: 2, meter: 50,
    noteParams: { vol: '40%', pct: '50', n: 120 }
  },
  liquidity: {
    key: 'liq.deep', meter: 92, dollarVolume: 1e9,
    noteParams: { dv: '$ 1.0B' }, sampleStock: false
  },
  session: { key: 'session.crypto247', state: '247' },
  evidence: {
    bull: [
      { key: 'ev.aboveSma50', weight: 3, params: { price: '$ 100.00', dist: '4.17%', sma: '$ 96.00' } },
      { key: 'ev.momentumUp', weight: 1, params: { ret: '+2.00%', rsi: '55' } }
    ],
    bear: [
      { key: 'ev.intoResistance', weight: 2, params: { dist: '1.00%', lvl: '$ 101.00' } }
    ],
    bullScore: 5, bearScore: 2
  },
  lean: { dir: 'bull', confidence: 'high', ratio: 0.35, total: 8 },
  levels: [
    { kind: 'support', price: 95, priceText: '$ 95.00', distPct: 5, distText: '5.00%', strength: 3, basisKey: 'level.basis.swing_low', basisParams: { n: 2 } },
    { kind: 'support', price: 92, priceText: '$ 92.00', distPct: 8, distText: '8.00%', strength: 2, basisKey: 'level.basis.swing_low', basisParams: { n: 1 } },
    { kind: 'resistance', price: 101, priceText: '$ 101.00', distPct: 1, distText: '1.00%', strength: 2, basisKey: 'level.basis.swing_high', basisParams: { n: 2 } },
    { kind: 'resistance', price: 106, priceText: '$ 106.00', distPct: 6, distText: '6.00%', strength: 1, basisKey: 'level.basis.range_high', basisParams: { window: 120 } }
  ],
  nearestSupport: { kind: 'support', price: 95, priceText: '$ 95.00', distPct: 5, distText: '5.00%', strength: 3, basisKey: 'level.basis.swing_low', basisParams: { n: 2 } },
  nextSupport: { kind: 'support', price: 92, priceText: '$ 92.00', distPct: 8, distText: '8.00%', strength: 2, basisKey: 'level.basis.swing_low', basisParams: { n: 1 } },
  nearestResistance: { kind: 'resistance', price: 101, priceText: '$ 101.00', distPct: 1, distText: '1.00%', strength: 2, basisKey: 'level.basis.swing_high', basisParams: { n: 2 } },
  nextResistance: { kind: 'resistance', price: 106, priceText: '$ 106.00', distPct: 6, distText: '6.00%', strength: 1, basisKey: 'level.basis.range_high', basisParams: { window: 120 } },
  scenarios: [
    {
      kind: 'base', titleKey: 'an.sc.base.title',
      params: { s: '$ 95.00', r: '$ 101.00', s2: '$ 92.00', r2: '$ 106.00' },
      triggerKey: 'an.sc.base.trigger', strengthenKey: 'an.sc.base.strengthen',
      invalidKey: 'an.sc.base.invalidate', params2: { s: '$ 95.00', r: '$ 101.00' }
    },
    {
      kind: 'bull', titleKey: 'an.sc.bull.title',
      params: { r: '$ 101.00', r2: '$ 106.00' },
      triggerKey: 'an.sc.bull.trigger', strengthenKey: 'an.sc.bull.strengthen',
      invalidKey: 'an.sc.bull.invalidate', params2: { r: '$ 101.00' }
    },
    {
      kind: 'bear', titleKey: 'an.sc.bear.title',
      params: { s: '$ 95.00', s2: '$ 92.00' },
      triggerKey: 'an.sc.bear.trigger', strengthenKey: 'an.sc.bear.strengthen',
      invalidKey: 'an.sc.bear.invalidate', params2: { s: '$ 95.00' }
    }
  ],
  risks: [
    { key: 'risk.vol_elevated', sev: 'medium', tag: 'market', params: { vol: '40%' } },
    { key: 'risk.model', sev: 'low', tag: 'model', params: {} }
  ],
  chart: {
    times: [], closes: [], sma20: [], sma50: [],
    levels: [{ price: 95, kind: 'support' }, { price: 101, kind: 'resistance' }],
    sample: false, interval: 'daily'
  },
  meta: {
    dataMode: 'live', interval: 'daily', requestedIntraday: false, barCount: 120,
    provider: 'coingecko', providerUrl: 'https://www.coingecko.com',
    retrievedAt: RETAINED, seriesEnd: SERIES_END,
    grainNote: 'Daily closes', delayNote: null, fallback: null
  },
  generatedAt: RETAINED
};

function ana(over) {
  over = over || {};
  const out = Object.assign({}, BASE, over);
  out.facts = Object.assign({}, BASE.facts, over.facts || {});
  out.meta = Object.assign({}, BASE.meta, over.meta || {});
  return out;
}

function plan(over, lang) {
  return TA.tradeplan.build(ana(over), { lang: lang || 'en' });
}

function answer(question, over, lang, opts) {
  TA.i18n.set(lang || 'en');
  return TA.copilot.answer(question, ana(over), plan(over, lang), opts);
}

const SCAN = {
  ok: true, chartType: 'candles', direction: 'up',
  positionPct: 82, spanPct: 40, volatilityPct: 3.2, recentPct: 4,
  confidence: 0.72, quality: 'good',
  levels: { supportPct: 12, resistancePct: 88, supportTouches: 3, resistanceTouches: 2 },
  trend: { r2: 0.74 }
};

function cites(ans) {
  return Array.from(ans.cites);
}

const STATE_CASES = [
  ['wait', {}, 'copilot.brief.wait', '$ 101.00'],
  ['practice', { meta: { dataMode: 'sample' } }, 'copilot.brief.practice', 'Sample data'],
  ['invalidated long', { facts: { price: 90 } }, 'copilot.brief.invalidatedLong', '$ 95.00'],
  ['invalidated short', { lean: { dir: 'bear', confidence: 'high' }, facts: { price: 110 } }, 'copilot.brief.invalidatedShort', '$ 101.00'],
  ['extended', { facts: { price: 104 }, nearestResistance: { price: 98, priceText: '$ 98.00' }, nextResistance: { price: 106, priceText: '$ 106.00' } }, 'copilot.brief.extended', '$ 98.00'],
  ['triggered', { facts: { price: 102, relVol: 0.9, relVolText: '0.90×' } }, 'copilot.brief.triggered', '$ 101.00'],
  ['in play', { facts: { price: 102, relVol: 1.5, relVolText: '1.50×' } }, 'copilot.brief.inPlay', '$ 101.00'],
  ['no edge', { lean: { dir: 'neutral', confidence: 'high' } }, 'copilot.brief.noEdge', '$ 101.00']
];

const QUESTIONS = {
  setup: 'What is the setup now?',
  exits: 'Where should my stop loss and take profit be?',
  levels: 'Where are the key levels?',
  risk: 'What invalidates this setup?',
  trend: 'Is the trend supportive?',
  volatility: 'How volatile is it?',
  volume: 'Is volume confirming?',
  scenario: 'What are the scenarios?',
  evidence: 'Explain the evidence',
  chart: 'What does this chart show?',
  data: 'How fresh is the data?',
  summary: 'Give me a quick summary',
  fallback: 'hello there'
};

test('brief headlines follow the plan state and keep every read populated', () => {
  TA.i18n.set('en');
  STATE_CASES.forEach(([name, over, key, needle]) => {
    const b = TA.copilot.brief(ana(over), plan(over));
    assert.equal(b.headlineKey, key, name);
    assert.ok(b.headline.indexOf(needle) >= 0, name + ': ' + b.headline);
    assert.equal(b.reads.length, 4);
    b.reads.forEach((r) => {
      assert.ok(r.label, name + ' read label');
      assert.ok(r.value, name + ' read value');
    });
    assert.ok(b.points.length >= 1 && b.points.length <= 3, name + ' points');
    assert.ok(['up', 'down', 'flat'].indexOf(b.tone) >= 0);
    assert.ok(b.prompts.length >= 4);
  });
});

test('English questions route to the right intent', () => {
  TA.i18n.set('en');
  Object.keys(QUESTIONS).forEach((id) => {
    assert.equal(TA.copilot.detect(QUESTIONS[id]), id, QUESTIONS[id]);
  });
  assert.equal(TA.copilot.detect('What happens if price breaks resistance?'), 'scenario');
  assert.equal(TA.copilot.detect('Should I buy or sell?'), 'setup');
});

test('synonyms, typos and screenshot questions still route correctly', () => {
  TA.i18n.set('en');
  const cases = [
    ['How volatilty is it?', 'volatility'],
    ['is liquidity thin?', 'volume'],
    ['how fresh are these quotes?', 'data'],
    ['what happens if it breaks out?', 'scenario'],
    ['read my screenshot', 'image'],
    ['What did you see in this image?', 'image'],
    ['where is my invalidation?', 'risk'],
    ['can you show the moving average?', 'trend'],
    ['what is my exit plan', 'exits'],
    ['show me the big picture', 'summary']
  ];
  cases.forEach(([q, id]) => assert.equal(TA.copilot.detect(q), id, q));
  assert.equal(TA.copilot.detect('What does this chart show?'), 'chart');
  assert.equal(TA.copilot.detect('hello there'), 'fallback');
});

test('image answers are honest without a scan and grounded with one', () => {
  const none = answer('What did you read in my chart?');
  assert.equal(none.id, 'image');
  assert.ok(none.paragraphs.join(' ').indexOf('Attach a chart screenshot') >= 0);
  assert.deepEqual(cites(none), []);

  const ans = answer('What did you read in my chart?', {}, 'en', { chartScan: SCAN });
  assert.equal(ans.id, 'image');
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('candles') >= 0, text);
  assert.ok(text.indexOf('up') >= 0, text);
  assert.ok(text.indexOf('82%') >= 0, text);
  assert.ok(text.indexOf('72%') >= 0, text);
  assert.ok(text.indexOf('does not include the ticker') >= 0, text);
  assert.deepEqual(cites(ans), []);

  const chart = answer(QUESTIONS.chart, {}, 'en', { chartScan: SCAN });
  assert.ok(chart.paragraphs.join(' ').indexOf('uploaded chart also reads up') >= 0);
});

test('answers and briefs are cached per analysis, plan and language', () => {
  TA.i18n.set('en');
  const a = ana();
  const p = plan();
  const q = QUESTIONS.levels;
  const first = TA.copilot.answer(q, a, p);
  const second = TA.copilot.answer(q, a, p);
  assert.equal(first, second);
  assert.equal(TA.copilot.brief(a, p), TA.copilot.brief(a, p));

  TA.i18n.set('es');
  const spanish = TA.copilot.answer(q, a, p);
  assert.notEqual(spanish, first);
  assert.equal(spanish.title, 'Niveles clave');

  const cached = TA.copilot.answer(q, a, p);
  assert.equal(cached, spanish);
  TA.i18n.set('en');
});

test('Spanish questions route to the same intents', () => {
  TA.i18n.set('es');
  const cases = [
    ['¿Cuál es la situación ahora?', 'setup'],
    ['¿Dónde deberían estar mi stop y mi objetivo?', 'exits'],
    ['¿Dónde están los niveles clave?', 'levels'],
    ['¿Qué invalidaría esta situación?', 'risk'],
    ['¿La tendencia acompaña?', 'trend'],
    ['¿Cuánta volatilidad hay?', 'volatility'],
    ['¿El volumen confirma?', 'volume'],
    ['¿Cuáles son los escenarios?', 'scenario'],
    ['¿Qué pasa si rompe la resistencia?', 'scenario'],
    ['¿Cuál es la evidencia?', 'evidence'],
    ['¿Qué muestra el gráfico?', 'chart'],
    ['¿Qué tan frescos son los datos?', 'data'],
    ['Resumen rápido', 'summary'],
    ['hola', 'fallback']
  ];
  cases.forEach(([q, id]) => assert.equal(TA.copilot.detect(q), id, q));
  TA.i18n.set('en');
});

test('levels answer uses the page levels and cites the sections', () => {
  const ans = answer(QUESTIONS.levels);
  assert.equal(ans.id, 'levels');
  assert.equal(ans.title, 'Key levels');
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('$ 95.00') >= 0, text);
  assert.ok(text.indexOf('$ 101.00') >= 0, text);
  assert.ok(text.indexOf('2.5 ATR') >= 0, text);
  assert.ok(text.indexOf('0.5 ATR') >= 0, text);
  assert.deepEqual(cites(ans), ['levels', 'plan']);
});

test('trend answer measures distance to the averages in percent', () => {
  const ans = answer(QUESTIONS.trend);
  assert.equal(ans.id, 'trend');
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('+2.04%') >= 0, text);
  assert.ok(text.indexOf('+4.17%') >= 0, text);
  assert.deepEqual(cites(ans), ['context', 'cases']);
});

test('risk answer names the invalidation and the leading risk', () => {
  const ans = answer(QUESTIONS.risk);
  assert.equal(ans.id, 'risk');
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('Volatility is elevated') >= 0, text);
  assert.ok(text.indexOf('$ 98.00') >= 0, text);
  assert.deepEqual(cites(ans), ['risks', 'plan', 'context']);
});

test('setup answer repeats the plan and the confirmation count', () => {
  const ans = answer(QUESTIONS.setup);
  assert.equal(ans.id, 'setup');
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('State: Wait for trigger') >= 0, text);
  assert.ok(text.indexOf('Structure: Breakout') >= 0, text);
  assert.ok(text.indexOf('$ 101.00') >= 0, text);
  assert.ok(text.indexOf('$ 98.00') >= 0, text);
  assert.ok(text.indexOf('4 of 4 confirmation checks pass') >= 0, text);
});

test('exits answer reports the plan stop and target when a setup exists', () => {
  const ans = answer(QUESTIONS.exits);
  assert.equal(ans.id, 'exits');
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('$ 98.00') >= 0, text);
  assert.ok(text.indexOf('$ 106.00') >= 0, text);
  assert.ok(text.indexOf('-2.97%') >= 0, text);
  assert.ok(text.indexOf('+4.95%') >= 0, text);
  assert.ok(text.indexOf('$ 101.00 trigger') >= 0, text);
  assert.ok(text.indexOf('not predictions') >= 0, text);
  assert.deepEqual(cites(ans), ['plan', 'levels']);
});

test('exits answer signs the stop as a loss on a short plan', () => {
  const over = {
    lean: { dir: 'bear', confidence: 'high' },
    nearestSupport: { price: 99, priceText: '$ 99.00' }, nextSupport: { price: 95 },
    nearestResistance: { price: 101, priceText: '$ 101.00' }, nextResistance: { price: 106 }
  };
  const ans = answer(QUESTIONS.exits, over);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('Short side plan') >= 0, text);
  assert.ok(text.indexOf('$ 101.00 (-2.02%') >= 0, text);
  assert.ok(text.indexOf('$ 95.00 (+4.04%') >= 0, text);
});

test('exits answer suggests both sides when the read is neutral and has no edge', () => {
  const over = {
    lean: { dir: 'neutral', confidence: 'high' },
    nearestSupport: { price: 90, priceText: '$ 90.00' }, nextSupport: { price: 85 },
    nearestResistance: { price: 110, priceText: '$ 110.00' }, nextResistance: { price: 115 }
  };
  const ans = answer(QUESTIONS.exits, over);
  assert.equal(ans.id, 'exits');
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('no confirmed setup') >= 0, text);
  assert.ok(text.indexOf('Buy:') >= 0, text);
  assert.ok(text.indexOf('Sell:') >= 0, text);
  assert.ok(text.indexOf('$ 97.00') >= 0, text);
  assert.ok(text.indexOf('$ 103.00') >= 0, text);
});

test('exits answer gives one side when the lean is directional without a setup', () => {
  const over = {
    nearestSupport: { price: 90, priceText: '$ 90.00' }, nextSupport: { price: 85 },
    nearestResistance: { price: 110, priceText: '$ 110.00' }, nextResistance: { price: 115 }
  };
  const ans = answer(QUESTIONS.exits, over);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('no confirmed setup') >= 0, text);
  assert.ok(text.indexOf('Long side') >= 0, text);
  assert.ok(text.indexOf('Sell:') < 0, text);
  assert.ok(text.indexOf('$ 97.00') >= 0, text);
  assert.ok(text.indexOf('$ 110.00') >= 0, text);
});

test('volume answer reads participation and the checklist', () => {
  const ans = answer(QUESTIONS.volume);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('1.20×') >= 0, text);
  assert.ok(text.indexOf('passing') >= 0, text);
  assert.deepEqual(cites(ans), ['snapshot', 'plan']);
});

test('scenario answer summarises all three paths', () => {
  const ans = answer(QUESTIONS.scenario);
  assert.equal(ans.paragraphs.length, 3);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('$ 101.00') >= 0, text);
  assert.ok(text.indexOf('Invalidation') >= 0, text);
  assert.deepEqual(cites(ans), ['scenarios']);
});

test('evidence answer lists both sides', () => {
  const ans = answer(QUESTIONS.evidence);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('Bullish evidence') >= 0, text);
  assert.ok(text.indexOf('Bearish evidence') >= 0, text);
  assert.ok(text.indexOf('Price is above') >= 0, text);
  assert.ok(text.indexOf('Upside runs into supply') >= 0, text);
  assert.deepEqual(cites(ans), ['cases']);
});

test('chart answer explains window, range and overlays', () => {
  const ans = answer(QUESTIONS.chart);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('120 plotted price points at the Daily interval') >= 0, text);
  assert.ok(text.indexOf('$ 110.00') >= 0, text);
  assert.ok(text.indexOf('$ 90.00') >= 0, text);
  assert.ok(text.indexOf('4 key levels') >= 0, text);
  assert.deepEqual(cites(ans), ['snapshot', 'levels']);
});

test('data answer exposes source, mode and series end', () => {
  const ans = answer(QUESTIONS.data);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('CoinGecko public API') >= 0, text);
  assert.ok(text.indexOf('Last available price') >= 0, text);
  assert.ok(text.indexOf('120 bars') >= 0, text);
  assert.deepEqual(cites(ans), ['sources']);
});

test('data answer warns on sample series', () => {
  const over = { meta: { dataMode: 'sample', provider: 'sample' } };
  const ans = answer(QUESTIONS.data, over);
  const text = ans.paragraphs.join(' ');
  assert.ok(text.indexOf('Sample data') >= 0, text);
  assert.ok(text.indexOf('synthetic') >= 0, text);
});

test('summary answer leads with the brief and cites the read', () => {
  const a = ana();
  const p = plan();
  const ans = TA.copilot.answer(QUESTIONS.summary, a, p);
  assert.equal(ans.id, 'summary');
  assert.equal(ans.paragraphs[0], TA.copilot.brief(a, p).headline);
  assert.deepEqual(cites(ans), ['snapshot', 'plan', 'risks']);
});

test('fallback is honest about the page-only scope', () => {
  const ans = answer(QUESTIONS.fallback);
  assert.equal(ans.id, 'fallback');
  assert.equal(ans.title, 'Outside this read');
  assert.deepEqual(cites(ans), []);
  assert.ok(ans.paragraphs[0].indexOf('I can only read the facts on this page') >= 0);
});

test('citations and follow-ups always resolve to real sections and prompts', () => {
  Object.keys(QUESTIONS).forEach((id) => {
    const ans = answer(QUESTIONS[id]);
    ans.cites.forEach((c) => assert.ok(TA.copilot.CITES.indexOf(c) >= 0, c));
    ans.followups.forEach((f) => {
      assert.ok(TA.copilot.INTENTS.indexOf(f) >= 0, f);
      assert.notEqual(TA.copilot.question(f), 'copilot.q.' + f, f);
    });
  });
});

test('answers are deterministic for identical inputs', () => {
  const a = ana();
  const p = plan();
  const first = JSON.stringify([
    TA.copilot.brief(a, p),
    TA.copilot.answer(QUESTIONS.levels, a, p),
    TA.copilot.answer(QUESTIONS.risk, a, p)
  ]);
  const second = JSON.stringify([
    TA.copilot.brief(a, p),
    TA.copilot.answer(QUESTIONS.levels, a, p),
    TA.copilot.answer(QUESTIONS.risk, a, p)
  ]);
  assert.equal(first, second);
});

test('Spanish copy resolves through the locale', () => {
  TA.i18n.set('es');
  const b = TA.copilot.brief(ana(), plan({}, 'es'));
  assert.equal(b.reads[0].label, 'Tendencia');
  assert.ok(b.headline.indexOf('El plan es condicional') >= 0, b.headline);
  const ans = TA.copilot.answer('¿Dónde están los niveles clave?', ana(), plan({}, 'es'));
  assert.equal(ans.title, 'Niveles clave');
  assert.ok(ans.paragraphs.join(' ').indexOf('El soporte más cercano') >= 0);
  assert.equal(TA.copilot.question('setup'), '¿Cuál es la situación ahora?');
  TA.i18n.set('en');
});

test('every copilot.* key used in code exists in EN and ES', () => {
  const code = fs.readFileSync(path.join(root, 'js/copilot.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'js/views/analysis.js'), 'utf8');
  const used = new Set();
  (code.match(/'copilot\.[^']+'/g) || []).forEach((s) => {
    const k = s.slice(1, -1);
    if (!k.endsWith('.')) used.add(k);
  });

  TA.copilot.PROMPTS.forEach((id) => used.add('copilot.q.' + id));
  TA.copilot.INTENTS.concat('fallback').forEach((id) => used.add('copilot.intent.' + id));
  TA.copilot.CITES.forEach((id) => used.add('copilot.cite.' + id));

  STATE_CASES.forEach(([, over]) => {
    const b = TA.copilot.brief(ana(over), plan(over));
    used.add(b.headlineKey);
    b.reads.forEach((r) => used.add(r.labelKey));
    b.points.forEach((p) => used.add(p.key));
  });
  Object.keys(QUESTIONS).forEach((id) => {
    const ans = answer(QUESTIONS[id]);
    used.add(ans.titleKey);
    ans.followups.forEach((f) => used.add('copilot.q.' + f));
  });

  const i18n = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
  const enPart = i18n.slice(i18n.indexOf('var en = {'), i18n.indexOf('var es = {'));
  const esPart = i18n.slice(i18n.indexOf('var es = {'), i18n.indexOf('function t('));
  const enKeys = new Set((enPart.match(/'(copilot\.[^']+)':/g) || []).map((s) => s.slice(1, -2)));
  const esKeys = new Set((esPart.match(/'(copilot\.[^']+)':/g) || []).map((s) => s.slice(1, -2)));
  const missingEn = [...used].filter((k) => !enKeys.has(k));
  const missingEs = [...used].filter((k) => !esKeys.has(k));
  assert.deepEqual(missingEn, [], 'missing EN: ' + missingEn.join(', '));
  assert.deepEqual(missingEs, [], 'missing ES: ' + missingEs.join(', '));
  assert.equal(enKeys.size, esKeys.size, 'EN/ES copilot key counts differ');
});
