
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  employer_user_id uuid NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worker_documents_client_id_idx ON public.worker_documents(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_documents TO authenticated;
GRANT ALL ON public.worker_documents TO service_role;

ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employer can view their contractor documents"
  ON public.worker_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = employer_user_id);

CREATE POLICY "Employer can add their contractor documents"
  ON public.worker_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = employer_user_id);

CREATE POLICY "Employer can update their contractor documents"
  ON public.worker_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = employer_user_id)
  WITH CHECK (auth.uid() = employer_user_id);

CREATE POLICY "Employer can delete their contractor documents"
  ON public.worker_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = employer_user_id);
