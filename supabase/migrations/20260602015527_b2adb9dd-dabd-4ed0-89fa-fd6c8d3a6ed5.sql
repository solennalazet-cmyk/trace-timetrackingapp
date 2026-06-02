-- =========================================================
-- 1. Profiles: role model
-- =========================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_role text NOT NULL DEFAULT 'worker',
  ADD COLUMN IF NOT EXISTS available_roles text[] NOT NULL DEFAULT ARRAY['worker']::text[];

-- =========================================================
-- 2. Clients: connection to a Trace user
-- =========================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS connected_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS invited_email text NULL,
  ADD COLUMN IF NOT EXISTS invite_token uuid NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS connection_initiated_by text NULL; -- 'worker' | 'employer'

CREATE INDEX IF NOT EXISTS idx_clients_connected_user_id ON public.clients(connected_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_invite_token ON public.clients(invite_token);
CREATE INDEX IF NOT EXISTS idx_clients_invited_email ON public.clients(lower(invited_email));

-- Allow the connected employer to SEE the client row (in addition to the existing owner=user_id policy).
-- The existing policy is FOR ALL using (auth.uid() = user_id). We add a SELECT-only policy for the connected employer.
DROP POLICY IF EXISTS "Connected employer can view client row" ON public.clients;
CREATE POLICY "Connected employer can view client row"
  ON public.clients
  FOR SELECT
  USING (auth.uid() = connected_user_id AND connection_status = 'accepted');

-- Allow an invitee to accept/decline by token (server-side path will set status). We also allow updates
-- when the row is currently pending and the auth user matches the invited email — but RLS cannot read
-- auth.users.email directly without a helper, so we use a security-definer helper below.

CREATE OR REPLACE FUNCTION public.email_matches_auth_user(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND lower(u.email) = lower(_email)
  );
$$;

DROP POLICY IF EXISTS "Invitee can accept or decline pending invite" ON public.clients;
CREATE POLICY "Invitee can accept or decline pending invite"
  ON public.clients
  FOR UPDATE
  USING (
    connection_status = 'pending'
    AND invited_email IS NOT NULL
    AND public.email_matches_auth_user(invited_email)
  )
  WITH CHECK (
    connection_status IN ('accepted', 'rejected')
    AND (connected_user_id IS NULL OR connected_user_id = auth.uid())
  );

-- =========================================================
-- 3. Submitted reports
-- =========================================================
CREATE TABLE IF NOT EXISTS public.submitted_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id uuid NOT NULL,
  employer_user_id uuid NULL, -- null if recipient hasn't accepted yet, but normally set
  client_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_hours numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  shared_columns text[] NOT NULL DEFAULT '{}',
  entries_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'submitted', -- submitted|approved|rejected
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  rejection_reason text NULL, -- missing_session|incorrect_hours|incorrect_information|other
  rejection_note text NULL,
  parent_submission_id uuid NULL REFERENCES public.submitted_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submitted_reports_worker ON public.submitted_reports(worker_user_id);
CREATE INDEX IF NOT EXISTS idx_submitted_reports_employer ON public.submitted_reports(employer_user_id);
CREATE INDEX IF NOT EXISTS idx_submitted_reports_client ON public.submitted_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_submitted_reports_status ON public.submitted_reports(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submitted_reports TO authenticated;
GRANT ALL ON public.submitted_reports TO service_role;

ALTER TABLE public.submitted_reports ENABLE ROW LEVEL SECURITY;

-- Worker: full control over their own submissions
CREATE POLICY "Worker owns their submissions"
  ON public.submitted_reports
  FOR ALL
  USING (auth.uid() = worker_user_id)
  WITH CHECK (auth.uid() = worker_user_id);

-- Employer: can view submissions addressed to them
CREATE POLICY "Employer can view their incoming submissions"
  ON public.submitted_reports
  FOR SELECT
  USING (auth.uid() = employer_user_id);

-- Employer: can update only review fields (status, reviewed_at, rejection_*). We can't restrict
-- columns in RLS; enforce via a trigger that rejects edits to other fields by non-worker users.
CREATE POLICY "Employer can approve or reject"
  ON public.submitted_reports
  FOR UPDATE
  USING (auth.uid() = employer_user_id AND status = 'submitted')
  WITH CHECK (auth.uid() = employer_user_id AND status IN ('approved', 'rejected'));

CREATE OR REPLACE FUNCTION public.guard_submitted_report_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the updater is the employer (not the worker), only allow review-related columns to change.
  IF auth.uid() = NEW.employer_user_id AND auth.uid() <> NEW.worker_user_id THEN
    IF (NEW.worker_user_id IS DISTINCT FROM OLD.worker_user_id)
       OR (NEW.employer_user_id IS DISTINCT FROM OLD.employer_user_id)
       OR (NEW.client_id IS DISTINCT FROM OLD.client_id)
       OR (NEW.period_start IS DISTINCT FROM OLD.period_start)
       OR (NEW.period_end IS DISTINCT FROM OLD.period_end)
       OR (NEW.total_hours IS DISTINCT FROM OLD.total_hours)
       OR (NEW.total_amount IS DISTINCT FROM OLD.total_amount)
       OR (NEW.currency IS DISTINCT FROM OLD.currency)
       OR (NEW.shared_columns IS DISTINCT FROM OLD.shared_columns)
       OR (NEW.entries_snapshot IS DISTINCT FROM OLD.entries_snapshot)
       OR (NEW.submitted_at IS DISTINCT FROM OLD.submitted_at)
       OR (NEW.parent_submission_id IS DISTINCT FROM OLD.parent_submission_id) THEN
      RAISE EXCEPTION 'Employer can only modify review fields';
    END IF;
    NEW.reviewed_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_submitted_report_update ON public.submitted_reports;
CREATE TRIGGER trg_guard_submitted_report_update
  BEFORE UPDATE ON public.submitted_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_submitted_report_update();

-- =========================================================
-- 4. Report payments
-- =========================================================
CREATE TABLE IF NOT EXISTS public.report_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_report_id uuid NOT NULL REFERENCES public.submitted_reports(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by_user_id uuid NOT NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_payments_report ON public.report_payments(submitted_report_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_payments TO authenticated;
GRANT ALL ON public.report_payments TO service_role;

ALTER TABLE public.report_payments ENABLE ROW LEVEL SECURITY;

-- Helper: can the current user see this submission (as worker or employer)?
CREATE OR REPLACE FUNCTION public.can_access_submission(_sub_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.submitted_reports s
    WHERE s.id = _sub_id
      AND (s.worker_user_id = auth.uid() OR s.employer_user_id = auth.uid())
  );
$$;

CREATE POLICY "Parties can view payments"
  ON public.report_payments
  FOR SELECT
  USING (public.can_access_submission(submitted_report_id));

CREATE POLICY "Parties can record payments"
  ON public.report_payments
  FOR INSERT
  WITH CHECK (
    auth.uid() = recorded_by_user_id
    AND public.can_access_submission(submitted_report_id)
  );

CREATE POLICY "Recorder can edit or delete own payments"
  ON public.report_payments
  FOR UPDATE
  USING (auth.uid() = recorded_by_user_id);

CREATE POLICY "Recorder can delete own payments"
  ON public.report_payments
  FOR DELETE
  USING (auth.uid() = recorded_by_user_id);

-- =========================================================
-- 5. On signup: auto-link pending invites
-- =========================================================
-- Extend handle_new_user to set available_roles based on pending invites and link them.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_pending_as_employer boolean := false;
BEGIN
  INSERT INTO public.profiles (id, full_name, plan, trial_started_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    'trial',
    now()
  );

  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);

  -- Auto-link any pending client invites for this email (worker invited this user as their client → new user becomes employer).
  UPDATE public.clients
     SET connected_user_id = NEW.id,
         connection_status = 'accepted'
   WHERE connection_status = 'pending'
     AND lower(invited_email) = lower(NEW.email);

  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE connected_user_id = NEW.id AND connection_status = 'accepted'
  ) INTO v_has_pending_as_employer;

  IF v_has_pending_as_employer THEN
    UPDATE public.profiles
       SET available_roles = ARRAY['worker','employer']::text[],
           active_role = 'employer'
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
