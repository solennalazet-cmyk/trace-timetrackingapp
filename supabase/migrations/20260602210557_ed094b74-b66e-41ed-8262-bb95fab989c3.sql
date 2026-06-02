
-- 1) Restrict user_feedback INSERT to authenticated users only
DROP POLICY IF EXISTS "Users can submit feedback" ON public.user_feedback;
CREATE POLICY "Users can submit feedback"
ON public.user_feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 2) webhook_logs: add explicit deny-all policy so no API role can access it (service role bypasses RLS)
DROP POLICY IF EXISTS "No API access to webhook logs" ON public.webhook_logs;
CREATE POLICY "No API access to webhook logs"
ON public.webhook_logs
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 3) Scope worker_invites policies to authenticated role only (no anon)
DROP POLICY IF EXISTS "Employer owns their worker invites" ON public.worker_invites;
DROP POLICY IF EXISTS "Invitee can accept or decline worker invite" ON public.worker_invites;
DROP POLICY IF EXISTS "Invitee can view pending worker invite" ON public.worker_invites;

CREATE POLICY "Employer owns their worker invites"
ON public.worker_invites
FOR ALL
TO authenticated
USING (auth.uid() = employer_user_id)
WITH CHECK (auth.uid() = employer_user_id);

CREATE POLICY "Invitee can view pending worker invite"
ON public.worker_invites
FOR SELECT
TO authenticated
USING (status = 'pending' AND public.email_matches_auth_user(invited_email));

CREATE POLICY "Invitee can accept or decline worker invite"
ON public.worker_invites
FOR UPDATE
TO authenticated
USING (status = 'pending' AND public.email_matches_auth_user(invited_email))
WITH CHECK (status IN ('accepted', 'rejected'));

-- 4) Revoke EXECUTE on SECURITY DEFINER functions from anon/public
-- Trigger-only functions: revoke from all API roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_submitted_report_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Functions used inside RLS policies: revoke from anon (policies are authenticated-only); keep for authenticated
REVOKE EXECUTE ON FUNCTION public.email_matches_auth_user(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_submission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_matches_auth_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_submission(uuid) TO authenticated;
