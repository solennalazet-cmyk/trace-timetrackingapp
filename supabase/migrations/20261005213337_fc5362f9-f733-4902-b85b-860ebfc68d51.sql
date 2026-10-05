CREATE TABLE public.staff_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_user_id uuid NOT NULL,
  staff_client_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_time_off_type_chk CHECK (type IN ('holiday','sick','personal')),
  CONSTRAINT staff_time_off_range_chk CHECK (start_date <= end_date),
  CONSTRAINT staff_time_off_sick_no_note CHECK (type <> 'sick' OR note IS NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_time_off TO authenticated;
GRANT ALL ON public.staff_time_off TO service_role;
ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employer manages own staff time off" ON public.staff_time_off
  FOR ALL TO authenticated
  USING (employer_user_id = auth.uid())
  WITH CHECK (employer_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = staff_client_id AND c.user_id = auth.uid()));
CREATE INDEX staff_time_off_lookup ON public.staff_time_off (employer_user_id, staff_client_id, start_date, end_date);
CREATE TRIGGER trg_staff_time_off_updated_at BEFORE UPDATE ON public.staff_time_off
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employer_closed_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  label text NOT NULL DEFAULT 'Closed',
  repeat_yearly boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_closed_days_range_chk CHECK (start_date <= end_date),
  CONSTRAINT employer_closed_days_label_chk CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT employer_closed_days_yearly_span CHECK (NOT repeat_yearly OR end_date - start_date < 366)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_closed_days TO authenticated;
GRANT ALL ON public.employer_closed_days TO service_role;
ALTER TABLE public.employer_closed_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employer manages own closed days" ON public.employer_closed_days
  FOR ALL TO authenticated
  USING (employer_user_id = auth.uid())
  WITH CHECK (employer_user_id = auth.uid());
CREATE INDEX employer_closed_days_lookup ON public.employer_closed_days (employer_user_id, start_date);
CREATE TRIGGER trg_employer_closed_days_updated_at BEFORE UPDATE ON public.employer_closed_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._report_staff_ids(_employer uuid, _worker uuid, _client uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(c.id), '{}'::uuid[]) FROM public.clients c
  WHERE c.user_id = _employer
    AND (c.id = _client OR (_worker IS DISTINCT FROM _employer AND c.connected_user_id = _worker));
$$;

CREATE OR REPLACE FUNCTION public._snapshot_flags(_employer uuid, _staff uuid[], _entries jsonb)
RETURNS TABLE (flag_key text, session_key text, entry_date date, duration_minutes numeric,
               amount numeric, reason_kind text, reason_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT coalesce(nullif(e->>'id',''), coalesce(e->>'entry_date','') || '@' || coalesce(e->>'start_time','') || '#' || ord::text) AS skey,
           coalesce(nullif(e->>'entry_date',''), left(e->>'start_time', 10))::date AS d,
           nullif(e->>'duration_minutes','')::numeric AS mins,
           coalesce(nullif(e->>'billable_value','')::numeric,
                    nullif(e->>'duration_minutes','')::numeric / 60.0 * nullif(e->>'hourly_rate','')::numeric) AS amt
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_entries) = 'array' THEN _entries ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(e, ord)
    WHERE coalesce(nullif(e->>'entry_date',''), left(e->>'start_time', 10)) ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  hits AS (
    SELECT s.*, 'time_off'::text AS kind, t.type AS label, 'off:' || t.type AS rcode
    FROM s JOIN public.staff_time_off t
      ON t.employer_user_id = _employer AND t.staff_client_id = ANY(_staff)
     AND s.d BETWEEN t.start_date AND t.end_date
    UNION ALL
    SELECT s.*, 'closed', c.label, 'closed:' || c.id::text
    FROM s JOIN public.employer_closed_days c ON c.employer_user_id = _employer
    WHERE (NOT c.repeat_yearly AND s.d BETWEEN c.start_date AND c.end_date)
       OR (c.repeat_yearly AND s.d >= c.start_date AND (
             (to_char(c.start_date,'MMDD') <= to_char(c.end_date,'MMDD')
               AND to_char(s.d,'MMDD') BETWEEN to_char(c.start_date,'MMDD') AND to_char(c.end_date,'MMDD'))
          OR (to_char(c.start_date,'MMDD') > to_char(c.end_date,'MMDD')
               AND (to_char(s.d,'MMDD') >= to_char(c.start_date,'MMDD') OR to_char(s.d,'MMDD') <= to_char(c.end_date,'MMDD')))))
  )
  SELECT DISTINCT skey || '|' || rcode, skey, d, mins, round(amt, 2), kind, label FROM hits;
$$;

CREATE OR REPLACE FUNCTION public._report_flags_internal(_report_id uuid)
RETURNS TABLE (flag_key text, session_key text, entry_date date, duration_minutes numeric,
               amount numeric, reason_kind text, reason_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.* FROM public.submitted_reports r,
    LATERAL public._snapshot_flags(r.employer_user_id,
      public._report_staff_ids(r.employer_user_id, r.worker_user_id, r.client_id), r.entries_snapshot) f
  WHERE r.id = _report_id AND r.status = 'submitted' AND r.employer_user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public._report_staff_ids(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._snapshot_flags(uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._report_flags_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_flags(_report_id uuid)
RETURNS TABLE (report_id uuid, flag_key text, session_key text, entry_date date, duration_minutes numeric,
               amount numeric, reason_kind text, reason_label text, acknowledged boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, f.flag_key, f.session_key, f.entry_date, f.duration_minutes, f.amount, f.reason_kind, f.reason_label,
         EXISTS (SELECT 1 FROM public.report_acknowledgements a
                 WHERE a.submitted_report_id = r.id AND a.session_id = f.flag_key)
  FROM public.submitted_reports r, LATERAL public._report_flags_internal(r.id) f
  WHERE r.id = _report_id AND auth.uid() IS NOT NULL
    AND r.employer_user_id = auth.uid() AND r.worker_user_id <> auth.uid()
  ORDER BY f.entry_date, f.session_key;
$$;

CREATE OR REPLACE FUNCTION public.report_flags_batch(_report_ids uuid[])
RETURNS TABLE (report_id uuid, flag_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, count(DISTINCT f.session_key)::int
  FROM public.submitted_reports r, LATERAL public._report_flags_internal(r.id) f
  WHERE r.id = ANY(_report_ids) AND auth.uid() IS NOT NULL
    AND r.employer_user_id = auth.uid() AND r.worker_user_id <> auth.uid()
  GROUP BY r.id;
$$;

CREATE OR REPLACE FUNCTION public.import_flags(_client_id uuid, _entries jsonb)
RETURNS TABLE (flag_key text, session_key text, entry_date date, duration_minutes numeric,
               amount numeric, reason_kind text, reason_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.* FROM public.clients c,
    LATERAL public._snapshot_flags(auth.uid(), public._report_staff_ids(auth.uid(), auth.uid(), c.id), _entries) f
  WHERE c.id = _client_id AND c.user_id = auth.uid() AND auth.uid() IS NOT NULL
  ORDER BY f.entry_date, f.session_key;
$$;

CREATE OR REPLACE FUNCTION public.approve_report(_report_id uuid, _acknowledge boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_status text; v_missing int; v_n int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT status INTO v_status FROM public.submitted_reports
   WHERE id = _report_id AND employer_user_id = v_uid AND worker_user_id <> v_uid FOR UPDATE;
  IF NOT FOUND OR v_status <> 'submitted' THEN RETURN jsonb_build_object('outcome', 'stale'); END IF;

  SELECT count(*) INTO v_missing FROM public._report_flags_internal(_report_id) f
   WHERE NOT EXISTS (SELECT 1 FROM public.report_acknowledgements a
                     WHERE a.submitted_report_id = _report_id AND a.session_id = f.flag_key);
  IF v_missing > 0 THEN
    IF NOT _acknowledge THEN RETURN jsonb_build_object('outcome', 'needs_ack', 'unacknowledged', v_missing); END IF;
    INSERT INTO public.report_acknowledgements (submitted_report_id, employer_user_id, session_id, acknowledged_by_user_id)
    SELECT _report_id, v_uid, f.flag_key, v_uid FROM public._report_flags_internal(_report_id) f
     WHERE NOT EXISTS (SELECT 1 FROM public.report_acknowledgements a
                       WHERE a.submitted_report_id = _report_id AND a.session_id = f.flag_key);
  END IF;

  UPDATE public.submitted_reports SET status = 'approved'
   WHERE id = _report_id AND status = 'submitted' AND employer_user_id = v_uid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('outcome', 'stale'); END IF;
  RETURN jsonb_build_object('outcome', 'approved');
END $$;

CREATE OR REPLACE FUNCTION public.import_report(_client_id uuid, _period_start date, _period_end date,
  _total_hours numeric, _total_amount numeric, _currency text, _shared_columns text[], _entries jsonb,
  _acknowledge boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_flags int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Unknown freelancer' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT count(*) INTO v_flags FROM public._snapshot_flags(v_uid, public._report_staff_ids(v_uid, v_uid, _client_id), _entries);
  IF v_flags > 0 AND NOT _acknowledge THEN RETURN jsonb_build_object('outcome', 'needs_ack'); END IF;

  PERFORM set_config('trace.import_ack', 'on', true);
  INSERT INTO public.submitted_reports (worker_user_id, employer_user_id, client_id, period_start, period_end,
    total_hours, total_amount, currency, shared_columns, entries_snapshot, status, reviewed_at, source)
  VALUES (v_uid, v_uid, _client_id, _period_start, _period_end, _total_hours, _total_amount, _currency,
    coalesce(_shared_columns, '{}'), _entries, 'approved', now(), 'imported')
  RETURNING id INTO v_id;
  PERFORM set_config('trace.import_ack', 'off', true);

  INSERT INTO public.report_acknowledgements (submitted_report_id, employer_user_id, session_id, acknowledged_by_user_id)
  SELECT v_id, v_uid, f.flag_key, v_uid
  FROM public._snapshot_flags(v_uid, public._report_staff_ids(v_uid, v_uid, _client_id), _entries) f;
  RETURN jsonb_build_object('outcome', 'imported', 'id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.report_flags(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_flags_batch(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_flags(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_report(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_report(uuid, date, date, numeric, numeric, text, text[], jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_flags(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_flags_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_flags(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_report(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_report(uuid, date, date, numeric, numeric, text, text[], jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_flagged_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'submitted' AND NEW.status = 'approved' AND EXISTS (
       SELECT 1 FROM public._report_flags_internal(OLD.id) f
        WHERE NOT EXISTS (SELECT 1 FROM public.report_acknowledgements a
                          WHERE a.submitted_report_id = OLD.id AND a.session_id = f.flag_key)) THEN
    RAISE EXCEPTION 'This report has sessions on days off or closed days. Review them before approving.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_flagged_approval BEFORE UPDATE ON public.submitted_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_flagged_approval();

CREATE OR REPLACE FUNCTION public.guard_flagged_import()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'imported' AND NEW.employer_user_id = NEW.worker_user_id
     AND coalesce(current_setting('trace.import_ack', true), '') <> 'on'
     AND coalesce(auth.role(), '') IN ('authenticated','anon')
     AND EXISTS (SELECT 1 FROM public._snapshot_flags(NEW.employer_user_id,
                   public._report_staff_ids(NEW.employer_user_id, NEW.worker_user_id, NEW.client_id), NEW.entries_snapshot)) THEN
    RAISE EXCEPTION 'This import has sessions on days off or closed days. Review them before importing.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_flagged_import BEFORE INSERT ON public.submitted_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_flagged_import();

REVOKE ALL ON FUNCTION public.guard_flagged_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_flagged_import() FROM PUBLIC, anon, authenticated;