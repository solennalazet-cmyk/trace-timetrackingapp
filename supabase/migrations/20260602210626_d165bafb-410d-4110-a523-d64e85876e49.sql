
-- active_sessions
DROP POLICY IF EXISTS "Users own their active session" ON public.active_sessions;
CREATE POLICY "Users own their active session" ON public.active_sessions
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- clients
DROP POLICY IF EXISTS "Users own their clients" ON public.clients;
DROP POLICY IF EXISTS "Connected employer can view client row" ON public.clients;
DROP POLICY IF EXISTS "Invitee can view pending invite" ON public.clients;
DROP POLICY IF EXISTS "Invitee can accept or decline pending invite" ON public.clients;

CREATE POLICY "Users own their clients" ON public.clients
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Connected employer can view client row" ON public.clients
FOR SELECT TO authenticated
USING (auth.uid() = connected_user_id AND connection_status = 'accepted');

CREATE POLICY "Invitee can view pending invite" ON public.clients
FOR SELECT TO authenticated
USING (connection_status = 'pending' AND invited_email IS NOT NULL AND public.email_matches_auth_user(invited_email));

CREATE POLICY "Invitee can accept or decline pending invite" ON public.clients
FOR UPDATE TO authenticated
USING (connection_status = 'pending' AND invited_email IS NOT NULL AND public.email_matches_auth_user(invited_email))
WITH CHECK (connection_status IN ('accepted','rejected') AND (connected_user_id IS NULL OR connected_user_id = auth.uid()));

-- invoices
DROP POLICY IF EXISTS "Users own their invoices" ON public.invoices;
CREATE POLICY "Users own their invoices" ON public.invoices
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Users own their profile" ON public.profiles;
CREATE POLICY "Users own their profile" ON public.profiles
FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- projects
DROP POLICY IF EXISTS "Users own their projects" ON public.projects;
CREATE POLICY "Users own their projects" ON public.projects
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- report_payments
DROP POLICY IF EXISTS "Parties can view payments" ON public.report_payments;
DROP POLICY IF EXISTS "Parties can record payments" ON public.report_payments;
DROP POLICY IF EXISTS "Recorder can edit or delete own payments" ON public.report_payments;
DROP POLICY IF EXISTS "Recorder can delete own payments" ON public.report_payments;

CREATE POLICY "Parties can view payments" ON public.report_payments
FOR SELECT TO authenticated USING (public.can_access_submission(submitted_report_id));

CREATE POLICY "Parties can record payments" ON public.report_payments
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = recorded_by_user_id AND public.can_access_submission(submitted_report_id));

CREATE POLICY "Recorder can edit own payments" ON public.report_payments
FOR UPDATE TO authenticated USING (auth.uid() = recorded_by_user_id) WITH CHECK (auth.uid() = recorded_by_user_id);

CREATE POLICY "Recorder can delete own payments" ON public.report_payments
FOR DELETE TO authenticated USING (auth.uid() = recorded_by_user_id);

-- submitted_reports
DROP POLICY IF EXISTS "Worker owns their submissions" ON public.submitted_reports;
DROP POLICY IF EXISTS "Employer can view their incoming submissions" ON public.submitted_reports;
DROP POLICY IF EXISTS "Employer can approve or reject" ON public.submitted_reports;

CREATE POLICY "Worker owns their submissions" ON public.submitted_reports
FOR ALL TO authenticated USING (auth.uid() = worker_user_id) WITH CHECK (auth.uid() = worker_user_id);

CREATE POLICY "Employer can view their incoming submissions" ON public.submitted_reports
FOR SELECT TO authenticated USING (auth.uid() = employer_user_id);

CREATE POLICY "Employer can approve or reject" ON public.submitted_reports
FOR UPDATE TO authenticated
USING (auth.uid() = employer_user_id AND status = 'submitted')
WITH CHECK (auth.uid() = employer_user_id AND status IN ('approved','rejected'));

-- tasks
DROP POLICY IF EXISTS "Users own their tasks" ON public.tasks;
CREATE POLICY "Users own their tasks" ON public.tasks
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- time_entries
DROP POLICY IF EXISTS "Users own their entries" ON public.time_entries;
CREATE POLICY "Users own their entries" ON public.time_entries
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_feedback
DROP POLICY IF EXISTS "Users read own feedback" ON public.user_feedback;
CREATE POLICY "Users read own feedback" ON public.user_feedback
FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- user_settings
DROP POLICY IF EXISTS "Users own their settings" ON public.user_settings;
CREATE POLICY "Users own their settings" ON public.user_settings
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
