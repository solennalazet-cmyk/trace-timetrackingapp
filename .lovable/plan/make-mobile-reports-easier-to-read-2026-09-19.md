# Make mobile Reports easier to read

## Goal

Improve the Freelancer Reports overview so goals, totals, client filters, and supporting insights are immediately legible on a phone.

## Changes

- Give Goals a stronger card treatment with larger labels, values, percentages, and progress bars.
- Replace the Hours and Average per Session donuts with flat metric cards; keep tap-to-show and copy decimal hours. For the decimal hours: we need to add a light "tap for decimals", so the user knows. Have a tooltip for the average card explaining what it is based on.
- Keep entry-mode insight as a compact breakdown beneath the metrics instead of hiding it in Settings or forcing it into exported reports.
- Increase small labels and body copy throughout the Reports overview and client breakdown to a readable 14–15px baseline.
- Increase headline values to 19–24px, strengthen client-filter contrast, and enlarge their touch targets.
- Normalize section gaps, headings, card padding, and mobile chart labels for a more continuous reading flow.

## Validation

- Check the Reports overview at the current phone width for readability, clipping, and interaction.
- Confirm decimal-hour toggling/copying, client filters, goal progress, and client expansion still work.
- Confirm the app builds without errors.

## Technical details

The existing calculations and report/export data stay unchanged. This is a presentation-only change, using existing theme tokens and responsive classes. Entry-mode insight remains on-screen because it helps explain the totals immediately; exports should continue showing entry type as row-level detail rather than adding a default summary section.