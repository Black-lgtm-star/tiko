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
const WEBHOOK_SECRET = 'whsec_test_0123456789';
const PRICE_7D = 'price_7day_test';
const PRICE_30D = 'price_30day_test';
const CODE = /([A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4})/;

let middleware;
let store = new Map();
let mails = [];
let stripeBodies = [];
let stripeSession = null;
let stripeFail = false;
let realFetch = null;
const tmp = path.join(os.tmpdir(), 'tiko-middleware-purchases-' + process.pid + '.mjs');

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
    TIKO_OWNER_EMAIL: 'owner@example.com',
    TIKO_KV_URL: 'https://kv.test',
    TIKO_KV_TOKEN: 'kv-token',
    RESEND_API_KEY: 're_test',
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRICE_7D: PRICE_7D,
    STRIPE_PRICE_30D: PRICE_30D
  });
  realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://kv.test') return reply(kvRun(JSON.parse(init.body)));
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(init.body);
      mails.push(body);
      return reply({ id: 'mail_' + mails.length });
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions' && init.method === 'POST') {
      if (stripeFail) return new Response('{"error":"nope"}', { status: 502 });
      stripeBodies.push(new URLSearchParams(init.body));
      return new Response(JSON.stringify({
        id: 'cs_test_created12345',
        object: 'checkout.session',
        url: 'https://checkout.stripe.com/c/pay/cs_test_created12345'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.indexOf('https://api.stripe.com/v1/checkout/sessions/') === 0) {
      if (stripeFail) return new Response('{"error":"nope"}', { status: 404 });
      if (!stripeSession) return new Response('{"error":"missing"}', { status: 404 });
      return new Response(JSON.stringify(stripeSession), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
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
  stripeBodies = [];
  stripeSession = null;
  stripeFail = false;
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

function cookie(res) {
  const match = (res.headers.get('set-cookie') || '').match(/tiko_access=([^;]+)/);
  return match ? match[1] : '';
}

function signature(payload, timestamp, secret) {
  return crypto.createHmac('sha256', secret || WEBHOOK_SECRET)
    .update(timestamp + '.' + payload)
    .digest('hex');
}

function webhook(payload, opts) {
  opts = opts || {};
  const timestamp = opts.timestamp || Math.floor(Date.now() / 1000);
  const header = opts.header !== undefined ? opts.header : 't=' + timestamp + ',v1=' + signature(payload, timestamp, opts.secret);
  return call('/api/stripe-webhook', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, header ? { 'stripe-signature': header } : {}),
    body: payload
  });
}

function paidEvent(sessionId, days, email) {
  return JSON.stringify({
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        metadata: { days: String(days) },
        customer_details: { email: email },
        amount_total: days === 7 ? 500 : 1200,
        currency: 'usd'
      }
    }
  });
}

test('the buy page is public and lists both passes', async () => {
  const res = await call('/buy');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Access passes/);
  assert.match(html, /7-day pass/);
  assert.match(html, /30-day pass/);
  assert.match(html, /\$5/);
  assert.match(html, /\$12/);
  assert.match(html, /form method="post" action="\/api\/checkout"/);
  assert.match(html, /name="days" value="7"/);
  assert.match(html, /name="days" value="30"/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(res.headers.get('content-security-policy'), /form-action 'self' https:\/\/checkout\.stripe\.com/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');

  const login = await (await call('/login')).text();
  assert.match(login, /buy a pass/);
  const request = await (await call('/request')).text();
  assert.match(request, /Buy a pass/);
});

test('checkout creates a server-priced Stripe session with pass metadata', async () => {
  const started = await form('/api/checkout', { days: '7' }, Object.assign(ip(1), { origin: BASE }));
  assert.equal(started.status, 303);
  assert.equal(started.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_test_created12345');
  assert.equal(started.headers.get('cache-control'), 'no-store');

  assert.equal(stripeBodies.length, 1);
  const body = stripeBodies[0];
  assert.equal(body.get('mode'), 'payment');
  assert.equal(body.get('line_items[0][price]'), PRICE_7D);
  assert.equal(body.get('line_items[0][quantity]'), '1');
  assert.equal(body.get('metadata[days]'), '7');
  assert.match(body.get('success_url'), /\/purchase\/success\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.equal(body.get('cancel_url'), BASE + '/buy?canceled=1');
  assert.ok(Number(body.get('expires_at')) > Math.floor(Date.now() / 1000));

  const monthly = await form('/api/checkout', { days: '30' }, Object.assign(ip(2), { origin: BASE }));
  assert.equal(monthly.status, 303);
  assert.equal(stripeBodies[1].get('line_items[0][price]'), PRICE_30D);
  assert.equal(stripeBodies[1].get('metadata[days]'), '30');
});

test('checkout refuses unknown passes, foreign posts, other methods and bursts', async () => {
  const unknown = await form('/api/checkout', { days: '999' }, Object.assign(ip(3), { origin: BASE }));
  assert.equal(unknown.headers.get('location'), BASE + '/buy?error=unavailable');

  const foreign = await form('/api/checkout', { days: '7' }, Object.assign(ip(4), { origin: 'https://evil.test' }));
  assert.equal(foreign.headers.get('location'), BASE + '/buy?error=origin');

  const opaqueSite = await form('/api/checkout', { days: '7' },
    Object.assign(ip(41), { origin: 'null', 'sec-fetch-site': 'cross-site' }));
  assert.equal(opaqueSite.headers.get('location'), BASE + '/buy?error=origin');

  const opaqueSame = await form('/api/checkout', { days: '7' },
    Object.assign(ip(42), { origin: 'null', 'sec-fetch-site': 'same-origin' }));
  assert.equal(opaqueSame.status, 303);
  assert.equal(opaqueSame.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_test_created12345');

  const get = await call('/api/checkout', { headers: ip(5) });
  assert.equal(get.status, 405);
  assert.deepEqual(await get.json(), { error: 'method' });

  stripeFail = true;
  const failed = await form('/api/checkout', { days: '7' }, Object.assign(ip(6), { origin: BASE }));
  assert.equal(failed.headers.get('location'), BASE + '/buy?error=failed');
  stripeFail = false;

  for (let i = 0; i < 8; i++) {
    const ok = await form('/api/checkout', { days: '7' }, Object.assign(ip(7), { origin: BASE }));
    assert.equal(ok.status, 303);
  }
  const blocked = await form('/api/checkout', { days: '7' }, Object.assign(ip(7), { origin: BASE }));
  assert.equal(blocked.headers.get('location'), BASE + '/buy?error=slow');
  assert.equal(stripeBodies.length, 9);
});

test('the webhook rejects bad signatures and stale timestamps', async () => {
  const payload = paidEvent('cs_test_paid123456', 7, 'ada@example.com');

  const unsigned = await webhook(payload, { header: '' });
  assert.equal(unsigned.status, 400);
  assert.deepEqual(await unsigned.json(), { error: 'invalid_signature' });

  const forged = await webhook(payload, { header: 't=' + Math.floor(Date.now() / 1000) + ',v1=deadbeef' });
  assert.equal(forged.status, 400);

  const stale = await webhook(payload, { timestamp: Math.floor(Date.now() / 1000) - 1200 });
  assert.equal(stale.status, 400);

  const future = await webhook(payload, { timestamp: Math.floor(Date.now() / 1000) + 1200 });
  assert.equal(future.status, 400);

  const wrongSecret = await webhook(payload, { secret: 'whsec_other' });
  assert.equal(wrongSecret.status, 400);

  assert.equal([...store.keys()].filter(function (k) { return k.indexOf('tiko:pass:') === 0; }).length, 0);
});

test('a paid webhook stores the pass, emails a code and is idempotent', async () => {
  const payload = paidEvent('cs_test_paid123456', 7, 'ada@example.com');

  for (let i = 0; i < 2; i++) {
    const res = await webhook(payload);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });
  }

  const record = JSON.parse(store.get('tiko:pass:cs_test_paid123456').value);
  assert.equal(record.email, 'ada@example.com');
  assert.equal(record.days, 7);
  assert.equal(record.amount, 500);
  assert.equal(record.currency, 'usd');
  assert.ok(record.exp > Math.floor(Date.now() / 1000) + 6 * 86400);

  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, ['ada@example.com']);
  assert.match(mails[0].subject, /Your TIKOTrade pass/);
  const code = mails[0].text.match(CODE)[1];
  assert.match(mails[0].text, /7-day pass/);
  assert.match(mails[0].text, /app\.test\/login/);

  const hash = crypto.createHash('sha256').update('code:' + code.replace(/-/g, '')).digest('hex');
  const stored = JSON.parse(store.get('tiko:code:' + hash).value);
  assert.equal(stored.email, 'ada@example.com');
  assert.equal(stored.source, 'stripe');
  assert.equal(stored.sessionId, 'cs_test_paid123456');

  const login = await form('/login', { password: code.toLowerCase(), next: '/' }, ip(20));
  assert.equal(login.headers.get('location'), BASE + '/');
  const session = await call('/api/session', { headers: { cookie: 'tiko_access=' + cookie(login) } });
  assert.deepEqual(await session.json(), { role: 'member' });
});

test('a paid pass is a member and never reaches the owner console', async () => {
  await webhook(paidEvent('cs_test_member12345', 7, 'ada@example.com'));
  const code = mails[0].text.match(CODE)[1];

  const login = await form('/login', { password: code, next: '/admin' }, ip(21));
  assert.equal(login.headers.get('location'), BASE + '/admin');
  const member = cookie(login);

  const session = await call('/api/session', { headers: { cookie: 'tiko_access=' + member } });
  assert.deepEqual(await session.json(), { role: 'member' });

  for (const target of ['/admin', '/admin?x=1']) {
    const page = await call(target, { headers: { cookie: 'tiko_access=' + member } });
    assert.equal(page.status, 403);
    assert.match(await page.text(), /Owner only/);
  }

  const mint = await form('/admin', { days: '30' }, { origin: BASE, cookie: 'tiko_access=' + member });
  assert.equal(mint.status, 403);
  assert.match(await mint.text(), /Owner only/);

  const logout = await call('/logout', { headers: { cookie: 'tiko_access=' + member } });
  assert.equal(logout.status, 303);
  assert.doesNotMatch(await logout.text(), /Vercel account access/);
});

test('no owner secret appears in any page or email', async () => {
  const secrets = [PASSWORD, SECRET, OWNER_KEY, WEBHOOK_SECRET, 'sk_test_123'];
  function exposes(text) {
    return secrets.filter(function (value) { return String(text).indexOf(value) >= 0; });
  }

  await webhook(paidEvent('cs_test_redact12345', 7, 'ada@example.com'));
  const memberCode = mails[0].text.match(CODE)[1];
  const member = cookie(await form('/login', { password: memberCode, next: '/' }, ip(22)));
  const owner = cookie(await form('/login', { password: PASSWORD, next: '/admin' }, ip(23)));

  stripeSession = {
    id: 'cs_test_redact12345',
    object: 'checkout.session',
    payment_status: 'paid',
    metadata: { days: '7' },
    customer_details: { email: 'ada@example.com' },
    amount_total: 500,
    currency: 'usd'
  };

  const pages = [
    await call('/login'),
    await call('/login?error=bad'),
    await call('/request'),
    await call('/request?sent=1'),
    await call('/buy'),
    await call('/buy?error=slow'),
    await call('/purchase/success?session_id=cs_test_redact12345'),
    await call('/admin', { headers: { cookie: 'tiko_access=' + owner } }),
    await form('/admin', { days: '1' }, { origin: BASE, cookie: 'tiko_access=' + owner })
  ];
  for (const page of pages) {
    assert.deepEqual(exposes(await page.text()), [], 'page leaked an owner secret');
    assert.deepEqual(exposes(page.headers.get('set-cookie')), [], 'a secret was set as a cookie');
  }

  assert.equal(mails.length, 1);
  for (const mail of mails) {
    assert.deepEqual(exposes(mail.text + mail.html + mail.subject), [], 'email leaked an owner secret');
  }
});

test('unpaid, unknown and unrelated webhook events record nothing', async () => {
  const unpaid = paidEvent('cs_test_unpaid12345', 7, 'ada@example.com');
  const parsed = JSON.parse(unpaid);
  parsed.data.object.payment_status = 'unpaid';
  const res = await webhook(JSON.stringify(parsed));
  assert.equal(res.status, 200);
  assert.equal(store.has('tiko:pass:cs_test_unpaid12345'), false);
  assert.equal(mails.length, 0);

  const other = await webhook(JSON.stringify({ id: 'evt_x', type: 'invoice.created', data: { object: {} } }));
  assert.deepEqual(await other.json(), { received: true });

  const noPlan = paidEvent('cs_test_noplan12345', 7, 'ada@example.com');
  const bad = JSON.parse(noPlan);
  bad.data.object.metadata = {};
  const skipped = await webhook(JSON.stringify(bad));
  assert.equal(skipped.status, 200);
  assert.equal(store.has('tiko:pass:cs_test_noplan12345'), false);
});

test('the success page verifies the session, signs in and shows the code', async () => {
  stripeSession = {
    id: 'cs_test_claim123456',
    object: 'checkout.session',
    payment_status: 'paid',
    metadata: { days: '30' },
    customer_details: { email: 'ada@example.com' },
    amount_total: 1200,
    currency: 'usd'
  };
  const res = await call('/purchase/success?session_id=cs_test_claim123456');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /You are in/);
  assert.match(html, /30-day pass/);
  assert.match(html, /ada@example\.com/);
  const shown = html.match(CODE)[1];
  assert.match(html, new RegExp('/login'));
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);
  const maxAge = Number(res.headers.get('set-cookie').match(/Max-Age=(\d+)/)[1]);
  assert.ok(maxAge > 2591000 && maxAge <= 2592000, 'the cookie expires with the pass');

  const open = await call('/analysis', { headers: { cookie: 'tiko_access=' + cookie(res) } });
  assert.equal(open, undefined);

  assert.equal(mails.length, 1);
  assert.equal(mails[0].text.match(CODE)[1], shown);

  const again = await call('/purchase/success?session_id=cs_test_claim123456');
  assert.equal(again.status, 200);
  assert.equal((await again.text()).match(CODE)[1], shown);
  assert.equal(mails.length, 1);
});

test('the success page refuses unpaid, missing and unknown checkouts', async () => {
  const missing = await (await call('/purchase/success')).text();
  assert.match(missing, /Checkout link missing/);

  const malformed = await (await call('/purchase/success?session_id=not-a-session')).text();
  assert.match(malformed, /Checkout link missing/);

  stripeSession = {
    id: 'cs_test_unpaid123456',
    object: 'checkout.session',
    payment_status: 'unpaid',
    metadata: { days: '7' },
    customer_details: { email: 'ada@example.com' }
  };
  const unpaid = await (await call('/purchase/success?session_id=cs_test_unpaid123456')).text();
  assert.match(unpaid, /Payment not complete/);
  assert.equal(store.has('tiko:pass:cs_test_unpaid123456'), false);

  stripeFail = true;
  const failed = await (await call('/purchase/success?session_id=cs_test_claim123456')).text();
  assert.match(failed, /Could not confirm the payment/);
});

test('a paid checkout cannot be replayed after the pass ends', async () => {
  stripeSession = {
    id: 'cs_test_expired123',
    object: 'checkout.session',
    payment_status: 'paid',
    metadata: { days: '7' },
    customer_details: { email: 'ada@example.com' },
    amount_total: 500,
    currency: 'usd'
  };
  const now = Math.floor(Date.now() / 1000);
  store.set('tiko:pass:cs_test_expired123', {
    value: JSON.stringify({ email: 'ada@example.com', days: 7, exp: now - 60, amount: 500, currency: 'usd' }),
    expires: Date.now() + 86400000
  });

  const res = await call('/purchase/success?session_id=cs_test_expired123');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /This pass has ended/);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal([...store.keys()].filter(function (key) {
    return key.indexOf('tiko:pass:code:') === 0;
  }).length, 0);
  assert.equal(mails.length, 0);
});

test('reopening a success link never extends the recorded pass', async () => {
  stripeSession = {
    id: 'cs_test_lateclaim12',
    object: 'checkout.session',
    payment_status: 'paid',
    metadata: { days: '30' },
    customer_details: { email: 'ada@example.com' },
    amount_total: 1200,
    currency: 'usd'
  };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  store.set('tiko:pass:cs_test_lateclaim12', {
    value: JSON.stringify({ email: 'ada@example.com', days: 30, exp: exp, amount: 1200, currency: 'usd' }),
    expires: Date.now() + 86400000
  });

  const res = await call('/purchase/success?session_id=cs_test_lateclaim12');
  assert.equal(res.status, 200);
  const maxAge = Number(res.headers.get('set-cookie').match(/Max-Age=(\d+)/)[1]);
  assert.ok(maxAge > 3400 && maxAge <= 3600, 'the cookie stops at the recorded expiry');

  const code = (await res.text()).match(CODE)[1];
  const hash = crypto.createHash('sha256').update('code:' + code.replace(/-/g, '')).digest('hex');
  assert.equal(JSON.parse(store.get('tiko:code:' + hash).value).exp, exp);
  assert.equal(JSON.parse(store.get('tiko:code:' + hash).value).email, 'ada@example.com');
});

test('without Stripe configuration the purchase routes close', async () => {
  const saved = {
    key: process.env.STRIPE_SECRET_KEY,
    hook: process.env.STRIPE_WEBHOOK_SECRET
  };
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const page = await (await call('/buy')).text();
    assert.match(page, /Passes are closed/);

    const start = await form('/api/checkout', { days: '7' }, Object.assign(ip(30), { origin: BASE }));
    assert.equal(start.headers.get('location'), BASE + '/buy?error=unavailable');

    const success = await (await call('/purchase/success?session_id=cs_test_paid123456')).text();
    assert.match(success, /Passes are closed/);

    const login = await (await call('/login')).text();
    assert.match(login, /Request an invitation/);
  } finally {
    process.env.STRIPE_SECRET_KEY = saved.key;
  }

  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const webhookRes = await webhook(paidEvent('cs_test_nohook123456', 7, 'ada@example.com'));
    assert.equal(webhookRes.status, 500);
    assert.deepEqual(await webhookRes.json(), { error: 'not_configured' });
  } finally {
    process.env.STRIPE_WEBHOOK_SECRET = saved.hook;
  }
});
