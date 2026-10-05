# AGENTS.md — technical rules

## Assignment box must never move (mobile)
- `AssignmentModal` uses `DialogContent position="pinned"`, height measured once on open; never centre it or follow the keyboard. Why: re-centring causes the recurring "bounce".
- `MobileSelectSheet` keeps a fixed top edge; only its bottom follows the keyboard; filtering never resizes it. Why: search field stays under the finger.
- Nothing opens an OS prompt/sheet while the box is open (geolocation warms only if already granted). Why: OS sheets resize the viewport.
- After touching dialogs, sheets, AssignmentModal, MobileSelectSheet, AdaptiveCombobox, viewport/keyboard, geolocation, timer stop flow or viewport meta, run `python3 scripts/checks/assignment_box_stability.py` until PASS. Why: regression keeps returning.

## Signed-out privacy
- Never show session summaries, history, unassigned counts or account toasts when signed out; sign-out clears that UI state. Why: private account data.
- Keep the `trace_recently_stopped` marker across sign-out. Why: stops failed cleanup resurrecting a clocked-out session.

## Billing fields are server-only
- `profiles` plan/subscription/trial/Stripe/period columns are blocked for users by `guard_profile_billing_columns`; write them only from edge functions (service role). Why: users could grant themselves Pro. Check: `scripts/checks/profile_billing_guard.sh`.

## Two sides, kept separate
1. Freelancer and employer sides are separate products sharing only style and the connection. No cross-side imports; shared code has no role checks (no isEmployer/activeRole/kind branching); new code goes in the right side's folder — ask if unclear.
2. Every request names its side; change only that side. If a file used by both sides must change, STOP and say which file, who uses it, what could change. Never add an isEmployer branch in a shared page; propose a split.
3. One-side features (e.g. freelancer tax-year selector) never appear on the other side; state which side gets a feature.
4. Invariants (report status order, payment limits, cross-side privacy, billing columns, one running timer) are enforced in the DATABASE (constraint/trigger/RLS); UI is only a friendly layer. Say which mechanism. New billing/entitlement columns go into the profiles guard trigger.
5. Never change, backfill or delete existing user data unless explicitly asked; new rules apply from now on.
6. Reuse existing queries, rate maths, role checks and storage keys before adding. Money maths lives once in src/lib.
7. After every change run build and tests (plus the stability check when relevant), add a test per bug fixed, report what ran and every file changed.
8. If unclear, failing or unsure, say so instead of guessing.

## Payments are private per side
- `report_payments` rows are visible only to their recorder, except `legacy_shared` pre-split rows (both parties). fully_settled/shortfall only on the freelancer's own new rows; `employer_hidden_at` only set by the employer on reviewed reports; approved employer reports can't be deleted; deletes never cascade the other party's payments. RLS + triggers. Why: each side's paid/due reflects only its own records. Check: `scripts/checks/payment_privacy_guard.sql` as DB admin (rolled back), all PASS.

## Report review and freelancer lock
- Employer status changes only submitted→approved/rejected or approved→rejected; nothing leaves rejected (resend = new report). Why: fix mistaken approvals without editing amounts.
- Linked reports, once submitted/approved/rejected, are fully locked for the freelancer (incl. submitted_at, source); fix by delete-and-resend. Solo and pending_connection stay editable, but only the connection link (transaction flag `trace.system_link`) attaches an employer or changes their status. New pending_connection rows have no employer; new linked rows start submitted, only to an accepted connection. Enforced by `guard_submitted_report_insert`/`_update` + RLS. Why: the employer's review must not be bypassed. Check: payment_privacy_guard.sql.
- Employer-only review data (e.g. session acknowledgements) lives in `report_acknowledgements`, never on `submitted_reports`. Why: freelancers can read every column of their own report rows.
