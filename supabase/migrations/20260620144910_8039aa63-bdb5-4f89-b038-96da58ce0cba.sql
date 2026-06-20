
CREATE OR REPLACE FUNCTION public.mirror_accepted_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_initiator_email text;
  v_initiator_name text;
  v_mirror_kind text;
  v_exists boolean;
BEGIN
  IF NEW.connection_status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.connection_status = 'accepted' THEN
    RETURN NEW;
  END IF;
  IF NEW.connected_user_id IS NULL OR NEW.connected_user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE user_id = NEW.connected_user_id
      AND connected_user_id = NEW.user_id
      AND connection_status = 'accepted'
  ) INTO v_exists;
  IF v_exists THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_initiator_email FROM auth.users WHERE id = NEW.user_id;
  SELECT NULLIF(full_name, '') INTO v_initiator_name FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.connection_initiated_by = 'worker' THEN
    v_mirror_kind := 'contractor';
    v_initiator_name := COALESCE(NULLIF(NEW.connection_requester_name, ''), v_initiator_name, v_initiator_email, 'Freelancer');
  ELSE
    v_mirror_kind := 'account';
    v_initiator_name := COALESCE(v_initiator_name, v_initiator_email, 'Employer');
  END IF;

  INSERT INTO public.clients (
    user_id, name, email, kind, connection_status, connected_user_id,
    connection_initiated_by, connection_requester_name
  )
  VALUES (
    NEW.connected_user_id, v_initiator_name, v_initiator_email, v_mirror_kind, 'accepted',
    NEW.user_id, NEW.connection_initiated_by, NEW.connection_requester_name
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_accepted_connection ON public.clients;
CREATE TRIGGER trg_mirror_accepted_connection
AFTER INSERT OR UPDATE OF connection_status ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.mirror_accepted_connection();

-- Backfill existing accepted connections that lack a mirror
INSERT INTO public.clients (
  user_id, name, email, kind, connection_status, connected_user_id,
  connection_initiated_by, connection_requester_name
)
SELECT
  c.connected_user_id,
  CASE
    WHEN c.connection_initiated_by = 'worker'
      THEN COALESCE(NULLIF(c.connection_requester_name, ''), NULLIF(p.full_name, ''), u.email, 'Freelancer')
    ELSE COALESCE(NULLIF(p.full_name, ''), u.email, 'Employer')
  END,
  u.email,
  CASE WHEN c.connection_initiated_by = 'worker' THEN 'contractor' ELSE 'account' END,
  'accepted',
  c.user_id,
  c.connection_initiated_by,
  c.connection_requester_name
FROM public.clients c
JOIN auth.users u ON u.id = c.user_id
LEFT JOIN public.profiles p ON p.id = c.user_id
WHERE c.connection_status = 'accepted'
  AND c.connected_user_id IS NOT NULL
  AND c.connected_user_id <> c.user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.clients c2
    WHERE c2.user_id = c.connected_user_id
      AND c2.connected_user_id = c.user_id
      AND c2.connection_status = 'accepted'
  );
