# Staff time off and closed days, checked before approval (employer side only)

## Step 1: what I found (read-only, no data queries)

**a) How staff are identified.** Each staff member is the employer's own freelancer record (`clients` row, kind = contractor, `user_id` = the employer). Reports link to it in two ways:
- Linked reports: `submitted_reports.client_id` points to the *freelancer's* client row, not the employer's. The employer's staff row is found through `clients.user_id = employer AND connected_user_id = worker_user_id`.
- Imported reports and unconnected staff: `ImportReportSheet` sets `worker_user_id = employer_user_id = employer` and `client_id` = the employer's own staff row.
- **Decision:** the new tables use the employer's staff row (`staff_client_id`) as the key. This works for connected staff, unconnected staff and imports. A helper resolves which staff row a report belongs to.

**b) Schedule & engagement.** Shown in `WorkerProfilePage.tsx` (section titled "Schedule & engagement", reading `scheduled_days` and the engagement dates). It is edited in `WorkerEditForm.tsx` and saved to `clients`. The new data goes in separate tables, so `clients` and its guard triggers (`guard_client_invitee_update`, `enforce_plan_limits`, the mirror/link triggers) stay as they are.

**c) Places that approve a report (four):**
- `SubmittedReportSheet.tsx`, line 135, direct update
- `EmployerHomePage.tsx`, line 247, swipe/quick approve
- `PaymentsPage.tsx`, line 132
- `ImportReportSheet.tsx`, line 97, inserts the report already approved

All four can use one shared approve function. The import is the exception: it creates the row rather than updating it, so it needs its own import call that runs the same check.

**d) How the calendar and weekly schedule load.** `EmployerCalendarPage` makes one query for `submitted_reports` and two for `clients`. `WorkersWeekSchedule` makes one query for `clients`. To show the new data, each screen adds one extra request for the visible date range, run in parallel with the existing ones, so loading time does not grow noticeably.

**e) Time zones.** `entry_date` in `entries_snapshot` is a plain local date (`YYYY-MM-DD`, from `toLocalDateKey`). A session that crosses midnight is flagged by its **start date** only. This keeps the rule simple and predictable. Checking the end date as well could be added later.

## Step 2: proposal

### Data (two new tables; each employer can read and write only their own rows)
- `staff_time_off`: employer_user_id, staff_client_id, start_date, end_date (inclusive), type (holiday / sick / personal), note, timestamps.
  - A trigger rejects any note when type = sick, so no reason or health details can be stored.
  - Another trigger checks that start ≤ end and that the staff row belongs to the employer.
- `employer_closed_days`: employer_user_id, start_date, end_date, label (default "Closed"; "No service" or free text allowed), repeat_yearly, timestamps.
  - No holiday lists are built in. Importing a public-holiday list is noted as a later option and needs your OK first.
- **Half days later:** add optional `start_part` / `end_part` columns (morning/afternoon) to both tables. Existing full-day rows keep working, so nothing needs rebuilding.
- **Freelancers:** no access to either table. RLS only allows `employer_user_id = auth.uid()`.
- **Grants:** authenticated and service role only.

### The one check: `report_flags(report_id)`
- A security-definer database function. Only the report's employer can call it.
- It returns one row per flagged session: date, duration, amount, reason (time off type or closed-day label).
- It returns nothing unless the report status is `submitted`, so approved and rejected reports are never flagged. Pending reports are checked live, so adding a day off changes the flags straight away.
- Yearly repeats are matched by month and day across years, including ranges that span New Year.
- A sister function, `snapshot_flags(employer, staff_client_id, entries jsonb)`, holds the same logic. `report_flags` calls it, and the import uses it to check before saving.

### How approval is enforced
- New function `approve_report(report_id, acknowledge boolean)`:
  - If the report has flags and `acknowledge` is false, it refuses and returns the flags.
  - Otherwise it records who acknowledged and when in the existing employer-only `report_acknowledgements` table, then approves.
- `guard_submitted_report_update` is extended: moving `submitted → approved` while flags exist is refused unless an acknowledgement row exists. This also stops direct updates that bypass the app.
- Rejecting never needs an acknowledgement. Unflagged reports approve exactly as today.
- New function `import_report(...)` runs `snapshot_flags`. If there are flags, it requires `acknowledge`, then inserts the report and the acknowledgement together. `guard_submitted_report_insert` refuses imported rows that have flags but no acknowledgement in the same transaction (a transaction flag, the same pattern as `trace.system_link`).

### Code
- New employer-only files:
  - `src/lib/employer/approve-report.ts`: one shared approve call
  - `src/components/employer/FlaggedApprovalDialog.tsx`: "Approve anyway" / "Open report" / "Reject", reusing `RejectReportDialog`
  - `src/components/employer/TimeOffList.tsx`
  - `src/components/employer/ClosedDaysSheet.tsx`
  - `src/hooks/employer/useReportFlags.ts`
- Files that change:
  - `SubmittedReportSheet.tsx`: **shared, needs your OK.** Flag banner and approval through the shared function, shown only on the employer review path, which the sheet already separates from the read-only view.
  - `PaymentsPage.tsx`: **shared/embedded, needs your OK.** Approval call and badge, employer section only.
  - `EmployerHomePage.tsx`: **embeds shared pieces, needs your OK.** Swipe approval and badge.
  - `ImportReportSheet.tsx`: employer only. Check before saving, then the warning.
  - `WorkerProfilePage.tsx`: employer only. Time off list under the schedule.
  - `EmployerCalendarPage.tsx`: employer only. Tap a day to mark it closed (single day or range, repeat yearly, "Add another"), with markers and a legend.
  - `WorkersWeekSchedule.tsx`: employer only. Off and closed styling.
  - `AGENTS.md`: one new rule.

### Screens
- **Staff profile:** a "Time off" list (past and upcoming) with add, edit and delete. The note field is hidden for sick days.
- **Calendar:** distinct dotted markers for time off and closed days, with a legend.
- **Report review sheet:** a banner at the top, e.g. "Session on 12 Oct falls on a day marked as sick day", listing date, duration and amount.
- **Home and Payments lists:** a "Check dates" badge on flagged pending reports.

### Tests
- **Database checks, rolled back** (added to `scripts/checks/`): each of the 13 cases you listed. These include a direct approval update being refused, the four approval paths including import, rejecting without acknowledgement, the freelancer being unable to read either table, separation between employers, approved reports never flagged, and live re-flagging.
- **App tests:** a unit test for the shared approve wrapper's handling of flagged and unflagged reports.
- Also run: the payment privacy check, the assignment-box stability check and the build.

### Not touched
Payment split and payment model, timer, assignment box, the freelancer side, and all existing data. Nothing is backfilled.
