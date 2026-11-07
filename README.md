# TIKOTrade — evidence-first market analysis (MVP)

> Understand the setup, the evidence, and the risks — at a glance.

A zero-build, zero-dependency web app that produces the same structured read for every market:
snapshot, context, bull/bear evidence, key levels, conditional scenarios, risks and sources.
It also turns that read into a conditional **action plan** — trigger, stop loss, take profit,
reward-to-risk and risk-based position sizing — recomputed from the live price for crypto. Stop loss
and take profit can be overridden per symbol and lens, and the plan recalculates live. A paper trade
bot runs the same rules against a virtual ledger, picks its timing and candidates, asks before each
entry or opens them on its own, and manages its exits. An optional Alpaca connection can turn a
scan candidate into a live order — after you review and confirm it, or under a live autopilot grant
you explicitly enable for this tab. An Ideas page ranks those same setups with fixed, visible
weights so you can see which candidates score best, and a Buy / Sell page pairs the long and short
versions of each stock's plan side by side. The app does not predict prices, and live trading is
never on unless you connect a broker and grant it.

## Run it

No install, no build step.

- Open `index.html` directly in a modern browser (works from `file://`), **or**
- Serve the folder for the most reliable live-data behavior:

```bash
python -m http.server 8000
# or: npx serve .
```

Then open `http://localhost:8000`.

Live requests go to public APIs from your browser; stock quotes go through the same-origin
`/api/quote` proxy so the browser security policy stays strict. If a request fails or is
rate-limited, the app falls back to a clearly labeled synthetic sample and tells you why. The
serverless routes need Vercel (or another Node serverless host); a plain static local server still
runs the whole app but stock analysis falls back to sample data or an optional Alpha Vantage key.

## Deploying at tiko.app

The client is a static site configured for Vercel (`vercel.json`), with serverless routes for the
stock directory (`api/stocks.js`) and stock quotes (`api/quote.js`). To publish it:

1. Import this repository in Vercel as a static project. No framework, build command or output
   directory is needed — the repository root is served as-is.
2. Add `tiko.app` (and optionally `www.tiko.app`) under **Project → Settings → Domains**.
3. At the domain registrar, create the DNS records Vercel shows. Vercel's usual targets are:
   - apex `tiko.app` → A record `76.76.21.21`
   - `www` → CNAME `cname.vercel-dns.com`
4. Wait for verification; Vercel issues the TLS certificate automatically.

`index.html` declares `https://tiko.app/` as its canonical and Open Graph URL.

## Local data

TIKOTrade opens straight into onboarding or the dashboard once you are past the site's access gate;
there are no in-app accounts. Settings, watchlists, notes, feedback and plan levels stay in this
browser's local storage. They are not encrypted at rest. The optional Alpha Vantage key is kept in
tab storage and cleared when the tab ends. If a browser still holds data from the earlier
device-account build, the app folds the signed-in profile back into the shared local profile and
deletes the stored password hashes and session on first load.

The access request form and the optional access-pass checkout are where data leaves the device: a
request stores the name, email and note in the project's Redis for 14 days and emails them to the
owner; an access pass is paid through Stripe, which receives the buyer's email and handles the card
details, while the app stores only the email, pass length, expiry and amount in Redis and the access
code as a SHA-256 hash. Owner-issued signed codes contain only an expiry and a signature, so they
carry no personal data and are never stored. Nothing else about the visitor is collected, and the
request and buy pages are the only public pages that collect contact details.

## Private access gate

The deployment is private. Every page, script and API route passes through `middleware.js`, a Vercel
Edge Function that runs before any file is read:

- The owner password is stored only as `TIKO_ACCESS_PASSWORD` in Vercel Production; a second secret,
  `TIKO_SESSION_SECRET`, signs the session cookie. Neither value is in the repository. Only the
  owner signs in with a password — everyone else needs a personal code or a paid access pass.
- A correct password sets `tiko_access` — HttpOnly, Secure, SameSite=Lax, seven days. `/logout`
  clears it, and Settings has a Sign out button.
- The signed session records whether it came from the owner password or a personal code.
  `/api/session` reports that role to the app, which brands the owner's profile with an Owner
  badge; the route requires a valid session and is never cached. Older cookies stay valid and
  simply show no role until the next sign-in.
- Missing either variable fails closed: every request redirects to `/login?error=setup` and the API
  returns `401`, so an unconfigured deployment never serves the app.
- Eight wrong passwords or codes from one IP in ten minutes lock that IP out for the rest of the window.
- `/login` and `/request` are the only public form pages, with a `default-src 'none'` policy, and
  every response carries `X-Robots-Tag: noindex, nofollow`. `/buy` and `/purchase/success` are also
  public, and `/admin` and `/admin/review` are owner-only.
- Staging can delegate sign-in to Vercel. When `VERCEL_ENV` is `preview` and `TIKO_PREVIEW_OPEN` is
  `1`, requests that already passed Vercel Authentication are treated as the owner, so every device
  signed into the owner's Vercel account opens the app without a second password. Keep Deployment
  Protection on in this mode: it is the only gate. Production and local runs ignore the flag.

## Owner-issued member codes

The owner does not need Redis or email to let someone in. Settings shows a **Member codes** button
to an owner session; it opens `/admin`, which mints codes on the spot:

- A code looks like `TK1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` (33 characters). It packs a version byte, a
  32-bit expiry and a 10-byte HMAC-SHA-256 of that expiry, all signed with `TIKO_OWNER_KEY` and
  encoded in Crockford-style base32.
- The owner picks 1, 7, 14 or 30 days. A code works until it expires and can be reused by anyone who
  has it, which suits a small group rather than one named person.
- Verification is stateless: the middleware checks the expiry and signature offline, so no KV,
  Resend or network call is involved, and issues the normal 24-hour member session.
- Codes cannot be revoked one at a time. Rotating `TIKO_OWNER_KEY` invalidates every issued code
  and every outstanding review link. KV-issued codes still work alongside signed codes when Redis
  is configured.
- `/admin` requires an owner session: members get `403`, guests are sent to `/login`, legacy
  sessions must sign in again, and submissions must be same-origin. A missing signing key shows an
  error instead of issuing a weak code.

## Access requests

People the owner has not met can ask for access; nobody gets in until the owner approves:

1. A visitor opens `/request` and sends a name (optional), email and note.
2. The middleware stores the request in Redis and emails the owner with a signed review link.
   No email or KV database means the form reports that requests are closed; it never half-works.
3. The owner opens the link and chooses **Approve** or **Deny**. Only approval generates a code.
   The review link is signed with `TIKO_OWNER_KEY`, expires after seven days, and every action is a
   POST, so mail scanners cannot approve anyone.
4. On approval the app emails a personal code (`XXXX-XXXX-XXXX`), valid for 30 days, to the
   requester. The owner can reissue a fresh code or revoke access from the same link.

Personal-code sessions last 24 hours, so revoking a code takes effect the next day at the latest;
owner-password sessions last seven days. Requests are deduplicated by email, limited to five per
address per hour, and protected by a honeypot field and an origin check. If the approval email cannot
be delivered (for example, no verified sending domain yet), the review page shows the code once for
the owner to forward.

## Access passes

People without an owner code can buy time instead of asking for one:

1. `/buy` offers a 7-day pass for $5 and a 30-day pass for $12. Each button posts to `/api/checkout`.
2. The middleware creates a Stripe Checkout Session server-side with the price ID from
   `STRIPE_PRICE_7D` or `STRIPE_PRICE_30D` and the pass length in metadata, then redirects to
   Stripe's hosted page. Card details never reach this app and no Stripe script is loaded, so the
   CSP stays `script-src 'self'`.
3. Stripe returns the buyer to `/purchase/success?session_id=...`. The middleware fetches that
   session from Stripe, accepts it only when `payment_status` is `paid`, records the pass in Redis
   (email, days, expiry, amount), and signs the browser in with a member cookie that expires with
   the pass. It also mints a reusable `XXXX-XXXX-XXXX` code, stores only its SHA-256 hash with the
   pass expiry, and emails the code through Resend for use on another device.
4. `/api/stripe-webhook` records the same pass from `checkout.session.completed` (and
   `checkout.session.async_payment_succeeded`), so a buyer who closes the tab after paying still gets
   access and the emailed code. It verifies the `Stripe-Signature` HMAC against
   `STRIPE_WEBHOOK_SECRET` with a five-minute timestamp tolerance, ignores unpaid or unrelated
   events, and uses Redis `SET NX` so redelivery cannot duplicate a pass or an email.

Passes do not renew, and Stripe holds the card data. The app keeps only the email, pass length,
expiry, amount and currency in Redis for 90 days so an old success link cannot reactivate a pass,
plus the code hash until the pass expires. Refunds, tax and receipts are handled in the Stripe
Dashboard; a refund does not revoke an already-recorded pass, so delete `tiko:pass:<session_id>` and
the matching `tiko:code:<hash>` to end it early. If Resend is not configured, the code is still shown
once on the success page.

A pass and any code it mints are member-level: they open the app but get `403 Owner only` from
`/admin`, cannot mint codes, and map to `{ "role": "member" }` at `/api/session`. `TIKO_ACCESS_PASSWORD`
and `TIKO_OWNER_KEY` stay in Vercel's environment and are never rendered, emailed, logged or stored
in Redis; rotating either one ends the surfaces that depend on it and nothing else.

### Gate environment variables

| Variable | Purpose |
| --- | --- |
| `TIKO_ACCESS_PASSWORD` | Owner password, entered at `/login` |
| `TIKO_SESSION_SECRET` | Signs the `tiko_access` session cookie |
| `TIKO_OWNER_KEY` | Signs member codes and review links (rotate to invalidate all of them) |
| `TIKO_PREVIEW_OPEN` | Set to `1` on Preview only: trust Vercel Authentication as the owner (requires Deployment Protection) |
| `TIKO_OWNER_EMAIL` | Where access requests and review links are sent |
| `RESEND_API_KEY` | Resend key used for both emails |
| `TIKO_MAIL_FROM` | Optional sender, e.g. `TIKOTrade <access@yourdomain>`; defaults to `onboarding@resend.dev` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV / Upstash Redis REST credentials |
| `STRIPE_SECRET_KEY` | Server-side Stripe key for creating Checkout Sessions and re-checking payments |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/stripe-webhook` (from the Stripe webhook endpoint) |
| `STRIPE_PRICE_7D`, `STRIPE_PRICE_30D` | Stripe Price IDs for the $5 and $12 passes |

Purchases need Stripe, KV, Resend (for the emailed code) and both Price IDs. The buy page prints
$5 and $12; keep those labels in step with the Stripe Prices. Register
`https://<your-domain>/api/stripe-webhook` in the Stripe Dashboard and copy its signing secret.
Without `STRIPE_SECRET_KEY` the buy page reports that passes are closed and the app stays code-only.

`TIKO_KV_URL`/`TIKO_KV_TOKEN` and `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are also read.
KV-issued codes are stored as SHA-256 hashes; the plaintext code is shown on the review page for one
day only. Signed codes from `/admin` need neither service.
Resend can email the owner without a verified domain, but emailing arbitrary requesters needs one.

To change the owner password, update `TIKO_ACCESS_PASSWORD` in Vercel and redeploy; existing cookies
stay valid until they expire. Rotating `TIKO_SESSION_SECRET` signs everyone out.

## No ads, no third-party scripts

The app ships no ad slots, ad SDKs, trackers or third-party scripts, and the deployment enforces
that with a Content-Security-Policy (`vercel.json`):

- `script-src 'self'` — only the app's own `js/*.js` files execute; injected ad or tracker scripts are refused.
- `frame-src 'none'`, `object-src 'none'` — no remote ad frames, interstitials or plugins can render over the UI.
- `connect-src` permits only the same-origin stock APIs (`/api/stocks`, `/api/quote`), the market data endpoints (`api.coingecko.com`, `www.alphavantage.co`, `api.frankfurter.dev`) and Alpaca's trading hosts (`api.alpaca.markets`, `paper-api.alpaca.markets`); Yahoo Finance is reached by the serverless proxy, never directly by the browser.
- Browser storage is local to the device. Watchlists, notes and settings use `localStorage`; the optional Alpha Vantage key uses `sessionStorage` and is cleared when the tab ends. Browser storage is not encrypted at rest.
- No third-party search redirect: ticker lookup stays in the app through the catalog, Markets page and U.S. stock directory.
- `frame-ancestors 'none'` plus `X-Frame-Options: DENY` — no other site can wrap the app in a frame with its own overlays.
- HSTS, same-origin opener/resource policies and restrictive cross-domain policy headers add transport and origin isolation.
- Fourteen Vercel WAF rules deny unsafe stock, quote, checkout and webhook methods, requests missing
  their required parameters, oversized symbol lists, secret-file probes and common CMS probes;
  scanner-like API clients receive a challenge. Vercel's platform firewall also applies its managed
  DDoS mitigation automatically.

Assets are served from the same origin (fonts and images are local), so nothing is loaded from a
CDN that could inject content. Keep this policy in place if you change hosting.

## Tests

All suites run on Node's built-in test runner (Node 20+) with no dependencies:

```bash
node --test tests/access.test.js tests/access-requests.test.js tests/owner-codes.test.js tests/purchases.test.js tests/tradeplan.test.js tests/bot.test.js tests/broker.test.js tests/session.test.js tests/copilot.test.js tests/chartread.test.js tests/overlay.test.js tests/market-notifications.test.js tests/quote-proxy.test.js tests/brokers.test.js tests/theme.test.js
# or: npm test (when Node is on PATH)
```

The action-plan suite covers the long/short state machine, directional copy, sample practice mode,
determinism, stop buffers, exit-level suggestions, fixed-fractional sizing and account caps,
editable stop/take-profit overrides, validation errors, warnings, and EN/ES key coverage (25 tests).
The copilot suite covers brief headlines for every plan state, EN/ES intent routing with synonym
and typo tolerance, grounded answers for each topic (including stop-loss/take-profit suggestions for
an active plan, a directional lean and a neutral read), a dedicated buy/sell answer that pairs the
evidence score with the conditional plan, failing confirmation checks, extended and sample modes,
both-sided exits for a neutral read, simplified versions of every topic triggered by plain-language
requests, selected-side trade actions with and without
a simulation, chart-image answers with and without a
scan, answer caching, sample warnings, fallback scope, citations and follow-ups, determinism, and
EN/ES key coverage (38 tests). The chart-reader suite covers plot detection, candle and line
direction, support/resistance touches, flat and choppy trend reads, rejection of non-chart
screenshots, and empty or too-small images against synthetic RGBA fixtures (8 tests). The overlay
suite covers screen-share and floating-window capability detection, compact reads from a synthetic
chart, drawn frame and level geometry, the price marker and direction badge, empty-frame clearing,
and EN/ES key coverage (5 tests). The
market-alert suite covers weekday, weekend,
holiday and early-close sessions, the Sunday-to-Friday forex week, DST boundaries, pre-close
reminders, duplicate suppression, disabled groups, notification permission gating and EN/ES alert
copy (12 tests). The quote-proxy suite covers response normalization, intraday session slicing,
batch quotes, cache reuse, input validation and safe upstream error codes (5 tests). The access
suite covers password matching, session issue and verification, tampered, expired and malformed
cookies, logout, redirect sanitizing, the fail-closed setup path, preview trust mode and the
owner/member role returned by `/api/session`, including legacy cookies (13 tests). The access-request
suite covers request storage and owner email, the honeypot, email validation, deduplication,
cross-origin posts, approval, denial, code email and code login, wrong, expired and revoked codes,
tampered review links, sender failures, throttling and the disabled configuration (10 tests), with
Redis and Resend replaced by in-memory fakes. The owner-code suite covers the owner-only generator,
guest redirects, member and legacy-session refusals, code shape and expiry, member login and reuse,
offline issuing without KV or mail, tampered, expired and foreign-key codes, rotation, duration and
origin validation, and the missing-key path (9 tests). The broker-reference suite checks EN/ES copy
parity,
that every broker key resolves, the six-region and 20-question scope, the official-register list,
local checklist persistence and reset, and a full render smoke test (5 tests). The theme suite
covers the dark default, preference normalization, system resolution against the device setting,
`data-theme` and theme-color writes, persistence, EN/ES copy and the live system listener (7 tests).
The bot suite covers state normalization, the open/watch/skip decision matrix, timing windows and
candidate ranking, the ask-mode proposal queue and its expiry and cap, approve and decline, the
disabled, duplicate and position-limit guards, sized entries, stop gaps filled at the worse price,
target fills, short mirroring, plan flips closed at market, breakeven and trailing exits, the
deterministic persona voice, EN/ES copy coverage, stats, start/pause and deterministic output (24
tests). The broker
suite covers key normalization and session storage, live and paper base URLs, Alpaca headers,
account/position/order normalization, connect saving only after a successful account call, the
canTrade gate, bracket-order construction and its crypto/short/fractional rejections, the
explicit-confirmation gate, the POST payload and upstream error mapping, and the session-scoped
autopilot grant (13 tests), with fetch and session storage injected. The session suite covers the
one-shot role lookup, owner/member mapping, unknown and missing roles, rejected lookups and the
no-fetch fallback (5 tests). The purchase suite covers the public buy page, server-priced Checkout
Sessions, pass metadata and return URLs, foreign, unknown, failed and burst checkouts, webhook
signature, timestamp and secret checks, paid-pass storage and emailed codes, redelivery
idempotency, unpaid and unrelated events, success-page verification, auto sign-in with a
pass-length cookie, invalid and unpaid claims, replay after expiry, late claims that never extend a
pass, member-only access with no route to owner surfaces, owner secrets absent from every page and
email, and the closed state without Stripe (13 tests). All seventeen suites total 206 tests.

## What is in the MVP

- **No in-app accounts** — once past the shared-password gate, the app opens directly into
  onboarding or the dashboard; TIKOTrade has no synced accounts, avatars or in-app passwords. The profile
  menu labels an owner-password session as Owner; everything else stays device-local.
- **Local-first storage** — data remains in this browser profile.
- **Date and time** — a live clock with weekday, date, time and time zone appears in the top bar on
  every screen. The alerts panel shows the exact Eastern Time date and time of the next U.S. stock or
  forex session event alongside the countdown.
- **Onboarding** — experience, markets, time horizon, preferred analysis, risk comfort, language.
  Answers are editable later in Settings and drive the default lens and copy density.
- **Dashboard** — a hero read of the current session (watchlist count, six lenses, no automatic
  orders), U.S. stock directory, on-demand live FX quotes, watchlist, recent analyses, market
  overview, and reference events. Recently opened analyses and non-catalog tickers are persisted
  with enough metadata to reopen them.
- **Broker landscape reference** — an educational `#/brokers` page maps how retail
  brokers and trading apps in emerging markets are structured, regulated and priced: six regional
  directories, provider archetypes, a five-level regulation ladder, compensation schemes, a fee
  taxonomy with cost traps, indicative all-in costs, asset-class notes, tax prompts, a 20-question
  due-diligence checklist with local progress, red flags, 2026–28 trends and links to official
  regulator registers. Firms appear as examples only — never as endorsements, rankings or
  recommendations — and the page itself opens no account and routes no order. The separate Alpaca
  connection on `#/bot` is optional, confirmation-gated, and never enabled by this page.
- **Paper trade bot** — an on-device, deterministic simulator on `#/bot` that scouts the watchlist
  plus a short U.S. stock list, ranks candidates by timing window and reward-to-risk, and enters
  only when the same plan rules used on the Analysis page are active or triggered with at least
  medium confidence and 1.3R. Entries are sized from the account size and risk percentage in
  Settings. Each candidate is labelled with its timing: **now** (setup in play or triggered),
  **armed** (price within 0.35 ATR of the trigger) or **waiting**. You choose how much autonomy it
  has: **ask every time** queues proposals that you approve or decline (five at a time, expiring
  after 30 minutes), while **on its own** opens paper positions directly. It manages exits itself —
  stop, target, flipped plan, breakeven once the trade is up one risk unit and a half-R trail at
  1.5R. It keeps a virtual ledger, equity curve, win rate and R multiples in this browser, has a
  recognizable voice and mood, and scans about once a minute while the page is open and the bot is
  running, so stops and targets are checked on a fresh quote. It runs on simulated data by default
  and its results are not a forecast of real performance.
- **Screen-share overlay** — `#/overlay` shares a trading window, tab or display with the browser's
  own picker, reads the price shape on-device every few seconds and draws its read over the capture:
  the detected plot frame, support and resistance lines, the last-price marker and a
  direction/confidence badge. Nothing is uploaded, recorded or stored, and no camera is used;
  stopping the share, closing the source or leaving the page ends capture immediately. **Float
  overlay** opens a small always-on-top Document Picture-in-Picture window (Chrome or Edge 116+)
  that mirrors the share and keeps the read visible while you work in another app. The floating
  window sits above other apps — a browser page cannot draw inside them. The side card shows the
  bot's conditional plan for the symbol you name, and the stance card mirrors any open paper
  position. A shared chart carries no ticker, axis values or timeframe, so the read is a shape
  estimate, not a quote, and the overlay never places an order.
- **Optional Alpaca broker** — the bot page can connect an Alpaca account from this tab. Keys are
  kept in `sessionStorage` (`gt.broker.v1`), sent only to Alpaca, never stored on a server, and
  cleared when the tab closes or you disconnect. You choose live or paper mode; the card shows the
  account status, equity, buying power, broker positions and open orders. For a scan candidate the
  bot can build an order ticket, but nothing is sent until you tick the acknowledgement and press
  **Send order**. Tickets are offered only for live stock scans less than an hour old. An explicit
  **live autopilot** grant is the one exception: after a separate acknowledgement, the grant lives
  in `sessionStorage` (`gt.broker.autopilot.session.v1`), dies with the tab, and lets the bot submit
  at most one long stock or ETF bracket order per scan. Pausing the bot, disconnecting the broker,
  changing mode or leaving auto mode revokes it — the pause button is the kill switch. This build
  sends long stock and ETF entries as whole-share market buys with a bracket stop and target; short
  setups and crypto stay on the paper ledger. TIKOTrade is not affiliated with Alpaca, and the app
  is not investment advice.
- **Ideas page** — `#/ideas` ranks the supported U.S. stocks with the same analysis and plan rules
  used elsewhere. A fixed weighted score (directional evidence 30, trend 20, reward-to-risk 18,
  setup state 15, liquidity 8, volume 5, confirmation checks 4) is reduced by visible penalties for
  sample data, extended or invalidated setups, high volatility, thin liquidity, low-confidence
  evidence and stretched RSI. Each idea card shows its rank, score, tier, the top two evidence
  reasons, confirmation checks, plan levels and the main risk, and links to the full plan. The page
  caps the shortlist at six ideas and two per sector, marks which setups are executable under the
  plan rules, labels sample data, and lists the weights on the page. The ranking is a transparent
  review aid built from fixed rules — not a personalized recommendation, a rating service, a price
  forecast or a guarantee.
- **Buy / Sell page** — `#/sides` shows, for every supported U.S. stock, what a long and a short
  case would look like from the same analysis. Each row pairs the two directions side by side: the
  buy panel carries the entry, stop and target for a long plan, and the sell panel the mirrored
  short plan, each with reward-to-risk, risk and reward per share and the distance to target and
  stop. The row header shows the quote, the change and the last-bar lean, and the panel that matches
  the lean is marked. Both panels are conditional reads produced by the same `tradeplan` rules the
  analysis page uses — a forced direction gets a transparent hypothetical scenario even when the
  rule-based setup has no edge, and sample data is labelled and never sized. Rows are ordered by the
  strength of the lean. Neither panel is a recommendation to trade either direction.
- **Analysis page** — identical seven-section structure for every asset:
  1. Snapshot (price, timeframe, data timestamp)
  2. Market context (trend, volatility, liquidity, momentum, news/event coverage)
  3. Bull case / bear case, each with its counter-case
  4. Key levels (swing points, averages, round numbers)
  5. Scenarios, each with trigger, what strengthens it, and invalidation
  6. Risks (data limits, missing feeds, model caveats)
  7. Sources (provider, retrieval time, series end, method)
- **Interactive chart** — the snapshot chart draws closes, averages and key levels from the same
  series. A fullscreen button expands it to the whole viewport and back; Escape also exits, and
  focus stays on the toggle. Browsers without the Fullscreen API get an in-page overlay with the
  same behavior.
- **Action plan** — a deterministic, conditional plan derived from the same facts: wait / unconfirmed /
  active / extended / invalidated / no-trade states, the level that activates it, the stop loss,
  the take profit, reward-to-risk, a confirmation checklist and risk-based sizing
  (account size × risk % ÷ distance to stop loss). Stop loss and take profit are editable inline:
  leave a field blank for the suggested level, enter a price to override it, or reset to suggested.
  Overrides are validated against the entry (stop on the losing side, take profit on the winning
  side), stored per symbol, asset class and lens, and update R:R and position size immediately.
  When there is no confirmed setup, the card adds structure-based suggested stop loss and take
  profit for the side Boom leans toward (both sides when the read is neutral), using the same ATR
  band, support/resistance and 1.3R/2R target rules as the plan. Crypto plans re-check the live
  spot quote every 60 seconds (paused while the tab is hidden, a dialog is open or the card has
  focus). No order is ever placed.
- **Ask-the-chart copilot** — an on-device assistant that turns the page's own facts into faster
  answers. A live brief summarizes the state, trend, location, momentum and volatility; suggested
  questions cover buy/sell, the setup, trade actions, stop loss and take profit, key levels,
  invalidation, trend, volatility, volume, scenarios, evidence, the chart, and data freshness. A
  buy/sell question is answered by grading the evidence scores, stating the plan's current side and
  state, listing the trigger/entry/invalidation/target with R:R and position size, showing which
  confirmation checks pass or fail, and naming the levels that would flip the read — never by telling
  the user to buy or sell. Asking in plain language ("explain simply", "in simple terms", "explicalo
  simple") returns a shortened version of any topic with the same facts and levels, and the prompt
  chips include a one-tap "Explain this simply". You can also drop,
  paste or choose a
  chart screenshot from a trading app: it is decoded and measured in the page, never uploaded. The
  scanner reports the plot shape — direction, net move, position in range, volatility, trend fit,
  support/resistance touches and candle balance — and the copilot grounds image and chart answers in
  that read. It reads shape only, not ticker, axis values or timeframe, and says so. The
  stop/take-profit answer repeats the
  active plan levels, or derives structure-based suggestions from price, ATR and nearby levels when
  there is no confirmed setup — one side when the read leans, both when it is neutral. After you
  choose Buy or Sell, **Ask Boom about this side** turns that selection into ordered conditional
  steps — trigger or entry, invalidation, first reference target, R:R and risk-based size — and
  pairs them with the simulation's resampled outcome bands and target-first/stop-first path shares.
  It states plainly that it does not predict prices: the steps are the plan's conditional rules and
  the ranges are historical resampling, not calibrated probabilities. Answers are composed locally
  from the same facts and fixed rules, cite the sections they come from (select a
  citation to jump there), and refresh with the live plan and the selected language. The suggestions
  are conditional estimates, not forecasts. No external model, no network request.
- **Six lenses** — Day, Swing, Long term, Options, FX & futures, Beginner. They are tailored views of
  the same core read, not separate products. Each lens re-weights what is emphasized.
- **Market session alerts** — on by default and managed from the bell in the top bar. Reminds you
  when the U.S. stock session opens, 15 minutes before the close, and at the close (including early
  closes and exchange holidays), plus the Sunday open and Friday close of the forex week. The bell
  panel shows whether each market is open or closed and when the next event is due. Alerts are
  scheduled on this device while TIKOTrade is open; browser notifications are optional and need
  permission. Crypto trades continuously, so it has no daily open or close.
- **Settings** — profile chips, appearance (dark, light or system), default lens, language (English, Spanish, French, Brazilian Portuguese), data mode (`auto` / `sample`),
  sizing account and risk per trade, optional Alpha Vantage key, market alert groups, feedback export, and full local reset.
- **Feedback and notes** — helpful / inaccurate / missing context, plus a free-text comment and a
  per-symbol note. Stored locally, exportable as JSON.

## Data sources and honesty rules

| Market | Default source | Labeling |
| --- | --- | --- |
| Crypto | CoinGecko public API (`/coins/markets`, `/market_chart`) | `LIVE` with retrieval timestamp, or `SAMPLE` |
| Stocks | Yahoo Finance chart API through the same-origin `/api/quote` proxy (no key) | `LIVE` / delayed, retrieval and quote timestamps; 2 years of daily bars or 5-minute intraday bars |
| Stocks (optional fallback) | Alpha Vantage (`TIME_SERIES_DAILY`, `GLOBAL_QUOTE`) with your own key | `LIVE` / `DELAYED`, end-of-day bars |
| Stocks (offline) | Synthetic seeded series | `SAMPLE`, watermark and banner; exchange is the listing venue |
| FX reference rates | Frankfurter (`/v2/rates`, `/v2/currencies`, `/v2/providers`) | Latest published daily reference rate, source and date; not real-time trading quotes |
| U.S. stock listings | Nasdaq Trader symbol directories (`nasdaqlisted.txt`, `otherlisted.txt`) | Current Nasdaq, NYSE and NYSE Arca listings; directory names only, never prices |

- Sample data is generated with a seeded geometric random walk so it is stable per session and asset.
  It is explicitly labeled in the header, chart, banner and sources. It is never presented as a quote.
- Every number can be traced: the Sources section lists provider, API URL, retrieval time and series end.
- News, sentiment, earnings and macro calendars are **not** connected. The UI says so in context,
  risks and sources instead of implying coverage.
- Crypto series are fetched with a 14-second timeout, serialized requests, in-memory TTL caches
  (45–90 seconds) and a single overview call to reduce rate-limit pressure.
- Intraday availability depends on the provider. When a provider cannot supply intraday bars, the
  analysis reports the actual interval used rather than silently substituting it.
- The dashboard stock directory searches the current official symbol listings through `/api/stocks`.
  It excludes test issues, ETFs and non-stock instruments. Opening a result requests live bars and a
  quote through `/api/quote`; the same proxy supplies dashboard sparklines and watchlist quotes.
- The quote proxy is GET-only, validates tickers against `^[A-Za-z0-9.^=-]{1,16}$`, accepts at most
  ten symbols per batch request, keeps a short in-memory cache and sets edge cache headers
  (30 seconds intraday, 120 seconds daily, 45 seconds for batches). It forwards no cookies or user
  identifiers, only the requested symbols. Yahoo Finance data is public and typically delayed.

### Optional Alpha Vantage fallback (stocks)

1. Get a free key at <https://www.alphavantage.co/support/#api-key>.
2. Open **Settings → Data sources**, paste the key, and use **Test key**.
3. The key is kept in this tab's `sessionStorage` and is sent directly to Alpha Vantage only when the
   live quote proxy is unavailable. It is cleared when the tab session ends.
4. FX reference rates use Frankfurter and need no API key.
5. Any remaining market-data failure falls back to clearly labeled sample data where available.

## Design

The interface uses a cosmic portal language: near-black violet surfaces, neon magenta for the
primary action, cyan for secondary outlines, and the bundled **Chakra Petch** display face for
headings, labels and controls. Cards carry a colored top edge and the hero backdrop is a generated
portal scene with a dark left third reserved for copy.

- Hero art: `assets/img/hero-portal.jpg` (generated for this project).
- Fonts: Chakra Petch 600/700 — SIL Open Font License 1.1, see `assets/fonts/OFL.txt`.
- Everything is local: no font CDN, icon pack or chart library is fetched at runtime. Charts are
  drawn as inline SVG, icons as inline paths.
- The starfield, HUD stat bar and card edges are CSS-only; all motion respects
  `prefers-reduced-motion`, and copy stays readable without the backdrop.

### Appearance

Dark is the default. **Settings → Appearance** offers **Dark**, **Light** and **System**; the
preference is stored in `gt.settings.v1` and applied as `data-theme="dark|light"` on `<html>` before
the first render, with the `theme-color` meta updated to match. **System** follows
`prefers-color-scheme` and re-applies when the device setting changes. The light palette keeps the
comic-book framing in ink-on-paper colors, while the hero panel and chart surfaces stay dark so the
generated art and SVG axis labels keep their contrast.

## Architecture

Classic scripts sharing a `window.TA` namespace, loaded in dependency order by `index.html`.

```
index.html          script order, app roots
styles.css          design tokens, layout, components, responsive rules
js/util.js          escaping, formatting, DOM helpers, seeded RNG, storage helpers
js/i18n.js          EN/ES dictionaries, core FR/PT-BR translations, and templating ({{var}})
js/store.js         settings, watchlist, recents, notes, feedback (localStorage)
js/theme.js         dark/light/system preference, data-theme and theme-color
js/market-notifications.js  exchange calendars, session state, local open/close alerts
js/indicators.js    SMA, RSI(14), ATR, realized volatility, pivots, drawdown
js/catalog.js       supported assets, search, sample-series parameters
js/data.js          providers, caching, fallback, stock quote proxy, overview/quotes, FX rates
js/analysis.js      rule-based engine: evidence, levels, scenarios, risks
js/tradeplan.js     conditional action plan, state machine, position sizing
js/bot.js           deterministic paper-trading loop, proposals, exits, persona and stats
js/recommend.js     deterministic ranking of stock setups: weighted score, tiers, sector cap
js/sides.js         one analysis input → mirrored buy and sell plan cases with per-share risk
js/broker.js        optional Alpaca client: session keys, account, positions, orders, confirm gate, autopilot grant
js/copilot.js       on-device brief and question answering over facts, plan and levels
js/chartread.js     on-device screenshot scanner: plot bounds, direction, levels, confidence
js/overlay.js       screen-share capture, frame scanning and the drawn read (no upload)
js/charts.js        SVG line charts and sparklines
js/ui.js            icons, modal, toast, search combobox, glossary, badges
js/views/*.js       onboarding, dashboard, ideas, sides, analysis, settings, brokers reference, paper bot, overlay
js/app.js           shell, hash router, language refresh, appearance, boot
```

Data flow: `views → data.getMarketData(asset, {timeframe}) → {asset, candles, quote, meta}`.
`meta` carries `dataMode`, provider URLs, timestamps, interval, bar count and fallback reasons.
The analysis engine is deterministic: it computes indicators locally, scores evidence for and
against, derives levels from structure, and generates scenarios and risks. `tradeplan.build` is a
pure function of those facts plus an optional live price, so the same inputs always produce the same
plan. `tradeplan.exits` is a pure helper that reuses the same stop and target rules to suggest exit
levels for a hypothetical position — one side when the lean or the caller picks one, both when the
read is neutral — and it never marks those suggestions as a confirmed setup. The copilot is
deterministic too: `copilot.brief` and `copilot.answer` compose copy from those same facts, the
current plan, the selected side's `simulation.run` output and local intent rules, so the brief stays
in sync with live plan updates and every answer traces back to the page. Screenshot reading is local too: the browser decodes the image,
downscales it on a canvas and `chartread.scan` classifies background, ink and candle colors to
measure the plotted series. The file never leaves the device, and the scanner reports shape only, so
the copilot labels axis values and timeframe as unread. No LLM is involved and nothing is sent to a
server by this app. Account size and risk percentage are stored only in `gt.settings.v1`; the plan
never sends an order anywhere. The paper bot is pure as well: `bot.scan` takes the current ledger
and a list of asset/analysis/plan inputs, manages open positions (including breakeven and trailing
stops), ranks new candidates by timing window and R:R, and returns a new ledger, events and
decisions. In ask mode it queues proposals instead of opening; `bot.approve` and `bot.decline` then
move or drop them. `bot.voice` chooses a persona line from a seed, so the copy is reproducible. The
view only fetches market data and stores the result under `gt.bot.v1`. `recommend.rank` is pure too: it scores a list of
asset/analysis/plan inputs with fixed weights, applies the visible penalties, sorts by score and
reward-to-risk, caps the shortlist per sector and returns ideas plus deferred candidates. The Ideas
view only fetches the catalog's daily series and feeds the same analysis, plan and decision
functions used everywhere else. `sides.build` is pure too: it runs `tradeplan.build` twice on the
same analysis with the side forced long and short, then reports both conditional cases, their
per-share risk and reward and whether each case is actionable; it never promotes a hypothetical
scenario to a confirmed setup. The Buy / Sell view only fetches the catalog's daily series and sorts
rows by the strength of the lean. The single network path to a broker is `broker.submit`, which is reachable
from the review dialog after the acknowledgement checkbox is ticked, or from a scan while a live
autopilot grant is present; `broker.submit` itself rejects any call whose `deps.confirm` is not
exactly `true`, and the grant can only be created for live keys. The grant is read at scan time,
never covers crypto or short setups, and is cleared by pause, disconnect, a mode change or leaving
auto mode. Keys are read from session storage at call time and are never written to the ledger, the
DOM, logs or a server.

Storage keys: `gt.settings.v1` also holds `theme` (`dark`, `light` or `system`), `accountSize` and
`riskPct` for the sizing calculator.

Routes: `#/`, `#/ideas`, `#/sides`, `#/markets`, `#/bot`, `#/brokers`, `#/settings`, `#/analysis/:symbol?style=&cls=&id=&name=`.
The two extra query parameters let non-catalog crypto assets (resolved via CoinGecko search) reopen
correctly from recents or the watchlist.

### Storage keys

`gt.settings.v1`, `gt.watchlist.v1`, `gt.recents.v1`, `gt.notes.v1`, `gt.feedback.v1`,
`gt.planlevels.v1`, `gt.brokerchecks.v1`, `gt.bot.v1`, and — in session storage only —
`gt.broker.v1` and `gt.broker.autopilot.session.v1`. `gt.market-alerts.last-event.v1` records the last delivered session alert so a
reload does not repeat it; alert preferences live in `gt.settings.v1`. Legacy device-account keys
(`gt.auth.*`) and per-account data (`gt.u.<uid>.*`) from the old sign-in build are migrated into the
shared profile and removed on first load.
Recents are capped at 12 (deduped by symbol), feedback at 300 items, notes at 2,000 characters.
`gt.brokerchecks.v1` stores only the boolean state of the broker due-diligence checklist; it is
cleared by the checklist reset and by Reset all data.
`gt.bot.v1` holds the paper ledger: running state, approval mode, open and closed positions,
pending proposals, the last scan's decisions, the activity log (200 entries), realised P&L and up
to 120 equity snapshots. Open positions are capped at 2, 3 or 5 by the page control, proposals at
five with a 30-minute expiry, closed trades at 120. The bot's reset button and Reset all data both
clear it.
`gt.broker.v1` is the exception: it holds the Alpaca key ID, secret and mode in `sessionStorage`
only, is never serialized into the ledger or a reset export, and disappears when the tab closes.
`gt.broker.autopilot.session.v1` holds the live autopilot grant and nothing else; it requires live
`gt.broker.v1` keys to be read, covers one long stock or ETF order per scan, and is removed by
pause, disconnect, a mode change or leaving auto mode. The app holds no server-side copy.
Plan overrides are keyed by `symbol|assetClass|lens` and keep only positive, direction-valid prices.
Personal notes, watchlists and feedback stay in this browser unless feedback is exported. Market-data requests go directly from the browser to the named provider, except stock quotes, which pass through TIKOTrade's same-origin `/api/quote` proxy to Yahoo Finance.

### Adding a market data provider

1. Add an adapter in `js/data.js` that returns
   `{ asset, candles, quote, meta }`, with `meta.dataMode`, `provider`, `providerUrl`,
   `retrievedAt`, `seriesEnd`, `interval`, `timeframe`, `barCount`, `fallback`.
2. Route it inside `getMarketData` based on `asset.assetClass` (or a new field), keeping the
   sample fallback and its `fallbackReason`.
3. Add symbols and descriptors to `js/catalog.js`, including a stable id for external lookups.
4. If the provider needs search for unknown tickers, extend `resolveSymbol`.
5. Keep the honesty contract: label live vs. delayed vs. sample, expose timestamps, and update the
   Sources section if the provider changes.

The Markets page (`#/markets`) searches the official Nasdaq Trader directories for Nasdaq, NYSE and
NYSE Arca stocks, and loads current and legacy currency codes, latest rates, and source attribution
from the public Frankfurter API. Rates can be filtered by provider. Frankfurter rates are daily
reference rates, not intraday trading quotes; they require internet access but no API key. Stock
directory entries are real listings; opening one loads live delayed daily or 5-minute bars from
Yahoo Finance through `/api/quote`, with sample data only as the labeled offline fallback.

### Adding a language

Add a dictionary to `js/i18n.js` and an entry to `langs`. Translate interface and generated-analysis
strings; untranslated keys fall back to English. The language is applied on change and persists in
settings. French and Brazilian Portuguese currently cover core screens, with detailed analysis copy
still being translated.

## Accessibility and UX notes

- Skip link, labeled landmarks, `aria-pressed` chips, `aria-selected` tabs, focus-trapped modals,
  visible focus styles, reduced-motion support.
- The copilot form is keyboard-first: labeled input, live `role="log"` thread, suggested-question
  buttons and citations that move focus to the cited section instead of changing the route.
- Chart screenshots can be chosen with the labeled file input, dropped on the copilot card, or
  pasted while the form has focus; scan results are announced as text and the clear button resets
  them.
- Responsive from narrow mobile to desktop; the dashboard grid collapses to single-column cards.
- Watchlist rows use sibling buttons (open + remove) instead of nested interactive controls.
- Feedback, notes and reset are local-first; reset clears all app data and returns to onboarding.

## Scope boundaries

Included: stocks and crypto, on-demand analysis, a ranked Ideas page built from fixed rules, a
buy/sell comparison page for every supported stock, search,
watchlist, recent analyses, local feedback, a simulated paper trade bot whose ledger never leaves
the browser, and an optional Alpaca connection that sends a live order only after per-order
confirmation or an explicit, session-scoped live autopilot grant.
Excluded by design: personalized advice, brokerage ratings or endorsements, price forecasts,
price or trigger alerts, automatic order execution without a revocable opt-in, portfolio tracking, licensed
news/event feeds, options chains, fundamental valuation data. Market-session open/close reminders
are included because they describe exchange hours, not a trade recommendation. The Ideas page ranks
rule-based setups so they can be reviewed side by side; its score is not a probability, a target or
a promise. The Buy / Sell page shows both conditional directions for comparison; the presence of a
sell case for a bullish lean — or the reverse — is symmetry in the tool, not a suggestion to take
the other side. The page named "trade bot" runs as a deterministic simulator by default; you choose
whether it asks before each paper entry or opens them on its own, and either way it manages and
closes the positions it opened. Live orders exist only through the explicitly connected Alpaca
account, are limited to long stock and ETF brackets, and require either the review dialog or the
session-only autopilot grant you enable after a separate acknowledgement.

## Disclaimer

Informational only. This is a description of a market setup produced by fixed rules, not investment
advice, personalized advice, a guarantee or a promise of returns. The Ideas page ranks those setups
with the weights shown on the page so you can review them; the ranking is not a ratings service, a
price forecast or a personalized recommendation. The Buy / Sell page pairs a long and a short case
for the same analysis so you can compare the levels; both cases are conditional reads of structure,
not recommendations to take either side. The action plan is a conditional read of levels,
trend and volume — not a forecast or an order. Data may be delayed, incomplete or — where
labeled — synthetic. The optional Alpaca connection can send a real order to your account only after
you review and confirm it, or while a live autopilot grant you enabled from this tab remains active;
that grant is session-only, limited to one long stock or ETF order per scan, and is revoked by
pause, disconnect, a mode change or leaving auto mode. You are responsible for every order sent
from your account. TIKOTrade is not affiliated with Alpaca. You are responsible for your decisions.
