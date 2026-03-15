-- Update handle_new_user to also create user_settings
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, plan, trial_started_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    'trial',
    now()
  );

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$;