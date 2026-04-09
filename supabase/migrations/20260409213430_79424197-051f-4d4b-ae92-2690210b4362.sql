
ALTER TABLE public.time_entries
ADD COLUMN start_time timestamptz,
ADD COLUMN end_time timestamptz;
