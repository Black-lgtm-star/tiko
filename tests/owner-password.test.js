'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = 'https://app.test';
const BOOT = 'owner-pass-123';
const NEW = 'correct-horse-battery';
const SECRET = 'test-secret-0123456789';
const OWNER_KEY = 'owner-sign-key-0123456789';

let middleware;
let store = new Map();
let kvFail = false;
let realFetch = null;
const tmp = path.join(os.tmpdir(), 'tiko-middleware-owner-password-' + process.pid + '.mjs');

function reply(result) {
  return new Response(JSON.stringify({ result: result }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function kvRun(args) {
  const cmd = String(args[0] || '').toUpperCase();
  if (cmd === 'SET') {
    const key = args[1];
    const value = args[2];
    const ex = args.indexOf('EX');
    const nx = args.indexOf('NX');
    if (nx >= 0 && store.has(key)) return null;
    store.set(key, { value: value, expires: ex >= 0 ? Date.now() + Number(args[ex + 1]) * 1000 : 0 });
    return 'OK';
  }
  if (cmd === 'GET') {
    const entry = store.get(args[1]);
    if (!entry) return null;
    if (entry.expires && entry.expires <= Date.now()) {
      store.delete(args[1]);
      return null;
    }
    return entry.value;
  }
  if (cmd === 'DEL') return store.delete(args[1]) ? 1 : 0;
  throw new Error('unsupported kv command ' + cmd);
}

test.before(async () => {
  fs.copyFileSync(path.join(__dirname, '..', 'middleware.js'), tmp);
  middleware = (await import(pathToFileURL(tmp).href)).default;
  Object.assign(process.env, {
    TIKO_ACCESS_PASSWORD: BOOT,
    TIKO_SESSION_SECRET: SECRET,
    TIKO_OWNER_KEY: OWNER_KEY,
    TIKO_KV_URL: 'https://kv.test',
    TIKO_KV_TOKEN: 'kv-token'
  });
  realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://kv.test') {
      if (kvFail) return new Response('{"error":"down"}', { status: 500 });
      return reply(kvRun(JSON.parse(init.body)));
    }
    throw new Error('unexpected network call: ' + url);
  };
});

test.after(() => {
  global.fetch = realFetch;
  fs.rmSync(tmp, { force: true });
});

test.beforeEach(() => {
  store = new Map();
  kvFail = false;
});

function call(pathname, init) {
  return middleware(new Request(new URL(pathname, BASE).toString(), init));
}

function form(pathname, fields, headers) {
  return call(pathname, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, headers || {}),
    body: new URLSearchParams(fields).toString()
  });
}

function ip(n) {
  return { 'x-forwarded-for': '10.11.0.' + n };
}

function cookieOf(res) {
  const match = (res.headers.get('set-cookie') || '').match(/tiko_access=([^;]+)/);
  return match ? match[1] : '';
}

async function ownerCookie(n) {
  const res = await form('/login', { password: BOOT, next: '/' }, ip(n));
  assert.equal(res.headers.get('location'), BASE + '/');
  return cookieOf(res);
}

function memberCookie() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = 'v1.code.' + exp;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

test('the password form is owner-only and linked from the console', async () => {
  const guest = await call('/admin/password');
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), BASE + '/login?next=%2Fadmin%2Fpassword');

  const member = await call('/admin/password', { headers: { cookie: 'tiko_access=' + memberCookie() } });
  assert.equal(member.status, 403);
  assert.match(await member.text(), /Owner only/);

  const cookie = await ownerCookie(1);
  const page = await call('/admin/password', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Owner password/);
  assert.match(html, /form method="post" action="\/admin\/password"/);
  assert.match(html, /name="current"/);
  assert.match(html, /name="password"/);
  assert.match(html, /name="confirm"/);
  assert.match(html, /minlength="12"/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');

  const admin = await call('/admin', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /Change owner password/);
});

test('changing the password stores only a hash and ends older owner sessions', async () => {
  const oldCookie = await ownerCookie(2);
  const res = await form('/admin/password', { current: BOOT, password: NEW, confirm: NEW },
    Object.assign(ip(20), { origin: BASE, cookie: 'tiko_access=' + oldCookie }));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), BASE + '/admin/password?state=changed');
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);
  const fresh = cookieOf(res);
  assert.match(fresh, /^v1\.owner\.[A-Za-z0-9_-]{1,32}\.\d+\.[A-Za-z0-9_-]+$/);

  const entry = store.get('tiko:owner:pass');
  assert.ok(entry);
  assert.equal(entry.expires, 0);
  const record = JSON.parse(entry.value);
  assert.equal(record.v, 1);
  assert.equal(record.alg, 'pbkdf2-sha256');
  assert.ok(record.iter >= 50000 && record.iter <= 600000);
  assert.match(record.salt, /^[A-Za-z0-9_-]+$/);
  assert.match(record.hash, /^[A-Za-z0-9_-]+$/);
  assert.match(record.kid, /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(entry.value.indexOf(NEW), -1);
  assert.equal(entry.value.indexOf(BOOT), -1);

  const done = await call('/admin/password?state=changed', { headers: { cookie: 'tiko_access=' + fresh } });
  assert.equal(done.status, 200);
  assert.match(await done.text(), /Password changed/);

  const stale = await call('/admin', { headers: { cookie: 'tiko_access=' + oldCookie } });
  assert.equal(stale.status, 403);
  assert.match(await stale.text(), /Sign in again/);
  assert.equal(await call('/analysis', { headers: { cookie: 'tiko_access=' + oldCookie } }), undefined);

  const oldLogin = await form('/login', { password: BOOT, next: '/' }, ip(21));
  assert.match(oldLogin.headers.get('location'), /error=bad/);

  const newLogin = await form('/login', { password: NEW, next: '/' }, ip(22));
  assert.equal(newLogin.headers.get('location'), BASE + '/');
  const newCookie = cookieOf(newLogin);
  assert.equal(newCookie.split('.').length, 5);
  assert.equal(newCookie.split('.')[2], record.kid);
  const admin = await call('/admin', { headers: { cookie: 'tiko_access=' + newCookie } });
  assert.equal(admin.status, 200);
});

test('the form refuses a wrong current password and unsafe new values', async () => {
  const cookie = await ownerCookie(3);
  const headers = Object.assign(ip(30), { origin: BASE, cookie: 'tiko_access=' + cookie });
  const wrong = await form('/admin/password', { current: 'not-the-password', password: NEW, confirm: NEW }, headers);
  assert.equal(wrong.status, 400);
  assert.match(await wrong.text(), /current password is not correct/);

  const short = await form('/admin/password', { current: BOOT, password: 'too-short-1', confirm: 'too-short-1' }, headers);
  assert.equal(short.status, 400);
  assert.match(await short.text(), /at least 12/);

  const mismatch = await form('/admin/password', { current: BOOT, password: NEW, confirm: NEW + 'x' }, headers);
  assert.equal(mismatch.status, 400);
  assert.match(await mismatch.text(), /do not match/);

  const same = await form('/admin/password', { current: BOOT, password: BOOT, confirm: BOOT }, headers);
  assert.equal(same.status, 400);
  assert.match(await same.text(), /different from the current one/);

  const foreign = await form('/admin/password', { current: BOOT, password: NEW, confirm: NEW },
    Object.assign(ip(31), { origin: 'https://evil.test', cookie: 'tiko_access=' + cookie }));
  assert.equal(foreign.status, 403);
  assert.match(await foreign.text(), /Blocked/);

  assert.equal(store.has('tiko:owner:pass'), false);
});

test('repeated wrong current passwords are throttled per address', async () => {
  const cookie = await ownerCookie(4);
  for (let i = 0; i < 6; i++) {
    const res = await form('/admin/password', { current: 'wrong-' + i, password: NEW, confirm: NEW },
      Object.assign(ip(40), { origin: BASE, cookie: 'tiko_access=' + cookie }));
    assert.equal(res.status, 400);
  }
  const locked = await form('/admin/password', { current: BOOT, password: NEW, confirm: NEW },
    Object.assign(ip(40), { origin: BASE, cookie: 'tiko_access=' + cookie }));
  assert.equal(locked.status, 429);
  assert.match(await locked.text(), /Too many attempts/);

  const other = await form('/admin/password', { current: BOOT, password: NEW, confirm: NEW },
    Object.assign(ip(41), { origin: BASE, cookie: 'tiko_access=' + cookie }));
  assert.equal(other.status, 303);
  assert.equal(store.has('tiko:owner:pass'), true);
});

test('a KV outage fails closed instead of falling back to the bootstrap password', async () => {
  const cookie = await ownerCookie(5);
  kvFail = true;

  const admin = await call('/admin', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.equal(admin.status, 503);
  assert.match(await admin.text(), /Temporarily unavailable/);

  const post = await form('/admin/password', { current: BOOT, password: NEW, confirm: NEW },
    Object.assign(ip(50), { origin: BASE, cookie: 'tiko_access=' + cookie }));
  assert.equal(post.status, 503);

  const login = await form('/login', { password: BOOT, next: '/' }, ip(51));
  assert.match(login.headers.get('location'), /error=bad/);

  kvFail = false;
  const open = await call('/admin', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.equal(open.status, 200);
});

test('deleting the stored hash restores the bootstrap password', async () => {
  const oldCookie = await ownerCookie(6);
  const changed = await form('/admin/password', { current: BOOT, password: NEW, confirm: NEW },
    Object.assign(ip(60), { origin: BASE, cookie: 'tiko_access=' + oldCookie }));
  assert.equal(changed.status, 303);
  const rotated = cookieOf(changed);
  store.delete('tiko:owner:pass');

  const bootstrap = await form('/login', { password: BOOT, next: '/' }, ip(61));
  assert.equal(bootstrap.headers.get('location'), BASE + '/');
  const rotatedLogin = await form('/login', { password: NEW, next: '/' }, ip(62));
  assert.match(rotatedLogin.headers.get('location'), /error=bad/);

  const stale = await call('/admin', { headers: { cookie: 'tiko_access=' + rotated } });
  assert.equal(stale.status, 403);
  assert.match(await stale.text(), /Sign in again/);
});

test('no password value is echoed back in any response', async () => {
  const cookie = await ownerCookie(7);
  const typedCurrent = 'typed-current-9999';
  const typedNext = 'typed-next-000000';
  const wrong = await form('/admin/password', { current: typedCurrent, password: typedNext, confirm: typedNext },
    Object.assign(ip(70), { origin: BASE, cookie: 'tiko_access=' + cookie }));
  const html = await wrong.text();
  assert.equal(html.indexOf(typedCurrent), -1);
  assert.equal(html.indexOf(typedNext), -1);
  assert.equal(html.indexOf(BOOT), -1);

  const page = await call('/admin/password', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.equal((await page.text()).indexOf(BOOT), -1);
});
