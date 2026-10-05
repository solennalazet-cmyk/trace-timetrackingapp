DROP POLICY IF EXISTS "Employer can approve or reject" ON public.submitted_reports;
CREATE POLICY "Employer can approve or reject" ON public.submitted_reports
FOR UPDATE TO authenticated
USING ((auth.uid() = employer_user_id) AND (status = ANY (ARRAY['submitted'::text, 'approved'::text])))
WITH CHECK ((auth.uid() = employer_user_id) AND (status = ANY (ARRAY['approved'::text, 'rejected'::text])));

CREATE OR REPLACE FUNCTION public.guard_submitted_report_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    -- Allowed status changes: submitted -> approved/rejected, approved -> rejected.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected'))
       AND NOT (OLD.status = 'approved' AND NEW.status = 'rejected') THEN
      RAISE EXCEPTION 'This report has already been reviewed';
    END IF;
    -- Review details can only change together with an allowed status change
    -- (or while the report is still awaiting review).
    IF NEW.status IS NOT DISTINCT FROM OLD.status AND OLD.status <> 'submitted'
       AND (NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
            OR NEW.rejection_note IS DISTINCT FROM OLD.rejection_note
            OR NEW.notify_worker IS DISTINCT FROM OLD.notify_worker) THEN
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