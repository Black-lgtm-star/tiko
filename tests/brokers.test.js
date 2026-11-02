'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    key: (index) => Array.from(map.keys())[index] || null,
    get length() { return map.size; }
  };
}

const ctx = {
  console,
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  window: { TA: {} }
};
ctx.window.window = ctx.window;
vm.createContext(ctx);

['js/util.js', 'js/i18n.js', 'js/store.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;

TA.ui = {
  icon: () => '',
  legalModal: () => {}
};
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/brokers.js'), 'utf8'), ctx, { filename: 'js/views/brokers.js' });

const view = TA.views.brokers;
const source = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
const brokerKeys = Array.from(new Set(Array.from(source.matchAll(/'(brokers\.[^']+)':/g), (m) => m[1])));

function fakeRoot() {
  return {
    innerHTML: '',
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

test('broker copy exists in both English and Spanish', () => {
  assert.ok(brokerKeys.length > 200, 'expected the full broker copy block');
  brokerKeys.forEach((key) => {
    const occurrences = (source.match(new RegExp("'" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':", 'g')) || []).length;
    assert.equal(occurrences, 2, key + ' must appear once in EN and once in ES');
  });
});

test('every broker key resolves in both locales', () => {
  TA.i18n.set('en');
  const en = {};
  brokerKeys.forEach((key) => {
    const value = TA.i18n.t(key);
    assert.notEqual(value, key, 'missing EN copy for ' + key);
    assert.ok(value.trim().length > 0, 'empty EN copy for ' + key);
    en[key] = value;
  });

  TA.i18n.set('es');
  brokerKeys.forEach((key) => {
    const value = TA.i18n.t(key);
    assert.notEqual(value, key, 'missing ES copy for ' + key);
  });
  TA.i18n.set('en');
});

test('reference data keeps the landscape scope', () => {
  assert.equal(view.regions.length, 6);
  assert.equal(new Set(view.regions.map((r) => r.id)).size, 6);
  assert.equal(view.checks.length, 20);
  assert.equal(new Set(view.checks).size, 20);
  assert.equal(view.redFlags.length, 10);
  assert.equal(view.registers.length, 24);
  view.registers.forEach((register) => {
    assert.match(register.url, /^https:\/\//);
    assert.ok(register.label);
  });
});

test('checklist selections persist locally and reset', () => {
  const checked = () => Object.assign({}, TA.store.brokerChecks());
  TA.store.clearBrokerChecks();
  assert.deepEqual(checked(), {});

  TA.store.setBrokerCheck('q1', true);
  TA.store.setBrokerCheck('q7', true);
  TA.store.setBrokerCheck('q1', false);
  assert.deepEqual(checked(), { q7: true });

  TA.store.setBrokerCheck('q7', false);
  assert.deepEqual(checked(), {});

  TA.store.setBrokerCheck('q3', true);
  TA.store.resetAll();
  assert.deepEqual(checked(), {});
});

test('render produces the full educational page', () => {
  const rootEl = fakeRoot();
  view.render(rootEl);
  const html = rootEl.innerHTML;

  assert.match(html, /id="broker-title"/);
  assert.match(html, /id="broker-region-panel"/);
  assert.equal((html.match(/data-region="/g) || []).length, 6);
  assert.equal((html.match(/data-check-id=/g) || []).length, 20);
  assert.equal((html.match(/class="broker-register"/g) || []).length, 24);
  assert.match(html, /data-check-meter/);
  assert.match(html, /data-open-legal/);
  assert.doesNotMatch(html, /http:\/\//);
});
