'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = 'https://app.test';
const PASSWORD = 'owner-pass-123';
const SECRET = 'test-secret-0123456789';
const OWNER_KEY = 'owner-sign-key-0123456789';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE = /TK1(?:-[A-HJ-NP-Z2-9]{4}){6}/;

let middleware;
let realFetch;
const tmp = path.join(os.tmpdir(), 'tiko-middleware-owner-codes-' + process.pid + '.mjs');

test.before(async () => {
  fs.copyFileSync(path.join(__dirname, '..', 'middleware.js'), tmp);
  middleware = (await import(pathToFileURL(tmp).href)).default;
  Object.assign(process.env, {
    TIKO_ACCESS_PASSWORD: PASSWORD,
    TIKO_SESSION_SECRET: SECRET,
    TIKO_OWNER_KEY: OWNER_KEY
  });
  realFetch = global.fetch;
  global.fetch = async (input, init) => {
    throw new Error('unexpected network call: ' + String(input));
  };
});

test.after(() => {
  global.fetch = realFetch;
  fs.rmSync(tmp, { force: true });
  delete process.env.TIKO_ACCESS_PASSWORD;
  delete process.env.TIKO_SESSION_SECRET;
  delete process.env.TIKO_OWNER_KEY;
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
  return { 'x-forwarded-for': '10.9.0.' + n };
}

function cookieOf(res) {
  const match = (res.headers.get('set-cookie') || '').match(/tiko_access=([^;]+)/);
  return match ? match[1] : '';
}

async function ownerCookie(n) {
  const login = await form('/login', { password: PASSWORD, next: '/admin' }, ip(n));
  assert.equal(login.status, 303);
  return cookieOf(login);
}

function b32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = ((value << 8) | bytes[i]) & 0xffffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < text.length; i++) {
    value = ((value << 5) | ALPHABET.indexOf(text.charAt(i))) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function signedCode(exp, key) {
  const mac = crypto.createHmac('sha256', key || OWNER_KEY).update('code.v1.' + exp).digest().subarray(0, 10);
  const bytes = Buffer.alloc(15);
  bytes[0] = 1;
  bytes.writeUInt32BE(exp, 1);
  mac.copy(bytes, 5);
  return 'TK1-' + b32(bytes).match(/.{4}/g).join('-');
}

test('the generator is owner-only and reached through sign in', async () => {
  const guest = await call('/admin');
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), BASE + '/login?next=%2Fadmin');

  const cookie = await ownerCookie(1);
  const page = await call('/admin', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Member codes/);
  assert.match(html, /form method="post" action="\/admin"/);
  assert.match(html, /name="days"/);
  assert.match(html, /Code|Generate code/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('an owner request for a code answers with a signed, well-shaped code', async () => {
  const cookie = await ownerCookie(2);
  const before = Math.floor(Date.now() / 1000);
  const res = await form('/admin', { days: '7' }, { origin: BASE, cookie: 'tiko_access=' + cookie });
  assert.equal(res.status, 200);
  const html = await res.text();
  const match = html.match(CODE);
  assert.ok(match, 'expected a TK1 code in the page');
  assert.equal(match[0].length, 33);
  assert.match(html, /Code ready/);
  assert.match(html, /Valid for 7 days/);
  assert.match(html, /Generate another/);

  const bytes = b32decode(match[0].replace(/^TK1-/, '').replace(/-/g, ''));
  assert.equal(bytes.length, 15);
  assert.equal(bytes[0], 1);
  const exp = bytes.readUInt32BE(1);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(exp >= before + 7 * 86400 && exp <= now + 7 * 86400 + 5);
});

test('a generated code signs a member in, is reusable, and cannot open the generator', async () => {
  const cookie = await ownerCookie(3);
  const made = await form('/admin', { days: '1' }, { origin: BASE, cookie: 'tiko_access=' + cookie });
  const code = (await made.text()).match(CODE)[0];

  const login = await form('/login', { password: code.toLowerCase(), next: '/settings' }, ip(4));
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('location'), BASE + '/settings');
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  const member = cookieOf(login);

  const session = await call('/api/session', { headers: { cookie: 'tiko_access=' + member } });
  assert.deepEqual(await session.json(), { role: 'member' });

  const open = await call('/settings', { headers: { cookie: 'tiko_access=' + member } });
  assert.equal(open, undefined);

  const again = await form('/login', { password: code, next: '/' }, ip(5));
  assert.equal(again.status, 303);
  assert.equal(again.headers.get('location'), BASE + '/');

  const admin = await call('/admin', { headers: { cookie: 'tiko_access=' + member } });
  assert.equal(admin.status, 403);
  assert.match(await admin.text(), /Owner only/);

  const post = await form('/admin', { days: '30' }, { origin: BASE, cookie: 'tiko_access=' + member });
  assert.equal(post.status, 403);
  assert.match(await post.text(), /Owner only/);
});

test('codes need no kv, no mail and no network to issue or verify', async () => {
  const saved = {
    kvUrl: process.env.TIKO_KV_URL,
    kvToken: process.env.TIKO_KV_TOKEN,
    mail: process.env.RESEND_API_KEY
  };
  delete process.env.TIKO_KV_URL;
  delete process.env.TIKO_KV_TOKEN;
  delete process.env.RESEND_API_KEY;
  try {
    const cookie = await ownerCookie(6);
    const made = await form('/admin', { days: '14' }, { origin: BASE, cookie: 'tiko_access=' + cookie });
    assert.equal(made.status, 200);
    const code = (await made.text()).match(CODE)[0];
    const login = await form('/login', { password: code, next: '/' }, ip(7));
    assert.equal(login.status, 303);
    assert.equal(login.headers.get('location'), BASE + '/');
  } finally {
    if (saved.kvUrl) process.env.TIKO_KV_URL = saved.kvUrl;
    if (saved.kvToken) process.env.TIKO_KV_TOKEN = saved.kvToken;
    if (saved.mail) process.env.RESEND_API_KEY = saved.mail;
  }
});

test('tampered, expired and foreign-key codes are refused', async () => {
  const cookie = await ownerCookie(8);
  const made = await form('/admin', { days: '7' }, { origin: BASE, cookie: 'tiko_access=' + cookie });
  const code = (await made.text()).match(CODE)[0];
  const last = code.charAt(code.length - 1);
  const tampered = code.slice(0, -1) + (last === 'A' ? 'B' : 'A');

  const bad = await form('/login', { password: tampered, next: '/' }, ip(9));
  assert.match(bad.headers.get('location'), /error=bad/);

  const expired = signedCode(Math.floor(Date.now() / 1000) - 60);
  const old = await form('/login', { password: expired, next: '/' }, ip(10));
  assert.match(old.headers.get('location'), /error=bad/);

  const foreign = signedCode(Math.floor(Date.now() / 1000) + 3600, 'another-key');
  const forged = await form('/login', { password: foreign, next: '/' }, ip(11));
  assert.match(forged.headers.get('location'), /error=bad/);
});

test('rotating the owner key revokes every issued code', async () => {
  const cookie = await ownerCookie(12);
  const made = await form('/admin', { days: '30' }, { origin: BASE, cookie: 'tiko_access=' + cookie });
  const code = (await made.text()).match(CODE)[0];

  process.env.TIKO_OWNER_KEY = 'rotated-owner-key-0123456789';
  try {
    const revoked = await form('/login', { password: code, next: '/' }, ip(13));
    assert.match(revoked.headers.get('location'), /error=bad/);
  } finally {
    process.env.TIKO_OWNER_KEY = OWNER_KEY;
  }
});

test('bad durations and cross-origin submissions are blocked', async () => {
  const cookie = await ownerCookie(14);
  const badDays = await form('/admin', { days: '3' }, { origin: BASE, cookie: 'tiko_access=' + cookie });
  assert.equal(badDays.status, 400);
  assert.match(await badDays.text(), /Choose 1, 7, 14 or 30 days/);

  const missing = await form('/admin', {}, { origin: BASE, cookie: 'tiko_access=' + cookie });
  assert.equal(missing.status, 400);

  const foreign = await form('/admin', { days: '7' }, { origin: 'https://evil.test', cookie: 'tiko_access=' + cookie });
  assert.equal(foreign.status, 403);
  assert.match(await foreign.text(), /Blocked/);
});

test('legacy sessions must sign in again before generating codes', async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = 'v1.' + exp;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const legacy = payload + '.' + sig;

  const page = await call('/admin', { headers: { cookie: 'tiko_access=' + legacy } });
  assert.equal(page.status, 403);
  assert.match(await page.text(), /Refresh your session/);

  const post = await form('/admin', { days: '7' }, { origin: BASE, cookie: 'tiko_access=' + legacy });
  assert.equal(post.status, 403);
  assert.match(await post.text(), /Owner only/);
});

test('without a signing key the generator refuses instead of issuing weak codes', async () => {
  const cookie = await ownerCookie(15);
  const saved = process.env.TIKO_OWNER_KEY;
  delete process.env.TIKO_OWNER_KEY;
  try {
    const page = await call('/admin', { headers: { cookie: 'tiko_access=' + cookie } });
    assert.equal(page.status, 500);
    assert.match(await page.text(), /Signing key missing/);
    const post = await form('/admin', { days: '7' }, { origin: BASE, cookie: 'tiko_access=' + cookie });
    assert.equal(post.status, 500);
  } finally {
    process.env.TIKO_OWNER_KEY = saved;
  }
});
