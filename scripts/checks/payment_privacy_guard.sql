-- Proves the private payment model and report guards in the live database.
-- Runs entirely inside one transaction that is ROLLED BACK: nothing persists.
-- Usage: bash scripts/checks/payment_privacy_guard.sh
BEGIN;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT s.worker_user_id AS w, s.employer_user_id AS e,
       (SELECT id FROM public.clients c WHERE c.user_id = s.worker_user_id LIMIT 1) AS client,
       gen_random_uuid() AS approved_rep, gen_random_uuid() AS pending_rep, gen_random_uuid() AS solo_rep,
       gen_random_uuid() AS rej_rep, gen_random_uuid() AS r2
FROM public.submitted_reports s
WHERE s.employer_user_id IS NOT NULL AND s.employer_user_id <> s.worker_user_id
LIMIT 1;
GRANT SELECT ON t_ids TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.act_as(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS %', label; ELSE RAISE EXCEPTION 'FAIL %', label; END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.blocked(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE sql; GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS % (blocked: %)', label, SQLERRM; RETURN; END;
  IF n = 0 THEN RAISE NOTICE 'PASS % (no rows affected)', label; ELSE RAISE EXCEPTION 'FAIL % (allowed)', label; END IF;
END $$;

SELECT pg_temp.act_as(w) FROM t_ids;
-- Fixture reports (as the system, then rolled back).
INSERT INTO public.submitted_reports (id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status, submitted_at)
SELECT approved_rep, w, e, client, '2099-01-01'::date, '2099-01-31'::date, 10, 300, 'EUR', '{}'::text[], '[]'::jsonb, 'approved', now() FROM t_ids
UNION ALL SELECT r2, w, e, client, '2099-02-01'::date, '2099-02-28'::date, 10, 200, 'EUR', '{}'::text[], '[]'::jsonb, 'approved', now() FROM t_ids
UNION ALL SELECT pending_rep, w, e, client, '2099-03-01'::date, '2099-03-31'::date, 1, 50, 'EUR', '{}'::text[], '[]'::jsonb, 'submitted', now() FROM t_ids
UNION ALL SELECT rej_rep, w, e, client, '2099-04-01'::date, '2099-04-30'::date, 1, 50, 'EUR', '{}'::text[], '[]'::jsonb, 'rejected', now() FROM t_ids
UNION ALL SELECT solo_rep, w, NULL, client, '2099-05-01'::date, '2099-05-31'::date, 1, 50, 'EUR', '{}'::text[], '[]'::jsonb, 'approved', now() FROM t_ids;
RESET ROLE;
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
SELECT r2, 50, 'EUR', '2099-03-01'::date, e FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.recorded_by_user_id = w AND p.submitted_report_id IN (approved_rep, r2)) = 0, 'employer cannot read the freelancer''s new receipts (settled/shortfall)');
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.fully_settled OR p.shortfall IS NOT NULL) = 0, 'employer sees no settled or shortfall values at all');
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.submitted_report_id = approved_rep AND p.legacy_shared) = 1, 'employer still sees the legacy row');
SELECT pg_temp.blocked(format($q$UPDATE public.report_payments SET fully_settled = true WHERE recorded_by_user_id = %L AND submitted_report_id = %L$q$, e, r2), 'employer cannot mark a payment settled') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET employer_hidden_at = now() WHERE id = %L$q$, pending_rep), 'employer cannot hide a report still awaiting review') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET total_amount = 1, employer_hidden_at = now() WHERE id = %L$q$, rej_rep), 'employer cannot change anything else while hiding') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'rejected' WHERE id = %L$q$, approved_rep), 'employer cannot re-review an approved report') FROM t_ids;
UPDATE public.submitted_reports SET employer_hidden_at = now() WHERE id = (SELECT approved_rep FROM t_ids);
SELECT pg_temp.ok((SELECT employer_hidden_at IS NOT NULL FROM public.submitted_reports, t_ids WHERE id = approved_rep), 'employer can hide an approved report');
SELECT pg_temp.blocked(format($q$DELETE FROM public.submitted_reports WHERE id = %L$q$, rej_rep), 'employer cannot delete reports') FROM t_ids;
RESET ROLE;

SELECT pg_temp.act_as(w) FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.recorded_by_user_id = e AND p.submitted_report_id = r2) = 0, 'freelancer cannot read the employer''s new payment');
SELECT pg_temp.ok((SELECT count(*) FROM public.report_payments p, t_ids WHERE p.submitted_report_id = approved_rep AND p.legacy_shared) = 1, 'freelancer still sees the legacy row');
SELECT pg_temp.ok((SELECT status = 'approved' AND total_amount = 300 FROM public.submitted_reports, t_ids WHERE id = approved_rep), 'hiding changed nothing the freelancer sees');
SELECT pg_temp.blocked(format($q$DELETE FROM public.submitted_reports WHERE id = %L$q$, r2), 'freelancer delete cannot take the employer''s payments') FROM t_ids;
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

ROLLBACK;
