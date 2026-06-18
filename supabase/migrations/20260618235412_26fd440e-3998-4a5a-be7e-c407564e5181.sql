ALTER FUNCTION public.sync_time_entry_client_from_project() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.sync_time_entry_client_from_project() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_time_entry_client_from_project() FROM anon;
REVOKE ALL ON FUNCTION public.sync_time_entry_client_from_project() FROM authenticated;