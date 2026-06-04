# Product Monitor — Admin UI

Vite + React + TypeScript + Tailwind front-end for the scraper backend.
Runs as a **separate process on its own port** from the backend.

## Architecture

```
Frontend (Vite)            Backend (Node)
http://localhost:5173  ──▶  http://localhost:4000
   dev server          /api      REST API + scrapers + scheduler
   proxies /api ───────────────▶ (set WEB_PORT=4000 in Backend/.env)
```

In dev, the Vite dev server proxies every `/api/*` request to the backend on
`:4000`, so there is no CORS and the browser only ever talks to `:5173`.

## Run it (two terminals)

```bash
# Terminal 1 — backend (from Backend/)
cd Backend
npm run web            # serves the API on http://localhost:4000

# Terminal 2 — frontend (from Frontend/)
cd Frontend
npm install            # first time only
npm run dev            # opens http://localhost:5173
```

> The proxy target can be overridden with `VITE_API_TARGET` (defaults to
> `http://localhost:4000`).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (HMR) on :5173. |
| `npm run build` | Type-check (`tsc -b`) then build to `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run typecheck` | Type-check only, no emit. |

## What's implemented (Phases 0–1)

- **Shell** — sidebar + topbar, dark theme, client-side routing.
- **Dashboard** — stat cards, crawl-activity chart, recent runs & products.
- **Products** — searchable/filterable table with a detail drawer (images,
  raw data, errors, scrape history).
- **Crawl History** — filterable run table.

Sources, Profiles (Mapping Studio), Pending, Scheduler, and Settings are
stubbed placeholders pending later phases. See `../Backend/plan.md`.

## Structure

```
src/
├── lib/          api client, query keys, formatters, cn
├── types/        API response types (mirror the backend)
├── components/   ui/ primitives + layout/ shell
├── features/     dashboard / products / crawls (+ placeholders)
└── hooks/        useApi — React Query hooks
```
