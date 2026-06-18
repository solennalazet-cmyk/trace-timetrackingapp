REVOKE EXECUTE ON FUNCTION public.email_matches_auth_user(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_submission(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.email_matches_auth_user(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_submission(uuid) TO service_role;