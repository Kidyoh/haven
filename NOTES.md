# NOTES — SOS

How an alert works, what was decided, and what is still weak. Code lives in `src/lib/sos/`; the engine's header comment has the state diagram.

## Flow

1. **Hold 2 s** → **5 s countdown**. The countdown already creates the incident as `pending` (client-generated id), turns on the mic and GPS, and takes a battery reading. Cancel marks it `cancelled` and discards the audio; nothing else has left the phone.
2. **Countdown ends** → `active`. Queued in order: activate, audio captured during the countdown, the latest fix, then "text my contacts". The text waits up to 5 s for a first GPS fix so it can include a map pin.
3. **While active**: audio is recorded as independent 10 s clips (capped at 10 min), each uploaded as it finishes. Location is sent on the first fix, on 25 m of movement (at most every 10 s), and at least every 30 s. The screen wake lock is held.
4. **I am safe** is press-and-hold. With a PIN set, the PIN is then required. The **safe PIN** resolves the incident and texts the contacts who got the alert; the **duress PIN** makes the phone look stood down while recording and location continue, and the dashboard shows a Duress badge.
5. A responder resolving the incident on the dashboard ends the alert on the phone within a minute.

Every write goes through the **outbox** (IndexedDB): status changes for an incident go strictly in order and are never given up on; notifications wait behind them but never hold them back (one bad number must not delay "I am safe" or a duress flag); nothing goes before its create; clips go last in every flush; and every op is idempotent so retries are safe. A status change that matches no row only counts as done if the incident is already in the state it was aiming for.

A reload during an alert restores it on any page, not only `/sos` (`SOSResume` in `App.tsx`). A countdown interrupted less than 60 s ago counts as a request for help; an older one is cancelled. The countdown has its own deadline in the engine, so it fires even if the overlay goes away.

During a duress stand-down, pressing SOS shows an ordinary countdown and then the alert screen, over the same incident: to someone watching, it looks like a first press.

## Decisions

- **SMS through an edge function, not the client.** `send-alert` claims each (incident, contact, kind) row in `alert_notifications` before sending, so retries only text people a previous attempt missed. Twilio and Africa's Talking are both supported via `SMS_PROVIDER`. At most 5 alerting incidents per account per hour.
- **The alert screen only says what happened.** Its headline comes from the engine snapshot (`src/lib/sos/wording.ts`). When contacts were not reached (offline, SMS not configured, no contacts, rate-limited, failing), "Call 991" and "Text contacts" (a prefilled `sms:` link built from contacts cached on the phone) move to the top.
- **Family links go through `get_tracking(token)`.** The previous anon RLS policies did not check the token: anyone with the anon key could list every share token and read every incident and location for those users. They are dropped. The tracking page polls (15 s during an alert) because a realtime subscription cannot be scoped to a token for an anonymous viewer. Family sees the location trail, never audio.
- **Evidence bucket is private.** Responders play clips through one-hour signed URLs. Old incidents with a public `audio_url` are converted to a signed URL on demand.
- **No noise suppression on the mic.** Evidence wants the room, including other voices, not a clean call.
- **PINs live on the device** as salted SHA-256, so they work offline. They are a barrier against someone standing over the user, not a secret against someone with the phone and time.
- **Pending and cancelled incidents are hidden from the dashboard and the tracking link.**
- **Writes only into your own incident.** Location and evidence inserts check that the incident belongs to the caller; the tracking RPC no longer returns incident ids.
- **Pathways from the alert screen.** "Places that can help" opens the directory while the alert keeps running; Pathways shows a "your alert is still on" bar (never during duress) that leads back.

## Deploying

`supabase db push` (migrations `20260915120000_sos_pipeline.sql`, `20260915130000_incident_analytics.sql`, `20260915140000_organizations.sql`), `supabase functions deploy send-alert`, then set secrets: `SMS_PROVIDER` plus the provider's keys, `PUBLIC_APP_URL`, optionally `DEFAULT_COUNTRY_CODE` (251) and `EMERGENCY_NUMBER` (991). The migration and the new client must ship together: the old client reads the public audio URL and the anon tracking policies, both of which the migration removes.

## Known gaps

- **Background on phones.** A web page gets throttled or suspended when the screen locks, iOS most aggressively. The wake lock keeps the screen on while the alert screen is open. It cannot help once the user locks the phone or switches apps: recording and location pause until the page is visible again. The queued writes survive and send on return. Only a native wrapper fixes this properly.
- **No sending while the app is closed.** The outbox flushes from the page (on load, on `online`, with backoff). Background Sync from the service worker would need the Supabase session in the worker; not done.
- **The mic indicator gives duress away** to someone who knows to look for the OS recording dot.
- **Stuck in duress.** If the user never re-opens the alert, a duress alert runs until a responder resolves it or the 10 min audio cap is reached (location keeps going).
- **Tracking link is shared across all contacts.** One active token per account, created on first alert. Revoking it means deactivating the row.
- **Bugs caught before shipping.** `Object.assign(window, { document })` in `src/lib/sos/index.ts` crashed every route in real browsers (jsdom allows it); `npm run check:offline` caught it. Run it after every change to app start-up code.
- **Not tested on real devices yet.** The MediaRecorder MIME fallbacks (`audio/mp4` on iOS Safari), `sms:` links and wake lock need a pass on an Android phone and an iPhone.

---

# NOTES — Pathways

Working notes for HAVEN Pathways: decisions, known gaps, and the human to-do list that the tooling is not allowed to do.

## Build order followed

1. `data/schema.json` and `scripts/verify.mjs`
2. Real Addis Ababa records from named sources (below)
3. IndexedDB cache, on-device search, service worker, background sync
4. Record detail and results views
5. Amharic localisation, tested with the real strings
6. Simple (low-literacy) view
7. Home / needs-based navigation
8. Quick exit and privacy hardening

The UI was not started until the data validated. That meant the "Not stated by the source" path, the phone-less records and the amber status were exercised against real gaps rather than placeholder rows.

Pathways was first built as a standalone Next.js app and then folded into HAVEN itself (Vite + React Router + vite-plugin-pwa) as the `/pathways` route. The data model, scripts, lib code and locale bundles moved over unchanged; the views were re-expressed in HAVEN's Tailwind/shadcn theme; the hand-written service worker became `src/sw.ts` via vite-plugin-pwa's `injectManifest` strategy so the SOS app's existing precache behaviour is preserved.

## Verification queue (human work)

All 40 records are `status: "unverified"`, `verified_via: "document"`. Each needs one phone call or institutional confirmation before it can be flipped to `verified`. Sources were fetched and quoted on 2026-09-14/15; every quote came through an extraction tool, so check the quote against the page when you make the call. Suggested order (nationwide and Addis Ababa first):

| id | What to confirm | Who to call |
|---|---|---|
| `et-nat-hotline-trafficking-8797` | line answers; hours; languages (sources disagree on English) | 8797 |
| `et-aa-hotline-police-991` | whether 991 or 911 connects to police (GOV.UK pages disagree); free; 24 h | 991 and 911 |
| `et-aa-hotline-ewla-7711` | line still answers; hours; free from Safaricom as well as Ethio Telecom | 7711 |
| `et-aa-hotline-alegnta-6388` | line still staffed (newest source January 2022; Setaweet's hotline page is gone); hours | 6388 |
| `et-aa-kirkos-ewla-office-001` and the eight `*-ewla-office-001` records | each office still at that address; hours; walk-in; phones for Semera and Jigjiga | +251115508783, then each branch number |
| `et-aa-stpauls-osc-001`, `et-aa-abebech-gobena-osc-001` | centre open; direct line; hours | hospital switchboards |
| `et-aa-kirkos-gandhi-osc-001` | direct phone number; hours; what to bring | Gandhi Memorial Hospital switchboard (gmh.gov.et was unreachable during the build) |
| `et-aa-menelik-osc-001` | sub-city; phone; hours; cost | Menelik II Referral Hospital |
| `et-aa-akaki-tirunesh-osc-001` | that the OSC is open; a direct line; hours; cost | +251114344217 |
| `et-aa-awsad-safe-house-001` | intake route; which number to call first; cost | +251116672290 |
| `et-aa-hotline-hiwot-936` | hours; languages | 936 |
| `et-aa-hotline-msi-8044` | whether post-rape care is offered and where | 8044 |
| `et-aa-hotline-unhcr-call-centre` | still current | +251905012823 |
| `et-aa-hotline-ambulance-907` | free to call; 24 h | ERCS |
| `et-aa-police-commission-001` | whether +251111110211 takes reports or is administrative | the number |
| `et-aa-aau-legal-aid-001` | still serving refugees at both locations; hours | UNHCR call centre |
| Tigray OSCs (`et-tg-*-osc-001`) | open after 2023; host hospitals for Adigrat, Axum, Shire, Abi Adi, Maychew | UNFPA Ethiopia / Tigray Regional Health Bureau |
| `et-am-dessie-osc-001` | host facility; phone; hours | Amhara Bureau of Women, Children and Social Affairs |
| `et-af-dubti-osc-001` | still running after the USAID programme ended (source 2019) | Afar Regional Health Bureau |
| Shelters (`et-am-kombolcha-safe-house-001`, `et-si-hawassa-awsad-safe-house-001`, `et-tg-axum-wat-shelter-001`) | intake route and a phone to publish; never an address | AWSAD, Women's Association of Tigray |

When a call confirms a record: update the fields it confirmed, set `verified_via: "phone"`, `verified_on` to that day, `status: "verified"`, and add the call to `additional_sources` (name: "Phone call, <date>, spoke to <role>"). Then `npm run verify`.

## Records that could not be added

- **Addis Ababa Bureau of Women, Children and Social Affairs** — aawcsa.gov.et would not load during the build, so there is no verbatim source text. Search results suggest +251 118 72 32 97 / +251 118 58 15 52, Mon–Fri 8:30–17:30. Needs the page fetched or a call before entry.
- **Woldia one-stop centre** — a UNICEF photo caption confirms an inauguration on 26 December 2022, but no source lists its services. A UN Women interview mentions a centre "based in Woldia referral hospital".
- **Addis Ababa hotline for victims of internal trafficking (6073)** — named in IOM's factsheet with no services, hours or languages.
- **JRS Ethiopia** — no loadable page gives a phone number or address.
- **Bahir Dar University Legal Aid Center's phone** — the only number is a named staff member's personal mobile; left out.
- **Hospital coordinates not found on OpenStreetMap:** Menelik II, Dilla University Referral Hospital, Dubti General Hospital. Tirunesh Beijing matched only a "Tirunesh Dibaba Hospital" in Akaki Kality; not used until someone confirms it is the same place.
- **AWSAD +251 911138620** — appears only on ZoomInfo, which conflicts with the organisation's other listing; not added.
- **Women and Children Protection Units at sub-city police stations** — well documented in general terms but no source listing specific stations was found. Do not add per-station records without one.
- **Sub-city for Menelik II OSC** — Wikipedia gives "near Jan Meda on Russia St." but not the sub-city; left null rather than inferred.

## Decisions

- **Everything unverified on day one.** AI is not allowed to make a verification decision, and "checked against a document" by a build agent is not the same as a person confirming the place exists. The green state is real only when a human makes it real.
- **One route, no URLs for records.** Nothing about what was viewed enters `history`. The `check:offline` script asserts `history.length` stays flat while navigating inside Pathways.
- **Public route.** `/pathways` sits outside `ProtectedRoute`; it never imports the Supabase client. It is lazy-loaded so the SOS bundle does not grow (Pathways chunk: ~11 KB gzipped).
- **Whole dataset as one IndexedDB value.** One write, one read, no per-record duplication per language. Fine for thousands of records; revisit at tens of thousands.
- **Content-hash dataset version.** The client can tell "nothing new" from "new records" with a 60-byte fetch and no server logic.
- **Precache the dataset, bypass it for checks.** `/pathways/dataset.json` is in the workbox precache (so first-visit-then-offline works, and every deploy ships fresh data). Update checks append `?t=` so they miss the precache and reach the network; a failed check is the offline signal.
- **Background Sync writes straight into IndexedDB from the worker.** `src/sw.ts` imports the same `db.ts` the page uses, so a sync that fires while the app is closed still lands the new dataset on the device.
- **Needs map onto schema vocabulary.** Home tiles are defined by categories + service keys, never by record ids or country-specific text.
- **`what_to_bring` left null where sources are silent.** The brief's example ("Nothing required. ID helps") would be a guess for these records.
- **Hotlines are `hotline` category even when run by police / health bodies** except 991 (`police`) and 907 (`health`) so that "I want to report" and "I need medical care" surface them.
- **Nationwide lines live in `nationwide.json` with region "Nationwide"** and show under every region filter. Their ids keep the old `et-aa-` prefix so saved links and history stay stable.
- **Region filter.** Shown once places exist in more than one region; the choice is remembered on the phone and cleared by quick exit.
- **Coordinates only from OpenStreetMap hospital elements**, and only for hospitals that host a centre. The pin is the hospital, not the centre's door; the record's sources say so. Shelters never get coordinates (the schema enforces it).
- **Directions draw a straight line on the phone.** No routing service: that would send the user's position and a GBV service's location to a third party. The map stays on the destination when the position arrives; "Show both on the map" zooms out to include the user, and the text beside it says that loading those map pictures lets OpenStreetMap see roughly where they are. "Open in Google Maps" passes only the destination. Leaflet is lazy-loaded, precached, and not downloaded by anyone who never opens a map.
- **Neutral title only while on the route.** HAVEN's own tab title names the SOS product; Pathways swaps in "Pathways" on mount and restores it on unmount.

## Known gaps

- **`subcity` is not localised.** Regions now are (`region.<name>` in the locale bundles); sub-cities are stored once, in the source's language.
- **Region names follow current administrative regions** (Sidama, South Ethiopia) where older sources say SNNPR; each such record says so in its notes.
- **Map pictures need a connection.** Offline, the map is blank; distance and direction still work.
- **HAVEN's main bundle is ~194 KB gzipped** before Pathways is reached (it includes the SOS pipeline, Supabase client and shadcn). Pathways itself adds ~11 KB. On an entry-level phone the first visit is dominated by the shell, not by Pathways; splitting the SOS/dashboard code further would help both.
- **Amharic quality.** UI strings and record translations were drafted with AI assistance and read through, not reviewed by a native speaker. `source_text_original` is on every record for audit; the locale bundle is one file to review.
- **Fonts.** HAVEN loads Inter, which has no Ethiopic glyphs; the browser falls back per-glyph to the system Ethiopic font. No Ethiopic web font is shipped (offline safety, size).
- **Push notifications.** HAVEN as a whole may add push for SOS; the Pathways route registers for none and the worker has no push handler today.
- **Service worker in embedded webviews.** Registration failed inside the Claude desktop preview pane, which is why `check:offline` uses real headless Chrome.

## Things that went wrong during the build (and were fixed)

- Top bar overflowed horizontally at 305 px with the Amharic labels; fixed by letting the preference toggles wrap to a second row while keeping **Leave** on the first.
- The first offline check "passed" while the server was still up: CDP `Network.emulateNetworkConditions` only affects the page session, not the service worker, so the worker happily fetched from the network. The script now runs its own server and kills it for the offline phase.
- A `Page.reload({ ignoreCache: true })` bypasses service workers (it is a hard reload), so the offline phase uses a plain navigation, which is what a returning user does.
- The offline banner depends on the update check failing, not on `navigator.onLine` (which stayed `true` in headless Chrome).
- Workbox stores precache entries with a `__WB_REVISION__` query string, so `caches.match` needs `ignoreSearch: true` to find them.

## Ideas not built

- A maintainer page listing stale records with one-tap "I called, still correct" that writes a PR.
- Distance sorting when the user opts in to location (never stored, never sent). Only 6 of 40 records have coordinates, so it would do little yet.
- `reported_closed` submission flow — out of scope: Pathways does not contact anyone or collect anything.
