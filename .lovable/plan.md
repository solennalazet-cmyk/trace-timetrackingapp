# Trace Connected Workflow — V1 Plan

Mobile-first extension of existing Clients + Reports. No new product surface; reuses cards, sheets, and Unassigned-style action cards.

## 1. Roles

- Every account has an `active_role`: `worker` (default) | `employer`.
- First connection assigns role:
  - If you invite someone as **your client** → you are `worker`.
  - If you invite someone as **your worker** → you are `employer`.
- Role toggle always visible in the header avatar dropdown (top of menu, above Settings), pill segmented control: ● Worker / ○ Employer. Switching role re-routes nav:
  - Worker view: Start, Timeline, Reports, Clients (unchanged).
  - Employer view: Home (dashboard), Workers, Payments.
- "Client" remains the worker-facing label; "Employer" is the role name on the toggle. UI strings adapt per active role.

## 2. Connections

Reuses existing `clients` table — no new Employer entity. Adds a link to a Trace user.

### Worker side (Clients page)
- Existing client card gets a **Connect Trace user** button (under the card menu).
- "Add client" modal gets a new option **Connect Trace user**: enter email → sends invite.
- Pending/Rejected connection state appears as a subtle badge on the client card.

### Employer side (Workers page)
- Mirror of Clients page: list of workers, "Add worker" → email invite.
- Reuses ClientFormModal pattern (renamed WorkerFormModal in employer view).

### Invitation handling
- Invite sends an email (Lovable transactional email) with a signup/login link carrying the invite token.
- New signups with that email auto-accept the connection on first login.
- Existing users see an **action card** (same visual as UnassignedPanel):
  - On next login: shown as a modal once, dismissible.
  - After dismiss: persists on Home until Accept/Decline.

## 3. Reports — "Send" flow

- Rename **Export & Bill** → **Send** in `PrepareBillingSheet` and triggers throughout.
- Sheet shows three primary actions: **Export PDF**, **Export CSV**, **Submit to Client** (last one disabled with tooltip if client isn't a connected Trace user).
- Rename **Export Settings** → **Shared Report Settings** (in client form + report sheet). Visually separated card above the actions. Columns list unchanged — they govern PDF, CSV, and submitted reports identically.
- Submit to Client → confirmation modal (Client, Email, Contact, Period, Hours, Amount) → creates a `submitted_report`.

## 4. Submitted Reports

New section on each client card (worker view) and each worker card (employer view): **Submitted Reports** list with period, hours, amount, submitted date, status badge.

Statuses: `submitted` · `approved` · `rejected` · `due` · `partially_paid` · `paid`.

## 5. Employer Review

- Employer opens a submitted report → interactive card mirroring the worker's report, honoring Shared Report Settings (columns toggle which fields render).
- Actions: **Approve** / **Reject**.
- Reject → required reason (Missing session / Incorrect hours / Incorrect information / Other + free text). Worker notified via action card on Home with reason; can edit entries and resubmit (creates a new submission linked to the original).
- Approve → status `approved` → automatically moves to **Payments Due** on both sides. Worker notified.

## 6. Payments

Both roles can register payments against an approved submitted report.

- Payment registration modal: amount, date, optional note. Multiple payments per report.
- Computed: total due, total paid (sum), outstanding. Status derives: `due` (0 paid) → `partially_paid` (0 < paid < due) → `paid` (paid ≥ due).
- Payments tracker visible inside the submitted-report detail sheet, and aggregated on a **Payments** tab (Due / Paid filter).

## 7. Employer Home Dashboard

Sections, in order, action-first:
1. **Pending Reports** — submitted, awaiting review.
2. **Payments Due** — approved, unpaid/partially paid.
3. **Recent Activity** — last 10 submissions / approvals / payments.
4. **Attendance Snapshot** — recent completed sessions per worker (only fields enabled in their Shared Report Settings).

## 8. Out of scope (deferred)

Messaging, chat, scheduling, shift assignment, leave, payroll, automatic payments, calendar planning.

---

## Technical notes

### Schema (one migration)
- `profiles`: add `active_role text default 'worker'`, `available_roles text[] default '{worker}'`.
- `clients`: add `connected_user_id uuid null`, `connection_status text` (`none|pending|accepted|rejected`), `invited_email text`, `invite_token uuid`, `invited_at timestamptz`.
- New `submitted_reports`:
  - `id`, `worker_user_id`, `employer_user_id`, `client_id`, `period_start`, `period_end`
  - `total_hours numeric`, `total_amount numeric`, `currency text`
  - `shared_columns text[]` (snapshot at submit time, so later toggle changes don't rewrite history)
  - `entries_snapshot jsonb` (immutable copy of the included entries, so edits/deletes don't mutate a submitted report)
  - `status text` default `submitted`
  - `submitted_at`, `reviewed_at`, `rejection_reason text`, `rejection_note text`, `parent_submission_id uuid` (for resubmits)
- New `report_payments`: `id`, `submitted_report_id`, `amount`, `currency`, `paid_at`, `recorded_by_user_id`, `note`.
- All tables: GRANTs + RLS — worker can CRUD their own row, employer can SELECT/UPDATE rows where they are the employer (approve/reject/record-payment only).

### Email
- Use Lovable transactional email (`send-transactional-email` edge function, scaffolded if not present) for invites + notifications. Suppress sending if recipient has no email or has opted out — graceful failure logs only.

### UI reuse
- Action cards: copy UnassignedPanel pattern.
- Submitted report sheet: reuse PrepareBillingSheet layout (read-only when status ≠ draft).
- Role toggle: new `RoleSwitcher` at top of `HeaderMenu`.
- Employer routes: `/home`, `/workers`, `/payments` rendered inside existing `AppLayout` with role-aware `BottomNav` + `DesktopSidebar`.

### Build order
1. Migration (schema + RLS).
2. Role model + toggle + role-aware nav.
3. Connections (invite/accept/reject, action card, email).
4. Send rename + Shared Report Settings rename + Submit to Client flow + `submitted_reports` writes.
5. Employer Home + report review (approve/reject).
6. Payments registration + Payments tab on both sides.
7. Notifications (action cards on both sides for approval/rejection/payment).
