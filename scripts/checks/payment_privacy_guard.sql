-- Proves the private payment model and report guards in the live database.
-- Runs entirely inside one transaction that is ROLLED BACK: nothing persists.
-- Run as a database admin (needs SET ROLE authenticated); every row must read PASS.
BEGIN;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT s.worker_user_id AS w, s.employer_user_id AS e,
       (SELECT id FROM public.clients c WHERE c.user_id = s.worker_user_id AND c.connected_user_id = s.employer_user_id AND c.connection_status = 'accepted' LIMIT 1) AS client,
       gen_random_uuid() AS approved_rep, gen_random_uuid() AS pending_rep, gen_random_uuid() AS solo_rep,
       gen_random_uuid() AS rej_rep, gen_random_uuid() AS r2
FROM public.submitted_reports s
WHERE s.employer_user_id IS NOT NULL AND s.employer_user_id <> s.worker_user_id
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.user_id = s.worker_user_id AND c.connected_user_id = s.employer_user_id AND c.connection_status = 'accepted')
LIMIT 1;
GRANT SELECT ON t_ids TO authenticated;
CREATE TEMP TABLE t_res (n serial, result text) ON COMMIT DROP;
GRANT ALL ON t_res TO authenticated;
GRANT USAGE ON SEQUENCE t_res_n_seq TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.act_as(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_res(result) VALUES (CASE WHEN cond THEN 'PASS ' ELSE 'FAIL ' END || label);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.blocked(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE sql; GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res(result) VALUES ('PASS ' || label || ' (blocked: ' || SQLERRM || ')'); RETURN; END;
  INSERT INTO t_res(result) VALUES (CASE WHEN n = 0 THEN 'PASS ' || label || ' (no rows affected)' ELSE 'FAIL ' || label || ' (allowed)' END);
END $$;

-- Fixture reports (as the system, then rolled back).
INSERT INTO public.submitted_reports (id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status, submitted_at)
SELECT approved_rep, w, e, client, '2099-01-01'::date, '2099-01-31'::date, 10, 300, 'EUR', '{}'::text[], '[]'::jsonb, 'approved', now() FROM t_ids
UNION ALL SELECT r2, w, e, client, '2099-02-01'::date, '2099-02-28'::date, 10, 200, 'EUR', '{}'::text[], '[]'::jsonb, 'approved', now() FROM t_ids
UNION ALL SELECT pending_rep, w, e, client, '2099-03-01'::date, '2099-03-31'::date, 1, 50, 'EUR', '{}'::text[], '[]'::jsonb, 'submitted', now() FROM t_ids
UNION ALL SELECT rej_rep, w, e, client, '2099-04-01'::date, '2099-04-30'::date, 1, 50, 'EUR', '{}'::text[], '[]'::jsonb, 'rejected', now() FROM t_ids
UNION ALL SELECT solo_rep, w, NULL, client, '2099-05-01'::date, '2099-05-31'::date, 1, 50, 'EUR', '{}'::text[], '[]'::jsonb, 'approved', now() FROM t_ids;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
-- One legacy row recorded by the employer.
INSERT INTO public.report_payments (submitted_report_id, amount, currency, paid_at, recorded_by_user_id, legacy_shared)
SELECT approved_rep, 100, 'EUR', '2099-02-01'::date, e, true FROM t_ids;

-- Freelancer records a new settled receipt across two reports, plus a new employer payment.
SELECT pg_temp.act_as(w) FROM t_ids;
INSERT INTO public.report_payments (submitted_report_id, amount, currency, paid_at, recorded_by_user_id, fully_settled, shortfall)
SELECT approved_rep, 200, 'EUR', '2099-02-02'::date, w, true, NULL FROM t_ids
UNION ALL SELECT r2, 180, 'EUR', '2099-02-02'::date, w, true, 20 FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.recorded_by_user_id = w AND p.fully_settled AND p.submitted_report_id IN (approved_rep, r2)) = 2, 'settled tick saved on both reports reached');
SELECT pg_temp.blocked(format($q$UPDATE public.report_payments SET legacy_shared = true WHERE recorded_by_user_id = %L AND submitted_report_id = %L$q$, w, r2), 'legacy tag cannot be changed') FROM t_ids;
SELECT pg_temp.blocked(format($q$INSERT INTO public.report_payments (submitted_report_id, amount, currency, paid_at, recorded_by_user_id, legacy_shared) VALUES (%L, 1, 'EUR', '2099-01-01', %L, true)$q$, r2, w), 'new rows cannot be tagged legacy') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET employer_hidden_at = now() WHERE id = %L$q$, approved_rep), 'freelancer cannot set employer_hidden_at') FROM t_ids;
SELECT pg_temp.blocked(format($q$DELETE FROM public.submitted_reports WHERE id = %L$q$, approved_rep), 'freelancer cannot delete an approved report with an employer') FROM t_ids;
RESET ROLE;

SELECT pg_temp.act_as(e) FROM t_ids;
INSERT INTO public.report_payments (submitted_report_id, amount, currency, paid_at, recorded_by_user_id)
SELECT r2, 50, 'EUR', '2099-03-01'::date, e FROM t_ids
UNION ALL SELECT pending_rep, 10, 'EUR', '2099-03-01'::date, e FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.recorded_by_user_id = w AND p.submitted_report_id IN (approved_rep, r2)) = 0, 'employer cannot read the freelancer''s new receipts (settled/shortfall)');
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.fully_settled OR p.shortfall IS NOT NULL) = 0, 'employer sees no settled or shortfall values at all');
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.submitted_report_id = approved_rep AND p.legacy_shared) = 1, 'employer still sees the legacy row');
SELECT pg_temp.blocked(format($q$UPDATE public.report_payments SET fully_settled = true WHERE recorded_by_user_id = %L AND submitted_report_id = %L$q$, e, r2), 'employer cannot mark a payment settled') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET employer_hidden_at = now() WHERE id = %L$q$, pending_rep), 'employer cannot hide a report still awaiting review') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET total_amount = 1, employer_hidden_at = now() WHERE id = %L$q$, rej_rep), 'employer cannot change anything else while hiding') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'approved' WHERE id = %L$q$, rej_rep), 'employer cannot approve a rejected report') FROM t_ids;
UPDATE public.submitted_reports SET employer_hidden_at = now() WHERE id = (SELECT approved_rep FROM t_ids);
SELECT pg_temp.ok((SELECT employer_hidden_at IS NOT NULL FROM public.submitted_reports, t_ids WHERE id = approved_rep), 'employer can hide an approved report');
SELECT pg_temp.blocked(format($q$DELETE FROM public.submitted_reports WHERE id = %L$q$, rej_rep), 'employer cannot delete reports') FROM t_ids;
RESET ROLE;

SELECT pg_temp.act_as(w) FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.recorded_by_user_id = e AND p.submitted_report_id = r2) = 0, 'freelancer cannot read the employer''s new payment');
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.submitted_report_id = approved_rep AND p.legacy_shared) = 1, 'freelancer still sees the legacy row');
SELECT pg_temp.ok((SELECT status = 'approved' AND total_amount = 300 FROM public.submitted_reports, t_ids WHERE id = approved_rep), 'hiding changed nothing the freelancer sees');
SELECT pg_temp.blocked(format($q$DELETE FROM public.submitted_reports WHERE id = %L$q$, pending_rep), 'freelancer delete of a pending report cannot take the employer''s payments') FROM t_ids;
DELETE FROM public.submitted_reports WHERE id = (SELECT solo_rep FROM t_ids);
SELECT pg_temp.ok((SELECT count(*) FROM public.submitted_reports, t_ids WHERE id = solo_rep) = 0, 'solo report can be deleted by its owner');
DELETE FROM public.submitted_reports WHERE id = (SELECT rej_rep FROM t_ids);
SELECT pg_temp.ok((SELECT count(*) FROM public.submitted_reports, t_ids WHERE id = rej_rep) = 0, 'rejected report can be deleted by the freelancer');
SELECT pg_temp.blocked(format($q$INSERT INTO public.submitted_reports (worker_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status, submitted_at, employer_hidden_at) VALUES (%L, %L, '2099-06-01'::date, '2099-06-30'::date, 1, 1, 'EUR', '{}'::text[], '[]'::jsonb, 'approved', now(), now())$q$, w, client), 'freelancer cannot insert with employer_hidden_at') FROM t_ids;
RESET ROLE;

SELECT pg_temp.act_as(gen_random_uuid());
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.submitted_report_id IN (approved_rep, r2)) = 0, 'outsider cannot read payments');
SELECT pg_temp.blocked(format($q$INSERT INTO public.report_payments (submitted_report_id, amount, currency, paid_at, recorded_by_user_id) VALUES (%L, 1, 'EUR', '2099-01-01', %L)$q$, r2, current_setting('request.jwt.claims')::json->>'sub'), 'outsider cannot insert payments') FROM t_ids;
RESET ROLE;

-- ===== Employer may reject an already-approved report =====
SELECT set_config('request.jwt.claims', '{}', true);
CREATE TEMP TABLE t_rev ON COMMIT DROP AS SELECT gen_random_uuid() AS x, gen_random_uuid() AS resend;
GRANT SELECT ON t_rev TO authenticated;
INSERT INTO public.submitted_reports (id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status, submitted_at, reviewed_at)
SELECT x, w, e, client, '2099-03-01'::date, '2099-03-31'::date, 5, 200, 'EUR', '{}'::text[], '[{"id":"s1"}]'::jsonb, 'approved', now(), now() - interval '1 day' FROM t_ids, t_rev;
INSERT INTO public.report_payments (submitted_report_id, amount, currency, paid_at, recorded_by_user_id)
SELECT x, 50, 'EUR', '2099-03-15', e FROM t_ids, t_rev;

SELECT pg_temp.act_as(gen_random_uuid());
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'rejected' WHERE id = %L$q$, x), 'another employer cannot reject this report') FROM t_rev;
RESET ROLE;

SELECT pg_temp.act_as(e) FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'rejected', total_amount = 1 WHERE id = %L$q$, x), 'employer cannot change the amount while rejecting') FROM t_rev;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'rejected', entries_snapshot = '[]'::jsonb WHERE id = %L$q$, x), 'employer cannot change sessions while rejecting') FROM t_rev;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET rejection_note = 'x' WHERE id = %L$q$, x), 'employer cannot edit review notes on an approved report without rejecting') FROM t_rev;
UPDATE public.submitted_reports SET status = 'rejected', rejection_reason = 'incorrect_hours', rejection_note = 'oops', notify_worker = true
 WHERE id = (SELECT x FROM t_rev) AND status IN ('submitted','approved');
SELECT pg_temp.ok((SELECT status = 'rejected' AND rejection_reason = 'incorrect_hours' AND rejection_note = 'oops' AND notify_worker AND reviewed_at > now() - interval '1 minute' AND total_amount = 200 FROM public.submitted_reports, t_rev WHERE id = x), 'employer rejects an approved report: status, reason, note, notify stored, fresh review time, amount unchanged');
-- Double tap: same conditional write again changes zero rows.
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'rejected' WHERE id = %L AND status IN ('submitted','approved')$q$, x), 'second reject tap changes nothing') FROM t_rev;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'approved' WHERE id = %L$q$, x), 'approve from rejected is refused') FROM t_rev;
SELECT pg_temp.ok((SELECT count(*) = 1 AND sum(amount) = 50 FROM public.report_payments p, t_rev WHERE p.submitted_report_id = x), 'employer payment is kept after rejection');
RESET ROLE;

SELECT pg_temp.act_as(w) FROM t_ids;
SELECT pg_temp.ok((SELECT status = 'rejected' AND notify_worker AND rejection_reason = 'incorrect_hours' FROM public.submitted_reports, t_rev WHERE id = x), 'freelancer sees the rejection with its reason');
INSERT INTO public.submitted_reports (id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status)
SELECT resend, w, e, client, '2099-03-01'::date, '2099-03-31'::date, 6, 240, 'EUR', '{}'::text[], '[]'::jsonb, 'submitted' FROM t_ids, t_rev;
SELECT pg_temp.ok((SELECT status = 'submitted' FROM public.submitted_reports, t_rev WHERE id = resend), 'freelancer can resend after an approved report was rejected');
RESET ROLE;

-- ===== Freelancer lock on sent reports =====
SELECT set_config('request.jwt.claims', '{}', true);
CREATE TEMP TABLE t_lock ON COMMIT DROP AS SELECT gen_random_uuid() AS solo, gen_random_uuid() AS pc, gen_random_uuid() AS pc2, gen_random_uuid() AS linkc;
GRANT SELECT ON t_lock TO authenticated;
INSERT INTO public.report_acknowledgements (submitted_report_id, employer_user_id, session_id, acknowledged_by_user_id)
SELECT approved_rep, e, 's1', e FROM t_ids;

SELECT pg_temp.act_as(w) FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'approved' WHERE id = %L$q$, pending_rep), 'freelancer cannot approve their own sent report') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET total_amount = 9999 WHERE id = %L$q$, approved_rep), 'freelancer cannot change the amount of an approved report') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET entries_snapshot = '[]'::jsonb, total_hours = 99 WHERE id = %L$q$, r2), 'freelancer cannot change the sessions of an approved report') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET total_amount = 1 WHERE id = %L$q$, pending_rep), 'freelancer cannot edit a report awaiting review') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET submitted_at = now() - interval '90 days' WHERE id = %L$q$, pending_rep), 'freelancer cannot change submitted_at of a sent report') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET source = 'imported' WHERE id = %L$q$, pending_rep), 'freelancer cannot change source of a sent report') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET rejection_note = NULL, total_amount = 1 WHERE id = %L$q$, x), 'freelancer cannot edit a rejected report') FROM t_rev;
SELECT pg_temp.blocked(format($q$INSERT INTO public.submitted_reports (worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status) VALUES (%L, %L, %L, '2099-07-01', '2099-07-31', 1, 1, 'EUR', '{}', '[]', 'pending_connection')$q$, w, e, client), 'pending_connection insert cannot name an employer') FROM t_ids;
SELECT pg_temp.blocked(format($q$INSERT INTO public.submitted_reports (worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status) VALUES (%L, %L, %L, '2099-07-01', '2099-07-31', 1, 1, 'EUR', '{}', '[]', 'approved')$q$, w, e, client), 'freelancer cannot insert a linked report as approved') FROM t_ids;
SELECT pg_temp.blocked(format($q$INSERT INTO public.submitted_reports (worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status) VALUES (%L, %L, %L, '2099-07-01', '2099-07-31', 1, 1, 'EUR', '{}', '[]', 'submitted')$q$, w, gen_random_uuid(), client), 'freelancer cannot send to an employer they are not connected to') FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.report_acknowledgements a, t_ids WHERE a.submitted_report_id = approved_rep), 'freelancer cannot read acknowledgements');
SELECT pg_temp.blocked(format($q$INSERT INTO public.report_acknowledgements (submitted_report_id, employer_user_id, acknowledged_by_user_id) VALUES (%L, %L, %L)$q$, approved_rep, e, w), 'freelancer cannot write acknowledgements') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.report_acknowledgements SET acknowledged_at = now() WHERE submitted_report_id = %L$q$, approved_rep), 'freelancer cannot change acknowledgements') FROM t_ids;
-- Solo and pending_connection stay editable.
INSERT INTO public.submitted_reports (id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status)
SELECT solo, w, NULL, client, '2099-08-01', '2099-08-31', 1, 10, 'EUR', '{}', '[]', 'approved' FROM t_ids, t_lock
UNION ALL SELECT pc, w, NULL, client, '2099-09-01', '2099-09-30', 1, 10, 'EUR', '{}', '[]', 'pending_connection' FROM t_ids, t_lock;
UPDATE public.submitted_reports SET total_amount = 20 WHERE id = (SELECT solo FROM t_lock);
SELECT pg_temp.ok((SELECT total_amount = 20 FROM public.submitted_reports, t_lock WHERE id = solo), 'solo report stays editable by its owner');
UPDATE public.submitted_reports SET total_amount = 30 WHERE id = (SELECT pc FROM t_lock);
SELECT pg_temp.ok((SELECT total_amount = 30 FROM public.submitted_reports, t_lock WHERE id = pc), 'pending_connection report stays editable');
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET employer_user_id = %L, status = 'submitted' WHERE id = %L$q$, e, solo), 'freelancer cannot attach an employer to a solo report') FROM t_ids, t_lock;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'submitted' WHERE id = %L$q$, pc), 'freelancer cannot move pending_connection to submitted by hand') FROM t_lock;
RESET ROLE;

SELECT pg_temp.act_as(e) FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.report_acknowledgements a, t_ids WHERE a.submitted_report_id = approved_rep), 'employer can read their acknowledgements');
RESET ROLE;

-- Automatic connection link still moves pending_connection to submitted (accepted by the employer).
SELECT set_config('request.jwt.claims', '{}', true);
ALTER TABLE public.clients DISABLE TRIGGER enforce_plan_limits_clients;
INSERT INTO public.clients (id, user_id, name, connection_status) SELECT linkc, w, 'Link test', 'pending' FROM t_ids, t_lock;
INSERT INTO public.submitted_reports (id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status)
SELECT pc2, w, NULL, linkc, '2099-10-01', '2099-10-31', 1, 10, 'EUR', '{}', '[]', 'pending_connection' FROM t_ids, t_lock;
SELECT set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true) FROM t_ids;
UPDATE public.clients SET connection_status = 'accepted', connected_user_id = (SELECT e FROM t_ids) WHERE id = (SELECT linkc FROM t_lock);
SELECT set_config('request.jwt.claims', '{}', true);
SELECT pg_temp.ok((SELECT status = 'submitted' AND employer_user_id = e FROM public.submitted_reports, t_ids, t_lock WHERE id = pc2), 'automatic connection link still delivers a pending report');
SELECT pg_temp.ok(current_setting('trace.system_link', true) IS DISTINCT FROM 'on', 'connection link flag is switched off afterwards');

SELECT result FROM t_res ORDER BY n;
ROLLBACK;
