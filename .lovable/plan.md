
## Trace – Master Plan

---

### 1. Tab Navigation

- **Done tab** (formerly Timeline): `src/pages/TimelinePage.tsx`
  - Route: `/timeline`, icon: `CheckSquare`, label: "Done"
  - Date range picker, client color legend, hero stats, task list grouped by day
  - Insights section (Pro-locked with blur overlay for free users)
  - Free plan: 7-day limit on tasks + restricted date range picker

---

### 2. Client Color-Coding

- `getClientColor(id)` extracted to `src/lib/utils.ts`
- Deterministic hash → consistent colors across Reports, Done tab, etc.

---

### 3. Multi-Task Assignment

- **File: `src/components/AssignmentModal.tsx`**
- "+" button appends tasks to a list with editable duration splits
- Save creates one `time_entry` per task, splitting total duration
- Task combobox resets after each addition

---

### 4. Mobile Modal Scrolling & Touch Handling

- **Dialog (`src/components/ui/dialog.tsx`)**:
  - `useVisualViewportStyle` hook dynamically repositions centered dialogs when the mobile keyboard opens using `window.visualViewport` API
  - `maxHeight` and `top` are recalculated on viewport resize/scroll events
  - All modals use `overscroll-contain`, `-webkit-overflow-scrolling: touch`, `touch-action: pan-y`

- **CreatableCombobox (`src/components/CreatableCombobox.tsx`)**:
  - Touch gesture tracking (`touchStartYRef`, `touchMovedRef`) differentiates scroll from tap
  - `runIfNotScrolling()` wrapper prevents accidental item selection during swipe
  - Dropdown uses `overscroll-contain` + `touch-action: pan-y` to prevent parent/browser scroll
  - Accepts `scrollContainerRef` prop — dropdown auto-closes when parent scrolls

- **All editing modals** (`AssignmentModal`, `ManualEntryModal`, `CallLogModal`):
  - Use `position="centered"` on DialogContent
  - Split layout: fixed header + scrollable body (`overflow-y-auto overscroll-contain`) + sticky footer
  - `onPointerDownOutside` / `onInteractOutside` disabled to prevent accidental dismissal
  - `dvh` units for max height; safe-area padding for bottom buttons

---

### 5. Rate Resolution & Billing Integrity

- **Rate cascade** (`src/lib/resolve-rate.ts`):
  1. Project rate (from `projects` table)
  2. Most recent entry rate for this project
  3. Client default rate (from `clients` table)
  4. Most recent entry rate for this client
  5. Fallback: `{ amount: null, currency: "EUR" }`

- **`useAutoResolvedRate` hook** (`src/hooks/useAutoResolvedRate.ts`):
  - Request key pattern prevents stale async responses from overwriting current state
  - `skip` flag avoids re-resolving when editing an existing entry with unchanged client/project
  - `onReset` clears rate fields immediately; `onResolved` applies the resolved rate
  - For anonymous users: synchronous lookup from local `clients`/`projects` arrays

- **Dependent field clearing** (all modals):
  - Changing Client → clears Project, Task, TaskList, and triggers rate re-resolve
  - Changing Project → clears Task, TaskList, and triggers rate re-resolve

- **Billing status protection** (save handlers in `StartPage`, `TimelinePage`, `ReportsPage`):
  - If any billing-critical field changes (Client, Project, Task, Rate, Billable), `billing_status` resets to `"unbilled"` and `invoice_id` is cleared
  - Manual rate edits within an entry do NOT update the client's global default

---

### 6. Focus Mode Drag Handle

- **Files: `CircularTimer.tsx`, `FocusMode.tsx`**
- 12px white circle with shadow at end of progress arc
- Visible only when `status === "idle"`, disappears on start

---

### 7. Technical Notes

- `SUNRISE_PALETTE` + `getClientColor` live in `src/lib/utils.ts`
- Tasks scoped by `project_id` in `tasks` table
- Multi-task assignment creates multiple rows in single transaction
- No custom backend schema changes needed for these features
- Supabase types auto-generated — never edit `src/integrations/supabase/types.ts`
- `.env` and `client.ts` are auto-managed — never edit manually
