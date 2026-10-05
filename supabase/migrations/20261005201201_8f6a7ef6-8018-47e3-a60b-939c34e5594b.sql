CREATE OR REPLACE FUNCTION public.guard_report_payment_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_worker uuid;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION public.guard_submitted_report_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated','anon') THEN RETURN OLD; END IF;
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

CREATE OR REPLACE FUNCTION public.guard_submitted_report_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated','anon') AND NEW.employer_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only the employer can set employer_hidden_at' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

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
  ELSIF coalesce(auth.role(), '') IN ('authenticated','anon')
        AND NEW.employer_hidden_at IS DISTINCT FROM OLD.employer_hidden_at THEN
    RAISE EXCEPTION 'Only the employer can change employer_hidden_at' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_report_payment_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_submitted_report_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_submitted_report_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_submitted_report_update() FROM PUBLIC, anon, authenticated;