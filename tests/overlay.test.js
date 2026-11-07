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
['js/util.js', 'js/chartread.js', 'js/overlay.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;
const overlay = TA.overlay;

const DARK = [11, 14, 26];
const BLUE = [60, 120, 255];

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

function line(img, x0, y0, x1, y1, color, width) {
  width = width || 1;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    for (let dy = 0; dy < width; dy++) {
      for (let dx = 0; dx < width; dx++) put(img, x + dx, y + dy, color);
    }
  }
}

function recordingContext() {
  const calls = [];
  const rec = (op, args) => calls.push([op].concat(args));
  const c = {
    calls,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: '',
    clearRect: (...a) => rec('clearRect', a),
    save: () => rec('save', []),
    restore: () => rec('restore', []),
    setLineDash: (a) => rec('setLineDash', [a]),
    strokeRect: (...a) => rec('strokeRect', a),
    beginPath: () => rec('beginPath', []),
    moveTo: (...a) => rec('moveTo', a),
    lineTo: (...a) => rec('lineTo', a),
    stroke: () => rec('stroke', []),
    fill: () => rec('fill', []),
    arc: (...a) => rec('arc', a),
    fillRect: (...a) => rec('fillRect', a),
    fillText: (text, x, y) => rec('fillText', [text, x, y, c.font, c.fillStyle]),
    measureText: (text) => ({ width: text.length * 8 })
  };
  return c;
}

test('detects screen-share and floating-window support without throwing', () => {
  const hadNavigator = Object.prototype.hasOwnProperty.call(ctx, 'navigator');
  const hadPip = Object.prototype.hasOwnProperty.call(ctx, 'documentPictureInPicture');
  const priorNavigator = ctx.navigator;
  try {
    delete ctx.navigator;
    assert.equal(overlay.supported(), false);

    ctx.navigator = { mediaDevices: {} };
    assert.equal(overlay.supported(), false);

    ctx.navigator = { mediaDevices: { getDisplayMedia: () => {} } };
    assert.equal(overlay.supported(), true);

    ctx.navigator = { mediaDevices: { getDisplayMedia() {} } };
    assert.equal(overlay.supported(), true);
  } finally {
    if (hadNavigator) ctx.navigator = priorNavigator;
    else delete ctx.navigator;
  }

  const priorPip = ctx.documentPictureInPicture;
  try {
    delete ctx.documentPictureInPicture;
    assert.equal(overlay.pipSupported(), false);
    ctx.documentPictureInPicture = { requestWindow: () => {} };
    assert.equal(overlay.pipSupported(), true);
    ctx.documentPictureInPicture = { requestWindow: 'nope' };
    assert.equal(overlay.pipSupported(), false);
  } finally {
    if (hadPip) ctx.documentPictureInPicture = priorPip;
    else delete ctx.documentPictureInPicture;
  }
});

test('models a real chart read as a compact overlay payload', () => {
  const img = makeImage(420, 280, [250, 250, 252]);
  line(img, 24, 40, 400, 236, BLUE, 2);
  const scan = TA.chartread.scan(img);
  assert.equal(scan.ok, true);

  const m = overlay.model(scan);
  assert.equal(m.direction, 'down');
  assert.equal(m.chartType, 'line');
  assert.equal(m.width, 420);
  assert.equal(m.height, 280);
  assert.ok(m.confidence >= 0 && m.confidence <= 100, 'confidence ' + m.confidence);
  assert.equal(Number.isInteger(m.confidence), true);
  assert.equal(Number.isInteger(m.position), true);
  assert.equal(m.position, Math.round(scan.positionPct));
  assert.equal(m.support, Math.round(scan.levels.supportPct));
  assert.equal(m.resistance, Math.round(scan.levels.resistancePct));
  assert.deepEqual(m.plot, scan.plot);
  assert.notEqual(m.caveats, scan.caveats);
  assert.deepEqual(m.caveats, scan.caveats);

  m.caveats.push('mutated');
  assert.equal(scan.caveats.indexOf('mutated'), -1);
  assert.equal(overlay.model(null), null);
  assert.equal(overlay.model({ ok: false }), null);
});

test('draws support, resistance, a price marker and a confidence badge', () => {
  const scan = {
    ok: true,
    width: 100,
    height: 50,
    plot: { x: 10, y: 5, w: 80, h: 40 },
    positionPct: 50,
    confidence: 0.82,
    direction: 'up',
    levels: { supportPct: 25, resistancePct: 75 }
  };
  const c = recordingContext();
  overlay.draw(c, scan, 200, 100);

  const clear = c.calls[0];
  assert.deepEqual(clear, ['clearRect', 0, 0, 200, 100]);
  const frame = c.calls.find((call) => call[0] === 'strokeRect');
  assert.deepEqual(frame.slice(1), [20, 10, 160, 80]);

  const levels = c.calls.filter((call) => call[0] === 'fillText' && (call[1] === 'S' || call[1] === 'R'));
  assert.equal(levels.length, 2);
  assert.deepEqual(levels[0].slice(1, 3), ['S', 22]);
  assert.equal(levels[0][3], 69);
  assert.deepEqual(levels[1].slice(1, 3), ['R', 22]);
  assert.equal(levels[1][3], 29);

  const marker = c.calls.find((call) => call[0] === 'arc');
  assert.equal(marker[1], 177);
  assert.equal(marker[2], 50);
  assert.equal(marker[3], 3);

  const badge = c.calls.find((call) => call[0] === 'fillText' && call[1] === '\u2191 82%');
  assert.ok(badge, 'direction badge');
});

test('draw clears the canvas when there is no read', () => {
  const c = recordingContext();
  overlay.draw(c, null, 120, 80);
  assert.deepEqual(c.calls, [['clearRect', 0, 0, 120, 80]]);
  assert.equal(overlay.intervalMs, 4000);
  assert.equal(overlay.maxWidth, 900);
});

test('overlay copy is translated in both shipped languages', () => {
  const view = fs.readFileSync(path.join(root, 'js/views/overlay.js'), 'utf8');
  const used = new Set((view.match(/'overlay\.[A-Za-z0-9_.]+'/g) || [])
    .map((s) => s.slice(1, -1))
    .filter((k) => !k.endsWith('.')));
  ['up', 'down', 'flat'].forEach((d) => used.add('overlay.read.dir.' + d));
  ['good', 'fair', 'poor'].forEach((q) => used.add('overlay.read.quality.' + q));
  ['candles', 'bars', 'line'].forEach((s) => used.add('overlay.read.shape.' + s));
  used.add('nav.overlay');

  const i18n = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
  const enPart = i18n.slice(i18n.indexOf('var en = {'), i18n.indexOf('var es = {'));
  const esPart = i18n.slice(i18n.indexOf('var es = {'), i18n.indexOf('function t('));
  const keys = (part, prefix) => new Set((part.match(new RegExp("'(" + prefix + "\\.[^']+)':", 'g')) || [])
    .map((s) => s.replace(/^'|':$/g, '')));
  const enKeys = keys(enPart, 'overlay');
  const esKeys = keys(esPart, 'overlay');
  const navKeys = (part) => (part.match(/'nav\.overlay':/g) || []).length;

  const missingEn = [...used].filter((k) => !(k === 'nav.overlay' ? navKeys(enPart) : enKeys.has(k)));
  const missingEs = [...used].filter((k) => !(k === 'nav.overlay' ? navKeys(esPart) : esKeys.has(k)));
  assert.deepEqual(missingEn, [], 'missing EN: ' + missingEn.join(', '));
  assert.deepEqual(missingEs, [], 'missing ES: ' + missingEs.join(', '));
  assert.equal(enKeys.size, esKeys.size, 'EN/ES overlay key counts differ');
});
