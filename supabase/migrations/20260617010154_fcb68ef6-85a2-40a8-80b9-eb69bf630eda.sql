
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'both'
  CHECK (kind IN ('account','contractor','both'));

UPDATE public.clients
   SET kind = 'account'
 WHERE user_id = 'cabebb81-124e-46f2-a971-4af9cf2ee2f9'
   AND name IN ('Trace','Knitting','Villora House','ZenLoo - Loowatt');
