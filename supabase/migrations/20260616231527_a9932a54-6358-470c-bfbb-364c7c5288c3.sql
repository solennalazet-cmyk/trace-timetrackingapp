ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS agreed_daily_hours numeric,
  ADD COLUMN IF NOT EXISTS agreed_start_time text,
  ADD COLUMN IF NOT EXISTS agreed_end_time text,
  ADD COLUMN IF NOT EXISTS engagement_start_date date,
  ADD COLUMN IF NOT EXISTS engagement_end_date date;