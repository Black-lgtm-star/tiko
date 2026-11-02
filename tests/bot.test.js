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
['js/util.js', 'js/tradeplan.js', 'js/bot.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;

const settings = { accountSize: 10000, riskPct: 1 };

function plan(over) {
  return Object.assign({
    side: 'long', state: 'in_play', entry: 100, stop: 98, target: 104,
    rr: 2, trigger: 100, price: 100, sizeAllowed: false
  }, over || {});
}

function input(symbol, over, opts) {
  opts = opts || {};
  const p = plan(over);
  return {
    asset: { symbol, name: symbol, assetClass: 'crypto' },
    a: {
      lean: { dir: p.side === 'short' ? 'bear' : 'bull', confidence: opts.confidence || 'high' },
      facts: { price: p.entry }
    },
    plan: p,
    price: opts.price == null ? p.entry : opts.price,
    meta: { dataMode: opts.dataMode || 'live' }
  };
}

function run(state, inputs, now) {
  return TA.bot.scan(state, inputs, { settings, now });
}

test('create and normalize produce safe defaults', () => {
  const s = TA.bot.create();
  assert.equal(s.enabled, false);
  assert.equal(s.maxPositions, 3);
  assert.equal(s.startEquity, null);
  assert.equal(s.positions.length, 0);
  assert.equal(s.closed.length, 0);

  const n = TA.bot.normalize({ enabled: 'yes', maxPositions: 9, positions: [{ bad: true }], closed: 'x', realized: 'nope' });
  assert.equal(n.enabled, true);
  assert.equal(n.maxPositions, 3);
  assert.equal(n.positions.length, 0);
  assert.equal(n.closed.length, 0);
  assert.equal(n.realized, 0);
});

test('decide opens only active setups with enough evidence and reward', () => {
  const a = { lean: { dir: 'bull', confidence: 'high' } };
  const ready = TA.bot.decide(a, plan());
  assert.equal(ready.action, 'open');
  assert.equal(ready.side, 'long');
  assert.equal(ready.reason, 'ready');
  assert.equal(TA.bot.decide({ lean: { confidence: 'medium' } }, plan({ state: 'triggered' })).action, 'open');
  assert.equal(TA.bot.decide(a, plan({ state: 'wait' })).reason, 'wait');
  assert.equal(TA.bot.decide(a, plan({ state: 'extended' })).action, 'skip');
  assert.equal(TA.bot.decide(a, plan({ state: 'invalidated' })).action, 'skip');
  assert.equal(TA.bot.decide(a, plan({ state: 'no_edge' })).action, 'skip');
  assert.equal(TA.bot.decide({ lean: { confidence: 'low' } }, plan()).action, 'watch');
  assert.equal(TA.bot.decide(a, plan({ rr: 1.1 })).reason, 'lowReward');
  assert.equal(TA.bot.decide(a, plan({ side: 'none' })).reason, 'noSide');
  assert.equal(TA.bot.decide(a, plan({ stop: 101 })).reason, 'badLevels');
});

test('a scan opens a sized paper position and records the decision', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const out = run(started, [input('BTC')], 2000);
  assert.equal(out.state.positions.length, 1);
  const pos = out.state.positions[0];
  assert.equal(pos.symbol, 'BTC');
  assert.equal(pos.side, 'long');
  assert.equal(pos.entry, 100);
  assert.equal(pos.units, 50);
  assert.equal(pos.riskAmount, 100);
  assert.equal(pos.last, 100);
  assert.equal(pos.dataMode, 'live');
  assert.equal(out.state.log[0].type, 'open');
  assert.equal(out.decisions[0].action, 'open');
  assert.equal(out.state.scans, 1);
  assert.equal(out.state.lastScanAt, 2000);
  assert.equal(out.state.equity.length, 1);
});

test('a disabled scan records decisions but never opens', () => {
  const out = run(TA.bot.create(), [input('ETH')], 2000);
  assert.equal(out.state.positions.length, 0);
  assert.equal(out.decisions[0].action, 'open');
  assert.equal(out.state.log.length, 0);
});

test('scans skip duplicates and respect the position limit by reward', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  state.maxPositions = 2;
  let out = run(state, [
    input('BTC', { rr: 1.5 }),
    input('ETH', { rr: 3 }),
    input('SOL', { rr: 2 })
  ], 2000);
  assert.equal(out.state.positions.length, 2);
  assert.equal(JSON.stringify(out.state.positions.map((p) => p.symbol).sort()), JSON.stringify(['ETH', 'SOL']));
  const skipped = out.decisions.find((d) => d.symbol === 'BTC');
  assert.equal(skipped.action, 'skip');
  assert.equal(skipped.reason, 'maxPositions');

  const again = run(out.state, [input('ETH')], 3000);
  assert.equal(again.state.positions.length, 2);
  const held = again.decisions.find((d) => d.symbol === 'ETH');
  assert.equal(held.action, 'watch');
  assert.equal(held.reason, 'alreadyOpen');
});

test('a long position fills a stop gap at the worse price', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  let out = run(state, [input('BTC')], 2000);
  out = run(out.state, [input('BTC', {}, { price: 97 })], 3000);
  assert.equal(out.state.positions.length, 0);
  assert.equal(out.state.closed.length, 1);
  const closed = out.state.closed[0];
  assert.equal(closed.reason, 'stop');
  assert.equal(closed.exit, 97);
  assert.equal(closed.pnl, -150);
  assert.equal(closed.r, -1.5);
  assert.equal(out.state.realized, -150);
  assert.equal(out.state.log[0].type, 'close');
});

test('a long position takes profit at the plan target', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  let out = run(state, [input('BTC')], 2000);
  out = run(out.state, [input('BTC', {}, { price: 104.6 })], 3000);
  const closed = out.state.closed[0];
  assert.equal(closed.reason, 'target');
  assert.equal(closed.exit, 104);
  assert.equal(closed.pnl, 200);
  assert.equal(closed.r, 2);
});

test('a short position mirrors stop and target handling', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  state = run(state, [input('BTC', { side: 'short', stop: 102, target: 96 }, { price: 100 })], 2000).state;
  let out = run(state, [input('BTC', { side: 'short', stop: 102, target: 96 }, { price: 103 })], 3000);
  const closed = out.state.closed[0];
  assert.equal(closed.reason, 'stop');
  assert.equal(closed.exit, 103);
  assert.equal(closed.pnl, -150);
  assert.equal(closed.r, -1.5);
});

test('a flipped plan closes at market', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  state = run(state, [input('BTC')], 2000).state;
  const flipped = input('BTC', { side: 'short', stop: 102, target: 96 }, { price: 101 });
  const out = run(state, [flipped], 3000);
  assert.equal(out.state.positions.length, 0);
  assert.equal(out.state.closed[0].reason, 'flip');
  assert.equal(out.state.closed[0].exit, 101);
  assert.equal(out.state.closed[0].pnl, 50);
});

test('a position stays open while the plan still agrees', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  state = run(state, [input('BTC')], 2000).state;
  const out = run(state, [input('BTC', {}, { price: 101 })], 3000);
  assert.equal(out.state.positions.length, 1);
  assert.equal(out.state.positions[0].last, 101);
  assert.equal(out.state.closed.length, 0);
});

test('stats summarize wins, losses, R and virtual equity', () => {
  const state = TA.bot.create();
  state.startEquity = 10000;
  state.realized = 100;
  state.closed = [
    { symbol: 'A', side: 'long', entry: 100, stop: 98, target: 104, units: 50, riskAmount: 100, exit: 104, pnl: 200, r: 2 },
    { symbol: 'B', side: 'long', entry: 100, stop: 98, target: 104, units: 50, riskAmount: 100, exit: 98, pnl: -100, r: -1 }
  ];
  const s = TA.bot.stats(state, settings);
  assert.equal(s.closedCount, 2);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 1);
  assert.equal(s.winRate, 50);
  assert.equal(s.totalR, 1);
  assert.equal(s.avgR, 0.5);
  assert.equal(s.profitFactor, 2);
  assert.equal(s.equity, 10100);
  assert.ok(Math.abs(s.returnPct - 1) < 1e-9);
  assert.equal(s.bestR, 2);
  assert.equal(s.worstR, -1);
});

test('start, stop and normalization keep the ledger intact', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  assert.equal(state.enabled, true);
  assert.equal(state.startEquity, 10000);
  assert.equal(state.startedAt, 1000);
  state = run(state, [input('BTC')], 2000).state;
  state = TA.bot.stop(state);
  assert.equal(state.enabled, false);
  state = TA.bot.start(state, settings, 4000);
  assert.equal(state.startEquity, 10000);
  assert.equal(state.positions.length, 1);
});

test('the same inputs and time produce the same ledger', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const one = run(started, [input('BTC'), input('ETH', { rr: 2.5 })], 2000);
  const two = run(TA.bot.start(TA.bot.create(), settings, 1000), [input('BTC'), input('ETH', { rr: 2.5 })], 2000);
  assert.deepEqual(one.state, two.state);
});
