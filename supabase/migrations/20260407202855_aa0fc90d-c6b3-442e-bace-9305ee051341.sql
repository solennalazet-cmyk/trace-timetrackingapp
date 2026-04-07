ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS week_start_day integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS time_format text DEFAULT '24h',
  ADD COLUMN IF NOT EXISTS default_billable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_hour_target numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idle_reminder_minutes integer DEFAULT 0;