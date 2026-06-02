-- Generic updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Employer-initiated worker invites.
CREATE TABLE public.worker_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_user_id uuid NOT NULL,
  invited_email text NOT NULL,
  invited_name text,
  invite_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | rejected | cancelled
  worker_user_id uuid,
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_worker_invites_email ON public.worker_invites (lower(invited_email));
CREATE INDEX idx_worker_invites_employer ON public.worker_invites (employer_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_invites TO authenticated;
GRANT ALL ON public.worker_invites TO service_role;

ALTER TABLE public.worker_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employer owns their worker invites"
  ON public.worker_invites
  FOR ALL
  USING (auth.uid() = employer_user_id)
  WITH CHECK (auth.uid() = employer_user_id);

CREATE POLICY "Invitee can view pending worker invite"
  ON public.worker_invites
  FOR SELECT
  USING (status = 'pending' AND public.email_matches_auth_user(invited_email));

CREATE POLICY "Invitee can accept or decline worker invite"
  ON public.worker_invites
  FOR UPDATE
  USING (status = 'pending' AND public.email_matches_auth_user(invited_email))
  WITH CHECK (status IN ('accepted','rejected'));

CREATE TRIGGER trg_worker_invites_updated_at
  BEFORE UPDATE ON public.worker_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend handle_new_user to also auto-link employer-initiated invites.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_pending_as_employer boolean := false;
  v_invite record;
BEGIN
  INSERT INTO public.profiles (id, full_name, plan, trial_started_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    'trial',
    now()
  );

  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);

  UPDATE public.clients
     SET connected_user_id = NEW.id,
         connection_status = 'accepted'
   WHERE connection_status = 'pending'
     AND lower(invited_email) = lower(NEW.email);

  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE connected_user_id = NEW.id AND connection_status = 'accepted'
  ) INTO v_has_pending_as_employer;

  IF v_has_pending_as_employer THEN
    UPDATE public.profiles
       SET available_roles = ARRAY['worker','employer']::text[],
           active_role = 'employer'
     WHERE id = NEW.id;
  END IF;

  FOR v_invite IN
    SELECT * FROM public.worker_invites
     WHERE status = 'pending'
       AND lower(invited_email) = lower(NEW.email)
  LOOP
    INSERT INTO public.clients (user_id, name, email, connected_user_id, connection_status, invited_email, connection_initiated_by, invited_at)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(v_invite.invited_name, ''), 'Employer'),
      NEW.email,
      v_invite.employer_user_id,
      'accepted',
      v_invite.invited_email,
      'employer',
      v_invite.invited_at
    );

    UPDATE public.worker_invites
       SET status = 'accepted',
           worker_user_id = NEW.id,
           responded_at = now()
     WHERE id = v_invite.id;
  END LOOP;

  RETURN NEW;
END;
$function$;
