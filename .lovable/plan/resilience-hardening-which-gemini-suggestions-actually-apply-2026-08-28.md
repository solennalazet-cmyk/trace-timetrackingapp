# Resilience hardening — which Gemini suggestions actually apply

## Verdict on the four suggestions

1. **Try/catch everywhere — partially useful.** The codebase already uses try/catch in 44 files, and Supabase calls return `{ data, error }` rather than throwing, so blanket wrapping adds noise. What is genuinely missing: a **global** safety net. There is exactly one error boundary (`RouteChunkErrorBoundary` in `src/App.tsx`) and it only wraps the route tree — a render crash inside a modal or panel still blanks the screen, and there are no `window.onerror` / `unhandledrejection` listeners at all.
2. **Fallback states — worth doing, low cost.** Not a systemic hole, but list/empty/error states are inconsistent across pages.
3. **On-screen error log — the most valuable of the four for this app.** Users hit bugs on mobile where no console is reachable; today the only signal is the user's screenshot. A local ring buffer of errors, viewable from Account, would end the guessing.
4. **Lock CDN versions — not applicable.** Every library is an npm dependency bundled by Vite with a lockfile; nothing is loaded from unpkg/cdnjs. The only external script is Microsoft Clarity in `index.html`, which is analytics-only, deferred, and skipped in the native shell. No change needed.

## What to build

### 1. Global error capture (`src/lib/error-log.ts`)
- Ring buffer of the last 50 errors in `localStorage` (`trace_error_log`): timestamp, message, stack, route, user id, app version.
- Install `window.onerror` and `window.addEventListener("unhandledrejection")` in `src/main.tsx`, plus a `logError()` helper for manual reporting.
- Filter out chunk-load errors already handled by `src/lib/chunk-recovery.ts` so recovery reloads don't spam the log.

### 2. App-wide error boundary
- Promote the existing boundary into a reusable `AppErrorBoundary` that reports to the error log, and wrap: the route tree (as today) and the layout's modal/panel region, so a crashing sheet shows a small inline "Something went wrong — reload" card instead of a white screen.

### 3. Diagnostics panel in Account
- A collapsed "Diagnostics" section on `src/pages/AccountPage.tsx` showing the recent-errors list with expandable stack traces, a copy-all button (for sending to support), and a clear button.
- Read-only, local-only — nothing is uploaded.

### 4. Fallback states pass
- Audit the main list surfaces (Reports, Clients, Workers, Payments, dashboard cards) for the three states: loading skeleton, empty message, and query-error message with a retry action. Add whichever is missing; no behaviour or data changes.

### 5. Automate the Report Bug flow
- **Auto-attach context:** `FeedbackModal` submissions include a `context` payload — last captured errors from the log, current route, role, plan, app version, browser/device, online status. Adds a `context jsonb` column to `user_feedback`.
- **Notify the admin by email:** an edge function triggered on submit sends the report (message, type, user email, context) to the admin address. Requires a Resend API key and a verified sender domain.
- **Fallback if email isn't set up yet:** the same data is readable in-app from an admin-only feedback inbox, so no report is missed while the domain is being verified.

## Notes
- No dependency changes. One additive column on `user_feedback`; nothing else in the schema changes.
- No blanket try/catch rewrite: error handling is added at the boundaries (global handlers, boundaries, query error states) rather than sprinkled through every function.

## Out of scope
- Sending every runtime error to a backend table or third-party service (only user-submitted bug reports get sent).

