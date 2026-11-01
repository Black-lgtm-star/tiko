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
vm.runInContext(fs.readFileSync(path.join(root, 'js/chartread.js'), 'utf8'), ctx, { filename: 'js/chartread.js' });
const read = ctx.window.TA.chartread;

const DARK = [11, 14, 26];
const LIGHT = [250, 250, 252];
const GREEN = [61, 220, 151];
const RED = [255, 92, 138];
const BLUE = [60, 120, 255];
const GREY = [120, 126, 142];

function makeImage(w, h, bg) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

function put(img, x, y, color) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = color[0];
  img.data[i + 1] = color[1];
  img.data[i + 2] = color[2];
  img.data[i + 3] = 255;
}

function rect(img, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) put(img, x + dx, y + dy, color);
  }
}

function line(img, x0, y0, x1, y1, color, width) {
  width = width || 1;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    rect(img, x, y, width, width, color);
  }
}

function candles(w, h, trend) {
  const img = makeImage(w, h, DARK);
  for (let gx = 30; gx < w - 20; gx += 70) line(img, gx, 18, gx, h - 24, GREY, 1);
  for (let gy = 30; gy < h - 20; gy += 50) line(img, 24, gy, w - 12, gy, GREY, 1);
  const n = 44;
  for (let i = 0; i < n; i++) {
    const x = 36 + i * 8;
    const base = h - 46;
    const y = trend === 'up'
      ? base - (base - 52) * (i / (n - 1)) + Math.sin(i * 1.7) * 6
      : 52 + (base - 52) * (i / (n - 1)) + Math.sin(i * 1.7) * 6;
    const up = i === 0 ? true : y < (trend === 'up' ? base - (base - 52) * ((i - 1) / (n - 1)) : 52 + (base - 52) * ((i - 1) / (n - 1)));
    const color = up ? GREEN : RED;
    line(img, x + 3, y - 9, x + 3, y + 9, color, 1);
    rect(img, x, y - 5, 6, 11, color);
  }
  return img;
}

test('reads an uptrend candlestick screenshot as shape only', () => {
  const res = read.scan(candles(420, 280, 'up'));
  assert.equal(res.ok, true);
  assert.equal(res.direction, 'up');
  assert.equal(res.chartType, 'candles');
  assert.equal(res.theme, 'dark');
  assert.ok(res.positionPct > 55, 'position ' + res.positionPct);
  assert.ok(res.confidence > 0.4, 'confidence ' + res.confidence);
  assert.ok(res.candles.bull + res.candles.bear >= 10);
  assert.ok(res.levels.supportPct < res.levels.resistancePct);
  assert.ok(res.caveats.indexOf('no-price-scale') >= 0);
  assert.ok(res.caveats.indexOf('no-timeframe') >= 0);
  assert.ok(res.caveats.indexOf('no-ticker') >= 0);
  assert.ok(res.caveats.indexOf('no-volume') >= 0);
});

test('reads a downtrend line chart on a light theme', () => {
  const img = makeImage(420, 280, LIGHT);
  line(img, 24, 40, 400, 236, BLUE, 2);
  const res = read.scan(img);
  assert.equal(res.ok, true);
  assert.equal(res.direction, 'down');
  assert.equal(res.chartType, 'line');
  assert.equal(res.theme, 'light');
  assert.ok(res.positionPct < 45, 'position ' + res.positionPct);
  assert.ok(res.netPct < 0, 'net ' + res.netPct);
});

test('keeps an uptrend direction through a late retracement', () => {
  const img = makeImage(420, 280, DARK);
  line(img, 30, 236, 150, 250, BLUE, 2);
  line(img, 150, 250, 330, 54, BLUE, 2);
  line(img, 330, 54, 400, 150, BLUE, 2);
  const res = read.scan(img);
  assert.equal(res.ok, true);
  assert.equal(res.direction, 'up');
  assert.ok(res.positionPct > 40, 'position ' + res.positionPct);
  assert.ok(res.levels.supportPct < res.levels.resistancePct);
});

test('keeps a downtrend direction through a late bounce', () => {
  const img = makeImage(420, 280, DARK);
  line(img, 30, 40, 170, 50, BLUE, 2);
  line(img, 170, 50, 330, 234, BLUE, 2);
  line(img, 330, 234, 400, 150, BLUE, 2);
  const res = read.scan(img);
  assert.equal(res.ok, true);
  assert.equal(res.direction, 'down');
  assert.ok(res.positionPct < 55, 'position ' + res.positionPct);
});

test('calls a nearly flat series flat even when it moves a little', () => {
  const img = makeImage(420, 280, DARK);
  for (let x = 24; x < 400; x++) {
    const y = 140 + Math.sin(((x - 24) / 376) * Math.PI * 12) * 5;
    rect(img, x, Math.round(y), 1, 2, GREEN);
  }
  const res = read.scan(img);
  assert.equal(res.ok, true);
  assert.equal(res.direction, 'flat');
});

test('rejects a screenshot with no plotted series', () => {
  const img = makeImage(420, 280, LIGHT);
  for (let x = 24; x < 120; x += 4) rect(img, x, 30, 2, 10, [40, 40, 40]);
  const res = read.scan(img);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-series');
});

test('rejects blank, tiny and transparent images honestly', () => {
  assert.equal(read.scan(makeImage(420, 280, LIGHT)).reason, 'no-series');
  assert.equal(read.scan(makeImage(20, 20, LIGHT)).reason, 'too-small');
  const blank = makeImage(420, 280, LIGHT);
  for (let i = 3; i < blank.data.length; i += 4) blank.data[i] = 0;
  assert.equal(read.scan(blank).ok, false);
  assert.equal(read.scan(null).reason, 'no-image');
});

test('scan is deterministic and does not mutate the pixels', () => {
  const img = candles(420, 280, 'down');
  const before = Buffer.from(img.data).toString('base64');
  const a = read.scan(img);
  const b = read.scan(img);
  assert.deepEqual(a, b);
  assert.equal(Buffer.from(img.data).toString('base64'), before);
  assert.equal(a.direction, 'down');
});
