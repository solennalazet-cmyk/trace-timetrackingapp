CREATE OR REPLACE FUNCTION public.guard_submitted_report_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF NEW.employer_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only the employer can set employer_hidden_at' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'pending_connection' AND NEW.employer_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'A report waiting for a connection cannot name an employer' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.employer_user_id IS NULL THEN
    IF NEW.status NOT IN ('approved','pending_connection') THEN
      RAISE EXCEPTION 'A report without an employer is either solo or waiting for a connection' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.employer_user_id = NEW.worker_user_id THEN
    -- Employer's own imported report.
    IF NEW.status <> 'approved' OR NEW.source <> 'imported' THEN
      RAISE EXCEPTION 'Only imported reports can be recorded on your own account' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.status <> 'submitted' OR NEW.reviewed_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL OR NEW.rejection_note IS NOT NULL THEN
      RAISE EXCEPTION 'A report sent to an employer starts awaiting review' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clients c
                   WHERE c.id = NEW.client_id AND c.user_id = NEW.worker_user_id
                     AND c.connected_user_id = NEW.employer_user_id AND c.connection_status = 'accepted') THEN
      RAISE EXCEPTION 'You can only send a report to a connected client' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_submitted_report_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- The automatic connection link (link_pending_reports_on_connection) sets this flag.
  IF current_setting('trace.system_link', true) = 'on' THEN
    NEW.updated_at := now(); RETURN NEW;
  END IF;

  IF auth.uid() = OLD.employer_user_id AND auth.uid() <> OLD.worker_user_id THEN
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
       OR (NEW.source IS DISTINCT FROM OLD.source)
       OR (NEW.parent_submission_id IS DISTINCT FROM OLD.parent_submission_id) THEN
      RAISE EXCEPTION 'Employer can only modify review fields';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected'))
       AND NOT (OLD.status = 'approved' AND NEW.status = 'rejected') THEN
      RAISE EXCEPTION 'This report has already been reviewed';
    END IF;
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
  ELSIF coalesce(auth.role(), '') IN ('authenticated','anon') THEN
    IF NEW.employer_hidden_at IS DISTINCT FROM OLD.employer_hidden_at THEN
      RAISE EXCEPTION 'Only the employer can change employer_hidden_at' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF auth.uid() = OLD.worker_user_id THEN
      IF OLD.employer_user_id IS NOT NULL AND OLD.employer_user_id <> OLD.worker_user_id THEN
        IF OLD.status IN ('submitted','approved','rejected') THEN
          RAISE EXCEPTION 'This report was sent and can no longer be edited' USING ERRCODE = 'insufficient_privilege';
        END IF;
      ELSIF OLD.employer_user_id IS NULL THEN
        IF NEW.employer_user_id IS NOT NULL THEN
          RAISE EXCEPTION 'An employer is attached only through the connection' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          RAISE EXCEPTION 'The status of this report cannot be changed by hand' USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_pending_reports_on_connection()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.connection_status = 'accepted'
     AND NEW.connected_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.connection_status IS DISTINCT FROM 'accepted') THEN
    PERFORM set_config('trace.system_link', 'on', true);
    UPDATE public.submitted_reports
       SET employer_user_id = NEW.connected_user_id,
           status = CASE WHEN status = 'pending_connection' THEN 'submitted' ELSE status END,
           submitted_at = CASE WHEN status = 'pending_connection' THEN now() ELSE submitted_at END,
           updated_at = now()
     WHERE client_id = NEW.id
       AND worker_user_id = NEW.user_id
       AND employer_user_id IS NULL;
    PERFORM set_config('trace.system_link', 'off', true);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TABLE public.report_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_report_id uuid NOT NULL REFERENCES public.submitted_reports(id) ON DELETE CASCADE,
  employer_user_id uuid NOT NULL,
  session_id text,
  acknowledged_by_user_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_acknowledgements TO authenticated;
GRANT ALL ON public.report_acknowledgements TO service_role;
ALTER TABLE public.report_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employer manages acknowledgements on their reports"
ON public.report_acknowledgements FOR ALL TO authenticated
USING (employer_user_id = auth.uid()
       AND EXISTS (SELECT 1 FROM public.submitted_reports s
                   WHERE s.id = submitted_report_id AND s.employer_user_id = auth.uid() AND s.worker_user_id <> auth.uid()))
WITH CHECK (employer_user_id = auth.uid() AND acknowledged_by_user_id = auth.uid()
       AND EXISTS (SELECT 1 FROM public.submitted_reports s
                   WHERE s.id = submitted_report_id AND s.employer_user_id = auth.uid() AND s.worker_user_id <> auth.uid()));