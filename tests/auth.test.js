'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function makeStorage(seed) {
  const data = new Map(Object.entries(seed || {}));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    dump: () => Object.fromEntries(data)
  };
}

function makeContext(seed) {
  const storage = makeStorage(seed);
  const ctx = {
    console,
    localStorage: storage,
    crypto: crypto.webcrypto,
    TextEncoder,
    window: { TA: {} }
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  ['js/util.js', 'js/auth.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  });
  return { TA: ctx.window.TA, storage };
}

const PASSWORD = 'correct horse battery';
const EMAIL = 'trader@example.com';

function signUp(input) {
  return { name: 'Ada', email: EMAIL, password: PASSWORD, confirm: PASSWORD, ...input };
}

test('email validation normalizes case and whitespace', () => {
  const { TA } = makeContext();
  assert.equal(TA.auth.normalizeEmail('  Trader@Example.COM '), 'trader@example.com');
  assert.equal(TA.auth.validEmail('trader@example.com'), true);
  assert.equal(TA.auth.validEmail('trader@example'), false);
  assert.equal(TA.auth.validEmail('trader example.com'), false);
});

test('sign-up stores a salted hash, never the password, and starts a session', async () => {
  const { TA, storage } = makeContext();
  const res = await TA.auth.signUp(signUp());

  assert.equal(res.ok, true);
  assert.equal(TA.auth.session().email, EMAIL);
  assert.equal(TA.auth.current().name, 'Ada');

  const stored = JSON.parse(storage.getItem('gt.auth.users.v1'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].email, EMAIL);
  assert.equal(stored[0].hash.length, 64);
  assert.equal(stored[0].salt.length, 32);
  assert.ok(stored[0].iter >= 100000);
  assert.equal(JSON.stringify(stored).includes(PASSWORD), false);
  assert.equal(stored[0].password, undefined);
});

test('sign-up rejects weak, mismatched, malformed and duplicate credentials', async () => {
  const { TA } = makeContext();

  const weak = await TA.auth.signUp(signUp({ password: 'short', confirm: 'short' }));
  assert.deepEqual([weak.ok, weak.error], [false, 'auth.error.password']);

  const mismatch = await TA.auth.signUp(signUp({ confirm: 'something else' }));
  assert.deepEqual([mismatch.ok, mismatch.error], [false, 'auth.error.confirm']);

  const badEmail = await TA.auth.signUp(signUp({ email: 'not-an-email' }));
  assert.deepEqual([badEmail.ok, badEmail.error], [false, 'auth.error.email']);

  await TA.auth.signUp(signUp());
  const duplicate = await TA.auth.signUp(signUp({ email: '  TRADER@example.com ' }));
  assert.deepEqual([duplicate.ok, duplicate.error], [false, 'auth.error.exists']);
});

test('sign-in accepts the right password and rejects the wrong one', async () => {
  const { TA } = makeContext();
  await TA.auth.signUp(signUp());
  TA.auth.signOut();

  const wrong = await TA.auth.signIn({ email: EMAIL, password: 'wrong password' });
  assert.deepEqual([wrong.ok, wrong.error], [false, 'auth.error.invalid']);
  assert.equal(TA.auth.session(), null);

  const right = await TA.auth.signIn({ email: 'TRADER@example.com ', password: PASSWORD });
  assert.equal(right.ok, true);
  assert.equal(TA.auth.session().email, EMAIL);
});

test('unknown emails fail with the same message as a wrong password', async () => {
  const { TA } = makeContext();
  await TA.auth.signUp(signUp());

  const res = await TA.auth.signIn({ email: 'nobody@example.com', password: PASSWORD });
  assert.deepEqual([res.ok, res.error], [false, 'auth.error.invalid']);
});

test('repeated failures lock the email for a while, even for the right password', async () => {
  const { TA } = makeContext();
  await TA.auth.signUp(signUp());
  TA.auth.signOut();

  let last = null;
  for (let i = 0; i < TA.auth.MAX_FAILS; i++) {
    last = await TA.auth.signIn({ email: EMAIL, password: 'nope-nope-nope' });
    assert.equal(last.ok, false);
  }
  assert.equal(last.error, 'auth.error.throttled');
  assert.ok(last.waitMs > 0);

  const blocked = await TA.auth.signIn({ email: EMAIL, password: PASSWORD });
  assert.deepEqual([blocked.ok, blocked.error], [false, 'auth.error.throttled']);
  assert.equal(TA.auth.session(), null);
});

test('a session survives a reload and is dropped once it expires', async () => {
  const first = makeContext();
  await first.TA.auth.signUp(signUp());
  const seeded = first.storage.dump();

  const resumed = makeContext(seeded);
  assert.equal(resumed.TA.auth.session().email, EMAIL);

  const sessionKey = 'gt.auth.session.v1';
  const expired = JSON.parse(seeded[sessionKey]);
  expired.exp = Date.now() - 1000;
  const stale = makeContext({ ...seeded, [sessionKey]: JSON.stringify(expired) });
  assert.equal(stale.TA.auth.session(), null);
  assert.equal(stale.storage.getItem(sessionKey), null);
});

test('each account gets its own storage namespace', async () => {
  const { TA } = makeContext();
  assert.equal(TA.auth.namespace(), 'gt.');

  await TA.auth.signUp(signUp());
  const uid = TA.auth.session().uid;
  assert.equal(TA.auth.namespace(), 'gt.u.' + uid + '.');

  TA.auth.signOut();
  assert.equal(TA.auth.namespace(), 'gt.');
  assert.equal(TA.auth.session(), null);
});
