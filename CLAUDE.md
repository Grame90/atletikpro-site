# Atletikpro — Fenerbahçe Athletics Club Manager

## What this is
A web app for managing Fenerbahçe Athletics Club (Fenerbahçe Atletizm Şubesi). Tracks athletes, coaches, expenses, competitions, schedules, licenses, etc. Deployed on Vercel, free hobby plan.

## Files
- **`tr.html`** — main Turkish app (~5200 lines, all-in-one: HTML + CSS + JS). Primary file.
- **`index.html`** — Russian version, same structure as tr.html. Must stay in sync with tr.html.
- **`api/data.js`** — Vercel serverless function. Reads/writes Supabase. Also does daily GitHub backup.
- **`vercel.json`** — routing config, cache-control headers for HTML files.
- **`logo.png`** — Fenerbahçe logo.

## Sync rule
**Always update both tr.html and index.html** when adding features, CSS, or JS. The only exception is language-specific text (Turkish vs Russian labels).

## Architecture
```
Browser (tr.html / index.html)
  └── localStorage (cache, keyed ak_<section>)
  └── fetch /api/data  →  Vercel serverless
                               └── Supabase PostgreSQL (ak_data table)
                               └── GitHub backup (fire-and-forget)
```

## Local development
```bash
vercel dev   # starts at localhost:3000
```
Do NOT use `node server.js` — it is a legacy stub without Supabase access.

## Database
**Supabase table:** `ak_data(section TEXT, id TEXT, data JSONB, PRIMARY KEY(section, id))`

Env vars on Vercel (set via Vercel dashboard, NOT in code):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — service role key (bypasses RLS)
- `GITHUB_PAT` — for daily backup to `Grame90/nextjs-boilerplate` repo

## Sections (data categories)
Both frontend and backend use the same list:
```
coaches, athletes, coordinators, expenses, contacts, documents, social,
competitions, inventory, users, management, records, licenses, schedule,
tracking, raceplan
```

## Roles
- `admin` — full access including all financial info
- `coordinator` — NO financial data (salaries, IBAN, TC, expenses section hidden entirely)
- `user` — standard access, no admin controls

Financial visibility is controlled by:
```javascript
function canSeeFinance() { const s = getSession(); return !s || s.role === 'admin'; }
```
Use `canSeeFinance()` in template literals everywhere financial data appears. Do NOT use CSS classes for this — they are unreliable in JS-generated content.

## Cache system
```javascript
const CACHE_VERSION = '2026-05-06-v1';
```
Bump this string whenever you need all users' browsers to drop stale localStorage data. The IIFE at the top of the script checks this and clears all `ak_*` keys if the version doesn't match.

## Race condition guard
`_serverSyncDone` flag prevents `pushToServer()` from running until `initApp()` has loaded fresh data from Supabase into localStorage. Never remove this pattern.

## Sorting
All lists are sorted alphabetically with locale:
```javascript
// tr.html
.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'tr'))
// index.html
.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'ru'))
```
Apply to every `renderX()` function that displays a list.

## Gender encoding
| File | Male | Female |
|---|---|---|
| tr.html | `E` | `K` |
| index.html | `М` | `Ж` |

The `_gPalette` object uses these keys. Use the correct keys per file.

## Athlete cards (view modes)
Four modes switchable by `setAthView(mode)`:
- `cards` — 3D hover grid (default), rendered by `renderAthCards()`
- `fan` — fan overlap grid, rendered by `renderAthFan()`
- `list` — compact list, rendered by `renderAthList()`
- `table` — full data table

Cards use `_gPalette` for gradient colors when no photo. Photos are full-bleed via `object-fit:cover`.

## Photo handling
Photos stored as base64 JPEG in athlete/coach data. Always resize before saving:
```javascript
const b64 = await resizePhoto(file);  // max 180px, 0.78 quality
```

## 3D login animation
Both tr.html and index.html have a Three.js stadium scene on the login screen.
- CDN: `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js` (in `<head>`)
- Canvas: `<canvas id="login-canvas">` inside `#login-screen`
- Function: `initLoginAnimation()` — called at end of `<script>`
- Stop on login: `if (window._stopLoginAnim) window._stopLoginAnim();` before hiding login screen

## Deploying
```bash
vercel --prod
```
**Limit: 100 deploys/day** on free plan. If you hit the limit, changes are already saved locally and will deploy the next day.

## Important rules
- Never hardcode secrets (Supabase keys, GitHub PAT) in tr.html or index.html — they live only in Vercel env vars.
- Never skip the `_serverSyncDone` guard.
- When adding financial fields to any modal or card, always wrap with `canSeeFinance()`.
- When bumping CACHE_VERSION, use format `YYYY-MM-DD-vN` (e.g. `2026-05-07-v1`).
- The `users` section is excluded from sync snapshots — never include it in backup exports to avoid leaking password hashes.
- `overflow:hidden` on a parent container clips CSS 3D transforms — avoid it on card grid wrappers.
