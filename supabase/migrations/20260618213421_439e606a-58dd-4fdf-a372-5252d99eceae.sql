ALTER TABLE public.time_entries
ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_user_id_idempotency_key_idx
ON public.time_entries (user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;