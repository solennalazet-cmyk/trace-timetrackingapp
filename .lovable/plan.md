

# Reports Page — Phase 1 Fixes

## 1. Header background with transparency
**File:** `src/components/Header.tsx`
- Add `backdrop-blur-md bg-background/70` to the `<header>` element so it's readable over content.

## 2. Font sizes — accessibility pass
**File:** `src/pages/ReportsPage.tsx` and `src/components/ClientBillingSummary.tsx`
- Client filter chips: `text-[11px]` → `text-xs`
- Donut center total: `text-xl` → `text-2xl`; sub-label `text-[10px]` → `text-xs`
- Section headers (`"By Entry Type"`, `"Clients"`, `"Goals"`, `"Daily Breakdown"`): `text-xs` → `text-sm`
- Goal progress labels: `text-xs` → `text-sm`
- Client card name: `text-sm` → `text-base`
- Client card metrics (Total, Billable): `text-lg` → `text-xl`; sub-labels `text-[10px]` → `text-xs`
- Avg/day: `text-sm` → `text-base`
- Session list items: `text-xs` → `text-sm`
- Legend items: `text-[11px]` / `text-[10px]` → `text-xs`
- Stacked bar tick font: `10` → `11`

## 3. Date range — respect weekStartDay from settings
**File:** `src/pages/ReportsPage.tsx`

The initial `useState` on lines 115-120 hardcodes `weekStartsOn: 1` before settings load. The `useEffect` on line 122 then recalculates, but `datesInitialized` gets set to `true` immediately on first render because `defaultRange` and `weekStartDay` already have their default values.

Fix: initialize `datesInitialized` as `false` and add a `settingsLoaded` flag. Only run the date initialization effect once settings have actually been fetched from the database. This ensures that for "weekly" range, `startOfWeek` uses the correct `weekStartDay` value from user settings.

## 4. Dual side-by-side donut charts with client initials in segments
**File:** `src/pages/ReportsPage.tsx`

Replace the single nested donut (lines 410-473) with two side-by-side donuts:

- **Left donut — "Time"**: Outer ring segments proportional to each client's duration. Center shows total `HH:MM`. Size ~150px wide.
- **Right donut — "Turnover"**: Outer ring segments proportional to each client's billable value (€). Center shows total `€XXX`. Size ~150px wide.

**Client initials inside segments**: Use Recharts' `<Label>` or a custom `renderLabel` function on each `<Pie>`. For each segment, compute the midpoint angle and place a `<text>` element with the first two letters of the client name (e.g., "AC" for "Acme Corp"). Only render initials if the segment arc is wide enough (e.g., >15° or >5% of total) to avoid clutter.

Remove the color legend underneath — the initials inside the segments serve as the legend. Keep the billable/non-billable summary line below the donuts as a simple text stat (not colored dots).

**Turnover donut data**: New `useMemo` that groups by `client_id` and sums `billable_value` instead of `duration_minutes`. Non-billable clients (zero turnover) won't appear in the turnover donut.

## 5. Client cards — colored background
**File:** `src/components/ClientBillingSummary.tsx`

Replace the current `bg-card` white background with each client's color at low opacity. Change line 157:
```
className={`rounded-2xl border bg-card ...`}
```
to use an inline `style` with the client color at ~15% opacity as the background, keeping text readable. The colored dot indicator can be removed since the card itself is now colored.

## Files modified
- `src/components/Header.tsx` — backdrop blur + semi-transparent bg
- `src/pages/ReportsPage.tsx` — font sizes, date init fix, dual donuts with initials
- `src/components/ClientBillingSummary.tsx` — font sizes, colored card backgrounds

