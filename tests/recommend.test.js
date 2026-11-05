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
['js/util.js', 'js/tradeplan.js', 'js/bot.js', 'js/recommend.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;

const checks = [{ ok: true }, { ok: true }, { ok: true }, { ok: true }];

function input(symbol, over) {
  over = over || {};
  const plan = Object.assign({
    side: 'long', state: 'in_play', setup: 'breakout',
    entry: 100, stop: 98, target: 106, rr: 3, checks
  }, over.plan || {});
  return {
    asset: {
      symbol,
      name: over.name || symbol,
      sector: over.sector || 'Technology',
      assetClass: 'stock'
    },
    a: {
      lean: {
        ratio: over.ratio == null ? 0.4 : over.ratio,
        confidence: over.confidence || 'high',
        dir: plan.side === 'short' ? 'bear' : 'bull'
      },
      trend: { score: over.trend == null ? 2.5 : over.trend },
      liquidity: { key: over.liquidity || 'liq.deep' },
      volatility: { key: over.vol || 'vol.normal' },
      facts: {
        price: 100,
        relVol: over.relVol == null ? 1.4 : over.relVol,
        rsi: over.rsi == null ? 60 : over.rsi
      },
      evidence: {
        bull: over.bull || [{ key: 'ev.aboveSma50', params: { dist: '+2%' } }],
        bear: over.bear || [{ key: 'ev.belowSma50', params: { dist: '+2%' } }]
      }
    },
    plan,
    price: 100,
    meta: { dataMode: over.dataMode || 'live' }
  };
}

test('a strong, active setup scores above a weak waiting one', () => {
  const strong = TA.recommend.score(input('AAA'));
  const weak = TA.recommend.score(input('BBB', {
    ratio: 0.1, confidence: 'medium', trend: 0,
    plan: { state: 'wait', rr: 1.4 }, liquidity: 'liq.moderate', relVol: 0.8
  }));
  assert.ok(strong);
  assert.ok(weak);
  assert.ok(strong.score > weak.score);
  assert.equal(strong.tier, 'strong');
  assert.equal(strong.side, 'long');
  assert.equal(strong.executable, true);
  assert.equal(weak.executable, false);
});

test('invalid levels and missing side are excluded', () => {
  assert.equal(TA.recommend.score(input('BAD', { plan: { stop: 101 } })), null);
  assert.equal(TA.recommend.score(input('NONE', { plan: { side: 'none' } })), null);
  const short = TA.recommend.score(input('SHRT', {
    plan: { side: 'short', entry: 100, stop: 103, target: 94, rr: 2 }
  }));
  assert.ok(short);
  assert.equal(short.side, 'short');
  assert.deepEqual(short.reasons.map((r) => r.key), ['ev.belowSma50']);
});

test('sample data is penalized and labelled', () => {
  const live = TA.recommend.score(input('LIVE'));
  const sample = TA.recommend.score(input('SMPL', {
    dataMode: 'sample', plan: { state: 'practice' }
  }));
  assert.ok(sample);
  assert.equal(sample.dataMode, 'sample');
  assert.equal(sample.executable, false);
  assert.ok(sample.score < live.score);
  assert.equal(sample.riskKey, 'ideas.risk.sample');
});

test('extended, invalidated and thin evidence are penalized', () => {
  const normal = TA.recommend.score(input('OK'));
  const extended = TA.recommend.score(input('EXT', { plan: { state: 'extended' } }));
  const invalid = TA.recommend.score(input('INV', { plan: { state: 'invalidated' } }));
  const thin = TA.recommend.score(input('THIN', { confidence: 'low', ratio: 0.05 }));
  assert.ok(extended.score < normal.score);
  assert.ok(invalid.score < extended.score);
  assert.ok(thin.score < normal.score);
});

test('ranking sorts, assigns ranks and respects the score floor', () => {
  const out = TA.recommend.rank([
    input('LOW', { ratio: 0.12, confidence: 'medium', trend: 0, plan: { state: 'wait', rr: 1.4 }, relVol: 0.9 }),
    input('HIGH'),
    input('MID', { ratio: 0.25, trend: 1.5, plan: { rr: 2 } })
  ], { max: 2 });
  assert.equal(out.ideas.length, 2);
  assert.deepEqual([...out.ideas.map((i) => i.symbol)], ['HIGH', 'MID']);
  assert.deepEqual([...out.ideas.map((i) => i.rank)], [1, 2]);
  assert.equal(out.scoredCount, 3);

  const none = TA.recommend.rank([input('HIGH')], { minScore: 101 });
  assert.equal(none.ideas.length, 0);
});

test('the shortlist diversifies sectors before filling up', () => {
  const out = TA.recommend.rank([
    input('T1'), input('T2'), input('T3'),
    input('F1', { sector: 'Financials' })
  ], { max: 3, maxPerSector: 2 });
  assert.equal(out.ideas.length, 3);
  const sectors = out.ideas.map((i) => i.sector);
  assert.equal(sectors.filter((s) => s === 'Technology').length, 2);
  assert.equal(sectors.filter((s) => s === 'Financials').length, 1);
  assert.ok(out.deferred.some((i) => i.symbol === 'T3'));
});

test('extended and invalidated setups are never shortlisted', () => {
  const out = TA.recommend.rank([
    input('EXT', { plan: { state: 'extended' } }),
    input('INV', { plan: { state: 'invalidated' } }),
    input('OK')
  ], { minScore: 0 });
  assert.deepEqual([...out.ideas.map((i) => i.symbol)], ['OK']);
});

test('the same inputs produce the same ranking', () => {
  const inputs = [input('A'), input('B', { plan: { rr: 2 } }), input('C', { sector: 'Energy' })];
  const one = TA.recommend.rank(inputs, { now: 1000 });
  const two = TA.recommend.rank(inputs, { now: 1000 });
  assert.deepEqual(one, two);
});
