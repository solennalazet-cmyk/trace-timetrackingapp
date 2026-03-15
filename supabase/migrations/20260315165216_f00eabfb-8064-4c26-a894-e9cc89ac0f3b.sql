-- PROFILES
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  plan text default 'trial' check (plan in ('trial', 'free', 'pro')),
  trial_started_at timestamptz default now(),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text check (subscription_status in ('active','trialing','past_due','cancelled','incomplete')) default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz default now()
);

-- CLIENTS
create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  nif text,
  currency text default 'EUR',
  default_rate numeric,
  created_at timestamptz default now()
);

-- PROJECTS
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  name text not null,
  rate numeric,
  currency text,
  created_at timestamptz default now()
);

-- TASKS
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

-- INVOICES
create table invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  date_range_start date not null,
  date_range_end date not null,
  total_amount numeric not null,
  currency text not null,
  status text default 'draft' check (status in ('draft','sent','paid','void')),
  delivery_method text check (delivery_method in ('stripe','pdf')),
  stripe_invoice_id text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- TIME ENTRIES
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  notes text,
  tags text[],
  duration_minutes integer not null,
  break_minutes integer default 0,
  billable boolean default true,
  billing_status text default 'unbilled' check (billing_status in ('unbilled','billed','paid')),
  rate_amount numeric,
  rate_currency text,
  rate_unit text check (rate_unit in ('hour','word','project')),
  billable_value numeric,
  entry_date date default current_date,
  entry_type text default 'timer' check (entry_type in ('timer','manual','call','shift')),
  created_at timestamptz default now()
);

-- ACTIVE SESSIONS
create table active_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text default 'stopwatch' check (session_type in ('stopwatch','shift')),
  started_at timestamptz not null,
  paused_at timestamptz,
  total_paused_ms integer default 0,
  created_at timestamptz default now(),
  unique(user_id)
);

-- USER SETTINGS
create table user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timer_presets integer[] default array[25,45,60,90],
  pause_mode text default 'deduct' check (pause_mode in ('deduct','separate')),
  timer_sound text default 'chime' check (timer_sound in ('chime','bell','none')),
  theme text default 'light' check (theme in ('light','dark')),
  show_logged_today boolean default true,
  updated_at timestamptz default now(),
  unique(user_id)
);

-- USER FEEDBACK
create table user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text check (type in ('bug','suggestion','other')),
  message text not null,
  created_at timestamptz default now()
);

-- WEBHOOK LOGS
create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  stripe_event_id text unique,
  payload jsonb,
  error text,
  processed_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table invoices enable row level security;
alter table time_entries enable row level security;
alter table active_sessions enable row level security;
alter table user_settings enable row level security;
alter table user_feedback enable row level security;

create policy "Users own their profile" on profiles for all using (auth.uid() = id);
create policy "Users own their clients" on clients for all using (auth.uid() = user_id);
create policy "Users own their projects" on projects for all using (auth.uid() = user_id);
create policy "Users own their tasks" on tasks for all using (auth.uid() = user_id);
create policy "Users own their invoices" on invoices for all using (auth.uid() = user_id);
create policy "Users own their entries" on time_entries for all using (auth.uid() = user_id);
create policy "Users own their active session" on active_sessions for all using (auth.uid() = user_id);
create policy "Users own their settings" on user_settings for all using (auth.uid() = user_id);
create policy "Users can submit feedback" on user_feedback for insert with check (auth.uid() = user_id or user_id is null);
create policy "Users read own feedback" on user_feedback for select using (auth.uid() = user_id);

-- AUTO-CREATE PROFILE ON SIGNUP
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- INDEXES
create index idx_clients_user on clients(user_id);
create index idx_projects_user on projects(user_id);
create index idx_projects_client on projects(client_id);
create index idx_tasks_user on tasks(user_id);
create index idx_time_entries_user on time_entries(user_id);
create index idx_time_entries_client on time_entries(client_id);
create index idx_time_entries_project on time_entries(project_id);
create index idx_time_entries_date on time_entries(entry_date);
create index idx_time_entries_invoice on time_entries(invoice_id);
create index idx_invoices_user on invoices(user_id);
create index idx_invoices_client on invoices(client_id);
create index idx_active_sessions_user on active_sessions(user_id);
create index idx_user_settings_user on user_settings(user_id);