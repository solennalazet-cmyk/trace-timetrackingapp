# Phase 1: Geolocation proof + PWA install guidance

Three things in this ship:

## 1. How Trace Works — add "Install to home screen" step

Add a fourth step to `HowTraceWorksModal.tsx` titled **"Install on your phone"** with a `Smartphone` icon and a short description plus a "Show me how" link that expands inline instructions:

- **iPhone (Safari):** Tap the Share button → Add to Home Screen → Add.
- **Android (Chrome):** Tap the ⋮ menu → Install app (or Add to Home Screen).
- Once installed, Trace opens like a real app — fullscreen, no browser bar, and notifications work reliably.

To make Trace actually installable, add a minimal web app manifest (`public/manifest.json`) with `display: "standalone"`, icons, theme color, and link it from `index.html`. **No service worker, no `vite-plugin-pwa`** — keeps the Lovable preview stable. Installability + notifications work without offline caching.

## 2. Geolocation Phase 1

### Database (one migration)

`clients`: add `site_address text`, `site_lat double precision`, `site_lng double precision`, `site_radius_m integer default 100`.
`time_entries`: add `start_lat`, `start_lng`, `start_accuracy_m`, `start_on_site boolean`, `start_distance_m`, plus same `end_*` set.
`user_settings`: add `geolocation_mode text default 'off'` (`off | ask | always`), `geolocation_prompt_seen boolean default false`.

### Settings → Privacy section

New "Location proof" block with three options (Off / Ask each time / Always) and a small **info icon** next to the heading. On tap (mobile-safe Popover, not Tooltip): "You can override this per client on the client's page — useful when one client needs location proof but others don't."

### Client form (`ClientFormModal`)

New "Place of work" collapsible section:
- Address field (optional)
- "📍 Use current location" button — runs the high-accuracy capture, fills lat/lng, reverse-geocodes the address via a free service (Nominatim) and pre-fills it
- Radius slider (50–500m, default 100m)
- Per-client override: Inherit / Always capture / Never capture

### Capture logic (new `src/lib/geolocation.ts`)

- `requestLocation()`: `getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })`, retry once if accuracy >100m, resolves `null` on any failure (graceful).
- `evaluateOnSite(lat, lng, client)`: haversine distance vs `site_lat/lng`, returns `{ on_site, distance_m }` or `null` if client has no site set.
- Pre-prompt modal: shown once before the first real permission request. Copy:
  > Trace can attach your location to clock in/out times as proof you were on site. Coordinates stay private on your account — they only appear on exports **if you choose to include them in Export Settings**. You're in control.
  
  Buttons: **Enable** (sets mode to `ask` or `always` based on user pick, flips `geolocation_prompt_seen=true`, then calls `getCurrentPosition`) / **Not now** (sets mode to `off`, flips flag, never auto-asks again).

### Hook into timer

In `useTimer` start/stop paths: if `geolocation_mode !== 'off'` and client override allows, fire `requestLocation()` in parallel with the existing DB write. Don't block clock in/out. On resolve, patch the `time_entries` row with the captured fields. On failure, show a soft toast: "Location unavailable — entry saved without it."

### Export rendering

`ExportColumnsPicker`: new option **"Include on-site verification"** (only enabled when Clock in or Clock out is also selected).

In `PrepareBillingSheet` / PDF export rendering: under the clock in/out time, render a secondary line:
- **Client has site set:** color-coded badge — sage green "On-site" or mustard "Off-site · 320m". Tokens added to `index.css` (`--badge-onsite`, `--badge-offsite`) so all themes get proper contrast.
- **Client has no site set:** plain coordinate string `41.3851, 2.1734 (±12m)` with a tappable Google Maps link. No color code. (This is the new behavior you just asked for — handles workers with multiple sites.)

### Idle clock-out reminder (geofence-aware)

Extend existing `idle_reminder_minutes` logic: while clocked in, poll location every few minutes (only if mode is `always` and client has site set). If user leaves geofence for >15min, fire a notification:
- Browser/PWA installed to home screen: Web Notifications API + a tiny inline service worker registration just for notifications (no caching, no offline — registered only after user grants notification permission, and skipped inside iframes/preview hosts per Lovable PWA guidance).
- Capacitor native (when packaged): `@capacitor/local-notifications`.

Reuses the user's existing notification permission grant; if not granted, falls back to in-app toast on next focus.

## 3. Files touched

- `supabase/migrations/<new>.sql` — one migration with all column additions (no new tables, no GRANT changes needed)
- `src/lib/geolocation.ts` — new
- `src/components/GeolocationPrePromptModal.tsx` — new
- `src/components/HowTraceWorksModal.tsx` — add install step
- `src/components/ClientFormModal.tsx` — place-of-work block
- `src/components/SettingsModal.tsx` — Location proof block + info popover
- `src/components/ExportColumnsPicker.tsx` + `src/lib/export-columns.ts` — new option
- `src/components/PrepareBillingSheet.tsx` — render secondary lines
- `src/hooks/useTimer.ts` — capture on start/stop
- `src/index.css` — sage/mustard badge tokens
- `public/manifest.json` + `index.html` — installability
- `public/icons/*` — manifest icons (generated)

## Out of scope (deferred to Phase 2)

- Photo proof, signature capture, full audit log UI
- Reverse-geocoding fallback when offline
- Editing captured coordinates after the fact

Want me to proceed exactly as above, or trim anything (e.g. skip the off-site geofence poll, skip reverse-geocode, skip icons generation)?