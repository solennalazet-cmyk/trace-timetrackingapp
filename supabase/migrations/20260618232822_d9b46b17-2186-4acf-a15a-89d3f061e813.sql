
-- 1) Guard invitee updates on clients via trigger (RLS WITH CHECK cannot compare OLD vs NEW)
CREATE OR REPLACE FUNCTION public.guard_client_invitee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the updater is NOT the owner of the client row
  -- (i.e. the invitee acting via the "Invitee can accept or decline pending invite" policy).
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    IF (NEW.user_id IS DISTINCT FROM OLD.user_id)
       OR (NEW.name IS DISTINCT FROM OLD.name)
       OR (NEW.email IS DISTINCT FROM OLD.email)
       OR (NEW.phone IS DISTINCT FROM OLD.phone)
       OR (NEW.nif IS DISTINCT FROM OLD.nif)
       OR (NEW.default_rate IS DISTINCT FROM OLD.default_rate)
       OR (NEW.currency IS DISTINCT FROM OLD.currency)
       OR (NEW.billing_notes IS DISTINCT FROM OLD.billing_notes)
       OR (NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days)
       OR (NEW.business_address IS DISTINCT FROM OLD.business_address)
       OR (NEW.contract_url IS DISTINCT FROM OLD.contract_url)
       OR (NEW.cv_url IS DISTINCT FROM OLD.cv_url)
       OR (NEW.export_columns IS DISTINCT FROM OLD.export_columns)
       OR (NEW.site_address IS DISTINCT FROM OLD.site_address)
       OR (NEW.site_lat IS DISTINCT FROM OLD.site_lat)
       OR (NEW.site_lng IS DISTINCT FROM OLD.site_lng)
       OR (NEW.site_radius_m IS DISTINCT FROM OLD.site_radius_m)
       OR (NEW.kind IS DISTINCT FROM OLD.kind)
       OR (NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth)
       OR (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.engagement_start_date IS DISTINCT FROM OLD.engagement_start_date)
       OR (NEW.engagement_end_date IS DISTINCT FROM OLD.engagement_end_date)
       OR (NEW.agreed_start_time IS DISTINCT FROM OLD.agreed_start_time)
       OR (NEW.agreed_end_time IS DISTINCT FROM OLD.agreed_end_time)
       OR (NEW.agreed_daily_hours IS DISTINCT FROM OLD.agreed_daily_hours)
       OR (NEW.invited_email IS DISTINCT FROM OLD.invited_email)
       OR (NEW.invite_token IS DISTINCT FROM OLD.invite_token)
       OR (NEW.invited_at IS DISTINCT FROM OLD.invited_at)
       OR (NEW.connection_initiated_by IS DISTINCT FROM OLD.connection_initiated_by)
       OR (NEW.geolocation_override IS DISTINCT FROM OLD.geolocation_override)
    THEN
      RAISE EXCEPTION 'Invitees may only update connection_status and connected_user_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_client_invitee_update ON public.clients;
CREATE TRIGGER guard_client_invitee_update
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.guard_client_invitee_update();

-- 2) Allow a connected worker to view documents their employer uploaded about them.
CREATE POLICY "Connected worker can view their documents"
ON public.worker_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = worker_documents.client_id
      AND c.connected_user_id = auth.uid()
      AND c.connection_status = 'accepted'
  )
);
