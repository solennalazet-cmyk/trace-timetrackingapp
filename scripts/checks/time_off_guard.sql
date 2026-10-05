-- Proves staff time off / closed days flags and the flagged-approval guard in the live database.
-- One transaction, ROLLED BACK at the end: nothing persists. Run as a database admin; every row must read PASS.
BEGIN;

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT s.worker_user_id AS w, s.employer_user_id AS e,
       (SELECT id FROM public.clients c WHERE c.user_id = s.worker_user_id AND c.connected_user_id = s.employer_user_id AND c.connection_status = 'accepted' LIMIT 1) AS client,
       (SELECT u.id FROM auth.users u WHERE u.id NOT IN (s.worker_user_id, s.employer_user_id) LIMIT 1) AS other_emp,
       gen_random_uuid() AS staff, gen_random_uuid() AS staff_dup,
       gen_random_uuid() AS rep, gen_random_uuid() AS rep_stale, gen_random_uuid() AS rep_plain,
       gen_random_uuid() AS rep_rej, gen_random_uuid() AS rep_appr
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
BEGIN INSERT INTO t_res(result) VALUES (CASE WHEN cond THEN 'PASS ' ELSE 'FAIL ' END || label); END $$;
CREATE OR REPLACE FUNCTION pg_temp.blocked(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN EXECUTE sql; GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN INSERT INTO t_res(result) VALUES ('PASS ' || label || ' (blocked: ' || SQLERRM || ')'); RETURN; END;
  INSERT INTO t_res(result) VALUES (CASE WHEN n = 0 THEN 'PASS ' || label || ' (no rows affected)' ELSE 'FAIL ' || label || ' (allowed)' END);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ents(VARIADIC d text[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('id', 'sess-' || x, 'entry_date', x, 'duration_minutes', 60, 'billable_value', 20)) FROM unnest(d) x $$;

-- Fixtures (system): employer staff row + a duplicate row for the same freelancer; reports.
SET LOCAL session_replication_role = replica;
INSERT INTO public.clients (id, user_id, name, kind, connection_status, connected_user_id)
SELECT staff, e, 'T staff', 'contractor', 'accepted', w FROM t_ids
UNION ALL SELECT staff_dup, e, 'T staff dup', 'contractor', 'none', w FROM t_ids;
SET LOCAL session_replication_role = origin;
INSERT INTO public.submitted_reports (id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status, submitted_at)
SELECT rep, w, e, client, '2099-03-01', '2099-12-31', 4, 80, 'EUR', '{}', pg_temp.ents('2099-03-10','2099-03-11','2099-12-25','2099-03-12'), 'submitted', now() FROM t_ids
UNION ALL SELECT rep_stale, w, e, client, '2099-03-01', '2099-03-31', 1, 20, 'EUR', '{}', pg_temp.ents('2099-03-10'), 'submitted', now() FROM t_ids
UNION ALL SELECT rep_plain, w, e, client, '2099-06-01', '2099-06-30', 1, 20, 'EUR', '{}', pg_temp.ents('2099-06-02'), 'submitted', now() FROM t_ids
UNION ALL SELECT rep_rej, w, e, client, '2099-03-01', '2099-03-31', 1, 20, 'EUR', '{}', pg_temp.ents('2099-03-11'), 'submitted', now() FROM t_ids
UNION ALL SELECT rep_appr, w, e, client, '2099-03-01', '2099-03-31', 1, 20, 'EUR', '{}', pg_temp.ents('2099-03-11'), 'approved', now() FROM t_ids;

-- Employer records days.
SELECT pg_temp.act_as(e) FROM t_ids;
INSERT INTO public.staff_time_off (employer_user_id, staff_client_id, start_date, end_date, type) SELECT e, staff, '2099-03-10', '2099-03-10', 'sick' FROM t_ids;
INSERT INTO public.employer_closed_days (employer_user_id, start_date, end_date, label) SELECT e, '2099-03-11', '2099-03-11', 'Closed' FROM t_ids;
INSERT INTO public.employer_closed_days (employer_user_id, start_date, end_date, label, repeat_yearly) SELECT e, '2090-12-25', '2090-12-25', 'Christmas', true FROM t_ids;

SELECT pg_temp.ok(EXISTS (SELECT 1 FROM t_ids, public.report_flags(rep) f WHERE f.entry_date = '2099-03-10' AND f.reason_label = 'sick'), 'session on a time-off day is flagged');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM t_ids, public.report_flags(rep) f WHERE f.entry_date = '2099-03-11' AND f.reason_label = 'Closed'), 'session on a closed day is flagged');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM t_ids, public.report_flags(rep) f WHERE f.entry_date = '2099-12-25' AND f.reason_label = 'Christmas'), 'session on a yearly repeat day is flagged');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM t_ids, public.report_flags(rep) f WHERE f.entry_date = '2099-03-12'), 'session on a normal day is not flagged');
SELECT pg_temp.blocked(format($q$INSERT INTO public.staff_time_off (employer_user_id, staff_client_id, start_date, end_date, type, note) VALUES (%L, %L, '2099-01-01', '2099-01-01', 'sick', 'flu')$q$, e, staff), 'a sick day cannot store a note') FROM t_ids;
SELECT pg_temp.blocked(format($q$INSERT INTO public.staff_time_off (employer_user_id, staff_client_id, start_date, end_date, type) VALUES (%L, %L, '2099-01-01', '2099-01-01', 'holiday')$q$, e, client), 'time off only on the employer''s own staff rows') FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'approved' WHERE id = %L$q$, rep), 'direct approval of flagged report without acknowledgement is refused') FROM t_ids;
SELECT pg_temp.ok((SELECT public.approve_report(rep, false)->>'outcome' FROM t_ids) = 'needs_ack', 'approve_report without acknowledgement asks for it');
SELECT pg_temp.ok((SELECT public.approve_report(rep, true)->>'outcome' FROM t_ids) = 'approved', 'approve anyway records acknowledgement and approves');
SELECT pg_temp.ok((SELECT count(*) FROM public.report_acknowledgements a, t_ids WHERE a.submitted_report_id = rep AND a.acknowledged_by_user_id = e) = 3, 'acknowledgement records who, when, and each flagged session');
SELECT pg_temp.ok((SELECT public.approve_report(rep, true)->>'outcome' FROM t_ids) = 'stale', 'double tap returns the stale outcome');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM t_ids, public.report_flags(rep) f), 'already-approved report is never flagged');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM t_ids, public.report_flags(rep_appr) f), 'approved report on a closed day is not flagged');

-- Stale acknowledgement: ack current flags, then a new closed day appears on the same date.
INSERT INTO public.report_acknowledgements (submitted_report_id, employer_user_id, session_id, acknowledged_by_user_id)
SELECT rep_stale, e, f.flag_key, e FROM t_ids, public.report_flags(rep_stale) f;
INSERT INTO public.employer_closed_days (employer_user_id, start_date, end_date, label) SELECT e, '2099-03-10', '2099-03-10', 'No service' FROM t_ids;
SELECT pg_temp.blocked(format($q$UPDATE public.submitted_reports SET status = 'approved' WHERE id = %L$q$, rep_stale), 'stale acknowledgement: new flag blocks direct approval') FROM t_ids;
SELECT pg_temp.ok((SELECT public.approve_report(rep_stale, false)->>'outcome' FROM t_ids) = 'needs_ack', 'stale acknowledgement: approve_report asks again');

-- Unflagged unchanged; rejecting never needs acknowledgement.
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public.report_flags(rep_plain)) = 0, 'unflagged report has no flags');
UPDATE public.submitted_reports SET status = 'approved' WHERE id = (SELECT rep_plain FROM t_ids) AND status = 'submitted';
SELECT pg_temp.ok((SELECT status FROM public.submitted_reports, t_ids WHERE id = rep_plain) = 'approved', 'unflagged report approves exactly as before');
UPDATE public.submitted_reports SET status = 'rejected', rejection_reason = 'other' WHERE id = (SELECT rep_rej FROM t_ids);
SELECT pg_temp.ok((SELECT status FROM public.submitted_reports, t_ids WHERE id = rep_rej) = 'rejected', 'rejecting a flagged report needs no acknowledgement');

-- Live: adding a day off updates a pending report's flags.
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public.report_flags(rep_stale)) = 2, 'pending report picks up a new closed day live');
SELECT pg_temp.ok((SELECT flag_count FROM t_ids, public.report_flags_batch(ARRAY[rep_stale, rep_plain, rep_rej]) b WHERE b.report_id = rep_stale) = 1
              AND (SELECT count(*) FROM t_ids, public.report_flags_batch(ARRAY[rep_stale, rep_plain, rep_rej])) = 1, 'batch returns flag counts for many reports in one call');

-- Import path.
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public.import_flags(staff, pg_temp.ents('2099-03-11'))) = 1, 'import pre-check flags a closed day');
SELECT pg_temp.ok((SELECT public.import_report(staff, '2099-03-01', '2099-03-31', 1, 20, 'EUR', '{}', pg_temp.ents('2099-03-11'), false)->>'outcome' FROM t_ids) = 'needs_ack', 'flagged import without acknowledgement asks for it');
SELECT pg_temp.blocked(format($q$INSERT INTO public.submitted_reports (worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, shared_columns, entries_snapshot, status, reviewed_at, source) VALUES (%L, %L, %L, '2099-03-01', '2099-03-31', 1, 20, 'EUR', '{}', %L::jsonb, 'approved', now(), 'imported')$q$, e, e, staff, pg_temp.ents('2099-03-11')), 'direct flagged import insert is refused') FROM t_ids;
SELECT pg_temp.ok((SELECT public.import_report(staff, '2099-03-01', '2099-03-31', 1, 20, 'EUR', '{}', pg_temp.ents('2099-03-11'), true)->>'outcome' FROM t_ids) = 'imported', 'import anyway saves with acknowledgement');
SELECT pg_temp.ok((SELECT public.import_report(staff, '2099-06-01', '2099-06-30', 1, 20, 'EUR', '{}', pg_temp.ents('2099-06-02'), false)->>'outcome' FROM t_ids) = 'imported', 'unflagged import works as before');

-- Staff matching: several rows -> time off on any of them counts; zero rows -> closed days still checked.
INSERT INTO public.staff_time_off (employer_user_id, staff_client_id, start_date, end_date, type) SELECT e, staff_dup, '2099-03-20', '2099-03-20', 'holiday' FROM t_ids;
RESET ROLE; SELECT set_config('request.jwt.claims', '{}', true);
UPDATE public.submitted_reports SET entries_snapshot = pg_temp.ents('2099-03-10','2099-03-20') WHERE id = (SELECT rep_stale FROM t_ids);
SELECT pg_temp.ok((SELECT cardinality(public._report_staff_ids(e, w, client)) FROM t_ids) >= 2, 'several staff rows for one freelancer are all matched');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM t_ids, public._report_flags_internal(rep_stale) f WHERE f.entry_date = '2099-03-20'), 'time off on a duplicate staff row is flagged');
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public._snapshot_flags(e, '{}'::uuid[], pg_temp.ents('2099-03-11','2099-03-10'))) = 2, 'no staff row: closed days are still checked');

-- Privacy: freelancer and another employer get nothing, by any call.
SELECT pg_temp.act_as(w) FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) FROM public.staff_time_off) + (SELECT count(*) FROM public.employer_closed_days, t_ids WHERE employer_user_id = e) = 0, 'freelancer cannot read time off or closed days');
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public.report_flags(rep_stale)) = 0, 'freelancer gets no flags from report_flags');
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public.report_flags_batch(ARRAY[rep_stale])) = 0, 'freelancer gets no flags from batch');
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public.import_flags(staff, pg_temp.ents('2099-03-11'))) = 0, 'freelancer gets no flags from import_flags');
SELECT pg_temp.ok((SELECT public.approve_report(rep_stale, true)->>'outcome' FROM t_ids) = 'stale', 'freelancer cannot approve via approve_report');
SELECT pg_temp.blocked(format($q$SELECT * FROM public._snapshot_flags(%L, ARRAY[%L]::uuid[], '[]')$q$, e, staff), 'internal _snapshot_flags not callable by signed-in users') FROM t_ids;
SELECT pg_temp.blocked(format($q$SELECT * FROM public._report_flags_internal(%L)$q$, rep_stale), 'internal _report_flags_internal not callable') FROM t_ids;
SELECT pg_temp.blocked(format($q$SELECT public._report_staff_ids(%L, %L, %L)$q$, e, w, staff), 'internal _report_staff_ids not callable') FROM t_ids;
SELECT pg_temp.blocked(format($q$INSERT INTO public.report_acknowledgements (submitted_report_id, employer_user_id, session_id, acknowledged_by_user_id) VALUES (%L, %L, 'x', %L)$q$, rep_stale, w, w), 'freelancer cannot write acknowledgements') FROM t_ids;
RESET ROLE; SELECT set_config('request.jwt.claims', '{}', true);
SELECT pg_temp.act_as(other_emp) FROM t_ids;
SELECT pg_temp.ok((SELECT count(*) FROM public.staff_time_off, t_ids WHERE employer_user_id = e) + (SELECT count(*) FROM public.employer_closed_days, t_ids WHERE employer_user_id = e) = 0, 'another employer cannot read time off or closed days');
SELECT pg_temp.ok((SELECT count(*) FROM t_ids, public.report_flags(rep_stale)) + (SELECT count(*) FROM t_ids, public.report_flags_batch(ARRAY[rep_stale])) + (SELECT count(*) FROM t_ids, public.import_flags(staff, pg_temp.ents('2099-03-11'))) = 0, 'another employer gets no flags by any function');
SELECT pg_temp.blocked(format($q$INSERT INTO public.staff_time_off (employer_user_id, staff_client_id, start_date, end_date, type) VALUES (%L, %L, '2099-01-01', '2099-01-01', 'holiday')$q$, e, staff), 'another employer cannot write in someone else''s name') FROM t_ids;
RESET ROLE;

SELECT result FROM t_res ORDER BY n;
ROLLBACK;
