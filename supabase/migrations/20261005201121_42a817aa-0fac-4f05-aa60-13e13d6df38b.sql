ALTER TABLE public.report_payments
  ADD COLUMN legacy_shared boolean NOT NULL DEFAULT false,
  ADD COLUMN fully_settled boolean NOT NULL DEFAULT false,
  ADD COLUMN shortfall numeric;

UPDATE public.report_payments SET legacy_shared = true;

ALTER TABLE public.submitted_reports ADD COLUMN employer_hidden_at timestamptz;

-- Visibility: own rows, or legacy rows, on a report you are part of.
DROP POLICY IF EXISTS "Parties can view payments" ON public.report_payments;
CREATE POLICY "Recorder or legacy party can view payments" ON public.report_payments
FOR SELECT TO authenticated
USING (
  (recorded_by_user_id = auth.uid() OR legacy_shared)
  AND EXISTS (SELECT 1 FROM public.submitted_reports s
              WHERE s.id = report_payments.submitted_report_id
                AND (s.worker_user_id = auth.uid() OR s.employer_user_id = auth.uid()))
);

-- Guard payment columns for app users.
CREATE OR REPLACE FUNCTION public.guard_report_payment_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_worker uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.legacy_shared THEN
      RAISE EXCEPTION 'legacy_shared cannot be set' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NEW.legacy_shared IS DISTINCT FROM OLD.legacy_shared
       OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
       OR NEW.submitted_report_id IS DISTINCT FROM OLD.submitted_report_id THEN
      RAISE EXCEPTION 'These payment fields cannot be changed' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.fully_settled OR NEW.shortfall IS NOT NULL THEN
    SELECT worker_user_id INTO v_worker FROM public.submitted_reports WHERE id = NEW.submitted_report_id;
    IF NEW.legacy_shared OR v_worker IS DISTINCT FROM NEW.recorded_by_user_id THEN
      RAISE EXCEPTION 'Only the freelancer can mark their own new receipts as settled' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.shortfall IS NOT NULL AND NEW.shortfall < 0 THEN
      RAISE EXCEPTION 'Shortfall cannot be negative' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_report_payment_columns BEFORE INSERT OR UPDATE ON public.report_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_report_payment_columns();

-- Employer may hide reports they received once reviewed.
CREATE POLICY "Employer can hide reviewed reports" ON public.submitted_reports
FOR UPDATE TO authenticated
USING (auth.uid() = employer_user_id AND status IN ('approved','rejected'))
WITH CHECK (auth.uid() = employer_user_id AND status IN ('approved','rejected'));

CREATE OR REPLACE FUNCTION public.guard_submitted_report_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
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
    -- A review decision can only be made once, from 'submitted'.
    IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status <> 'submitted' THEN
      RAISE EXCEPTION 'This report has already been reviewed';
    END IF;
    IF NEW.employer_hidden_at IS DISTINCT FROM OLD.employer_hidden_at
       AND OLD.status NOT IN ('approved','rejected') THEN
      RAISE EXCEPTION 'Only reviewed reports can be removed';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.rejection_note IS DISTINCT FROM OLD.rejection_note
       OR NEW.notify_worker IS DISTINCT FROM OLD.notify_worker THEN
      NEW.reviewed_at := now();
    END IF;
  ELSIF current_user IN ('authenticated','anon')
        AND NEW.employer_hidden_at IS DISTINCT FROM OLD.employer_hidden_at THEN
    RAISE EXCEPTION 'Only the employer can change employer_hidden_at' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_submitted_report_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NEW.employer_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only the employer can set employer_hidden_at' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_submitted_report_insert BEFORE INSERT ON public.submitted_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_submitted_report_insert();

-- Deleting a report: approved reports sent to an employer are locked, and a
-- delete may never take the other party's payment records with it.
CREATE OR REPLACE FUNCTION public.guard_submitted_report_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN OLD; END IF;
  IF OLD.employer_user_id IS NOT NULL AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved reports are locked and cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.report_payments p
             WHERE p.submitted_report_id = OLD.id
               AND p.recorded_by_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'This report can no longer be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trg_guard_submitted_report_delete BEFORE DELETE ON public.submitted_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_submitted_report_delete();