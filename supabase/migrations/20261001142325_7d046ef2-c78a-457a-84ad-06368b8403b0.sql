CREATE OR REPLACE FUNCTION public.fill_missing_entry_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_rate numeric;
  v_cur text;
BEGIN
  IF COALESCE(NEW.billable, false) AND NEW.client_id IS NOT NULL AND NEW.rate_amount IS NULL THEN
    IF NEW.project_id IS NOT NULL THEN
      SELECT rate, currency INTO v_rate, v_cur FROM public.projects
       WHERE id = NEW.project_id AND user_id = NEW.user_id;
    END IF;
    IF v_rate IS NULL THEN
      SELECT default_rate, currency INTO v_rate, v_cur FROM public.clients
       WHERE id = NEW.client_id AND user_id = NEW.user_id;
    END IF;
    IF v_rate IS NULL THEN
      SELECT rate_amount, rate_currency INTO v_rate, v_cur FROM public.time_entries
       WHERE user_id = NEW.user_id AND client_id = NEW.client_id
         AND rate_unit = 'hour' AND rate_amount IS NOT NULL AND deleted_at IS NULL
         AND id <> NEW.id
       ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NOT NULL THEN
      NEW.rate_amount := v_rate;
      NEW.rate_unit := 'hour';
      NEW.rate_currency := COALESCE(NEW.rate_currency, v_cur, 'EUR');
      NEW.billable_value := NEW.duration_minutes / 60.0 * v_rate;
    END IF;
  END IF;

  IF COALESCE(NEW.billable, false) AND NEW.rate_amount IS NOT NULL AND NEW.billable_value IS NULL THEN
    NEW.billable_value := CASE WHEN COALESCE(NEW.rate_unit, 'hour') = 'hour'
      THEN NEW.duration_minutes / 60.0 * NEW.rate_amount ELSE NEW.rate_amount END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER zz_fill_missing_entry_rate
BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.fill_missing_entry_rate();