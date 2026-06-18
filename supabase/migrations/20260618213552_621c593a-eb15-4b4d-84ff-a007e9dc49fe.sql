DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'time_entries_user_id_idempotency_key_key'
      AND conrelid = 'public.time_entries'::regclass
  ) THEN
    ALTER TABLE public.time_entries
    ADD CONSTRAINT time_entries_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
  END IF;
END $$;