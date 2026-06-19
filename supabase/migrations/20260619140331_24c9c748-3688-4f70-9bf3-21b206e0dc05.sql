CREATE OR REPLACE FUNCTION public.decline_client_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _row public.clients%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _row FROM public.clients WHERE id = _invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  _email := lower(COALESCE(auth.jwt() ->> 'email', ''));

  IF _row.connection_status <> 'pending'
     OR _row.invited_email IS NULL
     OR lower(_row.invited_email) <> _email THEN
    RAISE EXCEPTION 'Not authorized to decline this invite';
  END IF;

  UPDATE public.clients
  SET connection_status = 'rejected'
  WHERE id = _invite_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_client_invite(uuid) TO authenticated;