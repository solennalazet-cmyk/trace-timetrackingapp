REVOKE EXECUTE ON FUNCTION public.decline_client_invite(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_client_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_client_invite(uuid) TO authenticated;