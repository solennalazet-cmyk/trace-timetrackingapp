# Make work assignment client selection instant and stable

## What will change
- Show the last saved client list immediately whenever the assignment recap opens, including when the network is slow or unavailable.
- Refresh clients, projects, tasks, and tags independently so a slow secondary request cannot hold the client list hostage.
- Reuse one in-flight refresh instead of launching duplicate requests when the recap rerenders or reopens.
- Keep successful partial results and cache newly created clients immediately.
- Stabilize the mobile client picker so one tap opens it once, selection closes it once, and keyboard/viewport changes cannot replay the trigger tap.
- Preserve the current safety rule: closing the recap still saves the session to Unassigned Work.

## Verification
- Test stopwatch, focus, and clock-out recaps on a mobile viewport.
- Confirm cached clients appear immediately, client selection remains stable, and a deliberately slow refresh shows inline feedback without blocking selection.
- Confirm closing the recap still creates an unassigned entry and no duplicate requests or reopen loops occur.
- Check the preview build and runtime logs after the changes.

## Technical details
- Split the current all-or-nothing `Promise.all` load into independently applied requests.
- Add request deduplication and stale-while-revalidate behavior to the assignment cache layer.
- Tighten the picker open/close event boundary so closing gestures cannot propagate back to its trigger or parent dialog.
