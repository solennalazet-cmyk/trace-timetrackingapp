DROP POLICY IF EXISTS "Invitee can view pending invite" ON public.clients;
CREATE POLICY "Invitee can view pending invite"
ON public.clients
FOR SELECT
TO authenticated
USING (
  connection_status = 'pending'
  AND invited_email IS NOT NULL
  AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

DROP POLICY IF EXISTS "Invitee can accept or decline pending invite" ON public.clients;
CREATE POLICY "Invitee can accept or decline pending invite"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  connection_status = 'pending'
  AND invited_email IS NOT NULL
  AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
WITH CHECK (
  connection_status = ANY (ARRAY['accepted'::text, 'rejected'::text])
  AND (connected_user_id IS NULL OR connected_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Invitee can view pending worker invite" ON public.worker_invites;
CREATE POLICY "Invitee can view pending worker invite"
ON public.worker_invites
FOR SELECT
TO authenticated
USING (
  status = 'pending'
  AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

DROP POLICY IF EXISTS "Invitee can accept or decline worker invite" ON public.worker_invites;
CREATE POLICY "Invitee can accept or decline worker invite"
ON public.worker_invites
FOR UPDATE
TO authenticated
USING (
  status = 'pending'
  AND lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
WITH CHECK (status = ANY (ARRAY['accepted'::text, 'rejected'::text]));

DROP POLICY IF EXISTS "Parties can view payments" ON public.report_payments;
CREATE POLICY "Parties can view payments"
ON public.report_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.submitted_reports s
    WHERE s.id = report_payments.submitted_report_id
      AND (s.worker_user_id = auth.uid() OR s.employer_user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Parties can record payments" ON public.report_payments;
CREATE POLICY "Parties can record payments"
ON public.report_payments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = recorded_by_user_id
  AND EXISTS (
    SELECT 1
    FROM public.submitted_reports s
    WHERE s.id = report_payments.submitted_report_id
      AND (s.worker_user_id = auth.uid() OR s.employer_user_id = auth.uid())
  )
);

REVOKE EXECUTE ON FUNCTION public.email_matches_auth_user(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_submission(uuid) FROM authenticated;