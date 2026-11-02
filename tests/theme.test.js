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

const listeners = [];
const media = {
  matches: false,
  addEventListener: (type, fn) => { if (type === 'change') listeners.push(fn); },
  removeEventListener() {}
};

function fakeDoc() {
  const attrs = new Map();
  const meta = { content: '' };
  return {
    attrs,
    meta,
    documentElement: { setAttribute: (name, value) => attrs.set(name, value) },
    querySelector: (selector) => (selector === 'meta[name="theme-color"]'
      ? { setAttribute: (name, value) => { if (name === 'content') meta.content = value; } }
      : null)
  };
}

const pageDocument = fakeDoc();

const ctx = {
  console,
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  document: pageDocument,
  window: { TA: {}, matchMedia: () => media }
};
ctx.window.window = ctx.window;
vm.createContext(ctx);

['js/util.js', 'js/i18n.js', 'js/store.js', 'js/theme.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const TA = ctx.window.TA;

test('dark is the default preference', () => {
  assert.equal(TA.store.settings().theme, 'dark');
  assert.equal(TA.theme.current(), 'dark');
});

test('normalize keeps known preferences and falls back to dark', () => {
  assert.equal(TA.theme.normalize('light'), 'light');
  assert.equal(TA.theme.normalize('system'), 'system');
  assert.equal(TA.theme.normalize('sepia'), 'dark');
  assert.equal(TA.theme.normalize(undefined), 'dark');
  assert.equal(TA.theme.normalize(null), 'dark');
});

test('system resolves against the device preference', () => {
  assert.equal(TA.theme.resolve('system', true), 'light');
  assert.equal(TA.theme.resolve('system', false), 'dark');
  assert.equal(TA.theme.resolve('light', false), 'light');
  assert.equal(TA.theme.resolve('dark', true), 'dark');
});

test('apply writes data-theme and the browser theme color', () => {
  const doc = fakeDoc();
  media.matches = false;
  assert.equal(TA.theme.apply('dark', doc), 'dark');
  assert.equal(doc.attrs.get('data-theme'), 'dark');
  assert.equal(doc.meta.content, '#07040e');

  media.matches = true;
  assert.equal(TA.theme.apply('system', doc), 'light');
  assert.equal(doc.attrs.get('data-theme'), 'light');
  assert.equal(doc.meta.content, '#f4ede0');

  media.matches = false;
  assert.equal(TA.theme.apply('system', doc), 'dark');
  assert.equal(doc.attrs.get('data-theme'), 'dark');
});

test('the preference persists across sessions', () => {
  TA.store.updateSettings({ theme: 'light' });
  assert.equal(TA.theme.current(), 'light');
  assert.equal(TA.store.settings().theme, 'light');

  TA.store.resetAll();
  assert.equal(TA.theme.current(), 'dark');
});

test('appearance copy resolves in English and Spanish', () => {
  const keys = ['set.theme', 'set.theme.hint', 'set.theme.dark', 'set.theme.light', 'set.theme.system'];
  ['en', 'es'].forEach((lang) => {
    TA.i18n.set(lang);
    keys.forEach((key) => {
      const value = TA.i18n.t(key);
      assert.notEqual(value, key, 'missing ' + lang + ' copy for ' + key);
      assert.ok(value.trim().length > 0);
    });
  });
  TA.i18n.set('en');
});

test('start applies the preference and follows the device only for system', () => {
  TA.theme.start();
  assert.equal(pageDocument.attrs.get('data-theme'), 'dark');

  TA.store.updateSettings({ theme: 'system' });
  media.matches = true;
  listeners.forEach((fn) => fn());
  assert.equal(pageDocument.attrs.get('data-theme'), 'light');

  TA.store.updateSettings({ theme: 'dark' });
  listeners.forEach((fn) => fn());
  assert.equal(pageDocument.attrs.get('data-theme'), 'light', 'a dark preference ignores the device setting when it changes');
  TA.store.resetAll();
});
