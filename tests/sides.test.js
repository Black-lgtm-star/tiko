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
['js/util.js', 'js/i18n.js', 'js/tradeplan.js', 'js/sides.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;

function ana(over) {
  over = over || {};
  return Object.assign({
    asset: over.asset || { symbol: 'AAA', name: 'Alpha Corp', sector: 'Technology', assetClass: 'stock' },
    facts: Object.assign({
      price: 100, atr: 2, relVol: 1.2, rsi: 55, sma20: 98,
      sma20Text: '$ 98', ret20: 2, ret20Text: '+2.0%', rsiText: '55',
      relVolText: '1.2x', changePct: 0.5, atrText: '$ 2.00'
    }, over.facts || {}),
    lean: over.lean || { dir: 'bull', confidence: 'high', ratio: 0.4 },
    nearestSupport: over.nearestSupport !== undefined ? over.nearestSupport : { price: 95 },
    nearestResistance: over.nearestResistance !== undefined ? over.nearestResistance : { price: 101 },
    nextSupport: over.nextSupport !== undefined ? over.nextSupport : { price: 92 },
    nextResistance: over.nextResistance !== undefined ? over.nextResistance : { price: 106 },
    meta: over.meta || { dataMode: 'live', seriesEnd: '2026-11-06T00:00:00Z' }
  });
}

function build(over, opts) {
  return TA.sides.build({ a: ana(over), quote: { price: 100, changePct: 0.5 }, meta: ana(over).meta },
    Object.assign({ lang: 'en', style: 'swing' }, opts));
}

test('one analysis produces mirrored buy and sell cases', () => {
  const out = build();
  assert.ok(out);
  assert.equal(out.symbol, 'AAA');
  assert.equal(out.buy.side, 'long');
  assert.equal(out.sell.side, 'short');
  assert.ok(out.buy.entry > 0);
  assert.ok(out.sell.entry > 0);
  assert.ok(out.buy.stop < out.buy.entry, 'buy stop sits below entry');
  assert.ok(out.buy.target > out.buy.entry, 'buy target sits above entry');
  assert.ok(out.sell.stop > out.sell.entry, 'sell stop sits above entry');
  assert.ok(out.sell.target < out.sell.entry, 'sell target sits below entry');
  assert.ok(out.buy.perShareRisk > 0);
  assert.ok(out.buy.perShareReward > 0);
  assert.ok(out.sell.perShareRisk > 0);
  assert.ok(out.sell.perShareReward > 0);
  assert.ok(Math.abs(out.buy.rr - out.buy.perShareReward / out.buy.perShareRisk) < 1e-9);
});

test('the lean, quote and sector travel with the row', () => {
  const out = build({ lean: { dir: 'bear', confidence: 'medium', ratio: -0.3 } });
  assert.equal(out.lean.dir, 'bear');
  assert.equal(out.lean.confidence, 'medium');
  assert.equal(out.price, 100);
  assert.equal(out.changePct, 0.5);
  assert.equal(out.sector, 'Technology');
});

test('sample data becomes practice with no sizing', () => {
  const out = build({ meta: { dataMode: 'sample', seriesEnd: '2026-11-06T00:00:00Z' } });
  assert.equal(out.dataMode, 'sample');
  assert.equal(out.buy.state, 'practice');
  assert.equal(out.sell.state, 'practice');
  assert.equal(out.buy.actionable, false);
  assert.equal(out.sell.actionable, false);
  assert.ok(out.buy.entry > 0);
  assert.ok(out.sell.entry > 0);
});

test('each direction is scored and sized independently', () => {
  const out = build();
  assert.equal(out.buy.state, 'wait');
  assert.equal(out.sell.state, 'wait');
  assert.equal(out.buy.actionable, true);
  assert.equal(out.sell.actionable, true);
  assert.ok(out.buy.entry < out.buy.target);
  assert.ok(out.sell.entry > out.sell.target);
  assert.notEqual(out.buy.stop, out.sell.stop);
});

test('missing analysis or price returns null', () => {
  assert.equal(TA.sides.build({}, {}), null);
  assert.equal(TA.sides.build({ a: { facts: {} } }, {}), null);
  assert.equal(TA.sides.build({
    a: ana({ facts: { price: 0 } }), quote: {}, meta: {}
  }, {}), null);
});

test('the same inputs produce the same comparison', () => {
  assert.deepEqual(build(), build());
});
