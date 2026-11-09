/* Server-only SnapTrade client: signed requests and an encrypted credential cookie.
   Never send the user secret to the browser. */
'use strict';

const crypto = require('node:crypto');

const BASE = 'https://api.snaptrade.com';
const COOKIE = 'tiko_portfolio';
const MAX_AGE = 60 * 60 * 24 * 30;
const TIMEOUT = 15000;
const CONNECTION_TYPE = 'read';

function credentials() {
  const clientId = String(process.env.SNAPTRADE_CLIENT_ID || '').trim();
  const consumerKey = String(process.env.SNAPTRADE_CONSUMER_KEY || '').trim();
  return clientId && consumerKey ? { clientId, consumerKey } : null;
}

function cookieKey() {
  const secret = String(process.env.TIKO_SESSION_SECRET || '');
  if (secret.length < 16) return null;
  return Buffer.from(crypto.hkdfSync(
    'sha256', Buffer.from(secret), Buffer.from('tiko-portfolio'), Buffer.from('credentials-v1'), 32
  ));
}

function configured() {
  return Boolean(credentials() && cookieKey());
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().filter(function (key) {
      return value[key] !== undefined;
    }).map(function (key) {
      return JSON.stringify(key) + ':' + canonical(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value) {
  try {
    return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch (err) {
    return null;
  }
}

function snapError(code, status, data) {
  const err = new Error(code);
  err.code = code;
  err.status = status || 0;
  if (data && typeof data === 'object') err.detail = String(data.detail || data.message || '').slice(0, 200);
  return err;
}

function signedQuery(auth, query) {
  const params = new URLSearchParams();
  params.set('clientId', auth.clientId);
  Object.keys(query || {}).forEach(function (key) {
    const value = query[key];
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  params.set('timestamp', String(Math.floor(Date.now() / 1000)));
  return params.toString();
}

function signature(auth, path, query, body) {
  const payload = canonical({ content: body === undefined ? null : body, path: path, query: query });
  return crypto.createHmac('sha256', encodeURI(auth.consumerKey)).update(payload).digest('base64');
}

async function request(path, options) {
  const auth = credentials();
  if (!auth) throw snapError('unconfigured', 503);
  const opts = options || {};
  const method = opts.method || 'GET';
  const body = opts.body === undefined ? null : opts.body;
  const query = signedQuery(auth, opts.query);
  const headers = {
    accept: 'application/json',
    signature: signature(auth, path, query, body)
  };
  const init = { method: method, headers: headers, signal: AbortSignal.timeout(TIMEOUT) };
  if (body !== null) {
    headers['content-type'] = 'application/json';
    init.body = canonical(body);
  }
  let response;
  try {
    response = await fetch(BASE + path + '?' + query, init);
  } catch (err) {
    throw snapError(err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timeout' : 'network');
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (err) { data = null; }
  }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? 'auth'
      : response.status === 429 ? 'rate'
      : response.status >= 500 ? 'upstream' : 'rejected';
    throw snapError(code, response.status, data);
  }
  return data;
}

function seal(cred) {
  const key = cookieKey();
  if (!key || !cred || !cred.userId || !cred.userSecret) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = JSON.stringify({
    v: 1,
    userId: String(cred.userId),
    userSecret: String(cred.userSecret),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE
  });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return 'v1.' + b64url(iv) + '.' + b64url(encrypted) + '.' + b64url(cipher.getAuthTag());
}

function open(token) {
  const key = cookieKey();
  if (!key || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const iv = fromB64url(parts[1]);
  const encrypted = fromB64url(parts[2]);
  const tag = fromB64url(parts[3]);
  if (!iv || iv.length !== 12 || !encrypted || !tag || tag.length !== 16) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
    if (!payload || payload.v !== 1) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.userId !== 'string' || !payload.userId) return null;
    if (typeof payload.userSecret !== 'string' || !payload.userSecret) return null;
    return { userId: payload.userId, userSecret: payload.userSecret };
  } catch (err) {
    return null;
  }
}

function readCookie(req) {
  const header = String((req && req.headers && req.headers.cookie) || '');
  const parts = header.split(';');
  for (let i = 0; i < parts.length; i++) {
    const at = parts[i].indexOf('=');
    if (at < 0) continue;
    if (parts[i].slice(0, at).trim() === COOKIE) return parts[i].slice(at + 1).trim();
  }
  return null;
}

function cookieHeader(value, maxAge) {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (maxAge || MAX_AGE);
}

function clearCookieHeader() {
  return COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function newUserId() {
  return 'tiko-' + b64url(crypto.randomBytes(18));
}

function registerUser(userId) {
  return request('/snapTrade/registerUser', { method: 'POST', body: { userId: userId } });
}

function loginUrl(cred, redirect, locale) {
  const body = {
    connectionType: CONNECTION_TYPE,
    customRedirect: redirect,
    darkMode: true,
    connectionPortalVersion: 'v4'
  };
  if (locale === 'pt-BR' || locale === 'pt') body.locale = 'pt-BR';
  else body.locale = 'en';
  return request('/snapTrade/login', {
    method: 'POST',
    query: { userId: cred.userId, userSecret: cred.userSecret },
    body: body
  });
}

function deleteUser(cred) {
  return request('/snapTrade/deleteUser', {
    method: 'DELETE',
    query: { userId: cred.userId }
  });
}

function userQuery(cred) {
  return { userId: cred.userId, userSecret: cred.userSecret };
}

function listAccounts(cred) {
  return request('/accounts/all', { query: userQuery(cred) });
}

function listAuthorizations(cred) {
  return request('/authorizations', { query: userQuery(cred) });
}

function listPositions(cred, accountId) {
  return request('/accounts/' + encodeURIComponent(accountId) + '/positions/all', { query: userQuery(cred) });
}

function listBalances(cred, accountId) {
  return request('/accounts/' + encodeURIComponent(accountId) + '/balances', { query: userQuery(cred) });
}

module.exports = {
  COOKIE: COOKIE,
  MAX_AGE: MAX_AGE,
  configured: configured,
  credentials: credentials,
  canonical: canonical,
  signature: signature,
  signedQuery: signedQuery,
  seal: seal,
  open: open,
  readCookie: readCookie,
  cookieHeader: cookieHeader,
  clearCookieHeader: clearCookieHeader,
  newUserId: newUserId,
  registerUser: registerUser,
  loginUrl: loginUrl,
  deleteUser: deleteUser,
  listAccounts: listAccounts,
  listAuthorizations: listAuthorizations,
  listPositions: listPositions,
  listBalances: listBalances
};
