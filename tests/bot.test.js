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

test('timing separates fired, armed and waiting entries', () => {
  assert.equal(TA.bot.timing(plan()).window, 'now');
  assert.equal(TA.bot.timing(plan({ state: 'triggered' })).window, 'now');
  const armed = TA.bot.timing(plan({ state: 'wait', trigger: 100.5, price: 100, atr: 2 }));
  assert.equal(armed.window, 'armed');
  assert.equal(TA.bot.timing(plan({ state: 'wait', trigger: 106, price: 100, atr: 2 })).window, 'waiting');
  assert.equal(TA.bot.timing(plan({ state: 'extended' })).window, 'none');

  const near = TA.bot.decide({ lean: { confidence: 'high' } }, plan({ state: 'wait', trigger: 100.5, price: 100, atr: 2 }));
  assert.equal(near.action, 'watch');
  assert.equal(near.reason, 'triggerNear');
});

test('candidates are ranked by entry timing before reward', () => {
  const state = TA.bot.start(TA.bot.create(), settings, 1000);
  const out = run(state, [
    input('AAPL', { state: 'wait', trigger: 106, price: 100, atr: 2 }),
    input('MSFT', { rr: 5, state: 'triggered' }),
    input('NVDA', { rr: 1.8 })
  ], 2000);
  assert.equal(out.state.positions.map((p) => p.symbol).join(','), 'NVDA,MSFT');
});

test('ask mode queues a proposal instead of opening', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const out = TA.bot.scan(started, [input('AAPL')], { settings, now: 2000, autoApprove: false });
  assert.equal(out.state.positions.length, 0);
  assert.equal(out.state.pending.length, 1);
  assert.equal(out.state.pending[0].symbol, 'AAPL');
  assert.equal(out.state.pending[0].status, 'pending');
  assert.equal(out.state.pending[0].expiresAt, 2000 + TA.bot.pendingMs);
  assert.equal(out.decisions[0].action, 'watch');
  assert.equal(out.decisions[0].reason, 'pending');
  assert.equal(out.events.filter((e) => e.type === 'propose').length, 1);
  assert.equal(out.state.log[0].type, 'propose');
});

test('expired proposals are pruned and logged', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const queued = TA.bot.scan(started, [input('AAPL')], { settings, now: 2000, autoApprove: false });
  const out = TA.bot.scan(queued.state, [], {
    settings, now: 2000 + TA.bot.pendingMs + 1, autoApprove: false
  });
  assert.equal(out.state.pending.length, 0);
  assert.equal(out.events.some((e) => e.type === 'expire' && e.symbol === 'AAPL'), true);
});

test('the proposal queue is capped', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const symbols = ['A', 'B', 'C', 'D', 'E', 'F'].map((s) => input(s, { rr: 3 }));
  const out = TA.bot.scan(started, symbols, { settings, now: 2000, autoApprove: false });
  assert.equal(out.state.pending.length, TA.bot.maxPending);
  assert.equal(out.decisions.some((d) => d.reason === 'maxPending'), true);
});

test('approving a proposal opens the paper position once', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const queued = TA.bot.scan(started, [input('AAPL')], { settings, now: 2000, autoApprove: false });
  const id = queued.state.pending[0].id;
  const ok = TA.bot.approve(queued.state, id, 3000);
  assert.equal(ok.error, undefined);
  assert.equal(ok.state.pending.length, 0);
  assert.equal(ok.state.positions.length, 1);
  assert.equal(ok.position.symbol, 'AAPL');
  assert.equal(ok.position.openedAt, 3000);
  assert.equal(ok.state.log[0].type, 'open');

  const again = TA.bot.approve(ok.state, id, 4000);
  assert.equal(again.error, 'missing');
  assert.equal(again.state.positions.length, 1);
});

test('approval refuses expired proposals and a full book', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const queued = TA.bot.scan(started, [input('AAPL')], { settings, now: 2000, autoApprove: false });
  const id = queued.state.pending[0].id;
  const late = TA.bot.approve(queued.state, id, 2000 + TA.bot.pendingMs + 1);
  assert.equal(late.error, 'expired');
  assert.equal(late.state.pending.length, 0);
  assert.equal(late.state.log[0].type, 'expire');

  const full = TA.bot.start(TA.bot.create(), settings, 1000);
  full.maxPositions = 2;
  const scanned = TA.bot.scan(full, [input('AAPL'), input('MSFT'), input('NVDA')], {
    settings, now: 2000, autoApprove: false
  });
  scanned.state.positions = ['BTC', 'ETH'].map((symbol) => TA.bot.buildPosition(input(symbol), settings, 2000));
  const rejected = TA.bot.approve(scanned.state, scanned.state.pending[0].id, 3000);
  assert.equal(rejected.error, 'maxPositions');
});

test('declining a proposal removes it without opening a position', () => {
  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const queued = TA.bot.scan(started, [input('AAPL')], { settings, now: 2000, autoApprove: false });
  const out = TA.bot.decline(queued.state, queued.state.pending[0].id, 3000);
  assert.equal(out.error, undefined);
  assert.equal(out.state.pending.length, 0);
  assert.equal(out.state.positions.length, 0);
  assert.equal(out.state.log[0].type, 'decline');
});

test('winners move the stop to breakeven and then trail', () => {
  let state = TA.bot.start(TA.bot.create(), settings, 1000);
  state = run(state, [input('BTC')], 2000).state;
  assert.equal(state.positions[0].stop, 98);

  let out = run(state, [input('BTC', {}, { price: 102 })], 3000);
  assert.equal(out.state.positions[0].stop, 100);
  assert.equal(out.state.positions[0].trail, true);
  assert.equal(out.state.positions[0].trail2, false);
  assert.equal(out.state.log[0].type, 'manage');
  assert.equal(out.state.log[0].kind, 'breakeven');

  out = run(out.state, [input('BTC', {}, { price: 103 })], 4000);
  assert.equal(out.state.positions[0].stop, 101);
  assert.equal(out.state.positions[0].trail2, true);

  const stopped = run(out.state, [input('BTC', {}, { price: 100.5 })], 5000);
  assert.equal(stopped.state.closed[0].reason, 'trail');
  assert.equal(stopped.state.closed[0].exit, 100.5);
  assert.ok(stopped.state.closed[0].pnl > 0);
});

test('persona voice is deterministic and events carry quips', () => {
  const first = TA.bot.voice('open', 7);
  assert.equal(first, TA.bot.voice('open', 7));
  assert.match(first, /^bot\.voice\.open\./);
  assert.equal(TA.bot.voice('unknown', 1), null);
  assert.equal(TA.bot.persona.name, 'Tiko');

  const started = TA.bot.start(TA.bot.create(), settings, 1000);
  const out = run(started, [input('BTC')], 2000);
  assert.match(out.state.log[0].quip, /^bot\.voice\.open\./);
  const closed = run(out.state, [input('BTC', {}, { price: 104.6 })], 3000);
  assert.match(closed.state.log[0].quip, /^bot\.voice\.target\./);
});

test('every bot.* key used in code exists in EN and ES', () => {
  const code = fs.readFileSync(path.join(root, 'js/bot.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'js/views/bot.js'), 'utf8');
  const used = new Set();
  (code.match(/'bot\.[^']+'/g) || []).forEach((s) => {
    const k = s.slice(1, -1);
    if (!k.endsWith('.')) used.add(k);
  });
  TA.bot.approvals.forEach((mode) => {
    used.add('bot.auto.mode.' + mode);
    used.add('bot.auto.note.' + mode);
  });
  ['1', '2', '3', '4'].forEach((n) => used.add('bot.auto.modal.' + n));
  ['1', '2', '3', '4', '5', '6'].forEach((n) => used.add('bot.rules.' + n));
  ['paused', 'watching', 'up', 'down', 'ready'].forEach((m) => used.add('bot.persona.mood.' + m));
  ['now', 'armed'].forEach((t) => used.add('bot.scan.timing.' + t));
  ['open', 'watch', 'skip'].forEach((a) => used.add('bot.scan.action.' + a));
  ['ready', 'wait', 'triggerNear', 'extended', 'invalidated', 'noEdge', 'lowConfidence', 'lowReward',
    'badLevels', 'noSide', 'alreadyOpen', 'maxPositions', 'maxPending', 'pending', 'flipped', 'noSize']
    .forEach((r) => used.add('bot.scan.reason.' + r));
  ['stop', 'target', 'trail', 'flip'].forEach((r) => used.add('bot.closed.reason.' + r));
  ['breakeven', 'trail'].forEach((k) => used.add('bot.log.manage.' + k));
  ['long', 'short', 'none'].forEach((s) => used.add('bot.side.' + s));

  const i18n = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
  const enPart = i18n.slice(i18n.indexOf('var en = {'), i18n.indexOf('var es = {'));
  const esPart = i18n.slice(i18n.indexOf('var es = {'), i18n.indexOf('function t('));
  const enKeys = new Set((enPart.match(/'(bot\.[^']+)':/g) || []).map((s) => s.slice(1, -2)));
  const esKeys = new Set((esPart.match(/'(bot\.[^']+)':/g) || []).map((s) => s.slice(1, -2)));
  const missingEn = [...used].filter((k) => !enKeys.has(k));
  const missingEs = [...used].filter((k) => !esKeys.has(k));
  assert.deepEqual(missingEn, [], 'missing EN: ' + missingEn.join(', '));
  assert.deepEqual(missingEs, [], 'missing ES: ' + missingEs.join(', '));
  assert.equal(enKeys.size, esKeys.size, 'EN/ES bot key counts differ');
});
