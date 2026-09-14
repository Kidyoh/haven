# HAVEN

A women's safety platform for Ethiopia, live at [haven.kidus-yohannes.engineer](https://haven.kidus-yohannes.engineer). Progressive web app: React + Vite, Supabase backend, works on any phone with no app store.

It has two parts:

| | What | Needs an account? | Works offline? |
|---|---|---|---|
| **SOS** | One button. Alerts to police, family and friends with audio, photo and GPS; live tracking; responder dashboard. | Yes | Queues alerts for when signal returns |
| **Pathways** (`/pathways`) | A verified directory of gender-based violence and protection services: where to go, what they provide, what to bring, when it was last confirmed. Amharic and English. | No | Fully, after one visit |

> **About Pathways, read this first.** Coverage is partial and not exhaustive. It is a proof of concept. **It is not an emergency service.** It does not contact anyone on your behalf. If you are in immediate danger, call the police or an ambulance directly.

Pathways was built for the OSF × Andela *"Information you can trust"* hackathon (Safety / Reporting / Protection track).

---

## Running the project

Requires Node 20+ and npm (pnpm or bun also work; lockfiles for all three are checked in).

```bash
npm install
```

```bash
npm run dev
```

The app is at http://localhost:8080. For SOS features, create a `.env` with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Pathways needs no environment variables and no backend.

| Script | What it does |
|---|---|
| `npm run dev` | Generates the Pathways dataset, then starts Vite |
| `npm run build` | Validates the Pathways data, generates the dataset, builds to `dist/` |
| `npm run preview` | Serves `dist/` |
| `npm test` | Vitest: app tests plus Pathways staleness, search and needs tests |
| `npm run verify` | Validates every record in `/data` against the schema and reports status and staleness counts |
| `npm run check:offline` | Drives a headless Chrome/Edge: loads `/pathways` once, confirms the service worker and IndexedDB are populated, kills the server, navigates again, and asserts the directory still renders |
| `npm run screenshots` | Captures every public screen at phone width (plus Amharic and simple view) into `docs/screenshots/` |
| `npm run lint` | ESLint |

Deploy `dist/` to any static host. The service worker (`src/sw.ts`) precaches the app and the Pathways dataset.

---

## Design system

The app is dark-only by design: it is used at night, often one-handed, often with the screen half-hidden.

**Three accent roles, and only three.** Using one outside its role is a bug, not a preference.

| Role | Means | Where |
|---|---|---|
| `sos` (red) | Urgent, irreversible or dangerous | The SOS button, an active alert, destructive actions |
| `safe` (green) | Resolved, confirmed, all-clear | "I am safe", resolved incidents, success callouts |
| `haven-gold` | The calm informational layer | Pathways, wayfinding, secondary CTAs, non-emergency emphasis |

Filled `gold` and `safe` surfaces carry dark ink (`text-ink`); filled `sos` carries white — those are the pairings that clear contrast.

**Shared chrome.** Every screen is assembled from the same pieces, so the ground, gutters, header and feedback states are identical everywhere:

| Piece | File | What it is |
|---|---|---|
| `Screen`, `Container`, `PageHeader`, `BrandMark`, `IconTile` | [`src/components/haven/Screen.tsx`](src/components/haven/Screen.tsx) | Page ground, content column, top bar, the HAVEN lockup, the one way to frame an icon |
| `Spinner`, `ScreenLoader`, `Callout`, `StatusPill`, `EmptyState` | [`src/components/haven/Feedback.tsx`](src/components/haven/Feedback.tsx) | Wait, worked, failed, nothing here yet |
| `Field`, `TextField` | [`src/components/haven/Field.tsx`](src/components/haven/Field.tsx) | Labelled controls, with hint/error wired to the input for screen readers |
| `Button` variants | [`src/components/ui/button.tsx`](src/components/ui/button.tsx) | `sos` · `safe` · `gold` · `subtle` · `outline` · `ghost`, sizes up to `xl` |

Conventions worth keeping:

- **Touch targets are 44px or larger** at every button size except `sm`. This app gets used in a hurry.
- **Forms mark what is _optional_**, never what is required — most fields are required, so starring them is noise.
- **Motion respects `prefers-reduced-motion`.** A safety app should not strobe at someone who asked it not to. Status dots stay visible; only the animation stops.
- **Never interpolate a Tailwind class name** (`bg-${tone}/10`). Tailwind only emits classes it can see as complete strings, so pick from a literal map — see `IconTile` and `StatCard`.
- **Content column widths** come from `Container`: `form` (a column of fields), `content` (reading), `wide` (card grids), `full` (dense tables).

---

## Pathways

### What it does

After someone decides to seek help, four questions come immediately:

| Question | Where the answer is |
|---|---|
| Where do I go? | `location_description` — area-level, never a precise pin for a shelter |
| What does that place actually provide? | `services` — a controlled vocabulary, shown as plain words |
| What do I need to bring? | `what_to_bring` — or "Not stated by the source", never a guess |
| Is that information still true? | `status`, `verified_on`, `verified_via`, `source_*` — shown on every card, not buried |

It is not a reporting tool, not a panic button and not an emergency service. It is an information layer, and that narrowness is deliberate. Search runs on the phone; nothing a person searches for or opens leaves the device.

### Why offline-first matters here

The referral information already exists — in Protection Cluster PDFs, ministry spreadsheets and caseworkers' phone contacts. None of it is reachable by someone on a basic phone with no data, in her own language, at the moment she needs it. Pathways caches the entire directory on first visit; every later visit works fully offline, and says so calmly ("Working offline. All information below is saved on this device.").

A second reason is privacy: a search for "shelter" is itself sensitive. Because search is on-device there is no query to log, no server to subpoena, no analytics to leak.

### Trust model

Every record is one object in a region file under [`/data`](data), validated against [`data/schema.json`](data/schema.json).

| Field | Purpose |
|---|---|
| `source_name`, `source_url` | The named document or contact the record came from. Required. A record with no source cannot exist. |
| `source_text_original` | Verbatim text from that source. Required. Every translated or normalised field can be audited against it. |
| `additional_sources[]` | Other documents consulted, with a note on which field each one supports. |
| `verified_on` | Date the record was last checked, `YYYY-MM-DD`. |
| `verified_via` | `document` · `institutional_contact` · `phone` — how it was checked. |
| `status` | `verified` · `unverified` · `reported_closed`. Set by a person, never by a script. |
| `coordinates` | May be `null`. Shelters **must** be `null` (enforced by the schema). Area descriptions are the wayfinding field. |
| `phone[]` | Digits only. Empty when no source states a number. |
| `hours`, `what_to_bring_*`, `subcity` | `null` when the source does not say. The UI shows "Not stated by the source". |
| `cost` | `free` · `paid` · `unknown`. `unknown` when the source does not say. |
| `placeholder` | `true` only for example rows; the UI labels them loudly. None ship today. |

**Staleness rule.** A `verified` record whose `verified_on` is older than 90 days (`staleness_days` in `data/meta.json`) is shown with a re-verification flag. It is never hidden, never dropped and never auto-downgraded in the data file: the flag is computed at display time in [`src/lib/pathways/staleness.ts`](src/lib/pathways/staleness.ts). An old phone number that the user knows is old is more useful than a silent gap.

| Data | On screen |
|---|---|
| `verified` | green pill with the date |
| `verified`, older than 90 days | green pill with the date **plus** an amber "confirmed *n* days ago, re-check" flag |
| `unverified` | amber pill, with the source it came from and the date it was checked |
| `reported_closed` | muted red pill; the record stays fully readable |

### Current data

`npm run verify` prints the live numbers. At the time of writing: **11 records for Addis Ababa, all `unverified`.**

That is deliberate. Every record was entered by hand from a named, public source with the source text quoted verbatim (UNFPA, UNHCR Help, UN Women, a peer-reviewed 2026 study, the organisations' own pages). None has yet been confirmed by phone or with the institution, and the AI tooling used in the build is not allowed to make that call. Flipping a record to `verified` is a human step — see [NOTES.md](NOTES.md) for the queue.

Records: EWLA legal-aid hotline 7711 · Alegnta 6388 (Setaweet) · Hiwot Ethiopia child helpline 936 · MSI Ethiopia 8044 · one-stop centres at Gandhi Memorial, Menelik II and Tirunesh Beijing hospitals · AWSAD safe house · UNHCR call centre · police 991 · Red Cross ambulance 907.

### How to adapt Pathways to another country

Replace the contents of `/data` and nothing else.

1. Edit `data/meta.json`: `country_code`, `country_name_*`, `languages`, `default_language`, `staleness_days`, `coverage_note_*`.
2. Add one JSON file per region (`data/<region>.json`), an array of records matching `data/schema.json`. Ids must start with the lower-cased country code.
3. If you add a language, add a bundle in `src/locales/pathways/<code>.json` and the `*_<code>` fields on records. That is the only change outside `/data`.
4. `npm run verify`, then `npm run build`.

There are no country names, region names, phone formats or service names in Pathways application code. The needs on its home screen ("I need medical care" …) map onto the schema's category and service vocabulary, so they work for any dataset that uses it.

### Architecture

- **One route, `/pathways`**, lazy-loaded (11 KB gzipped on top of the HAVEN bundle). Its views — home, results, record, about — are React state, not URLs, so nothing about what was viewed enters browser history.
- **IndexedDB** ([`src/lib/pathways/db.ts`](src/lib/pathways/db.ts)) holds the whole dataset as one object; translations ride inside each record rather than duplicating records per language.
- **Service worker** ([`src/sw.ts`](src/sw.ts), vite-plugin-pwa `injectManifest`): precaches the app and `/pathways/dataset.json`; SPA navigation fallback; **Background Sync** fetches a fresh dataset when a connection returns after the page asked for one while offline, writes it straight into IndexedDB, and tells open pages.
- **Update checks** add a query string so they bypass the precache and reach the network; a failed check is the offline signal (more reliable than `navigator.onLine`). The dataset version is a content hash, shown in the footer with a manual "Check for updates" button.
- **On-device search** ([`src/lib/pathways/search.ts`](src/lib/pathways/search.ts)): AND-of-tokens with prefix matching, weighted names > places > notes; folds Latin diacritics and Ethiopic homophones (ሠ/ሰ, ሐ/ሀ, ዐ/አ, ፀ/ጸ).
- **No** analytics, cookies, accounts, push notifications or third-party requests on the Pathways route.

### Safety-specific UI

- **Leave** button (and the Escape key) clears the view and replaces the page with a neutral website via `location.replace`, so it is not left as the previous history entry.
- The tab title switches to a neutral "Pathways" while on the route and back afterwards; the icon is a plain path glyph; the offline banner is calm.
- Shelters carry no coordinates; the schema rejects them.
- **Simple view**: single-column icon-led tiles, larger type, source quotations hidden, one idea per line.
- Amharic and English toggle, persisted locally; Ethiopic line-height is sized for from the start.

### How AI tools were used — and where they stopped

Built with Claude Code as the primary coding agent. The line is drawn the same way in the code, this README and the commit history.

**AI was used for:** scaffolding the schema, validator, service worker, views and tests; normalising formatting from sources (phone numbers to international format, service lists to the controlled vocabulary); drafting the Amharic UI strings and the Amharic fields of each record (`source_text_original` is kept verbatim on every record so a human can audit each translation); repetitive transforms during the build.

**AI was never used for:** generating a service record that does not trace to a named source; guessing an address, phone number, opening time, cost or service list (where the source did not state a value it is `null` / `unknown`); making or overriding a verification decision (all 11 records are `unverified` for exactly this reason).

If a build step would have required inventing a field value, the field was left null and the record marked `unverified`.

---

## Project structure

```
data/                     Pathways records: schema.json, meta.json, addis-ababa.json
scripts/                  verify.mjs, build-dataset.mjs, serve.mjs, check-offline.mjs
public/pathways/          icon; dataset.json is generated here at build time (gitignored)
src/
├── sw.ts                 service worker (precache, SPA fallback, Pathways background sync)
├── pages/                route-level pages; Pathways.tsx is the directory
├── components/           SOS components, shadcn/ui primitives, components/pathways/
├── lib/pathways/         types, staleness, search, needs, i18n, db, dataset
├── locales/pathways/     en.json, am.json
├── hooks/                useAuth, useSOSPipeline, …
├── integrations/supabase
└── test/                 vitest (jsdom)
supabase/                 migrations and edge functions for SOS
NOTES.md                  Pathways decisions, known gaps, verification queue
```
