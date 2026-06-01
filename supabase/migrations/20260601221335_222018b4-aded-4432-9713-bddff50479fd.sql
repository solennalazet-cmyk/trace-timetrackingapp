-- Geolocation Phase 1: per-client site, per-entry capture, user setting

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS site_lat double precision,
  ADD COLUMN IF NOT EXISTS site_lng double precision,
  ADD COLUMN IF NOT EXISTS site_radius_m integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS geolocation_override text DEFAULT 'inherit'
    CHECK (geolocation_override IN ('inherit','always','never'));

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS start_lat double precision,
  ADD COLUMN IF NOT EXISTS start_lng double precision,
  ADD COLUMN IF NOT EXISTS start_accuracy_m integer,
  ADD COLUMN IF NOT EXISTS start_on_site boolean,
  ADD COLUMN IF NOT EXISTS start_distance_m integer,
  ADD COLUMN IF NOT EXISTS end_lat double precision,
  ADD COLUMN IF NOT EXISTS end_lng double precision,
  ADD COLUMN IF NOT EXISTS end_accuracy_m integer,
  ADD COLUMN IF NOT EXISTS end_on_site boolean,
  ADD COLUMN IF NOT EXISTS end_distance_m integer;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS geolocation_mode text DEFAULT 'off'
    CHECK (geolocation_mode IN ('off','ask','always')),
  ADD COLUMN IF NOT EXISTS geolocation_prompt_seen boolean DEFAULT false;
