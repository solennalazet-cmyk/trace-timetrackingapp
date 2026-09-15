# Fix dashboard deletion and mobile assignment flow

## Changes

- Remove freelancer-level deletion from the employer Dashboard payments section, including the swipe-to-delete wrapper, expanded-card Delete button, confirmation dialog, and related state/handlers. Keep payment-history deletion and freelancer management elsewhere unchanged.
- Make client rows in the phone assignment picker reliably selectable with a direct tap. Separate tap selection from vertical scrolling, prevent the parent dialog from stealing the gesture, and update the selected client before dismissing the keyboard/sheet.
- Configure the Capacitor keyboard so the native app does not repeatedly resize the whole screen behind the client picker. Browser behavior remains unchanged.
- When the Unassigned Work summary contains exactly one entry, tapping it will skip the list and detail screens and open that entry’s assignment dialog immediately. Multiple entries will continue opening the list and retain bulk assignment.

## Verification

- Check the employer Dashboard has no freelancer delete gesture or button while payment deletion still works.
- Test the client picker at a phone viewport: tap a client, scroll without selecting, search, and select a filtered result.
- Test one versus multiple unassigned entries and confirm closing assignment still leaves the entry in Unassigned Work.
- Confirm the app compiles cleanly and perform a mobile interaction smoke test.

## Native app update

After pulling the changes locally, run `npm install` and `npx cap sync`, then rebuild the Android/iOS app so the keyboard setting takes effect.
