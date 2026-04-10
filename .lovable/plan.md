

## Settings Modal Reorganization

### Google Sign-on
The `redirect_uri_mismatch` error is a preview-environment issue. Test on the published URL (trace-timetrackingapp.lovable.app or custom domain). No code changes needed.

### Settings reorder + Pro gating

**New section order:**
1. **Targets** (Daily hour + Revenue) — PRO card
2. **Week starts on**
3. **Show activity on Start page** (toggle)
4. **Default report range**
5. **Time format**
6. **Break Tracking** (pause mode)
7. **New entries are billable** (toggle)
8. **Rounding** — PRO card
9. **Appearance**
10. **Idle reminder**
11. **Timer Completion Sound**
12. **Focus Timer Presets**
13. **Integrations** (remove Toggl/Notion mentions)

### Pro feature visual treatment
- Targets and Rounding sections wrapped in a subtle card with a distinct background (`bg-muted/40` light, `bg-muted/20` dark) and rounded corners
- Each card header shows the section title + `ProBadge` inline (visible for all users, including Pro)
- Free users: inputs are interactive but on submit trigger `PaywallModal`; a soft description line like *"Set daily goals to track your progress in Reports"* for Targets, *"Fine-tune how durations and amounts are displayed"* for Rounding
- No accordion or collapsible — everything visible, no extra tap needed

### Technical changes
**Single file: `src/components/SettingsModal.tsx`**
- Import `ProBadge`, `PaywallModal`, `useAuth` (already imported)
- Derive `isPro` from `profile` via `useAuth`
- Reorder JSX sections per the list above
- Create a `ProSection` wrapper component: renders a card with `bg-muted/40 rounded-2xl p-4` containing the title + ProBadge + description + children; for free users, intercepts `persist` calls on those fields to open PaywallModal instead
- Update Integrations text to: *"Google Calendar and more coming soon."*
- Add `PaywallModal` state (`paywallOpen`) with trigger from Pro-gated sections

