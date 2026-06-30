
-- When a client connection is accepted, link any reports the freelancer
-- queued for that client (employer_user_id = NULL, status = 'pending_connection')
-- so the employer can review them in their dashboard.
CREATE OR REPLACE FUNCTION public.link_pending_reports_on_connection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.connection_status = 'accepted'
     AND NEW.connected_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.connection_status IS DISTINCT FROM 'accepted') THEN
    UPDATE public.submitted_reports
       SET employer_user_id = NEW.connected_user_id,
           status = CASE WHEN status = 'pending_connection' THEN 'submitted' ELSE status END,
           submitted_at = CASE WHEN status = 'pending_connection' THEN now() ELSE submitted_at END,
           updated_at = now()
     WHERE client_id = NEW.id
       AND worker_user_id = NEW.user_id
       AND employer_user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_pending_reports_on_connection ON public.clients;
CREATE TRIGGER trg_link_pending_reports_on_connection
AFTER INSERT OR UPDATE OF connection_status, connected_user_id ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.link_pending_reports_on_connection();
