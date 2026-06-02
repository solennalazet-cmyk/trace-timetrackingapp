
CREATE OR REPLACE FUNCTION public.enforce_plan_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count int;
BEGIN
  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  -- Trial and pro have no caps enforced here
  IF v_plan IS DISTINCT FROM 'free' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'clients' THEN
    SELECT count(*) INTO v_count FROM public.clients WHERE user_id = NEW.user_id;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'Free plan is limited to 1 client. Upgrade to Pro to add more.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    SELECT count(*) INTO v_count FROM public.projects WHERE user_id = NEW.user_id;
    IF v_count >= 2 THEN
      RAISE EXCEPTION 'Free plan is limited to 2 projects. Upgrade to Pro to add more.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_plan_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_plan_limits_clients ON public.clients;
CREATE TRIGGER enforce_plan_limits_clients
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();

DROP TRIGGER IF EXISTS enforce_plan_limits_projects ON public.projects;
CREATE TRIGGER enforce_plan_limits_projects
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limits();
