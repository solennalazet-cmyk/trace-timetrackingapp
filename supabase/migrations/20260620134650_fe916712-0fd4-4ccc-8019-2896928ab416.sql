CREATE OR REPLACE FUNCTION public.list_incoming_client_invites()
RETURNS TABLE (
  id uuid,
  client_name text,
  requester_name text,
  requester_user_id uuid,
  invited_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    c.id,
    c.name AS client_name,
    COALESCE(
      NULLIF(trim(p.full_name), ''),
      NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      u.email,
      c.name
    ) AS requester_name,
    c.user_id AS requester_user_id,
    c.invited_email
  FROM public.clients c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN auth.users u ON u.id = c.user_id
  WHERE auth.uid() IS NOT NULL
    AND c.connection_status = 'pending'
    AND c.invited_email IS NOT NULL
    AND lower(c.invited_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    AND c.user_id <> auth.uid()
    AND COALESCE(c.connection_initiated_by, 'worker') = 'worker'
  ORDER BY c.invited_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_incoming_client_invites() TO authenticated;