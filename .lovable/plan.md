# Fix client selection drawer

## Goal
Make tapping an existing client select it immediately and close the drawer reliably in both the browser and phone app, without breaking list scrolling or desktop assignment.

## Changes
- Replace click-only mobile row selection with a touch-safe pointer interaction that distinguishes a tap from a vertical scroll.
- Keep ownership of the pointer through small keyboard/drawer position changes so the selection is not cancelled mid-tap.
- Prevent the parent assignment dialog and backdrop from receiving the same completed tap or reopening the client drawer.
- Keep mouse and keyboard selection working through the normal click path.
- Apply the same shared fix to client, project, and task drawers because they use the same control.

## Validation
- Verify a searched client can be selected while the keyboard is open and the drawer closes with the chosen name displayed.
- Verify vertical scrolling does not accidentally select a row.
- Verify repeated opening/closing remains stable at the current mobile viewport.
- Check the preview build and runtime logs after the change.

## Technical details
The current row waits for a synthetic `click`. Mobile browsers can cancel that click when the keyboard changes the visual viewport and moves the drawer between pointer-down and pointer-up. The fix will commit a genuine tap from the pointer sequence itself, using movement tolerance and pointer capture, while retaining `click` for mouse and keyboard access.
