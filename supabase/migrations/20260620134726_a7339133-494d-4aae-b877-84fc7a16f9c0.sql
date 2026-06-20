ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS connection_requester_name text NULL;

UPDATE public.clients c
SET connection_requester_name = COALESCE(NULLIF(trim(p.full_name), ''), c.connection_requester_name)
FROM public.profiles p
WHERE c.user_id = p.id
  AND c.connection_status = 'pending'
  AND c.connection_requester_name IS NULL;

DROP FUNCTION IF EXISTS public.list_incoming_client_invites();