

## Plan: "Done" Tab, Assignment UX Improvements, Focus Mode Handle, and Scroll Fix

This plan covers all items from your message. The tab will be called **Done**, free users see a limited 7-day list (insights are Pro-locked).

---

### 1. Rename Timeline to "Done" tab

**File: `src/components/BottomNav.tsx`**
- Change label from "Timeline" to "Done"
- Change icon from `Clock` to `CheckSquare` (lucide)
- Route stays `/timeline`

---

### 2. Rewrite TimelinePage as achievements view

**File: `src/pages/TimelinePage.tsx`** (full rewrite)

- **Date range picker**: Reuse the existing `DateRangePicker` component (same as Reports page), fully customizable with quick presets
- **Client color legend** at top: colored dots + client names, using the existing `getClientColor` hash function (already deterministic per client ID — same colors everywhere)
- **Hero stats**: Tasks completed (count of distinct task entries), Total time tracked, Streak (consecutive days)
- **Task list grouped by day**: Each row shows a filled checkbox icon, task/project name, client color dot, and duration. Sorted newest first
- **Insights section** (Pro-locked for free users with blur overlay):
  - Most productive day = day of week with most completed tasks (ticked boxes count, not time)
  - Average session duration
  - Longest single session
- **Free plan gating**: Free users see only the last 7 days of tasks; insights section is blurred with a Pro upgrade prompt. Date range picker is restricted to 7 days max

---

### 3. Client color-coding consistency

The `getClientColor(id)` function already exists in `TimelinePage.tsx`. It will be:
- Extracted to `src/lib/utils.ts` so it can be shared across the app (Reports charts, Done tab, future views)
- The same deterministic hash ensures identical colors per client everywhere

---

### 4. Add multiple tasks in the Assignment Modal

**File: `src/components/AssignmentModal.tsx`**

Currently users assign one task per entry. To support multiple tasks within a single session:
- Add a "task list" section: after selecting a task, a small "+" button appends it to a visible list of tasks for this session
- Each task in the list shows: task name, optional duration split (editable), and a remove button
- The save action creates one `time_entry` per task, splitting the total duration proportionally or as manually adjusted
- The Task combobox resets after adding, ready for the next task
- This allows users who don't stop the timer between tasks to log multiple tasks in one go

---

### 5. Fix vertical scrolling in Assignment Modal on mobile

**File: `src/components/AssignmentModal.tsx`**

The scroll container uses `overflow-y-auto overscroll-contain` but active input fields on mobile cause the viewport to shift. Fix:
- Add `touch-action: pan-y` to the scroll container
- Add `-webkit-overflow-scrolling: touch` for iOS momentum scrolling
- Wrap each form field group with adequate padding/margin so tapping outside a field doesn't accidentally hit another field
- Ensure the dialog doesn't resize when the virtual keyboard opens by using `dvh` units and `visualViewport` API to adjust the container height

---

### 6. Focus mode drag handle

**Files: `src/components/CircularTimer.tsx`, `src/components/FocusMode.tsx`**

Add a visible circular handle on the timer ring to indicate drag-to-set capability:
- In `CircularTimer`, accept an optional `showHandle` prop
- When `showHandle` is true, render a small filled circle (12px diameter, white fill with a subtle shadow) at the end of the progress arc
- Position is calculated from the current progress angle using basic trig
- The handle appears only in Focus mode's idle state, disappears once the timer starts
- `FocusMode` passes `showHandle={status === "idle"}` to `CircularTimer`

---

### Technical Details

- `getClientColor` and `SUNRISE_PALETTE` move to `src/lib/utils.ts` for reuse
- TimelinePage queries: same `time_entries` with client/project/task joins pattern, filtered by date range and `deleted_at IS NULL`
- Multi-task assignment creates multiple `time_entry` rows in a single transaction
- No database schema changes needed
- Tasks table already has `project_id` for scoping; new tasks created in the modal will link to the selected project

