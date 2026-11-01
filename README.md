# TIKO — evidence-first market analysis (MVP)

> Understand the setup, the evidence, and the risks — at a glance.

A zero-build, zero-dependency web app that produces the same structured read for every market:
snapshot, context, bull/bear evidence, key levels, conditional scenarios, risks and sources.
It also turns that read into a conditional **action plan** — trigger, stop loss, take profit,
reward-to-risk and risk-based position sizing — recomputed from the live price for crypto. Stop loss
and take profit can be overridden per symbol and lens, and the plan recalculates live.
It is informational only. It does not place trades, connect to brokers, or issue predictions.

## Run it

No install, no build step.

- Open `index.html` directly in a modern browser (works from `file://`), **or**
- Serve the folder for the most reliable live-data behavior:

```bash
python -m http.server 8000
# or: npx serve .
```

Then open `http://localhost:8000`.

Live requests go to public APIs from your browser. If a request fails or is rate-limited, the app
falls back to a clearly labeled synthetic sample and tells you why.

## Deploying at tiko.app

The client is a static site configured for Vercel (`vercel.json`), with a serverless stock-directory
route in `api/stocks.js`. To publish it:

1. Import this repository in Vercel as a static project. No framework, build command or output
   directory is needed — the repository root is served as-is.
2. Add `tiko.app` (and optionally `www.tiko.app`) under **Project → Settings → Domains**.
3. At the domain registrar, create the DNS records Vercel shows. Vercel's usual targets are:
   - apex `tiko.app` → A record `76.76.21.21`
   - `www` → CNAME `cname.vercel-dns.com`
4. Wait for verification; Vercel issues the TLS certificate automatically.

`index.html` declares `https://tiko.app/` as its canonical and Open Graph URL.

## Accounts and local data

TIKO asks you to sign in or create an account before it opens. Accounts exist only on this device:
passwords are stretched with PBKDF2-SHA256 (600,000 iterations, random 16-byte salt) and only the
hash is stored; nothing is sent to a server. Sessions last 30 days and can be ended from the
top-right profile menu. There is no password reset, so keep the password safe.

Settings, watchlists, notes, feedback and plan levels stay in this browser's local storage. They are
not encrypted at rest and are shared by accounts in the same browser profile. The optional Alpha
Vantage key is kept in tab storage and cleared on sign-out.

## No ads, no third-party scripts

The app ships no ad slots, ad SDKs, trackers or third-party scripts, and the deployment enforces
that with a Content-Security-Policy (`vercel.json`):

- `script-src 'self'` — only the app's own `js/*.js` files execute; injected ad or tracker scripts are refused.
- `frame-src 'none'`, `object-src 'none'` — no remote ad frames, interstitials or plugins can render over the UI.
- `connect-src` permits only the same-origin stock directory API and the market data endpoints (`api.coingecko.com`, `www.alphavantage.co`, `api.frankfurter.dev`).
- Browser storage is local to the device. Watchlists, notes and settings use `localStorage`; the optional Alpha Vantage key uses `sessionStorage` and is cleared when the tab ends. Browser storage is not encrypted at rest.
- Bing searches open in a new tab; the browser sends the submitted query to Bing directly, and TIKO does not ingest search results.
- `frame-ancestors 'none'` plus `X-Frame-Options: DENY` — no other site can wrap the app in a frame with its own overlays.
- HSTS, same-origin opener/resource policies and restrictive cross-domain policy headers add transport and origin isolation.
- Six Vercel WAF rules deny unsafe stock API methods, requests missing its search parameter, oversized queries, secret-file probes and common CMS probes; scanner-like API clients receive a challenge. Vercel's platform firewall also applies its managed DDoS mitigation automatically.

Assets are served from the same origin (fonts and images are local), so nothing is loaded from a
CDN that could inject content. Keep this policy in place if you change hosting.

## Tests

All suites run on Node's built-in test runner (Node 20+) with no dependencies:

```bash
node --test tests/tradeplan.test.js tests/copilot.test.js tests/auth.test.js tests/market-notifications.test.js
# or: npm test (when Node is on PATH)
```

The action-plan suite covers the long/short state machine, directional copy, sample practice mode,
determinism, stop buffers, fixed-fractional sizing and account caps, editable stop/take-profit
overrides, validation errors, warnings, and EN/ES key coverage (21 tests). The copilot suite covers
brief headlines for every plan state, EN/ES intent routing, grounded answers for each topic, sample
warnings, fallback scope, citations and follow-ups, determinism, and EN/ES key coverage (19 tests).
The auth suite covers email normalization, salted hashing (no plaintext stored), validation errors,
duplicate accounts, correct and incorrect sign-in, throttling after repeated failures, session
resume and expiry, and per-account storage namespaces (8 tests). The market-alert suite covers
weekday, weekend, holiday and early-close sessions, the Sunday-to-Friday forex week, DST boundaries,
pre-close reminders, duplicate suppression, disabled groups, notification permission gating and
EN/ES alert copy and the signed-in requirement (13 tests). All four suites total 61 tests.

## What is in the MVP

- **On-device accounts** — sign in or create an account stored only in this browser (PBKDF2-SHA256
  hash, 30-day session). The top-right profile menu shows the signed-in name, email, account date,
  trading profile, a settings link and sign-out. This is a local access gate, not server-side
  authorization.
- **Local-first storage** — data remains in this browser profile.
- **Date and time** — a live clock with weekday, date, time and time zone appears in the top bar on
  every screen and on the sign-in screen before access. The alerts panel shows the exact Eastern
  Time date and time of the next U.S. stock or forex session event alongside the countdown.
- **Onboarding** — experience, markets, time horizon, preferred analysis, risk comfort, language.
  Answers are editable later in Settings and drive the default lens and copy density.
- **Dashboard** — a hero read of the current session (watchlist count, six lenses, zero orders placed),
  Bing web search, quick asset shortcuts, U.S. stock directory, on-demand live FX quotes, watchlist, recent analyses, market overview,
  and reference events. Recently opened analyses and non-catalog tickers are persisted with enough
  metadata to reopen them.
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
  Crypto plans re-check the live spot quote every 60 seconds (paused while the tab is hidden, a
  dialog is open or the card has focus). No order is ever placed.
- **Ask-the-chart copilot** — an on-device assistant that turns the page's own facts into faster
  answers. A live brief summarizes the state, trend, location, momentum and volatility; suggested
  questions cover the setup, key levels, invalidation, trend, volatility, volume, scenarios,
  evidence, the chart and data freshness. Answers are composed locally from the same facts and fixed
  rules, cite the sections they come from (select a citation to jump there), and refresh with the
  live plan and the selected language. No external model, no network request, no prediction.
- **Six lenses** — Day, Swing, Long term, Options, FX & futures, Beginner. They are tailored views of
  the same core read, not separate products. Each lens re-weights what is emphasized.
- **Market session alerts** — on by default and managed from the bell in the top bar. Reminds you
  when the U.S. stock session opens, 15 minutes before the close, and at the close (including early
  closes and exchange holidays), plus the Sunday open and Friday close of the forex week. The bell
  panel shows whether each market is open or closed and when the next event is due. Alerts are
  scheduled on this device while TIKO is open; browser notifications are optional and need
  permission. Crypto trades continuously, so it has no daily open or close.
- **Settings** — profile chips, default lens, language (English, Spanish, French, Brazilian Portuguese), data mode (`auto` / `sample`),
  optional Alpha Vantage key, market alert groups, feedback export, and full local reset.
- **Feedback and notes** — helpful / inaccurate / missing context, plus a free-text comment and a
  per-symbol note. Stored locally, exportable as JSON.

## Data sources and honesty rules

| Market | Default source | Labeling |
| --- | --- | --- |
| Crypto | CoinGecko public API (`/coins/markets`, `/market_chart`) | `LIVE` with retrieval timestamp, or `SAMPLE` |
| Stocks | Synthetic seeded series | `SAMPLE`, watermark and banner; exchange is the listing venue |
| Stocks (optional) | Alpha Vantage (`TIME_SERIES_DAILY`, `GLOBAL_QUOTE`) with your own key | `LIVE` / `DELAYED`, end-of-day bars |
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
  It excludes test issues, ETFs and non-stock instruments. Listing coverage does not make prices live;
  stock analysis remains labeled `SAMPLE` until a stock data key is configured.

### Optional Alpha Vantage key (stocks)

1. Get a free key at <https://www.alphavantage.co/support/#api-key>.
2. Open **Settings → Data sources**, paste the key, and use **Test key**.
3. The key is kept in this tab's `sessionStorage` and sent directly to Alpha Vantage for stock data. It is cleared on sign-out or when the tab session ends.
4. FX reference rates use Frankfurter and need no API key.
5. Other market-data failures fall back to clearly labeled sample data where available.

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

## Architecture

Classic scripts sharing a `window.TA` namespace, loaded in dependency order by `index.html`.

```
index.html          script order, app roots
styles.css          design tokens, layout, components, responsive rules
js/util.js          escaping, formatting, DOM helpers, seeded RNG, storage helpers
js/auth.js          on-device accounts: PBKDF2 hashing, sessions, throttling, sign-in screen
js/i18n.js          EN/ES dictionaries, core FR/PT-BR translations, and templating ({{var}})
js/store.js         settings, watchlist, recents, notes, feedback (localStorage)
js/market-notifications.js  exchange calendars, session state, local open/close alerts
js/indicators.js    SMA, RSI(14), ATR, realized volatility, pivots, drawdown
js/catalog.js       supported assets, search, sample-series parameters
js/data.js          providers, caching, fallback, overview/quotes, FX reference rates
js/analysis.js      rule-based engine: evidence, levels, scenarios, risks
js/tradeplan.js     conditional action plan, state machine, position sizing
js/copilot.js       on-device brief and question answering over facts, plan and levels
js/charts.js        SVG line charts and sparklines
js/ui.js            icons, modal, toast, search combobox, glossary, badges
js/views/*.js       onboarding, dashboard, analysis, settings
js/app.js           shell, hash router, language refresh, boot
```

Data flow: `views → data.getMarketData(asset, {timeframe}) → {asset, candles, quote, meta}`.
`meta` carries `dataMode`, provider URLs, timestamps, interval, bar count and fallback reasons.
The analysis engine is deterministic: it computes indicators locally, scores evidence for and
against, derives levels from structure, and generates scenarios and risks. `tradeplan.build` is a
pure function of those facts plus an optional live price, so the same inputs always produce the same
plan. The copilot is deterministic too: `copilot.brief` and `copilot.answer` compose copy from those
same facts, the current plan and local intent rules, so the brief stays in sync with live plan
updates and every answer traces back to the page. No LLM is involved and nothing is sent to a
server by this app. Account size and risk percentage are stored only in `gt.settings.v1`; the plan
never sends an order anywhere.

Storage keys: `gt.settings.v1` also holds `accountSize` and `riskPct` for the sizing calculator.

Routes: `#/`, `#/markets`, `#/settings`, `#/analysis/:symbol?style=&cls=&id=&name=`.
The two extra query parameters let non-catalog crypto assets (resolved via CoinGecko search) reopen
correctly from recents or the watchlist.

### Storage keys

`gt.settings.v1`, `gt.watchlist.v1`, `gt.recents.v1`, `gt.notes.v1`, `gt.feedback.v1`,
`gt.planlevels.v1`, plus `gt.auth.users.v1`, `gt.auth.session.v1`, `gt.auth.throttle.v1` and
`gt.auth.lang.v1` for the device account. `gt.market-alerts.last-event.v1` records the last
delivered session alert so a reload does not repeat it; alert preferences live in `gt.settings.v1`.
Recents are capped at 12 (deduped by symbol), feedback at 300 items, notes at 2,000 characters.
Plan overrides are keyed by `symbol|assetClass|lens` and keep only positive, direction-valid prices.
Personal notes, watchlists and feedback stay in this browser unless feedback is exported. Market-data requests go directly from the browser to the named provider, and submitted Bing searches are sent to Bing.

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
directory entries are real listings, while stock charts remain sample data unless a stock data key
is configured.

### Adding a language

Add a dictionary to `js/i18n.js` and an entry to `langs`. Translate interface and generated-analysis
strings; untranslated keys fall back to English. The language is applied on change and persists in
settings. French and Brazilian Portuguese currently cover core screens, with detailed analysis copy
still being translated.

## Accessibility and UX notes

- Skip link, labeled landmarks, `aria-pressed` chips, `aria-selected` tabs, focus-trapped modals,
  keyboard search (`/`), visible focus styles, reduced-motion support.
- The copilot form is keyboard-first: labeled input, live `role="log"` thread, suggested-question
  buttons and citations that move focus to the cited section instead of changing the route.
- Responsive from narrow mobile to desktop; the dashboard grid collapses to single-column cards.
- Watchlist rows use sibling buttons (open + remove) instead of nested interactive controls.
- Feedback, notes and reset are local-first; reset clears all app data and returns to onboarding.

## Scope boundaries

Included: stocks and crypto, on-demand analysis, search, watchlist, recent analyses, local feedback.
Excluded by design: price or trigger alerts, broker connections, portfolio tracking, automated
strategies, licensed news/event feeds, options chains, fundamental valuation data. Market-session
open/close reminders are included because they describe exchange hours, not a trade recommendation.

## Disclaimer

Informational only. This is a description of a market setup produced by fixed rules, not investment
advice, a recommendation, or a guarantee. The action plan is a conditional read of levels, trend and
volume — not a recommendation, a forecast, or an order. Data may be delayed, incomplete or — where
labeled — synthetic. You are responsible for your decisions.
