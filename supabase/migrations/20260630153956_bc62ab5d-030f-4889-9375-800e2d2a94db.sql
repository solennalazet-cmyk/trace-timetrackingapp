ALTER TABLE public.submitted_reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'submitted';
ALTER TABLE public.submitted_reports
  DROP CONSTRAINT IF EXISTS submitted_reports_source_check;
ALTER TABLE public.submitted_reports
  ADD CONSTRAINT submitted_reports_source_check CHECK (source IN ('submitted','imported'));