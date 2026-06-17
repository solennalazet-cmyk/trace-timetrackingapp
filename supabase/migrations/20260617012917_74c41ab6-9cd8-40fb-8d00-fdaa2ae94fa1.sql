ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS business_address text,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS billing_notes text,
  ADD COLUMN IF NOT EXISTS contract_url text;