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
['js/util.js', 'js/i18n.js', 'js/tradeplan.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;

const FACTS = {
  price: 100, atr: 2, relVol: 1.2, rsi: 55, sma20: 98, sma20Text: '$ 98',
  ret20: 2, ret20Text: '+2.0%', rsiText: '55', relVolText: '1.2x',
  changePct: 0.5, atrText: '$ 2.00'
};

function ana(over) {
  over = over || {};
  return Object.assign({
    facts: Object.assign({}, FACTS, over.facts || {}),
    lean: over.lean || { dir: 'bull', confidence: 'high' },
    nearestSupport: over.nearestSupport !== undefined ? over.nearestSupport : { price: 95 },
    nearestResistance: over.nearestResistance !== undefined ? over.nearestResistance : { price: 105 },
    nextSupport: over.nextSupport !== undefined ? over.nextSupport : { price: 92 },
    nextResistance: over.nextResistance !== undefined ? over.nextResistance : { price: 110 },
    meta: over.meta || { dataMode: 'live', seriesEnd: '2026-10-31T00:00:00Z' },
    asset: over.asset || { assetClass: 'crypto' },
    volatility: over.volatility,
    liquidity: over.liquidity
  });
}

function plan(over, opts) {
  return TA.tradeplan.build(ana(over), Object.assign({ lang: 'en' }, opts));
}

test('long wait for breakout', () => {
  const p = plan({ nearestResistance: { price: 101 }, nextResistance: { price: 106 } });
  assert.equal(p.side, 'long');
  assert.equal(p.setup, 'breakout');
  assert.equal(p.state, 'wait');
  assert.equal(p.trigger, 101);
  assert.equal(p.entry, 101);
  assert.equal(p.stop, 98);
  assert.equal(p.target, 106);
  assert.ok(Math.abs(p.rr - 5 / 3) < 1e-9);
  assert.equal(p.sizeAllowed, true);
  assert.equal(p.actionKey, 'plan.act.wait.breakoutLong');
});

test('long wait for pullback', () => {
  const p = plan({ nearestSupport: { price: 99.5 }, nearestResistance: { price: 110 } });
  assert.equal(p.setup, 'pullback');
  assert.equal(p.state, 'wait');
  assert.equal(p.trigger, 99.5);
  assert.ok(Math.abs(p.stop - (99.5 - 2 * 1.2)) < 1e-9);
  assert.equal(p.target, 110);
  assert.equal(p.actionKey, 'plan.act.wait.pullbackLong');
});

test('long extended beyond 2 ATR of resistance', () => {
  const p = plan({ nearestResistance: { price: 90 }, nearestSupport: { price: 85 }, nextResistance: { price: 120 }, facts: { relVol: 2 } });
  assert.equal(p.state, 'extended');
  assert.equal(p.entryBasis, 'last');
  assert.equal(p.sizeAllowed, false);
  assert.equal(p.sizeHiddenKey, 'plan.size.hidden.extended');
});

test('long invalidated below support', () => {
  const p = plan({ facts: { price: 90 }, nearestSupport: { price: 95 } });
  assert.equal(p.state, 'invalidated');
  assert.equal(p.sizeAllowed, false);
  assert.equal(p.actionKey, 'plan.act.invalidatedLong');
});

test('long in play on volume', () => {
  const p = plan({ nearestResistance: { price: 98.5 }, facts: { relVol: 1.5 } });
  assert.equal(p.state, 'in_play');
  assert.equal(p.entryBasis, 'last');
  assert.equal(p.sizeAllowed, true);
});

test('long triggered without volume confirmation', () => {
  const p = plan({ nearestResistance: { price: 98.5 }, facts: { relVol: 0.9 } });
  assert.equal(p.state, 'triggered');
  assert.equal(p.sizeAllowed, true);
  assert.equal(p.actionKey, 'plan.act.triggered');
});

test('short wait for breakdown uses mirrored copy', () => {
  const p = plan({ lean: { dir: 'bear', confidence: 'high' }, nearestSupport: { price: 99 }, nearestResistance: { price: 105 }, nextSupport: { price: 94 } });
  assert.equal(p.side, 'short');
  assert.equal(p.state, 'wait');
  assert.equal(p.trigger, 99);
  assert.equal(p.stop, 102);
  assert.equal(p.target, 94);
  assert.equal(p.actionKey, 'plan.act.wait.breakoutShort');
});

test('short invalidated above resistance', () => {
  const p = plan({ lean: { dir: 'bear', confidence: 'high' }, facts: { price: 110 }, nearestResistance: { price: 105 } });
  assert.equal(p.state, 'invalidated');
  assert.equal(p.actionKey, 'plan.act.invalidatedShort');
});

test('neutral lean flips on a live break', () => {
  const p = plan({ lean: { dir: 'neutral', confidence: 'high' }, nearestResistance: { price: 105 }, facts: { price: 106, relVol: 1 } }, { live: true });
  assert.equal(p.side, 'long');
  assert.equal(p.state, 'triggered');
});

test('neutral mid-range has no edge', () => {
  const p = plan({ lean: { dir: 'neutral', confidence: 'high' } });
  assert.equal(p.side, 'none');
  assert.equal(p.state, 'no_edge');
  assert.equal(p.sizeAllowed, false);
  assert.equal(p.actionKey, 'plan.act.noEdge');
});

test('sample data forces practice mode', () => {
  const p = plan({ meta: { dataMode: 'sample', seriesEnd: '2026-10-31T00:00:00Z' } });
  assert.equal(p.state, 'practice');
  assert.equal(p.sizeAllowed, false);
  assert.equal(p.dataKey, 'plan.data.sample');
  assert.ok(p.warnings.indexOf('plan.warn.sample') >= 0);
  assert.equal(p.actionKey, 'plan.act.practice');
});

test('determinism: identical inputs yield identical plans', () => {
  const a = plan({}, { live: true, price: 100, changePct: 0.5, asOf: '2026-10-31T01:00:00Z' });
  const b = plan({}, { live: true, price: 100, changePct: 0.5, asOf: '2026-10-31T01:00:00Z' });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('stop keeps a 0.9-1.5 ATR buffer', () => {
  const p = plan({ nearestResistance: { price: 101 }, nearestSupport: { price: 99 } });
  assert.ok(101 - p.stop >= 0.9 * 2 - 1e-9 && 101 - p.stop <= 1.5 * 2 + 1e-9);
});

test('sizing uses fixed-fractional risk', () => {
  const p = plan({ nearestResistance: { price: 101 }, nextResistance: { price: 106 } });
  const s = TA.tradeplan.size(p, { accountSize: 10000, riskPct: 1 });
  assert.ok(Math.abs(s.maxLoss - 100) < 1e-9);
  assert.ok(Math.abs(s.units - 100 / 3) < 1e-9);
  assert.ok(Math.abs(s.notional - (100 / 3) * 101) < 1e-9);
  assert.equal(s.capped, false);
});

test('sizing caps notional at the account size', () => {
  const p = plan({
    nearestSupport: { price: 99.98 },
    nearestResistance: { price: 110 },
    facts: { atr: 0.05 }
  });
  assert.equal(p.setup, 'pullback');
  const s = TA.tradeplan.size(p, { accountSize: 1000, riskPct: 100 });
  assert.equal(s.capped, true);
  assert.ok(Math.abs(s.notional - 1000) < 1e-9);
  assert.ok(Math.abs(s.units - 1000 / 99.98) < 1e-9);
  assert.ok(s.maxLoss < 1000);
});

test('sizing is unavailable outside tradable states', () => {
  const p = plan({ meta: { dataMode: 'sample' } });
  assert.equal(TA.tradeplan.size(p, { accountSize: 10000, riskPct: 1 }), null);
});

test('warnings reflect low confidence, high volatility and stretched RSI', () => {
  const p = plan({ lean: { dir: 'bull', confidence: 'low' }, volatility: { key: 'vol.high' }, facts: { rsi: 74 } });
  ['plan.warn.lowConf', 'plan.warn.vol', 'plan.warn.stretchLong'].forEach((k) =>
    assert.ok(p.warnings.indexOf(k) >= 0, 'missing ' + k));
});

test('every plan.* key used in code exists in EN and ES', () => {
  const code = fs.readFileSync(path.join(root, 'js/tradeplan.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'js/views/analysis.js'), 'utf8');
  const used = new Set();
  (code.match(/'plan\.[^']+'/g) || []).forEach((s) => {
    const k = s.slice(1, -1);
    if (!k.endsWith('.')) used.add(k);
  });
  ['wait', 'triggered', 'in_play', 'extended', 'invalidated', 'no_edge', 'practice'].forEach((s) => used.add('plan.state.' + s));
  ['long', 'short', 'none'].forEach((s) => used.add('plan.side.' + s));
  ['breakout', 'pullback', 'none'].forEach((s) => used.add('plan.setup.' + s));
  const fixture = plan({});
  const sample = plan({ meta: { dataMode: 'sample' } });
  [fixture, sample].forEach((p) => {
    used.add(p.actionKey);
    used.add(p.dataKey);
    if (p.sizeHiddenKey) used.add(p.sizeHiddenKey);
    p.reasons.forEach((r) => used.add(r.key));
    p.checks.forEach((c) => used.add(c.key));
    p.warnings.forEach((w) => used.add(w));
  });
  const i18n = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
  const enPart = i18n.slice(i18n.indexOf('var en = {'), i18n.indexOf('var es = {'));
  const esPart = i18n.slice(i18n.indexOf('var es = {'), i18n.indexOf('function t('));
  const enKeys = new Set((enPart.match(/'(plan\.[^']+)':/g) || []).map((s) => s.slice(1, -2)));
  const esKeys = new Set((esPart.match(/'(plan\.[^']+)':/g) || []).map((s) => s.slice(1, -2)));
  const missingEn = [...used].filter((k) => !enKeys.has(k));
  const missingEs = [...used].filter((k) => !esKeys.has(k));
  assert.deepEqual(missingEn, [], 'missing EN: ' + missingEn.join(', '));
  assert.deepEqual(missingEs, [], 'missing ES: ' + missingEs.join(', '));
  assert.equal(enKeys.size, esKeys.size, 'EN/ES key counts differ');
});

test('Spanish copy resolves through the locale', () => {
  TA.i18n.set('es');
  assert.equal(TA.i18n.t('plan.warn.lowConf'), 'La evidencia es escasa; trata el sesgo como tentativo.');
  assert.equal(TA.i18n.t('plan.foot'), 'Plan basado en reglas · no se envía ninguna orden');
  TA.i18n.set('en');
});
