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
