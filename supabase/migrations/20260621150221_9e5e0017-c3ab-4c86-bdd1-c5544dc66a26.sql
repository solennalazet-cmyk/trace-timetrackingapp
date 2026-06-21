ALTER TABLE public.clients ADD COLUMN scheduled_days integer[] DEFAULT ARRAY[0,1,2,3,4,5,6];

UPDATE public.clients SET scheduled_days = ARRAY[0,1,2,3,4,5,6] WHERE scheduled_days IS NULL;