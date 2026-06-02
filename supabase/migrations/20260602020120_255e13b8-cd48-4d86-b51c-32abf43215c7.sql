DROP POLICY IF EXISTS "Invitee can view pending invite" ON public.clients;
CREATE POLICY "Invitee can view pending invite"
  ON public.clients
  FOR SELECT
  USING (
    connection_status = 'pending'
    AND invited_email IS NOT NULL
    AND public.email_matches_auth_user(invited_email)
  );