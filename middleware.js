/* Private access gate: owner password and signed member codes, enforced before any file is served. */

const COOKIE = 'tiko_access';
const MAX_AGE = 60 * 60 * 24 * 7;
const CODE_SESSION = 60 * 60 * 24;
const WINDOW = 10 * 60 * 1000;
const MAX_FAILS = 8;
const REVIEW_TTL = 60 * 60 * 24 * 7;
const CODE_TTL = 60 * 60 * 24 * 30;
const CODE_SHOW_TTL = 60 * 60 * 24;
const REQUEST_TTL = 60 * 60 * 24 * 14;
const REQUEST_WINDOW = 60 * 60 * 1000;
const MAX_REQUESTS = 5;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PREFIX = 'TK1';
const CODE_VERSION = 1;
const CODE_BYTES = 15;
const CODE_MAC_BYTES = 10;
const CODE_DAYS = [1, 7, 14, 30];
const PASSES = [
  { days: 7, env: 'STRIPE_PRICE_7D', label: '$5' },
  { days: 30, env: 'STRIPE_PRICE_30D', label: '$12' }
];
const CHECKOUT_WINDOW = 60 * 60 * 1000;
const MAX_CHECKOUTS = 8;
const STRIPE_TOLERANCE = 300;
const PASS_TTL = 60 * 60 * 24 * 90;
const OWNER_HASH_KEY = 'tiko:owner:pass';
const OWNER_ITERATIONS = 120000;
const OWNER_PASSWORD_MIN = 12;
const OWNER_PASSWORD_MAX = 200;
const OWNER_ROTATE_WINDOW = 15 * 60 * 1000;
const MAX_OWNER_ROTATES = 6;
const encoder = new TextEncoder();
const fails = new Map();
const requestHits = new Map();
const checkoutHits = new Map();
const ownerTries = new Map();

export const config = { matcher: '/:path*' };

export default async function middleware(req) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/login' || path === '/login/' || path === '/login.html') {
    if (req.method === 'POST') return login(req, url);
    if (await authorized(req)) return redirect(url, safeNext(url.searchParams.get('next')));
    return loginPage(url);
  }

  if (path === '/logout' || path === '/logout/') {
    if (previewOpen()) {
      return gateResponse('Private access',
        '<h1>Vercel account access</h1>' +
        '<p>Staging trusts your Vercel account, so there is no TIKOTrade password to clear. ' +
        'Sign out of Vercel to end access on this device.</p>' +
        '<p class="note"><a href="/">Back to TIKOTrade</a></p>');
    }
    return logout(url);
  }

  if (path === '/request' || path === '/request/') {
    if (req.method === 'POST') return requestSubmit(req, url);
    return requestPage(url);
  }

  if (path === '/buy' || path === '/buy/') {
    return buyPage(url);
  }

  if (path === '/purchase/success' || path === '/purchase/success/') {
    return purchaseSuccess(url);
  }

  if (path === '/api/checkout' || path === '/api/checkout/') {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    return checkout(req, url);
  }

  if (path === '/api/stripe-webhook' || path === '/api/stripe-webhook/') {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    return stripeWebhook(req);
  }

  if (path === '/admin/review' || path === '/admin/review/') {
    if (req.method === 'POST') return reviewSubmit(req, url);
    return reviewPage(url);
  }

  if (path === '/admin/password' || path === '/admin/password/') {
    if (req.method === 'POST') return ownerPasswordSubmit(req, url);
    return ownerPasswordPage(req, url);
  }

  if (path === '/admin' || path === '/admin/') {
    if (req.method === 'POST') return adminCodesSubmit(req, url);
    return adminCodesPage(req, url);
  }

  if (path === '/api/session' || path === '/api/session/') {
    const session = await readSession(req);
    if (!session) return json({ error: 'unauthorized' }, 401);
    const role = session.role === 'owner' ? 'owner' : session.role === 'code' ? 'member' : null;
    return json({ role: role });
  }

  if (await authorized(req)) return undefined;

  if (path.startsWith('/api/')) return json({ error: 'unauthorized' }, 401);

  const next = safeNext(path + url.search);
  const target = new URL('/login', url);
  if (next !== '/') target.searchParams.set('next', next);
  return redirect(url, target.toString());
}

function configured() {
  return Boolean(process.env.TIKO_ACCESS_PASSWORD && process.env.TIKO_SESSION_SECRET);
}

/* Only a preview deployment behind Vercel Authentication may trust the platform account. */
function previewOpen() {
  return process.env.VERCEL_ENV === 'preview' && process.env.TIKO_PREVIEW_OPEN === '1';
}

function secret() {
  return process.env.TIKO_SESSION_SECRET || '';
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(payload) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

function b64url(bytes) {
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value) {
  try {
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch (err) {
    return null;
  }
}

function readCookie(req) {
  const header = req.headers.get('cookie') || '';
  const parts = header.split(';');
  for (let i = 0; i < parts.length; i++) {
    const at = parts[i].indexOf('=');
    if (at < 0) continue;
    if (parts[i].slice(0, at).trim() === COOKIE) return parts[i].slice(at + 1).trim();
  }
  return null;
}

async function issue(maxAge, role, kid) {
  const exp = Math.floor(Date.now() / 1000) + (maxAge || MAX_AGE);
  const kind = role === 'owner' ? 'owner' : 'code';
  const payload = kid
    ? 'v1.' + kind + '.' + kid + '.' + exp
    : 'v1.' + kind + '.' + exp;
  return payload + '.' + b64url(await hmac(payload));
}

async function readSession(req) {
  if (previewOpen()) return { exp: Math.floor(Date.now() / 1000) + 60, role: 'owner' };
  if (!configured()) return null;
  const token = readCookie(req);
  if (!token) return null;
  const parts = token.split('.');
  if (parts[0] !== 'v1' || (parts.length !== 3 && parts.length !== 4 && parts.length !== 5)) return null;
  let role = '';
  let kid = '';
  let exp = 0;
  if (parts.length === 5) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(parts[2])) return null;
    role = parts[1] === 'owner' ? 'owner' : 'code';
    kid = parts[2];
    exp = Number(parts[3]);
  } else if (parts.length === 4) {
    role = parts[1] === 'owner' ? 'owner' : 'code';
    exp = Number(parts[2]);
  } else {
    exp = Number(parts[1]);
  }
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  const sent = fromB64url(parts[parts.length - 1]);
  if (!sent) return null;
  if (!sameBytes(sent, await hmac(parts.slice(0, -1).join('.')))) return null;
  return { exp: exp, role: role, kid: kid };
}

async function authorized(req) {
  return Boolean(await readSession(req));
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }, key, 256
  );
  return new Uint8Array(bits);
}

/* The env password is the bootstrap; a rotated password lives in KV as a salted hash. */
async function ownerHashState() {
  if (!codesEnabled()) return { state: 'off' };
  try {
    const raw = await kvCommand(['GET', OWNER_HASH_KEY]);
    if (typeof raw !== 'string') return { state: 'none' };
    const record = JSON.parse(raw);
    if (!record || record.v !== 1 || typeof record.salt !== 'string' || typeof record.hash !== 'string') {
      return { state: 'invalid' };
    }
    return { state: 'set', record: record };
  } catch (err) {
    return { state: 'error' };
  }
}

async function verifyOwnerPassword(input) {
  const raw = String(input == null ? '' : input);
  if (!raw || raw.length > OWNER_PASSWORD_MAX) return { ok: false, kid: '' };
  const stored = await ownerHashState();
  if (stored.state === 'off' || stored.state === 'none') {
    const expected = process.env.TIKO_ACCESS_PASSWORD;
    if (!expected) return { ok: false, kid: '' };
    const a = await digest(raw);
    const b = await digest(expected);
    return { ok: sameBytes(a, b), kid: '' };
  }
  if (stored.state !== 'set') return { ok: false, kid: '' };
  const salt = fromB64url(stored.record.salt);
  const expected = fromB64url(stored.record.hash);
  const iterations = Number(stored.record.iter);
  if (!salt || !expected || !Number.isFinite(iterations)) return { ok: false, kid: '' };
  if (iterations < 50000 || iterations > 600000) return { ok: false, kid: '' };
  const ok = sameBytes(await derivePassword(raw, salt, iterations), expected);
  return { ok: ok, kid: typeof stored.record.kid === 'string' ? stored.record.kid : '' };
}

function ownerTryLocked(ip) {
  const entry = ownerTries.get(ip);
  return Boolean(entry) && Date.now() - entry.start < OWNER_ROTATE_WINDOW && entry.count >= MAX_OWNER_ROTATES;
}

function recordOwnerTry(ip) {
  const now = Date.now();
  const entry = ownerTries.get(ip);
  if (!entry || now - entry.start >= OWNER_ROTATE_WINDOW) ownerTries.set(ip, { count: 1, start: now });
  else entry.count += 1;
  if (ownerTries.size > 500) ownerTries.clear();
}

function clientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || 'unknown';
}

function lockedOut(ip) {
  const entry = fails.get(ip);
  return Boolean(entry) && Date.now() - entry.start < WINDOW && entry.count >= MAX_FAILS;
}

function recordFailure(ip) {
  const now = Date.now();
  const entry = fails.get(ip);
  if (!entry || now - entry.start >= WINDOW) fails.set(ip, { count: 1, start: now });
  else entry.count += 1;
  if (fails.size > 500) fails.clear();
}

function clearFailure(ip) {
  fails.delete(ip);
}

function cookieHeader(value, maxAge) {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (maxAge || MAX_AGE);
}

async function login(req, url) {
  if (!configured()) return redirect(url, '/login?error=setup');
  const form = await req.formData();
  const next = safeNext(form.get('next'));
  const ip = clientIp(req);
  if (lockedOut(ip)) return redirect(url, '/login?error=locked&next=' + encodeURIComponent(next));
  const input = form.get('password');
  const owner = await verifyOwnerPassword(input);
  let kind = owner.ok ? 'owner' : '';
  if (!kind) {
    try {
      if (await codeMatches(input)) kind = 'code';
    } catch (err) {
      kind = '';
    }
  }
  if (!kind) {
    recordFailure(ip);
    return redirect(url, '/login?error=bad&next=' + encodeURIComponent(next));
  }
  clearFailure(ip);
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(next, url).toString(),
      'set-cookie': cookieHeader(await issue(kind === 'owner' ? MAX_AGE : CODE_SESSION, kind, owner.kid)),
      'cache-control': 'no-store'
    }
  });
}

function logout(url) {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL('/login', url).toString(),
      'set-cookie': COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      'cache-control': 'no-store'
    }
  });
}

function redirect(url, target) {
  return new Response(null, {
    status: 303,
    headers: { location: new URL(target, url).toString(), 'cache-control': 'no-store' }
  });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function safeNext(value) {
  if (typeof value !== 'string' || !value || value.charAt(0) !== '/') return '/';
  if (value.charAt(1) === '/' || value.charAt(1) === '\\') return '/';
  if (value.indexOf('\\') >= 0) return '/';
  if (/^\/login(?:[\/?#]|$)/.test(value)) return '/';
  return value;
}

/* ---------------- access requests ---------------- */

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.TIKO_KV_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.TIKO_KV_TOKEN || '';
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token: token };
}

function codesEnabled() {
  return Boolean(kvConfig());
}

function requestsEnabled() {
  return Boolean(codesEnabled() && process.env.RESEND_API_KEY && process.env.TIKO_OWNER_EMAIL && process.env.TIKO_OWNER_KEY);
}

async function kvCommand(args) {
  const cfg = kvConfig();
  if (!cfg) throw new Error('kv_missing');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + cfg.token, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error('kv_http_' + res.status);
  const data = await res.json();
  if (data && data.error) throw new Error('kv_error');
  return data ? data.result : null;
}

async function sendMail(to, subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: 'not_configured' };
  const from = process.env.TIKO_MAIL_FROM || 'TIKO <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ from: from, to: [to], subject: subject, text: text, html: html }),
      signal: AbortSignal.timeout(8000)
    });
    return { ok: res.ok, reason: res.ok ? '' : 'send_failed' };
  } catch (err) {
    return { ok: false, reason: 'send_failed' };
  }
}

function hex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function sha256(value) {
  return hex(await digest(value));
}

async function ownerSignBytes(payload) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(process.env.TIKO_OWNER_KEY || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

async function ownerSign(payload) {
  return b64url(await ownerSignBytes(payload));
}

async function reviewToken(id) {
  const payload = 'req.' + id + '.' + (Math.floor(Date.now() / 1000) + REVIEW_TTL);
  return payload + '.' + await ownerSign(payload);
}

async function reviewId(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'req') return null;
  if (!/^[a-f0-9]{16}$/.test(parts[1])) return null;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  const sent = fromB64url(parts[3]);
  if (!sent) return null;
  const payload = parts[0] + '.' + parts[1] + '.' + parts[2];
  return sameBytes(sent, await ownerSignBytes(payload)) ? parts[1] : null;
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = ((value << 8) | bytes[i]) & 0xffffff;
    bits += 8;
    while (bits >= 5) {
      out += CODE_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CODE_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = new Uint8Array(Math.floor((text.length * 5) / 8));
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    const index = CODE_ALPHABET.indexOf(text.charAt(i));
    if (index < 0) return null;
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out[at++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  if (bits !== 0 || at !== out.length) return null;
  return out;
}

async function signedCodeBytes(exp) {
  const mac = (await ownerSignBytes('code.v1.' + exp)).slice(0, CODE_MAC_BYTES);
  const bytes = new Uint8Array(CODE_BYTES);
  bytes[0] = CODE_VERSION;
  new DataView(bytes.buffer).setUint32(1, exp, false);
  bytes.set(mac, 5);
  return bytes;
}

async function makeSignedCode(days) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const body = base32Encode(await signedCodeBytes(exp));
  return { code: CODE_PREFIX + '-' + body.match(/.{4}/g).join('-'), exp: exp };
}

async function signedCodeMatches(input) {
  if (!process.env.TIKO_OWNER_KEY) return false;
  const norm = normalizeCode(input);
  if (!norm.startsWith(CODE_PREFIX)) return false;
  const body = norm.slice(CODE_PREFIX.length);
  if (body.length !== 24) return false;
  const bytes = base32Decode(body);
  if (!bytes || bytes.length !== CODE_BYTES || bytes[0] !== CODE_VERSION) return false;
  const exp = new DataView(bytes.buffer).getUint32(1, false);
  if (exp <= Math.floor(Date.now() / 1000)) return false;
  const expected = (await ownerSignBytes('code.v1.' + exp)).slice(0, CODE_MAC_BYTES);
  return sameBytes(bytes.subarray(5), expected);
}

async function codeRecordKey(value) {
  return 'tiko:code:' + await sha256('code:' + normalizeCode(value));
}

async function codeMatches(input) {
  if (await signedCodeMatches(input)) return true;
  if (!codesEnabled()) return false;
  const norm = normalizeCode(input);
  if (norm.length < 8 || norm.length > 24) return false;
  const raw = await kvCommand(['GET', await codeRecordKey(input)]);
  if (typeof raw !== 'string') return false;
  try {
    const record = JSON.parse(raw);
    return Number(record.exp) > Math.floor(Date.now() / 1000);
  } catch (err) {
    return false;
  }
}

function makeCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += CODE_ALPHABET[bytes[i] & 31];
  return raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12);
}

function requestId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

async function loadRequest(id) {
  const raw = await kvCommand(['GET', 'tiko:req:' + id]);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function saveRequest(record) {
  await kvCommand(['SET', 'tiko:req:' + record.id, JSON.stringify(record), 'EX', String(REQUEST_TTL)]);
}

async function dropRequest(record) {
  try {
    await kvCommand(['DEL', 'tiko:req:' + record.id]);
    await kvCommand(['DEL', 'tiko:req:email:' + await sha256('email:' + record.email)]);
  } catch (err) {
    /* best effort */
  }
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function requestLimited(ip) {
  const now = Date.now();
  const entry = requestHits.get(ip);
  if (!entry || now - entry.start >= REQUEST_WINDOW) {
    requestHits.set(ip, { count: 1, start: now });
    if (requestHits.size > 500) requestHits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

function sameOrigin(req, url) {
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  if (!origin || origin === url.origin) return true;
  /* Sandboxed and privacy-hardened browsers report an opaque origin; Sec-Fetch-Site still proves same-site. */
  return origin === 'null' && site === 'same-origin';
}

/* ---------------- access passes (Stripe Checkout) ---------------- */

function paymentsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY) && codesEnabled();
}

function passAvailable(plan) {
  return Boolean(process.env[plan.env]);
}

function paymentsSellable() {
  return paymentsConfigured() && PASSES.some(passAvailable);
}

function passPlan(value) {
  const days = Number(value);
  for (let i = 0; i < PASSES.length; i++) {
    if (PASSES[i].days === days) return PASSES[i];
  }
  return null;
}

function passDays(value) {
  const plan = passPlan(value);
  return plan ? plan.days : 0;
}

function stripeSessionId(value) {
  return typeof value === 'string' && /^cs_(?:test|live)_[A-Za-z0-9_]{8,200}$/.test(value);
}

function sessionEmail(session) {
  const details = session.customer_details || {};
  return cleanText(details.email || session.customer_email || '', 254).toLowerCase();
}

async function stripePost(path, body) {
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + (process.env.STRIPE_SECRET_KEY || ''),
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error('stripe_http_' + res.status);
  return res.json();
}

async function stripeGet(path) {
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    headers: { authorization: 'Bearer ' + (process.env.STRIPE_SECRET_KEY || '') },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error('stripe_http_' + res.status);
  return res.json();
}

async function hmacText(keyText, payload) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function stripeSignature(payload, header, keyText) {
  if (typeof header !== 'string' || !header) return false;
  let timestamp = 0;
  const signatures = [];
  header.split(',').forEach(function (part) {
    const at = part.indexOf('=');
    if (at < 0) return;
    const name = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (name === 't') timestamp = Number(value);
    else if (name === 'v1') signatures.push(value);
  });
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > STRIPE_TOLERANCE) return false;
  const expected = hex(await hmacText(keyText, timestamp + '.' + payload));
  return signatures.some(function (sig) { return sameText(sig, expected); });
}

function checkoutLimited(ip) {
  const now = Date.now();
  const entry = checkoutHits.get(ip);
  if (!entry || now - entry.start >= CHECKOUT_WINDOW) {
    checkoutHits.set(ip, { count: 1, start: now });
    if (checkoutHits.size > 500) checkoutHits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_CHECKOUTS;
}

function buyErrorText(code) {
  if (code === 'origin') return 'That request did not come from this site.';
  if (code === 'slow') return 'Too many checkout attempts from this network. Wait a while and try again.';
  if (code === 'unavailable') return 'That pass is not for sale right now.';
  if (code === 'failed') return 'Checkout could not start. Try again in a moment.';
  if (code === 'canceled') return 'Checkout was canceled. You were not charged.';
  return '';
}

function passPlanHtml(plan) {
  return '<form method="post" action="/api/checkout" class="plan">' +
      '<input type="hidden" name="days" value="' + plan.days + '">' +
      '<b>' + plan.days + '-day pass</b>' +
      '<div class="price">' + esc(plan.label) + '</div>' +
      '<span>' + plan.days + ' days of full access, then it ends by itself. No subscription.</span>' +
      '<button type="submit">Buy ' + plan.days + '-day pass</button>' +
    '</form>';
}

function buyPage(url) {
  if (!paymentsSellable()) {
    return gateResponse('Access passes',
      '<h1>Passes are closed</h1>' +
      '<p>Payments are not configured on this deployment. Ask the owner for an access code.</p>' +
      '<p class="note"><a href="/login">Back to sign in</a> · <a href="/request">Request access</a></p>');
  }
  const error = buyErrorText(url.searchParams.get('error')) ||
    (url.searchParams.get('canceled') === '1' ? buyErrorText('canceled') : '');
  return gateResponse('Access passes',
    '<h1>Access passes</h1>' +
    '<p>Buy a pass to open TIKOTrade right away — no owner code needed. Stripe handles the payment on its own ' +
    'page; your card details never reach this site.</p>' +
    (error ? '<div class="error" role="alert">' + esc(error) + '</div>' : '') +
    PASSES.filter(passAvailable).map(passPlanHtml).join('') +
    '<p class="note">Prices in USD; sales tax may apply at checkout. Passes do not renew. ' +
    'After payment this device is signed in and the app emails your access code. ' +
    'Contact the owner for refunds.<br><a href="/login">Already have a code? Sign in</a> · ' +
    '<a href="/request">Ask for access</a></p>',
    200,
    { 'content-security-policy': GATE_CSP.replace("form-action 'self'", "form-action 'self' https://checkout.stripe.com") });
}

async function checkout(req, url) {
  if (!paymentsSellable()) return redirect(url, '/buy?error=unavailable');
  if (!sameOrigin(req, url)) return redirect(url, '/buy?error=origin');
  if (checkoutLimited(clientIp(req))) return redirect(url, '/buy?error=slow');
  const form = await req.formData();
  const plan = passPlan(form.get('days'));
  if (!plan || !passAvailable(plan)) return redirect(url, '/buy?error=unavailable');
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('line_items[0][price]', process.env[plan.env]);
  body.set('line_items[0][quantity]', '1');
  body.set('success_url', new URL('/purchase/success?session_id={CHECKOUT_SESSION_ID}', url).toString());
  body.set('cancel_url', new URL('/buy?canceled=1', url).toString());
  body.set('metadata[days]', String(plan.days));
  body.set('metadata[pass]', plan.days + '-day');
  body.set('expires_at', String(Math.floor(Date.now() / 1000) + 1800));
  try {
    const session = await stripePost('checkout/sessions', body);
    if (!session || typeof session.url !== 'string') throw new Error('stripe_shape');
    return new Response(null, {
      status: 303,
      headers: { location: session.url, 'cache-control': 'no-store' }
    });
  } catch (err) {
    return redirect(url, '/buy?error=failed');
  }
}

async function stripeWebhook(req) {
  const key = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!key) return json({ error: 'not_configured' }, 500);
  const payload = await req.text();
  if (!(await stripeSignature(payload, req.headers.get('stripe-signature'), key))) {
    return json({ error: 'invalid_signature' }, 400);
  }
  let event;
  try {
    event = JSON.parse(payload);
  } catch (err) {
    return json({ error: 'bad_payload' }, 400);
  }
  if (event.type !== 'checkout.session.completed' &&
      event.type !== 'checkout.session.async_payment_succeeded') {
    return json({ received: true });
  }
  const session = event.data && event.data.object ? event.data.object : null;
  if (!session || session.object !== 'checkout.session' || session.payment_status !== 'paid') {
    return json({ received: true });
  }
  const days = passDays(session.metadata && session.metadata.days);
  if (!days || !stripeSessionId(session.id)) return json({ received: true });
  try {
    const origin = new URL(req.url).origin;
    const stored = await recordPass(session, days);
    const code = await passCodeFor(session.id, stored.record.email, stored.record.exp);
    if (code) await deliverPassCode(session.id, stored.record.email, code, days, stored.record.exp, origin);
  } catch (err) {
    return json({ error: 'retry' }, 500);
  }
  return json({ received: true });
}

async function recordPass(session, days) {
  const id = String(session.id || '');
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const record = {
    email: sessionEmail(session),
    days: days,
    exp: exp,
    amount: Number(session.amount_total) || 0,
    currency: String(session.currency || 'usd'),
    paidAt: new Date().toISOString()
  };
  const key = 'tiko:pass:' + id;
  const fresh = await kvCommand(['SET', key, JSON.stringify(record), 'EX', String(PASS_TTL), 'NX']);
  if (fresh === 'OK') return { first: true, record: record };
  const raw = await kvCommand(['GET', key]);
  if (typeof raw === 'string') {
    try {
      const stored = JSON.parse(raw);
      if (stored && Number.isFinite(Number(stored.exp))) return { first: false, record: stored };
    } catch (err) {
      /* fall through to the fresh record */
    }
  }
  return { first: false, record: record };
}

async function passCodeFor(sessionId, email, exp) {
  const key = 'tiko:pass:code:' + sessionId;
  const existing = await kvCommand(['GET', key]);
  if (typeof existing === 'string' && existing) return existing;
  const ttl = exp - Math.floor(Date.now() / 1000);
  if (ttl <= 0) return '';
  const code = makeCode();
  const hash = await sha256('code:' + normalizeCode(code));
  await kvCommand(['SET', 'tiko:code:' + hash, JSON.stringify({
    email: email, exp: exp, issuedAt: new Date().toISOString(), source: 'stripe', sessionId: sessionId
  }), 'EX', String(ttl)]);
  const stored = await kvCommand(['SET', key, code, 'EX', String(ttl), 'NX']);
  if (stored === 'OK') return code;
  const winner = await kvCommand(['GET', key]);
  return typeof winner === 'string' && winner ? winner : code;
}

function passText(code, days, exp, origin) {
  return 'Your TIKOTrade ' + days + '-day pass is active until ' + codeExpiry(exp) + '.\n\n' +
    'Your access code: ' + code + '\n\n' +
    'This device is already signed in. To open the app on another device, go to ' + origin + '/login and enter the code. ' +
    'The code stops working when the pass ends.\n\n' +
    'TIKOTrade is informational only; an optional broker connection can place orders only with your permission.';
}

function passHtml(code, days, exp, origin) {
  return '<p>Your TIKOTrade ' + days + '-day pass is active until ' + esc(codeExpiry(exp)) + '.</p>' +
    '<p>Your access code:</p>' +
    '<p style="font:600 22px ui-monospace,Menlo,monospace;letter-spacing:.08em">' + esc(code) + '</p>' +
    '<p>This device is already signed in. To open the app on another device, go to ' +
    '<a href="' + esc(origin) + '/login">' + esc(origin) + '/login</a> and enter the code. ' +
    'The code stops working when the pass ends.</p>' +
    '<p style="color:#666;font-size:12px">TIKOTrade is informational only; an optional broker connection can place orders only with your permission.</p>';
}

async function deliverPassCode(sessionId, email, code, days, exp, origin) {
  if (!validEmail(email)) return { ok: false, reason: 'no_email' };
  const key = 'tiko:pass:mail:' + sessionId;
  const claimed = await kvCommand(['SET', key, '1', 'EX', '86400', 'NX']);
  if (claimed !== 'OK') return { ok: true, reason: 'already' };
  const sent = await sendMail(email, 'Your TIKOTrade pass', passText(code, days, exp, origin), passHtml(code, days, exp, origin));
  if (!sent.ok) {
    try {
      await kvCommand(['DEL', key]);
    } catch (err) {
      /* best effort */
    }
    return { ok: false, reason: 'send_failed' };
  }
  return { ok: true, reason: '' };
}

async function claimPass(url) {
  const id = url.searchParams.get('session_id') || '';
  if (!stripeSessionId(id)) return { ok: false, reason: 'missing' };
  if (!paymentsConfigured()) return { ok: false, reason: 'closed' };
  let session;
  try {
    session = await stripeGet('checkout/sessions/' + encodeURIComponent(id));
  } catch (err) {
    return { ok: false, reason: 'failed' };
  }
  if (!session || session.id !== id || session.payment_status !== 'paid') {
    return { ok: false, reason: 'unpaid' };
  }
  const days = passDays(session.metadata && session.metadata.days);
  if (!days) return { ok: false, reason: 'failed' };
  let stored;
  try {
    stored = await recordPass(session, days);
  } catch (err) {
    return { ok: false, reason: 'failed' };
  }
  if (Number(stored.record.exp) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  let code = '';
  try {
    code = await passCodeFor(id, stored.record.email, Number(stored.record.exp));
    if (code) await deliverPassCode(id, stored.record.email, code, days, stored.record.exp, url.origin);
  } catch (err) {
    code = '';
  }
  return { ok: true, days: days, record: stored.record, code: code };
}

async function purchaseSuccess(url) {
  if (!paymentsConfigured()) {
    return gateResponse('Access passes',
      '<h1>Passes are closed</h1>' +
      '<p>Payments are not configured on this deployment.</p>' +
      '<p class="note"><a href="/login">Back to sign in</a></p>');
  }
  const claimed = await claimPass(url);
  if (!claimed.ok) {
    if (claimed.reason === 'missing') {
      return gateResponse('Access passes',
        '<h1>Checkout link missing</h1>' +
        '<p>Open the confirmation link that Stripe returned after payment.</p>' +
        '<p class="note"><a href="/buy">Buy a pass</a> · <a href="/login">Sign in</a></p>');
    }
    if (claimed.reason === 'unpaid') {
      return gateResponse('Access passes',
        '<h1>Payment not complete</h1>' +
        '<p>Stripe has not confirmed this checkout yet. If you were charged, reload this page in a moment.</p>' +
        '<p class="note"><a href="/buy">Back to passes</a></p>');
    }
    if (claimed.reason === 'expired') {
      return gateResponse('Access passes',
        '<h1>This pass has ended</h1>' +
        '<p>It was activated when it was bought, and passes do not renew. Buy a new pass to continue.</p>' +
        '<p class="note"><a href="/buy">Buy a pass</a> · <a href="/login">Sign in</a></p>');
    }
    return gateResponse('Access passes',
      '<h1>Could not confirm the payment</h1>' +
      '<p>Stripe did not answer. Reload in a moment; you were not charged twice.</p>' +
      '<p class="note"><a href="/buy">Back to passes</a></p>');
  }
  const record = claimed.record;
  const until = codeExpiry(record.exp);
  const remaining = Number(record.exp) - Math.floor(Date.now() / 1000);
  return gateResponse('Pass active',
    '<h1>You are in</h1>' +
    '<p>Your ' + claimed.days + '-day pass is active until ' + esc(until) + '. This device is signed in.</p>' +
    (claimed.code ? '<div class="code">' + esc(claimed.code) + '</div>' : '') +
    '<p class="note">' +
    (record.email && validEmail(record.email)
      ? 'We emailed this code to ' + esc(record.email) + '. '
      : '') +
    'Use it to sign in on another device at <a href="/login">/login</a>. ' +
    'The code and the pass end together; nothing renews automatically.</p>' +
    '<p class="note"><a href="/">Open TIKOTrade</a></p>',
    200, { 'set-cookie': cookieHeader(await issue(remaining, 'code'), remaining) });
}

function codeText(code, origin) {
  return 'Your TIKOTrade access code is ' + code + '\n\n' +
    'Open ' + origin + '/login and enter it. The code works for 30 days.\n\n' +
    'If you did not request access, ignore this email. TIKOTrade is informational only; an optional broker connection can place orders only with your permission.';
}

function codeHtml(code, origin) {
  return '<p>Your TIKOTrade access code:</p>' +
    '<p style="font:600 22px ui-monospace,Menlo,monospace;letter-spacing:.08em">' + esc(code) + '</p>' +
    '<p>Open <a href="' + esc(origin) + '/login">' + esc(origin) + '/login</a> and enter it. The code works for 30 days.</p>' +
    '<p style="color:#666;font-size:12px">If you did not request access, ignore this email. TIKOTrade is informational only; an optional broker connection can place orders only with your permission.</p>';
}

async function issueCode(record, url) {
  if (record.codeHash) {
    try {
      await kvCommand(['DEL', 'tiko:code:' + record.codeHash]);
    } catch (err) {
      /* best effort */
    }
  }
  const code = makeCode();
  const hash = await sha256('code:' + normalizeCode(code));
  const exp = Math.floor(Date.now() / 1000) + CODE_TTL;
  await kvCommand(['SET', 'tiko:code:' + hash, JSON.stringify({
    email: record.email, name: record.name, exp: exp, issuedAt: new Date().toISOString(), requestId: record.id
  }), 'EX', String(CODE_TTL)]);
  record.codeHash = hash;
  const sent = await sendMail(record.email, 'Your TIKOTrade access code', codeText(code, url.origin), codeHtml(code, url.origin));
  record.mail = sent.ok ? 'ok' : 'failed';
  record.mailAt = new Date().toISOString();
  await kvCommand(['SET', 'tiko:reqcode:' + record.id, code, 'EX', String(CODE_SHOW_TTL)]);
  return code;
}

function requestErrorText(code) {
  if (code === 'email') return 'Enter a valid email address.';
  if (code === 'slow') return 'Too many requests from this network. Try again later.';
  if (code === 'send') return 'The request could not be delivered. Try again in a few minutes.';
  if (code === 'origin') return 'That request did not come from this site.';
  if (code === 'closed') return 'Access requests are not open right now.';
  return '';
}

function requestPage(url) {
  if (!requestsEnabled()) {
    return gateResponse('Request access',
      '<h1>Requests are closed</h1>' +
      '<p>The owner has not opened access requests. Ask them directly for an access code.</p>' +
      '<p class="note"><a href="/login">Back to sign in</a></p>');
  }
  if (url.searchParams.get('sent') === '1') {
    return gateResponse('Request sent',
      '<h1>Request sent</h1>' +
      '<p>Your request is with the owner. If they approve it, the app emails you an access code.</p>' +
      '<p class="note"><a href="/login">Back to sign in</a></p>');
  }
  const error = requestErrorText(url.searchParams.get('error'));
  return gateResponse('Request access',
    '<h1>Request access</h1>' +
    '<p>TIKOTrade is private. Send one request; the owner reviews it and emails a code only if they approve.</p>' +
    (error ? '<div class="error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/request">' +
      '<label for="name">Name (optional)</label>' +
      '<input id="name" name="name" maxlength="80" autocomplete="name">' +
      '<label for="email">Email</label>' +
      '<input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>' +
      '<label for="note">Why do you want access? (optional)</label>' +
      '<textarea id="note" name="note" maxlength="500" rows="3"></textarea>' +
      '<div style="position:absolute;left:-9999px" aria-hidden="true"><label for="company">Company</label>' +
      '<input id="company" name="company" tabindex="-1" autocomplete="off"></div>' +
      '<button type="submit">Send request</button>' +
    '</form>' +
    '<p class="note">Already have a code? <a href="/login">Sign in</a>.' +
    (paymentsSellable() ? ' Prefer instant access? <a href="/buy">Buy a pass</a>.' : '') +
    '</p>');
}

async function requestSubmit(req, url) {
  if (!requestsEnabled()) return redirect(url, '/request?error=closed');
  if (!sameOrigin(req, url)) return redirect(url, '/request?error=origin');
  const ip = clientIp(req);
  if (requestLimited(ip)) return redirect(url, '/request?error=slow');
  const form = await req.formData();
  if (String(form.get('company') || '').trim()) return redirect(url, '/request?sent=1');
  const email = cleanText(form.get('email'), 254).toLowerCase();
  const name = cleanText(form.get('name'), 80);
  const note = cleanText(form.get('note'), 500);
  if (!validEmail(email)) return redirect(url, '/request?error=email');

  const id = requestId();
  const emailKey = 'tiko:req:email:' + await sha256('email:' + email);
  const record = { id: id, name: name, email: email, note: note, status: 'pending', createdAt: new Date().toISOString() };
  try {
    const claimed = await kvCommand(['SET', emailKey, id, 'EX', String(REQUEST_TTL), 'NX']);
    if (claimed !== 'OK') return redirect(url, '/request?sent=1');
    await saveRequest(record);
    const token = await reviewToken(id);
    const link = new URL('/admin/review?t=' + encodeURIComponent(token), url).toString();
    const body = 'Name: ' + (name || '(not given)') + '\n' +
      'Email: ' + email + '\n' +
      'Note: ' + (note || '(none)') + '\n\n' +
      'Approve or deny: ' + link + '\n\n' +
      'This link expires in 7 days. A code is generated only when you approve.';
    const sent = await sendMail(process.env.TIKO_OWNER_EMAIL, 'TIKOTrade access request', body,
      '<p>' + esc(body).replace(/\n/g, '<br>') + '</p>');
    if (!sent.ok) {
      await dropRequest(record);
      return redirect(url, '/request?error=send');
    }
    return redirect(url, '/request?sent=1');
  } catch (err) {
    await dropRequest(record);
    return redirect(url, '/request?error=send');
  }
}

async function reviewPage(url) {
  const token = url.searchParams.get('t');
  const id = await reviewId(token);
  if (!id) {
    return gateResponse('Review request',
      '<h1>Link not valid</h1><p>This approval link is invalid or has expired. Use the newest request email.</p>');
  }
  if (!codesEnabled()) {
    return gateResponse('Review request',
      '<h1>Not configured</h1><p>Access requests need a KV database. Add it in Vercel, then redeploy.</p>');
  }
  let record;
  try {
    record = await loadRequest(id);
  } catch (err) {
    record = null;
  }
  if (!record) {
    return gateResponse('Review request',
      '<h1>Request not found</h1><p>It may have expired or already been removed.</p>');
  }
  const heading = record.status === 'approved' ? 'Approved' :
    record.status === 'denied' ? 'Denied' : record.status === 'revoked' ? 'Revoked' : 'Access request';
  const facts = '<div class="facts"><b>Name</b>' + esc(record.name || '(not given)') +
    '<br><b style="margin-top:10px">Email</b>' + esc(record.email) +
    (record.note ? '<br><b style="margin-top:10px">Note</b>' + esc(record.note) : '') +
    '<br><b style="margin-top:10px">Requested</b>' + esc(record.createdAt) + '</div>';

  if (record.status === 'pending') {
    return gateResponse('Review request',
      '<h1>Access request</h1>' +
      '<p>Approve to generate a personal access code and email it to this address.</p>' + facts +
      '<form method="post" action="/admin/review">' +
        '<input type="hidden" name="t" value="' + esc(token) + '">' +
        '<button type="submit" name="action" value="approve">Approve and email a code</button>' +
        '<button type="submit" name="action" value="deny" class="secondary">Deny</button>' +
      '</form>' +
      '<p class="note">The code is valid for 30 days. Nothing is sent unless you approve.</p>');
  }

  let code = '';
  if (record.status === 'approved') {
    try {
      code = (await kvCommand(['GET', 'tiko:reqcode:' + id])) || '';
    } catch (err) {
      code = '';
    }
  }
  const mailLine = record.mail === 'ok' ? 'The code was emailed to ' + record.email + '.' :
    record.mail === 'failed' ? 'The email could not be sent — forward the code yourself.' : '';
  const actions = record.status === 'approved'
    ? '<form method="post" action="/admin/review">' +
        '<input type="hidden" name="t" value="' + esc(token) + '">' +
        '<button type="submit" name="action" value="reissue">Generate and email a new code</button>' +
        '<button type="submit" name="action" value="revoke" class="secondary">Revoke access</button>' +
      '</form>'
    : '';
  return gateResponse('Review request',
    '<h1>' + heading + '</h1>' +
    (record.status === 'approved'
      ? '<p>' + esc(mailLine) + '</p>'
      : '<p>This request was denied. No code was generated.</p>') +
    (code ? '<div class="code">' + esc(code) + '</div>' : '') +
    facts + actions +
    (record.status === 'approved'
      ? '<p class="note">The code stops working 30 days after it is generated. Revoke deletes it immediately. The code is shown here for one day.</p>'
      : ''));
}

async function reviewSubmit(req, url) {
  if (!sameOrigin(req, url)) {
    return gateResponse('Review request', '<h1>Blocked</h1><p>That request did not come from this site.</p>');
  }
  const form = await req.formData();
  const token = String(form.get('t') || '');
  const id = await reviewId(token);
  if (!id) {
    return gateResponse('Review request', '<h1>Link not valid</h1><p>This approval link is invalid or has expired.</p>');
  }
  if (!codesEnabled()) {
    return gateResponse('Review request', '<h1>Not configured</h1><p>Access requests need a KV database.</p>');
  }
  let record;
  try {
    record = await loadRequest(id);
  } catch (err) {
    record = null;
  }
  if (!record) {
    return gateResponse('Review request', '<h1>Request not found</h1><p>It may have expired or already been removed.</p>');
  }
  const action = String(form.get('action') || '');
  const target = new URL('/admin/review?t=' + encodeURIComponent(token), url);
  try {
    if (action === 'approve' && record.status === 'pending') {
      record.status = 'approved';
      record.approvedAt = new Date().toISOString();
      await issueCode(record, url);
      await saveRequest(record);
      target.searchParams.set('done', 'approve');
      return redirect(url, target.toString());
    }
    if (action === 'deny' && record.status === 'pending') {
      record.status = 'denied';
      record.deniedAt = new Date().toISOString();
      await saveRequest(record);
      target.searchParams.set('done', 'deny');
      return redirect(url, target.toString());
    }
    if (action === 'reissue' && record.status === 'approved') {
      await issueCode(record, url);
      await saveRequest(record);
      target.searchParams.set('done', 'approve');
      return redirect(url, target.toString());
    }
    if (action === 'revoke' && record.status === 'approved') {
      if (record.codeHash) await kvCommand(['DEL', 'tiko:code:' + record.codeHash]);
      await kvCommand(['DEL', 'tiko:reqcode:' + id]);
      record.status = 'revoked';
      record.revokedAt = new Date().toISOString();
      await saveRequest(record);
      target.searchParams.set('done', 'revoke');
      return redirect(url, target.toString());
    }
    return redirect(url, target.toString());
  } catch (err) {
    return gateResponse('Review request',
      '<h1>Something failed</h1><p>The change did not go through. Try again in a moment.</p>');
  }
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- owner-issued codes ---------------- */

function adminCodeDays(value) {
  const days = Number(value);
  return CODE_DAYS.indexOf(days) >= 0 ? days : 0;
}

function codeExpiry(exp) {
  return new Date(exp * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function adminCodesForm(error) {
  return '<h1>Member codes</h1>' +
    '<p>Generate a code and send it to a member. Codes are signed, so they need no database and no email; each one works until it expires.</p>' +
    (error ? '<div class="error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/admin">' +
      '<label for="days">Valid for</label>' +
      '<select id="days" name="days">' +
        CODE_DAYS.map(function (days) {
          return '<option value="' + days + '"' + (days === 7 ? ' selected' : '') + '>' +
            days + (days === 1 ? ' day' : ' days') + '</option>';
        }).join('') +
      '</select>' +
      '<button type="submit">Generate code</button>' +
    '</form>' +
    '<p class="note">Codes can be reused until they expire. Rotating TIKO_OWNER_KEY invalidates every code, along with every review link. ' +
    '<a href="/admin/password">Change owner password</a> · <a href="/">Back to TIKOTrade</a> · <a href="/logout">Sign out</a></p>';
}

function adminCodeResult(made, days) {
  return '<h1>Code ready</h1>' +
    '<p>Send this code to the member. They enter it at <a href="/login">/login</a>.</p>' +
    '<div class="code">' + esc(made.code) + '</div>' +
    '<p class="note">Valid for ' + days + (days === 1 ? ' day' : ' days') +
    ', until ' + esc(codeExpiry(made.exp)) + '. Reusable until it expires; this page is not stored, so copy the code now.</p>' +
    '<p class="note"><a href="/admin">Generate another</a> · <a href="/">Back to TIKOTrade</a></p>';
}

/* Owner-only surfaces also reject sessions issued before the latest password change. */
async function requireOwner(req, url, title, next, refreshLegacy) {
  const session = await readSession(req);
  if (!session) return { response: redirect(url, '/login?next=' + encodeURIComponent(next)) };
  if (previewOpen()) return { response: null, session: session };
  if (session.role !== 'owner') {
    return { response: gateResponse(title,
      session.role || !refreshLegacy
        ? '<h1>Owner only</h1><p>This area is for the owner.</p>' +
          '<p class="note"><a href="/">Back to TIKOTrade</a></p>'
        : '<h1>Refresh your session</h1><p>This session was issued before owner roles existed. ' +
          'Sign out and back in to manage owner settings.</p><p class="note"><a href="/logout">Sign out</a></p>', 403) };
  }
  const stored = await ownerHashState();
  if (stored.state === 'error' || stored.state === 'invalid') {
    return { response: gateResponse(title,
      '<h1>Temporarily unavailable</h1><p>Could not verify this owner session. Try again in a minute.</p>', 503) };
  }
  const current = stored.state === 'set' ? String(stored.record.kid || '') : '';
  if (String(session.kid || '') !== current) {
    return { response: gateResponse(title,
      '<h1>Sign in again</h1><p>This owner session ended when the owner password changed.</p>' +
      '<p class="note"><a href="/logout">Sign in</a></p>', 403) };
  }
  return { response: null, session: session };
}

function ownerPasswordForm(error) {
  return '<h1>Owner password</h1>' +
    '<p>Change the password you use at <a href="/login">/login</a>. Only a salted hash is stored; the password itself is never kept or shown.</p>' +
    (error ? '<div class="error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/admin/password">' +
      '<label for="current">Current password</label>' +
      '<input id="current" name="current" type="password" autocomplete="current-password" required spellcheck="false">' +
      '<label for="next">New password</label>' +
      '<input id="next" name="password" type="password" autocomplete="new-password" minlength="' + OWNER_PASSWORD_MIN + '" maxlength="' + OWNER_PASSWORD_MAX + '" required spellcheck="false">' +
      '<label for="confirm">Repeat new password</label>' +
      '<input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="' + OWNER_PASSWORD_MIN + '" maxlength="' + OWNER_PASSWORD_MAX + '" required spellcheck="false">' +
      '<button type="submit">Change password</button>' +
    '</form>' +
    '<p class="note">At least ' + OWNER_PASSWORD_MIN + ' characters. Other owner sessions end when you change it. ' +
    '<a href="/admin">Back to member codes</a> · <a href="/logout">Sign out</a></p>';
}

async function ownerPasswordPage(req, url) {
  const owner = await requireOwner(req, url, 'Owner password', '/admin/password', true);
  if (owner.response) return owner.response;
  if (!codesEnabled()) {
    return gateResponse('Owner password',
      '<h1>Storage required</h1><p>Connect Vercel KV or Upstash so the password can be stored as a salted hash. ' +
      'Until then, keep using TIKO_ACCESS_PASSWORD.</p>' +
      '<p class="note"><a href="/admin">Back to member codes</a></p>', 503);
  }
  if (url.searchParams.get('state') === 'changed') {
    return gateResponse('Owner password',
      '<h1>Password changed</h1>' +
      '<p>Use the new password the next time you sign in. It will not be shown or emailed.</p>' +
      '<p>This browser stays signed in. Other owner sessions end the next time they open an owner page.</p>' +
      '<p class="note"><a href="/admin">Member codes</a> · <a href="/">Back to TIKOTrade</a></p>');
  }
  return gateResponse('Owner password', ownerPasswordForm(''));
}

async function ownerPasswordSubmit(req, url) {
  const owner = await requireOwner(req, url, 'Owner password', '/admin/password', false);
  if (owner.response) return owner.response;
  if (!codesEnabled()) {
    return gateResponse('Owner password',
      '<h1>Storage required</h1><p>Connect Vercel KV or Upstash before changing the owner password.</p>', 503);
  }
  if (!sameOrigin(req, url)) {
    return gateResponse('Owner password',
      '<h1>Blocked</h1><p>That request did not come from this site.</p>', 403);
  }
  const ip = clientIp(req);
  if (ownerTryLocked(ip)) {
    return gateResponse('Owner password',
      ownerPasswordForm('Too many attempts. Wait a few minutes and try again.'), 429);
  }
  const form = await req.formData();
  const current = String(form.get('current') || '');
  const next = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');

  if (!(await verifyOwnerPassword(current)).ok) {
    recordOwnerTry(ip);
    return gateResponse('Owner password',
      ownerPasswordForm('The current password is not correct.'), 400);
  }
  if (next.length < OWNER_PASSWORD_MIN || next.length > OWNER_PASSWORD_MAX) {
    return gateResponse('Owner password',
      ownerPasswordForm('Use at least ' + OWNER_PASSWORD_MIN + ' and at most ' + OWNER_PASSWORD_MAX + ' characters.'), 400);
  }
  if (next !== confirm) {
    return gateResponse('Owner password',
      ownerPasswordForm('The new passwords do not match.'), 400);
  }
  if (next === current) {
    return gateResponse('Owner password',
      ownerPasswordForm('Choose a password different from the current one.'), 400);
  }

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePassword(next, salt, OWNER_ITERATIONS);
  const kidBytes = new Uint8Array(9);
  crypto.getRandomValues(kidBytes);
  const record = {
    v: 1,
    alg: 'pbkdf2-sha256',
    iter: OWNER_ITERATIONS,
    salt: b64url(salt),
    hash: b64url(hash),
    kid: b64url(kidBytes),
    at: new Date().toISOString()
  };
  try {
    await kvCommand(['SET', OWNER_HASH_KEY, JSON.stringify(record)]);
  } catch (err) {
    return gateResponse('Owner password',
      ownerPasswordForm('The new password could not be saved. Try again in a minute.'), 503);
  }
  ownerTries.delete(ip);
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL('/admin/password?state=changed', url).toString(),
      'set-cookie': cookieHeader(await issue(MAX_AGE, 'owner', record.kid)),
      'cache-control': 'no-store'
    }
  });
}

async function adminCodesPage(req, url) {
  const owner = await requireOwner(req, url, 'Member codes', '/admin', true);
  if (owner.response) return owner.response;
  if (!process.env.TIKO_OWNER_KEY) {
    return gateResponse('Member codes',
      '<h1>Signing key missing</h1><p>Add TIKO_OWNER_KEY in Vercel, then redeploy.</p>', 500);
  }
  return gateResponse('Member codes', adminCodesForm(''));
}

async function adminCodesSubmit(req, url) {
  const owner = await requireOwner(req, url, 'Member codes', '/admin', false);
  if (owner.response) return owner.response;
  if (!process.env.TIKO_OWNER_KEY) {
    return gateResponse('Member codes',
      '<h1>Signing key missing</h1><p>Add TIKO_OWNER_KEY in Vercel, then redeploy.</p>', 500);
  }
  if (!sameOrigin(req, url)) {
    return gateResponse('Member codes',
      '<h1>Blocked</h1><p>That request did not come from this site.</p>', 403);
  }
  const form = await req.formData();
  const days = adminCodeDays(form.get('days'));
  if (!days) {
    return gateResponse('Member codes', adminCodesForm('Choose 1, 7, 14 or 30 days.'), 400);
  }
  return gateResponse('Member code', adminCodeResult(await makeSignedCode(days), days));
}

const GATE_CSS =
  ':root{color-scheme:dark}' +
  '*{box-sizing:border-box}' +
  'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;' +
  'font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
  'color:#eef1f7;background:#0b0d14;' +
  'background-image:radial-gradient(900px 500px at 20% -10%,rgba(86,112,255,.22),transparent 60%),' +
  'radial-gradient(700px 420px at 100% 110%,rgba(38,208,124,.12),transparent 55%)}' +
  '.gate{width:100%;max-width:420px;background:rgba(17,20,30,.9);border:1px solid rgba(255,255,255,.1);' +
  'border-radius:20px;padding:30px 28px 24px;box-shadow:0 24px 70px rgba(0,0,0,.45)}' +
  '.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.22em;font-size:15px}' +
  '.dot{width:9px;height:9px;border-radius:50%;background:#26d07c;box-shadow:0 0 16px rgba(38,208,124,.8)}' +
  'h1{font-size:22px;line-height:1.2;margin:22px 0 6px;letter-spacing:-.02em;font-weight:640}' +
  'p{margin:0;color:#9aa3b2;font-size:13px}' +
  'a{color:#a8b8ff}' +
  '.error{margin-top:16px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.45;' +
  'color:#ffc9d3;background:rgba(240,74,96,.12);border:1px solid rgba(240,74,96,.34)}' +
  'label{display:block;margin-top:18px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8b95a7;font-weight:600}' +
  'input,select,textarea{display:block;width:100%;margin-top:8px;padding:12px 13px;border-radius:11px;border:1px solid rgba(255,255,255,.14);' +
  'background:#0c0f18;color:#eef1f7;font:inherit;font-size:15px;outline:none;resize:vertical}' +
  'input:focus,select:focus,textarea:focus{border-color:#5670ff;box-shadow:0 0 0 3px rgba(86,112,255,.22)}' +
  'button{margin-top:18px;width:100%;padding:12px 16px;border:0;border-radius:11px;cursor:pointer;' +
  'background:#eef1f7;color:#0b0d14;font-size:14px;font-weight:650;letter-spacing:.01em}' +
  'button:hover{background:#fff}' +
  'button.secondary{margin-top:10px;background:transparent;color:#c7cedb;border:1px solid rgba(255,255,255,.16)}' +
  'button.secondary:hover{background:rgba(255,255,255,.06)}' +
  '.note{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;color:#798394}' +
  '.foot{margin-top:20px;text-align:center;font-size:11px;color:#5f6878}' +
  '.facts{margin-top:16px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);' +
  'border:1px solid rgba(255,255,255,.08);font-size:13px;color:#c7cedb;word-break:break-word}' +
  '.facts b{color:#8b95a7;font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;display:block}' +
  '.code{margin-top:16px;padding:16px;border-radius:12px;background:#0c0f18;border:1px dashed rgba(86,112,255,.5);' +
  'font:600 20px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-align:center}' +
  '.plan{margin-top:16px;padding:16px 16px 6px;border-radius:14px;background:rgba(255,255,255,.04);' +
  'border:1px solid rgba(255,255,255,.09)}' +
  '.plan b{display:block;font-size:15px;color:#eef1f7}' +
  '.plan span{display:block;margin-top:2px;font-size:12px;color:#98a1b0}' +
  '.price{margin-top:4px;font-size:26px;font-weight:650;letter-spacing:-.03em;color:#eef1f7}' +
  '@media (max-width:420px){.gate{padding:24px 20px 20px}}';

const GATE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function gateResponse(title, inner, status, extraHeaders) {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>' + esc(title) + ' · TIKOTrade</title><style>' + GATE_CSS + '</style></head><body>' +
    '<main class="gate"><div class="brand"><span class="dot" aria-hidden="true"></span>TIKOTrade</div>' +
    inner + '</main>' +
    '<p class="foot">Informational only — not financial advice.</p>' +
    '</body></html>';
  return new Response(html, {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': GATE_CSP,
      'x-frame-options': 'DENY',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer'
    }, extraHeaders || {})
  });
}

function errorText(code) {
  if (!configured()) return 'Access is not configured yet. Add TIKO_ACCESS_PASSWORD and TIKO_SESSION_SECRET in Vercel, then redeploy.';
  if (code === 'locked') return 'Too many attempts. Wait a few minutes and try again.';
  if (code === 'bad') return 'That password or access code is not correct.';
  if (code === 'setup') return 'Access is not configured yet. Add TIKO_ACCESS_PASSWORD and TIKO_SESSION_SECRET in Vercel, then redeploy.';
  return '';
}

function loginPage(url) {
  const next = safeNext(url.searchParams.get('next'));
  const error = errorText(url.searchParams.get('error'));
  const invite = requestsEnabled()
    ? 'Need access? <a href="/request">Request an invitation</a> or <a href="/buy">buy a pass</a>.'
    : (paymentsSellable()
      ? 'The owner signs in with a password. Members can <a href="/buy">buy an access pass</a> or use a code from the owner.'
      : 'The owner signs in with a password. Members need an access code from the owner.');
  return gateResponse('Sign in',
    '<h1>Private access</h1>' +
    '<p>This build opens only for people the owner has let in.</p>' +
    (error ? '<div class="error" role="alert">' + esc(error) + '</div>' : '') +
    '<form method="post" action="/login">' +
      '<input type="hidden" name="next" value="' + esc(next) + '">' +
      '<label for="pw">Password or access code</label>' +
      '<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus spellcheck="false">' +
      '<button type="submit">Unlock</button>' +
    '</form>' +
    '<p class="note">' + invite + '</p>');
}
