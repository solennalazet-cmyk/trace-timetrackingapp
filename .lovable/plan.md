

## Peak Productivity Hours — 24-Hour Radial Heatmap

### Concept
A half-circle (180°) divided into 24 equal slices representing each hour of the day (0–23). Each slice's radial length varies based on how many minutes the user worked during that hour — taller = more productive. Think of it as a polar bar chart, not a pie chart.

### Visual design
- **Shape**: Half-circle (startAngle=180, endAngle=0), same 120×120 size as existing mini-donuts
- **24 segments**: Each 7.5° wide, one per hour
- **Height encoding**: Each bar's outer radius scales from a minimum (e.g. 30%) to 100% based on minutes worked in that hour relative to the peak hour
- **Distinct palette**: A cool-toned gradient (e.g. teal → cyan → mint) that's clearly separate from the warm Sunrise Palette used for clients. Hours with zero activity use a very faint base color
- **Center label**: The peak hour displayed as "14h" or "2 PM"
- **Sub-label**: "Peak Hour"
- **Below chart**: Label "Peak Hours"
- **Fallback**: When < 3 entries have `start_time`, show a muted placeholder: "Track more to see patterns"

### Data logic
1. Filter entries with non-null `start_time`
2. For each entry, extract the hour from `start_time` and assign `duration_minutes` to that hour bucket (if an entry spans multiple hours, just use the start hour for simplicity)
3. Build a 24-element array, sum minutes per hour
4. Normalize: each hour's outer radius = `minRadius + (value / maxValue) * (maxRadius - minRadius)`
5. Render using Recharts `RadialBarChart` or a custom `Pie` with variable outer radii per cell

### Implementation
Since Recharts `Pie` doesn't support per-slice outer radius natively, I'll use a **custom SVG** approach — 24 arc paths drawn with calculated radii inside a 120×120 container. This gives full control over the polar bar chart look. The palette will use HSL with hue ranging from 170–200 (teal/cyan family) and lightness varying by value.

### Technical changes
**File: `src/pages/ReportsPage.tsx`**
- Add `PeakHoursChart` component with custom SVG arcs
- Compute hourly buckets from `displayEntries` with `start_time`
- Place as third item in the mini-donut horizontal scroll row
- Define a teal/cyan color scale separate from the Sunrise Palette

