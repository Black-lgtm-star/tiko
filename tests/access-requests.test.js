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
const OWNER_EMAIL = 'owner@example.com';
const CODE = /([A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4})/;

let middleware;
let store = new Map();
let mails = [];
let failMail = false;
let realFetch = null;
const tmp = path.join(os.tmpdir(), 'tiko-middleware-requests-' + process.pid + '.mjs');

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
    TIKO_ACCESS_PASSWORD: PASSWORD,
    TIKO_SESSION_SECRET: SECRET,
    TIKO_OWNER_KEY: OWNER_KEY,
    TIKO_OWNER_EMAIL: OWNER_EMAIL,
    TIKO_KV_URL: 'https://kv.test',
    TIKO_KV_TOKEN: 'kv-token',
    RESEND_API_KEY: 're_test'
  });
  realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://kv.test') return reply(kvRun(JSON.parse(init.body)));
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(init.body);
      if (failMail) return new Response(JSON.stringify({ message: 'nope' }), { status: 422 });
      mails.push(body);
      return reply({ id: 'mail_' + mails.length });
    }
    return realFetch(input, init);
  };
});

test.after(() => {
  global.fetch = realFetch;
  fs.rmSync(tmp, { force: true });
});

test.beforeEach(() => {
  store = new Map();
  mails = [];
  failMail = false;
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
  return { 'x-forwarded-for': '10.5.0.' + n };
}

function reviewLink(mail) {
  const match = mail.text.match(/https:\/\/app\.test\/admin\/review\?t=([^\s]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function requestKeys() {
  return [...store.keys()].filter(function (key) {
    return key.indexOf('tiko:req:') === 0 && key.indexOf('tiko:req:email:') !== 0;
  });
}

test('request page is public, self-contained and linked from sign in', async () => {
  const res = await call('/request');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Request access/);
  assert.match(html, /form method="post" action="\/request"/);
  assert.match(html, /name="email"/);
  assert.match(html, /name="company"/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');

  const login = await (await call('/login')).text();
  assert.match(login, /Request an invitation/);
  assert.match(login, /Password or access code/);
});

test('a request is stored and emailed to the owner with a signed review link', async () => {
  const res = await form('/request', { name: 'Ada', email: 'Ada@Example.com', note: '  Please  ' }, Object.assign(ip(1), { origin: BASE }));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), BASE + '/request?sent=1');
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, [OWNER_EMAIL]);
  assert.match(mails[0].subject, /TIKO access request/);
  assert.match(mails[0].text, /ada@example\.com/);
  const token = reviewLink(mails[0]);
  assert.match(token, /^req\.[a-f0-9]{16}\.\d+\.[A-Za-z0-9_-]+$/);

  const keys = requestKeys();
  assert.equal(keys.length, 1);
  const record = JSON.parse(store.get(keys[0]).value);
  assert.equal(record.email, 'ada@example.com');
  assert.equal(record.name, 'Ada');
  assert.equal(record.note, 'Please');
  assert.equal(record.status, 'pending');
});

test('honeypot, bad email, duplicates and cross-origin posts are not delivered', async () => {
  const bot = await form('/request', { email: 'bot@example.com', company: 'Acme' }, Object.assign(ip(2), { origin: BASE }));
  assert.equal(bot.headers.get('location'), BASE + '/request?sent=1');
  assert.equal(mails.length, 0);
  assert.equal(requestKeys().length, 0);

  const bad = await form('/request', { email: 'not-an-email' }, Object.assign(ip(3), { origin: BASE }));
  assert.match(bad.headers.get('location'), /error=email/);
  assert.equal(mails.length, 0);

  const external = await form('/request', { email: 'eve@example.com' }, Object.assign(ip(4), { origin: 'https://evil.test' }));
  assert.match(external.headers.get('location'), /error=origin/);
  assert.equal(mails.length, 0);

  const first = await form('/request', { email: 'same@example.com' }, Object.assign(ip(5), { origin: BASE }));
  assert.match(first.headers.get('location'), /sent=1/);
  const again = await form('/request', { email: 'SAME@example.com' }, Object.assign(ip(6), { origin: BASE }));
  assert.match(again.headers.get('location'), /sent=1/);
  assert.equal(mails.length, 1);
  assert.equal(requestKeys().length, 1);
});

test('approving emails one personal code that unlocks the app', async () => {
  const submitted = await form('/request', { name: 'Ada', email: 'ada@example.com' }, Object.assign(ip(7), { origin: BASE }));
  assert.match(submitted.headers.get('location'), /sent=1/);
  const token = reviewLink(mails[0]);

  const review = await (await call('/admin/review?t=' + encodeURIComponent(token))).text();
  assert.match(review, /Approve and email a code/);
  assert.match(review, /ada@example\.com/);
  assert.match(review, /action="\/admin\/review"/);

  const approved = await form('/admin/review', { t: token, action: 'approve' }, { origin: BASE });
  assert.equal(approved.status, 303);
  assert.match(approved.headers.get('location'), /done=approve/);

  assert.equal(mails.length, 2);
  assert.deepEqual(mails[1].to, ['ada@example.com']);
  assert.match(mails[1].subject, /Your TIKO access code/);
  const code = mails[1].text.match(CODE)[1];
  assert.match(mails[1].text, /works for 30 days/);

  const done = await (await call('/admin/review?t=' + encodeURIComponent(token) + '&done=approve')).text();
  assert.match(done, new RegExp(code));
  assert.match(done, /emailed to ada@example\.com/);
  assert.match(done, /Revoke access/);

  const login = await form('/login', { password: code.toLowerCase(), next: '/analysis' }, ip(8));
  assert.equal(login.headers.get('location'), BASE + '/analysis');
  const cookie = login.headers.get('set-cookie').match(/tiko_access=([^;]+)/)[1];
  const open = await call('/analysis', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.equal(open, undefined);
  const info = await call('/api/session', { headers: { cookie: 'tiko_access=' + cookie } });
  assert.deepEqual(await info.json(), { role: 'member' });
});

test('wrong, expired and revoked codes are rejected', async () => {
  const wrong = await form('/login', { password: 'AAAA-BBBB-CCCC', next: '/' }, ip(9));
  assert.match(wrong.headers.get('location'), /error=bad/);

  const past = 'ZXZX-ZXZX-ZXZX';
  const hash = crypto.createHash('sha256').update('code:ZXZXZXZXZXZX').digest('hex');
  store.set('tiko:code:' + hash, {
    value: JSON.stringify({ email: 'old@example.com', exp: Math.floor(Date.now() / 1000) - 60 }),
    expires: 0
  });
  const expired = await form('/login', { password: past, next: '/' }, ip(10));
  assert.match(expired.headers.get('location'), /error=bad/);

  await form('/request', { email: 'rev@example.com' }, Object.assign(ip(11), { origin: BASE }));
  const token = reviewLink(mails[0]);
  await form('/admin/review', { t: token, action: 'approve' }, { origin: BASE });
  const code = mails[1].text.match(CODE)[1];
  const revoke = await form('/admin/review', { t: token, action: 'revoke' }, { origin: BASE });
  assert.match(revoke.headers.get('location'), /done=revoke/);
  const revokedPage = await (await call('/admin/review?t=' + encodeURIComponent(token))).text();
  assert.match(revokedPage, /Revoked/);

  const denied = await form('/login', { password: code, next: '/' }, ip(12));
  assert.match(denied.headers.get('location'), /error=bad/);
});

test('denying sends nothing and generates no code', async () => {
  await form('/request', { email: 'no@example.com' }, Object.assign(ip(13), { origin: BASE }));
  const token = reviewLink(mails[0]);
  const denied = await form('/admin/review', { t: token, action: 'deny' }, { origin: BASE });
  assert.match(denied.headers.get('location'), /done=deny/);
  assert.equal(mails.length, 1);
  const page = await (await call('/admin/review?t=' + encodeURIComponent(token))).text();
  assert.match(page, /Denied/);
  assert.match(page, /denied\. No code/);
  const keys = [...store.keys()].filter(function (key) { return key.indexOf('tiko:code:') === 0; });
  assert.equal(keys.length, 0);
});

test('tampered review links and foreign posts are refused', async () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const tampered = await (await call('/admin/review?t=req.' + 'a'.repeat(16) + '.' + future + '.bogus')).text();
  assert.match(tampered, /Link not valid/);

  await form('/request', { email: 'ada@example.com' }, Object.assign(ip(14), { origin: BASE }));
  const token = reviewLink(mails[0]);
  const foreign = await form('/admin/review', { t: token, action: 'approve' }, { origin: 'https://evil.test' });
  assert.match(await foreign.text(), /Blocked/);
  assert.equal(mails.length, 1);
});

test('a failed owner notification removes the request so it can be retried', async () => {
  failMail = true;
  const res = await form('/request', { email: 'retry@example.com' }, Object.assign(ip(15), { origin: BASE }));
  assert.match(res.headers.get('location'), /error=send/);
  assert.equal(requestKeys().length, 0);
  assert.equal([...store.keys()].filter(function (key) { return key.indexOf('tiko:req:email:') === 0; }).length, 0);

  failMail = false;
  const retry = await form('/request', { email: 'retry@example.com' }, Object.assign(ip(16), { origin: BASE }));
  assert.match(retry.headers.get('location'), /sent=1/);
  assert.equal(mails.length, 1);
});

test('requests are throttled per address', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await form('/request', { email: 'burst' + i + '@example.com' }, Object.assign(ip(17), { origin: BASE }));
    assert.match(res.headers.get('location'), /sent=1/);
  }
  const blocked = await form('/request', { email: 'burst5@example.com' }, Object.assign(ip(17), { origin: BASE }));
  assert.match(blocked.headers.get('location'), /error=slow/);
  assert.equal(mails.length, 5);
});

test('without mail or kv the request flow closes but the owner password still works', async () => {
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const page = await (await call('/request')).text();
  assert.match(page, /Requests are closed/);
  const post = await form('/request', { email: 'ada@example.com' }, ip(18));
  assert.match(post.headers.get('location'), /error=closed/);
  const loginPage = await (await call('/login')).text();
  assert.match(loginPage, /One shared password/);
  const owner = await form('/login', { password: PASSWORD, next: '/' }, ip(19));
  assert.equal(owner.headers.get('location'), BASE + '/');
  process.env.RESEND_API_KEY = saved;
});
