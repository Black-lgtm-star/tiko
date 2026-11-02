'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = 'https://app.test';
const PASSWORD = 'test-pass-123';
const SECRET = 'test-secret-0123456789';

let middleware;
const tmp = path.join(os.tmpdir(), 'tiko-middleware-' + process.pid + '.mjs');

test.before(async () => {
  fs.copyFileSync(path.join(__dirname, '..', 'middleware.js'), tmp);
  middleware = (await import(pathToFileURL(tmp).href)).default;
  process.env.TIKO_ACCESS_PASSWORD = PASSWORD;
  process.env.TIKO_SESSION_SECRET = SECRET;
});

test.after(() => {
  fs.rmSync(tmp, { force: true });
  delete process.env.TIKO_ACCESS_PASSWORD;
  delete process.env.TIKO_SESSION_SECRET;
});

function call(pathname, init) {
  return middleware(new Request(new URL(pathname, BASE).toString(), init));
}

function post(password, next) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: password, next: next || '/' }).toString()
  };
}

function token(res) {
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/tiko_access=([^;]+)/);
  return match ? match[1] : '';
}

test('login page is public, self-contained and unbranded by trackers', async () => {
  const res = await call('/login');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Private access/);
  assert.match(html, /form method="post" action="\/login"/);
  assert.match(html, /name="next"/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('every app path requires a session and keeps the next URL', async () => {
  const res = await call('/analysis?symbol=BTC');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), BASE + '/login?next=%2Fanalysis%3Fsymbol%3DBTC');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('api routes answer 401 instead of redirecting', async () => {
  const res = await call('/api/quote?symbol=AAPL');
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal((await res.json()).error, 'unauthorized');
});

test('wrong password is rejected and recorded', async () => {
  const res = await call('/login', post('not-the-password', '/analysis'));
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /\/login\?error=bad/);
});

test('correct password issues a signed HttpOnly session', async () => {
  const res = await call('/login', post(PASSWORD, '/analysis?symbol=BTC'));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), BASE + '/analysis?symbol=BTC');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const value = token(res);
  assert.match(value, /^v1\.owner\.\d+\.[A-Za-z0-9_-]+$/);

  const open = await call('/analysis', { headers: { cookie: 'tiko_access=' + value } });
  assert.equal(open, undefined);

  const root = await call('/', { headers: { cookie: 'tiko_access=' + value } });
  assert.equal(root, undefined);
});

test('the session endpoint reports the owner role and is never cached', async () => {
  const login = await call('/login', post(PASSWORD, '/'));
  const value = token(login);
  const res = await call('/api/session', { headers: { cookie: 'tiko_access=' + value } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { role: 'owner' });
});

test('the session endpoint rejects a missing session', async () => {
  const res = await call('/api/session');
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
});

test('legacy sessions stay valid and carry no role', async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = 'v1.' + exp;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const value = payload + '.' + sig;
  const open = await call('/analysis', { headers: { cookie: 'tiko_access=' + value } });
  assert.equal(open, undefined);
  const info = await call('/api/session', { headers: { cookie: 'tiko_access=' + value } });
  assert.deepEqual(await info.json(), { role: null });
});

test('preview trust mode opens the app only behind VERCEL_ENV=preview', async () => {
  const saved = {
    env: process.env.VERCEL_ENV,
    open: process.env.TIKO_PREVIEW_OPEN,
    key: process.env.TIKO_OWNER_KEY
  };
  process.env.VERCEL_ENV = 'preview';
  delete process.env.TIKO_PREVIEW_OPEN;
  try {
    const gated = await call('/analysis');
    assert.equal(gated.status, 303);

    process.env.TIKO_PREVIEW_OPEN = '1';
    process.env.TIKO_OWNER_KEY = 'preview-owner-key-0123456789';

    assert.equal(await call('/analysis'), undefined);
    const session = await call('/api/session');
    assert.deepEqual(await session.json(), { role: 'owner' });
    const admin = await call('/admin');
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /Generate code/);
    const logout = await call('/logout');
    assert.equal(logout.status, 200);
    assert.match(await logout.text(), /Vercel account access/);

    process.env.VERCEL_ENV = 'production';
    const blocked = await call('/analysis');
    assert.equal(blocked.status, 303);
    const denied = await call('/api/session');
    assert.equal(denied.status, 401);
  } finally {
    [['VERCEL_ENV', saved.env], ['TIKO_PREVIEW_OPEN', saved.open], ['TIKO_OWNER_KEY', saved.key]].forEach(function (pair) {
      if (pair[1] === undefined) delete process.env[pair[0]];
      else process.env[pair[0]] = pair[1];
    });
  }
});

test('tampered, expired and malformed sessions are rejected', async () => {
  const login = await call('/login', post(PASSWORD, '/'));
  const value = token(login);

  const tampered = value.slice(0, -2) + (value.endsWith('AA') ? 'BB' : 'AA');
  const bad = await call('/analysis', { headers: { cookie: 'tiko_access=' + tampered } });
  assert.equal(bad.status, 303);

  const past = 'v1.' + (Math.floor(Date.now() / 1000) - 60);
  const sig = crypto.createHmac('sha256', SECRET).update(past).digest('base64url');
  const expired = await call('/analysis', { headers: { cookie: 'tiko_access=' + past + '.' + sig } });
  assert.equal(expired.status, 303);

  const malformed = await call('/analysis', { headers: { cookie: 'tiko_access=nope' } });
  assert.equal(malformed.status, 303);
});

test('logout clears the cookie', async () => {
  const res = await call('/logout');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), BASE + '/login');
  assert.match(res.headers.get('set-cookie'), /tiko_access=;/);
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
});

test('login refuses external and login redirects', async () => {
  const external = await call('/login', post(PASSWORD, '//evil.test/steal'));
  assert.equal(external.headers.get('location'), BASE + '/');
  const loop = await call('/login', post(PASSWORD, '/login?error=bad'));
  assert.equal(loop.headers.get('location'), BASE + '/');
});

test('an unconfigured deployment fails closed', async () => {
  const saved = process.env.TIKO_ACCESS_PASSWORD;
  delete process.env.TIKO_ACCESS_PASSWORD;
  const res = await call('/login', post(PASSWORD, '/'));
  assert.match(res.headers.get('location'), /error=setup/);
  const page = await call('/login?error=setup');
  assert.match(await page.text(), /not configured yet/);
  const blocked = await call('/');
  assert.equal(blocked.status, 303);
  process.env.TIKO_ACCESS_PASSWORD = saved;
});
