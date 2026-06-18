CREATE OR REPLACE FUNCTION public.sync_time_entry_client_from_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_client_id uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.client_id
    INTO project_client_id
    FROM public.projects p
   WHERE p.id = NEW.project_id
     AND p.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project does not belong to this user';
  END IF;

  IF project_client_id IS NOT NULL THEN
    NEW.client_id := project_client_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_time_entry_client_from_project() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_time_entry_client_from_project_trigger ON public.time_entries;

CREATE TRIGGER sync_time_entry_client_from_project_trigger
BEFORE INSERT OR UPDATE OF project_id, client_id, user_id
ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.sync_time_entry_client_from_project();