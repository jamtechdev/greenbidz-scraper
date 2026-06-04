# Frontend Rebuild Plan — Vite + React Admin UI

> **Status:** planning only. No application code changes yet. This document is the
> blueprint for replacing the current single-file `web/public/index.html` review page
> with a full Vite + React admin app, with UX inspired by the CodeCanyon "Scraper –
> Automatic Content Crawl and Post" WordPress plugin.

---

## 1. Goal & current state

**Goal:** a polished, multi-page admin dashboard to drive the existing scraper backend —
manage sources, build/verify profiles with a live mapping studio, run/schedule crawls,
browse scraped products, and inspect logs.

**What already works (the prototype backend):**

- Profile-driven scraping with **two source modes**: `api` (JSON endpoint sniffing) and
  `dom` (Puppeteer + CSS selectors).
- **Unified `products` table** with a `scraped` discovery flag; `crawl_history` and
  `pending_mappings` tables.
- **Scheduler** (`node-cron`), retry/backoff, image download, `ONLY_NEW_PRODUCTS` flag.
- A minimal HTTP API + the current one-page UI: `/api/analyze`, `/api/detect`,
  `/api/save-profile`, `/api/scrape`, `/api/products`, `/api/state`.

**What's weak:** the frontend. It's one static HTML file — fine for a prototype, not for
a production label. This plan replaces it.

---

## 2. Reference → our feature mapping

| Reference plugin feature | Our equivalent | Status |
|---|---|---|
| Source/site management, bulk URL lists | `sources` (listing URLs to monitor) | **new** (today: `.env` `LISTING_URLS`) |
| Visual selector editor / parse attributes | **Mapping Studio** with live selector tester | partial (have `/api/detect`) |
| XPath/regex extraction | CSS selectors + API field-map; add regex/transforms | partial → extend |
| Next-page navigation detection | pagination config (DOM "Next" / API page param) | **have** |
| Search-and-replace, content templates, price math | per-field **transforms pipeline** | **new** |
| Regex / JSON parsing | API `fieldMap` + dotted paths | **have** (extend with regex) |
| Featured image, gallery, local download, alt/title | image handling (download exists) | partial → extend |
| Schedule tasks, intervals, task queue, cron | `node-cron` scheduler | **have** (expose in UI) |
| Draft/publish, duplicate check, update existing | `products` upsert + `scraped` + `ONLY_NEW_PRODUCTS` | **have** (surface in UI) |
| Detailed logs & task history | `crawl_history` + `logs/*.log` | **have** (surface in UI) |
| Translate API / WooCommerce export | export pipeline | **out of scope (future)** |

---

## 3. Tech stack

| Concern | Choice | Why / alternative |
|---|---|---|
| Build/dev | **Vite + React 18 + TypeScript** | Fast HMR, typed API contracts. |
| Routing | **React Router v6** | Standard multi-page SPA routing. |
| Server state | **TanStack Query (React Query)** | Caching, background refetch, polling for live crawl status. |
| UI kit | **shadcn/ui + Tailwind CSS** | Full control, matches our existing dark palette; owns the components. *Alt: Mantine or Ant Design for faster out-of-the-box tables/forms.* |
| Tables | **TanStack Table** | Sortable/filterable/paginated product & log grids. |
| Forms | **react-hook-form + zod** | Profile/source forms with schema validation (mirrors backend `validateProfile`). |
| Charts | **Recharts** | Dashboard crawl/volume charts. |
| Icons | **lucide-react** | Matches current UI. |
| Client state | **Zustand** (small) | Sidebar, theme, transient UI only; server data stays in React Query. |
| Live updates | **SSE** (EventSource) | Stream crawl progress/log lines; simpler than websockets. |

> **Decision needed:** shadcn/ui (control, our dark theme) vs Mantine/AntD (faster admin
> scaffolding). Recommendation: **shadcn/ui** to keep the existing aesthetic and avoid a
> heavy dependency, accepting a bit more component work.

---

## 4. Architecture & integration

```
┌────────────────────────┐         ┌─────────────────────────────┐
│  React app (Vite)      │  /api/* │  Node API (Express)         │
│  dev:  localhost:5173  │ ──────▶ │  dev:  localhost:4000       │
│  prod: served from     │  (proxy │  - REST endpoints           │
│        dist/ by Node   │  in dev)│  - serves dist/ in prod     │
└────────────────────────┘         │  - scheduler + scrapers     │
                                    └──────────────┬──────────────┘
                                                   │
                                            MySQL (products, …)
                                            Puppeteer / Chromium
```

- **Dev:** Vite dev server (`5173`) with a proxy: `/api → http://localhost:4000`. Move the
  Node API to **port 4000** to free 5173 for Vite.
- **Prod/team:** `vite build` → `web/ui/dist/`; the Node server serves that static folder
  **plus** the `/api` routes → single origin, no CORS, still tunnel-able via `npm run share`.
- **API formalization:** migrate the current no-framework `web/server.js` to a small
  **Express** app (`web/api/`) with proper routers, JSON validation, and error middleware.
  Keep all existing handlers; add the new endpoints below.

---

## 5. REST API contract (to formalize)

**Exists (keep/refactor):**
`POST /api/analyze`, `POST /api/detect`, `POST /api/save-profile`, `POST /api/scrape`,
`GET /api/products`, `GET /api/state`.

**New endpoints needed:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/sources` | CRUD listing URLs to monitor (promote from `.env`). |
| GET/PUT/DELETE | `/api/profiles[/:file]` | List/read/update/delete profile JSON files. |
| GET | `/api/products` (extend) | Pagination, search, filter (scraped/active/profile), sort. |
| GET | `/api/products/:id` | Single product detail (raw_data, images, errors). |
| GET | `/api/crawl-history` | Paged crawl runs for the History/Logs page. |
| GET | `/api/logs?type=error\|activity&tail=N` | Tail log files. |
| GET/POST | `/api/pending-mappings` + `/:id/approve\|reject` | Review queue actions. |
| GET | `/api/scheduler` | Scheduler status, interval, next run, running flag. |
| POST | `/api/scheduler/run-now` `/pause` `/resume` | Control the scheduler. |
| GET/PUT | `/api/settings` | Read/update editable config (interval, ONLY_NEW_PRODUCTS, images, retries). |
| GET (SSE) | `/api/events/crawl` | Live crawl progress + log stream. |

---

## 6. Information architecture (pages & routes)

```
/                     Dashboard
/sources              Sources (listing URLs to monitor)
/profiles             Profiles list
/profiles/new         Mapping Studio (create)  ← the hero screen
/profiles/:file       Mapping Studio (edit)
/products             Products browser (table + detail drawer)
/crawls               Crawl history & logs
/pending              Pending mappings review queue
/scheduler            Scheduler / jobs
/settings             Settings
```

Shell: left **sidebar** (nav + status pills) + **top bar** (current job indicator, run-now,
quick search) — same dark theme as today.

---

## 7. Key screens

### Dashboard
Stat cards (products total / scraped / unscraped, profiles, pending, last crawl) · crawl
volume chart (Recharts, from `crawl_history`) · recent runs table · recent products ·
live "scrape in progress" banner (SSE).

### Mapping Studio (the centerpiece — replaces today's review page)
Wizard-style, three panes:
1. **Input** — listing URL (+ optional sample product URL), **Analyze**.
2. **Source toggle (api/dom)** → auto re-detect (already built) populates fields.
3. **Mapping & live preview**:
   - DOM mode: editable selector rows + **live tester** (renders the sample, highlights
     matches, shows extracted value per field).
   - API mode: endpoint, query, pagination paths, **field-map** with a live JSON-record
     preview and the mapped result.
   - **Transforms per field** (new): find/replace, regex extract, trim, template
     `{value} kg`, price math — previewed live.
   - Pagination, image options (featured/gallery/download), `downloadImages` toggle.
4. **Save** → validates (mirror backend) → writes profile → optional **Run scrape now**.

### Products browser
TanStack Table: search, filters (scraped/active/profile/price range), sort, pagination ·
row → **detail drawer** (title, price, description, image gallery, raw_data JSON,
last_error, scrape history).

### Crawl history & logs
Paged `crawl_history` table (found/new/failed/duration/status) · log viewer
(`error.log` / `activity.log`) with tail + filter · live tail via SSE during a run.

### Sources, Pending mappings, Scheduler, Settings
- **Sources:** CRUD list of listing URLs (+ assigned profile, last run, enable/disable).
- **Pending:** queue of unmatched patterns → "Create profile" (opens Mapping Studio
  pre-filled) / reject.
- **Scheduler:** status, interval, next run, pause/resume, run-now, per-source schedule.
- **Settings:** editable config (interval, ONLY_NEW_PRODUCTS, image download, retries,
  user agents) + DB connection (read-only display).

> **Per-profile scrape mode (auto | manual) — change pending.** Each profile gains a
> `scrapeMode` field. `auto` → the background cron job crawls it on the normal
> interval (today's behaviour). `manual` → the scheduler **skips** this profile/source
> entirely; it only runs on explicit "Run now" from the UI. **Backend wiring is
> deferred** ("change it later"): the scheduler/job-runner must read `scrapeMode` and
> exclude `manual` profiles from automatic cycles. The UI already models the field
> (`ProfileSummary.scrapeMode` in the shared types) so the toggle can surface in the
> Mapping Studio / Sources screens once the backend honours it.

---

## 8. Frontend folder structure (as built)

> **Decisions taken:** the frontend lives in a **top-level `Frontend/`** folder (the
> backend was moved into `Backend/`), runs as a **separate process on its own port**
> (Vite `5173`, backend moved to `4000`), and uses **Tailwind-only custom components**
> (no shadcn/Mantine). Phases 0–1 are implemented.

```
Frontend/                      # separate process; npm run dev → :5173
├── index.html
├── vite.config.ts            # dev proxy /api → http://localhost:4000
├── package.json              # separate from Backend/package.json
├── tailwind.config.ts        # carries the original dark palette
└── src/
    ├── main.tsx, router.tsx
    ├── lib/            api client (fetch wrapper), queryKeys, format, cn
    ├── types/          shared API types (mirror backend responses)
    ├── components/     ui/ (Card, Button, Badge, Table, Drawer, StatCard, states),
    │                   layout/ (Sidebar, TopBar, AppShell, PageHeader)
    ├── features/
    │   ├── dashboard/  products/ (+ detail drawer)  crawls/
    │   └── PlaceholderPage  (sources/profiles/pending/scheduler/settings stubs)
    └── hooks/          useApi (state, products, product, crawlHistory, runScrape)
```

**Implemented (Phases 0–1):** app shell (sidebar + topbar + dark theme + routing),
typed API client + React Query, **Dashboard** (stat cards, dependency-free crawl
chart, recent runs/products), **Products** browser (search/filter + detail drawer),
**Crawl History** (filterable table). Remaining routes are stubbed placeholders.

**Backend touched for Phase 1:** moved to port **4000** (`WEB_PORT`), added
`listCrawlHistory` + `getProductById` queries and `GET /api/crawl-history` +
`GET /api/products/:id` endpoints.

---

## 8b. Phase 2 — Visual Scraper Builder (as built)

A new **"New Scraper"** sidebar item (`/scraper/new`) opens a 4-step Mapping
Studio: **URLs → Listing → Fields → Review**.

- **Rendering:** arbitrary sites can't be iframed (X-Frame-Options/CSP), so the
  backend renders the page with Puppeteer and serves a **sanitized, same-origin
  snapshot** (`GET /api/proxy-page?url=`): strips `<script>` + CSP meta, injects
  `<base href>` so the site's own CSS/images still load, auto-scrolls to trigger
  lazy content, and injects a **selector script**.
- **Visual selection:** inside the iframe, hover → blue outline, click → green
  lock + field badge. The script computes a **CSS selector** (mirrors
  `field-auto-detector`'s `cssPath`, with `:nth-of-type` for uniqueness) +
  **XPath**, text, attributes, and image `src`, and `postMessage`s them to the
  React parent. **Images** are multi-select.
- **Fields:** built-in Title (required) / Price / Description, plus user-added
  **custom fields** (name + type + required). A live "matches N elements" check
  runs the selector against the same-origin snapshot.
- **Listing + pagination:** on the listing page the user visually picks the
  **product link** (its `href` auto-fills the sample product URL) and the
  **Next-page** control.
- **URL pattern:** `POST /api/url-pattern` auto-generates the regex from the
  sample URL and **warns if an existing profile already matches** (dedupe).
- **Save:** builds a DOM profile (`fields`, `selectors.images`, `listingUrls`,
  `pagination`, `urlPattern`, `scrapeMode`, …) and POSTs to the existing
  `/api/save-profile` (mirrors `validateProfile` client-side first).

**Backend touched for Phase 2:** new `web/proxy/` (`page-proxy.js`,
`selector-inject.js`); `GET /api/proxy-page` + `POST /api/url-pattern`; new
`findDomProfileForListing` and **wired `runCrawlForListing` to consume the
profile's `pagination`** (previously it only used hardcoded defaults).

**Known caveat:** pure-JS-navigation SPAs (e.g. 101lab) render product cards
without crawlable `<a href>` anchors, so the visual *listing-link* capture yields
no URL there (those sites use the API source instead). Detail-field mapping still
works via a manually-entered sample product URL. Normal anchor-based listings
work fully.

**Scrape-mode enforcement (done).** The blanket auto-crawl is gone:
- `main.js` no longer crawls `.env` `LISTING_URLS` on startup and does **not**
  run immediately.
- The scheduler (`runAllAutoProfiles`) crawls **only** profiles marked
  `scrapeMode: 'auto'` ("with job"), using each profile's `listingUrls`, every
  `CRAWL_INTERVAL_HOURS`. Profiles with no `scrapeMode` or `'manual'` ("one-time")
  are never auto-crawled.
- **Run-once-on-save:** `POST /api/save-profile` kicks off a single background
  crawl of the new profile's listing URL(s) (fire-and-forget, `runStarted` in the
  response). For one-time profiles that's the only run; for "with job" it's the
  first run before the scheduler takes over.
- **Re-detect unmapped patterns:** each auto tick also runs
  `reprocessPendingMappings()` — for every `pending_mappings` row (a URL pattern
  with no profile), it refreshes auto-detection and best-effort scrapes the sample
  with an ephemeral (unsaved) profile.

> Existing `profile_101lab.json` has no `scrapeMode`, so after this change it
> **stops auto-crawling** until an admin re-saves it as "with job".

---

## 9. Phased roadmap

| Phase | Deliverable | Backend work |
|---|---|---|
| **0 · Foundation** | Vite+TS scaffold, shell (sidebar/topbar), dark theme, API client, dev proxy | Move API to :4000, Express refactor, serve `dist/` in prod |
| **1 · Read views** | Dashboard + Products browser + Crawl history (read-only) — instant value | Extend `/api/products` (paging/filter), add `/api/crawl-history`, `/api/products/:id` |
| **2 · Mapping Studio** | Port analyze/detect/edit/save into React; api/dom toggle; live preview | (reuse existing) + `/api/profiles` CRUD |
| **3 · Sources & Scheduler** | Sources CRUD, scheduler control, **run-now**, live progress (SSE) | `sources` table + endpoints, `/api/scheduler/*`, `/api/events/crawl` |
| **4 · Logs & Pending** | Log viewer, pending-mapping review → create profile | `/api/logs`, `/api/pending-mappings/*` |
| **5 · Transforms & media** | Per-field transforms (find/replace, template, price math), featured/gallery image options | transform engine in extractor, profile schema additions |
| **6 · Polish** | Settings page, empty/loading/error states, responsive, optional **basic auth**, build & deploy | `/api/settings`, auth middleware |

MVP for team use = **Phases 0–2**.

---

## 10. Non-functional

- **Loading/empty/error states** everywhere (React Query statuses + skeletons).
- **Optimistic + polling**: poll scheduler/crawl status; SSE for live logs.
- **Type safety**: shared TS types between API responses and UI.
- **Responsive**: works on laptop screens; sidebar collapses.
- **Auth**: deferred; add env-based basic auth before any public exposure (Phase 6).
- **Testing**: component tests (Vitest + Testing Library) for the Mapping Studio form
  logic; backend endpoints get smoke tests.

---

## 11. Risks & open questions

- **Sources in DB vs `.env`** — moving listing URLs to a `sources` table is needed for a
  real UI; confirm we want that migration.
- **Transforms scope** — find/replace + template + price math add real backend work
  (Phase 5); confirm priority vs. shipping read+mapping first.
- **Live preview for DOM** — rendering a sample per keystroke is expensive (Puppeteer);
  debounce + explicit "Test" button instead of auto-run.
- **UI kit choice** — shadcn/ui vs Mantine/AntD (section 3) — pick before Phase 0.
- **Auth & multi-user** — currently single-user/no-auth; if the team needs accounts, that's
  a larger addition (out of current scope).

## 12. Out of scope (for now)
Translation API, WooCommerce/export targets, proxy/cookie management, multi-tenant
accounts. Revisit after the MVP (Phases 0–2) lands.
