# AGENTS.md — technical rules

## Assignment box must never move (mobile)
- On phones the assignment box (`AssignmentModal`) uses `DialogContent position="pinned"` with a height measured once on open; never centre it or make it follow the keyboard. Why: any re-centring (keyboard, OS location sheet, async content) is the recurring "bounce".
- `MobileSelectSheet` keeps a fixed top edge measured on open; only its bottom follows the keyboard, and filtering never resizes it. Why: the search field must stay under the finger.
- Nothing may open an OS prompt/sheet while the assignment box is open (e.g. geolocation only warms when permission is already granted). Why: OS sheets resize the viewport.
- REQUIRED CHECK: after any change touching dialogs, sheets, AssignmentModal, MobileSelectSheet, AdaptiveCombobox, viewport/keyboard handling, geolocation, the timer stop flow, or the viewport meta in index.html, run `python3 scripts/checks/assignment_box_stability.py` and only finish when it prints PASS. Why: this regression has returned several times after unrelated fixes.
