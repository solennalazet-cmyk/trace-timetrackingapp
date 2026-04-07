ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS round_duration text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS round_duration_to integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS round_amount text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS round_amount_to numeric DEFAULT 0.01;