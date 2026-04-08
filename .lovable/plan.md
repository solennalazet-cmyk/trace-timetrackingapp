

# Downgrade Flow: Keep Data Visible, Limit Editing

## Overview
When a Pro user downgrades to Free, they return to 2 clients / 3 projects limits. If they exceed those limits, a selection modal prompts them to choose which to keep "active." Inactive ones remain fully visible but non-interactive.

## Key principle: No data loss, no data hiding
- **Reports**: All time entries for inactive clients/projects remain visible and included in calculations. No filtering by `is_active` in Reports queries.
- **Projects tab**: Inactive clients and projects appear muted (greyed out, not clickable/editable). Active ones work normally.
- **Assignment modals** (new entries): Only active clients/projects appear in dropdowns — you can't assign new work to inactive items.
- **Re-upgrade**: All items become active again automatically.

## What changes

### 1. Database: `is_active` column on `clients` and `projects`
- `ALTER TABLE clients ADD COLUMN is_active boolean NOT NULL DEFAULT true;`
- `ALTER TABLE projects ADD COLUMN is_active boolean NOT NULL DEFAULT true;`

### 2. New component: `DowngradeSelectionModal`
Two-step modal triggered when `plan = "free"` and user exceeds limits:
- **Step 1**: Choose up to 2 clients to keep active (shows entry count per client).
- **Step 2**: Choose up to 3 projects to keep active (projects of deactivated clients are pre-unchecked).
- **Confirm**: Sets `is_active = false` on unselected items.

### 3. Trigger logic
In `AppLayout.tsx`, when profile loads with `plan = "free"` and active clients > 2 or active projects > 3, open the modal.

### 4. Projects tab — muted inactive items
In `ClientsPage.tsx`, fetch ALL clients/projects (no `is_active` filter). Render inactive ones with muted styling (`opacity-50`, no click handler, no edit/delete). Active ones behave normally.

### 5. Assignment modals — filter to active only
In `AssignmentModal.tsx` and similar, filter dropdowns to `.eq("is_active", true)` so new entries can only be assigned to active items.

### 6. Reports — no change
Reports queries do NOT filter by `is_active`. All historical data remains visible regardless of plan.

### 7. Account modal — note for free users
Show: "Some clients/projects are inactive. Upgrade to Pro to edit them again."

### 8. Webhook: re-activate on upgrade
On `checkout.session.completed` (plan → pro), set all user's clients and projects to `is_active = true`.

## Files modified/created
- New migration: add `is_active` to `clients` and `projects`
- New: `src/components/DowngradeSelectionModal.tsx`
- `src/components/AppLayout.tsx` — trigger modal
- `src/pages/ClientsPage.tsx` — muted rendering for inactive
- `src/components/AssignmentModal.tsx` — filter active only in dropdowns
- `src/components/AccountModal.tsx` — inactive items note
- `supabase/functions/stripe-webhook/index.ts` — re-activate on upgrade
