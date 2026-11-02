'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'session.js'), 'utf8');

function load(fetchImpl) {
  const window = { TA: {}, fetch: fetchImpl };
  window.window = window;
  const ctx = vm.createContext({ console, window: window, Promise: Promise });
  vm.runInContext(source, ctx, { filename: 'js/session.js' });
  return window.TA.session;
}

function response(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: function () { return Promise.resolve(body); }
  });
}

test('reads the owner role once from the session endpoint', async () => {
  const calls = [];
  const session = load(function (url, init) {
    calls.push({ url: url, init: init });
    return response(200, { role: 'owner' });
  });

  assert.equal(session.role(), null);
  assert.equal(session.isOwner(), false);

  assert.equal(await session.load(), 'owner');
  assert.equal(session.role(), 'owner');
  assert.equal(session.isOwner(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/session');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.cache, 'no-store');

  await session.load();
  assert.equal(calls.length, 1);
});

test('a personal access code is a member, not the owner', async () => {
  const session = load(function () { return response(200, { role: 'member' }); });
  assert.equal(await session.load(), 'member');
  assert.equal(session.role(), 'member');
  assert.equal(session.isOwner(), false);
});

test('unknown and missing roles stay unbranded', async () => {
  const unknown = load(function () { return response(200, { role: 'admin' }); });
  assert.equal(await unknown.load(), null);
  assert.equal(unknown.role(), null);

  const legacy = load(function () { return response(200, { role: null }); });
  assert.equal(await legacy.load(), null);
  assert.equal(legacy.isOwner(), false);
});

test('a rejected or failed session lookup stays quiet', async () => {
  const denied = load(function () { return response(401, { error: 'unauthorized' }); });
  assert.equal(await denied.load(), null);
  assert.equal(denied.isOwner(), false);

  const offline = load(function () { return Promise.reject(new Error('offline')); });
  assert.equal(await offline.load(), null);
  assert.equal(offline.isOwner(), false);
});

test('without fetch the session stays unbranded', async () => {
  const session = load(undefined);
  assert.equal(await session.load(), null);
  assert.equal(session.isOwner(), false);
});
