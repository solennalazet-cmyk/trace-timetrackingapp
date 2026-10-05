# AGENTS.md — technical rules

## Assignment box must never move (mobile)
- On phones the assignment box (`AssignmentModal`) uses `DialogContent position="pinned"` with a height measured once on open; never centre it or make it follow the keyboard. Why: any re-centring (keyboard, OS location sheet, async content) is the recurring "bounce".
- `MobileSelectSheet` keeps a fixed top edge measured on open; only its bottom follows the keyboard, and filtering never resizes it. Why: the search field must stay under the finger.
- Nothing may open an OS prompt/sheet while the assignment box is open (e.g. geolocation only warms when permission is already granted). Why: OS sheets resize the viewport.
- REQUIRED CHECK: after any change touching dialogs, sheets, AssignmentModal, MobileSelectSheet, AdaptiveCombobox, viewport/keyboard handling, geolocation, the timer stop flow, or the viewport meta in index.html, run `python3 scripts/checks/assignment_box_stability.py` and only finish when it prints PASS. Why: this regression has returned several times after unrelated fixes.

## Signed-out privacy
- Never render session summaries, entry history, unassigned counts, or lingering account toasts when no user is authenticated; sign-out must clear their local UI state. Why: work-session information is private account data.
- Preserve the non-display `trace_recently_stopped` marker across sign-out; it prevents a failed server cleanup from resurrecting an already clocked-out session. Why: privacy cleanup must not remove timer conflict protection.

## Billing fields are server-only
- `profiles` plan/subscription/trial/Stripe/period columns are blocked for signed-in users by the `guard_profile_billing_columns` trigger; write them only from edge functions with the service role. Why: users could otherwise grant themselves Pro. Check: `scripts/checks/profile_billing_guard.sh`.

## Two sides, kept separate

1. Trace has a freelancer side and an employer side. They have different navigation, home screens, data and jobs. Treat them as separate products that share only a visual style and the connection between users.
   - Freelancer-only code is never imported by employer code, and the reverse.
   - Both sides may import shared code, and shared code contains no role checks (no isEmployer / activeRole / kind branching inside shared UI or utilities).
   - New code goes in the correct side's folder. If the side is unclear, ask me.
2. Every request names which side it is for. Only change that side. If a change would touch a file used by both sides, STOP and tell me first: name the file, who uses it and what could change for the other side. Never fix something by adding an isEmployer branch inside a shared page; propose a split instead.
3. A feature built for one side (for example the tax country and tax-year selector, which is freelancer-only) must not appear on the other side. When adding a feature, state which side gets it.
4. Anything that must always be true (a report's status order, payment limits, privacy between the two sides, billing and plan columns writable only by the Stripe webhook, one running timer per user) is enforced in the DATABASE (constraint, trigger or RLS), with the UI only as a friendly layer. Tell me which mechanism you chose. Any new billing or entitlement column must be added to the profiles protection trigger.
5. Never change, backfill or delete existing user data (reports, payments, sessions) unless I explicitly ask. New rules apply from now on.
6. Reuse before adding: before writing a new query, rate calculation, role check or device-storage key, check whether one exists. Money maths lives in one place (src/lib), used by both sides.
7. After every change run the build and existing tests, run scripts/checks/assignment_box_stability.py when dialogs, sheets, AssignmentModal, viewport or the timer stop flow were touched, and add a test for any bug fixed. Report what you ran and the results, and list every file changed.
8. If something is unclear, a test fails or you are unsure, say so instead of guessing.

## Payments are private per side
- `report_payments` rows are visible only to their recorder, except rows tagged `legacy_shared` (pre-split data, readable by both parties); fully_settled/shortfall only on the freelancer's own new rows; `employer_hidden_at` only set by the employer on reviewed reports; approved employer reports can't be deleted and a delete can never cascade the other party's payments. All enforced by RLS and triggers. Why: each side's paid/due must reflect only their own records. Check: run `scripts/checks/payment_privacy_guard.sql` as a database admin (rolled back); every row must read PASS.

## Report review transitions
- Employer may change status only submitted→approved/rejected or approved→rejected; nothing leaves rejected (resend = new report). Enforced by RLS + `guard_submitted_report_update`. Why: fix mistaken approvals without editing amounts. Check: payment_privacy_guard.sql.

## Sent reports are locked for the freelancer
- Once a report linked to an employer is sent (submitted, approved or rejected), the freelancer cannot change any field, including submitted_at and source; corrections mean delete (where allowed) and send a new report. pending_connection and solo reports stay editable, but only the automatic connection link may attach an employer or change their status. New pending_connection rows have no employer; new linked rows start as submitted and only to an accepted connection. Enforced by `guard_submitted_report_insert` / `guard_submitted_report_update` (the link sets a transaction-local `trace.system_link` flag). Why: the employer's review must not be bypassed. Check: payment_privacy_guard.sql.
- Employer-only review data (e.g. session acknowledgements) lives in `report_acknowledgements`, never on `submitted_reports`, because the freelancer can read every column of their own report rows. Why: row-level rules cannot hide single columns.
