ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS cv_url text;