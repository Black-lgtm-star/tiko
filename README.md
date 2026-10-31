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

The app is a static site configured for Vercel (`vercel.json`). To publish it:

1. Import this repository in Vercel as a static project. No framework, build command or output
   directory is needed — the repository root is served as-is.
2. Add `tiko.app` (and optionally `www.tiko.app`) under **Project → Settings → Domains**.
3. At the domain registrar, create the DNS records Vercel shows. Vercel's usual targets are:
   - apex `tiko.app` → A record `76.76.21.21`
   - `www` → CNAME `cname.vercel-dns.com`
4. Wait for verification; Vercel issues the TLS certificate automatically.

`index.html` declares `https://tiko.app/` as its canonical and Open Graph URL.

## No ads, no third-party scripts

The app ships no ad slots, ad SDKs, trackers or third-party scripts, and the deployment enforces
that with a Content-Security-Policy (`vercel.json`):

- `script-src 'self'` — only the app's own `js/*.js` files execute; injected ad or tracker scripts are refused.
- `frame-src 'none'`, `object-src 'none'` — no remote ad frames, interstitials or plugins can render over the UI.
- `connect-src` is limited to the market data endpoints (`api.coingecko.com`, `www.alphavantage.co`).
- `frame-ancestors 'none'` plus `X-Frame-Options: DENY` — no other site can wrap the app in a frame with its own overlays.

Assets are served from the same origin (fonts and images are local), so nothing is loaded from a
CDN that could inject content. Keep this policy in place if you change hosting.

## Tests

Both suites run on Node's built-in test runner (Node 20+) with no dependencies:

```bash
node --test tests/tradeplan.test.js tests/copilot.test.js
# or: npm test (when Node is on PATH)
```

The action-plan suite covers the long/short state machine, directional copy, sample practice mode,
determinism, stop buffers, fixed-fractional sizing and account caps, editable stop/take-profit
overrides, validation errors, warnings, and EN/ES key coverage (21 tests). The copilot suite covers
brief headlines for every plan state, EN/ES intent routing, grounded answers for each topic, sample
warnings, fallback scope, citations and follow-ups, determinism, and EN/ES key coverage (19 tests).

## What is in the MVP

- **Onboarding** — experience, markets, time horizon, preferred analysis, risk comfort, language.
  Answers are editable later in Settings and drive the default lens and copy density.
- **Dashboard** — a hero read of the current session (watchlist count, six lenses, zero orders placed),
  search (ticker/asset), quick analysis, watchlist, recent analyses, market overview,
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
- **Settings** — profile chips, default lens, language (English/Spanish), data mode (`auto` / `sample`),
  optional Alpha Vantage key, feedback export, and full local reset.
- **Feedback and notes** — helpful / inaccurate / missing context, plus a free-text comment and a
  per-symbol note. Stored locally, exportable as JSON.

## Data sources and honesty rules

| Market | Default source | Labeling |
| --- | --- | --- |
| Crypto | CoinGecko public API (`/coins/markets`, `/market_chart`) | `LIVE` with retrieval timestamp, or `SAMPLE` |
| Stocks | Synthetic seeded series | `SAMPLE`, watermark and banner, sample exchange label |
| Stocks (optional) | Alpha Vantage (`TIME_SERIES_DAILY`, `GLOBAL_QUOTE`) with your own key | `LIVE` / `DELAYED`, end-of-day bars |

- Sample data is generated with a seeded geometric random walk so it is stable per session and asset.
  It is explicitly labeled in the header, chart, banner and sources. It is never presented as a quote.
- Every number can be traced: the Sources section lists provider, API URL, retrieval time and series end.
- News, sentiment, earnings and macro calendars are **not** connected. The UI says so in context,
  risks and sources instead of implying coverage.
- Crypto series are fetched with a 14-second timeout, serialized requests, in-memory TTL caches
  (45–90 seconds) and a single overview call to reduce rate-limit pressure.
- Intraday availability depends on the provider. When a provider cannot supply intraday bars, the
  analysis reports the actual interval used rather than silently substituting it.

### Optional Alpha Vantage key

1. Get a free key at <https://www.alphavantage.co/support/#api-key>.
2. Open **Settings → Data sources**, paste the key, and use **Test key**.
3. The key is stored unencrypted in this browser's localStorage and sent only to Alpha Vantage.
4. The free tier has a low daily quota. Failures fall back to labeled sample data.

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
js/i18n.js          EN/ES dictionaries and templating ({{var}})
js/store.js         settings, watchlist, recents, notes, feedback (localStorage)
js/indicators.js    SMA, RSI(14), ATR, realized volatility, pivots, drawdown
js/catalog.js       supported assets, search, sample-series parameters
js/data.js          providers, caching, fallback, overview/quotes, resolution
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

Routes: `#/`, `#/settings`, `#/analysis/:symbol?style=&cls=&id=&name=`.
The two extra query parameters let non-catalog crypto assets (resolved via CoinGecko search) reopen
correctly from recents or the watchlist.

### Storage keys

`gt.settings.v1`, `gt.watchlist.v1`, `gt.recents.v1`, `gt.notes.v1`, `gt.feedback.v1`,
`gt.planlevels.v1`.
Recents are capped at 12 (deduped by symbol), feedback at 300 items, notes at 2,000 characters.
Plan overrides are keyed by `symbol|assetClass|lens` and keep only positive, direction-valid prices.
Nothing leaves the browser; feedback export is a local JSON download.

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

### Adding a language

Add a dictionary to `js/i18n.js`, add an entry to `langs`, and translate the generated-analysis
strings used by `js/analysis.js`. Interface and generated copy are both localized; the language is
applied on change and persists in settings.

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
Excluded by design: alerts, broker connections, portfolio tracking, automated strategies, licensed
news/event feeds, options chains, fundamental valuation data.

## Disclaimer

Informational only. This is a description of a market setup produced by fixed rules, not investment
advice, a recommendation, or a guarantee. The action plan is a conditional read of levels, trend and
volume — not a recommendation, a forecast, or an order. Data may be delayed, incomplete or — where
labeled — synthetic. You are responsible for your decisions.
