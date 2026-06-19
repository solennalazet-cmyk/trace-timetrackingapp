ALTER TABLE public.tasks ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON public.tasks(client_id);