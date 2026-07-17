-- ============ ENUMS ============
create type public.app_role as enum ('founder', 'admin');
create type public.startup_stage as enum ('pre_seed', 'seed', 'series_a');
create type public.business_model as enum ('saas', 'marketplace', 'ecommerce', 'b2b_services', 'consumer', 'other');
create type public.task_status as enum ('pending', 'in_progress', 'done');
create type public.metric_category as enum ('revenue', 'acquisition', 'retention', 'cash_efficiency');
create type public.doc_category as enum ('corporate', 'equity_cap_table', 'ip_legal', 'financials', 'contracts_hr', 'pitch');
create type public.doc_status as enum ('missing', 'uploaded', 'verified');

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ============ USER ROLES (separate table for security) ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- Security definer function (no recursion)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- ============ STARTUPS ============
create table public.startups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage startup_stage,
  business_model business_model,
  industry text,
  target_raise_usd numeric,
  readiness_score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.startups enable row level security;

create table public.startup_members (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'founder',
  created_at timestamptz not null default now(),
  unique (startup_id, user_id)
);
alter table public.startup_members enable row level security;

-- Helper: is user member of startup?
create or replace function public.is_startup_member(_user_id uuid, _startup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.startup_members
    where user_id = _user_id and startup_id = _startup_id
  )
$$;

-- ============ ROADMAP ============
create table public.roadmap_pillars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  weight numeric not null,
  order_index integer not null default 0
);
alter table public.roadmap_pillars enable row level security;

create table public.roadmap_tasks (
  id uuid primary key default gen_random_uuid(),
  pillar_id uuid not null references public.roadmap_pillars(id) on delete cascade,
  title text not null,
  description text,
  why_it_matters text,
  how_to_do_it text,
  stage_required text not null default 'all',
  criticality text not null default 'important',
  requires_doc boolean not null default false,
  order_index integer not null default 0
);
alter table public.roadmap_tasks enable row level security;

create table public.startup_tasks (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  task_id uuid not null references public.roadmap_tasks(id) on delete cascade,
  status task_status not null default 'pending',
  doc_url text,
  notes text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (startup_id, task_id)
);
alter table public.startup_tasks enable row level security;

-- ============ METRICS ============
create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category metric_category not null,
  formula text,
  description text,
  why_it_matters text,
  benchmark text,
  applies_to_model business_model[] not null default '{}',
  stage_required text not null default 'all',
  is_core boolean not null default false,
  order_index integer not null default 0
);
alter table public.metric_definitions enable row level security;

create table public.metric_entries (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  metric_id uuid not null references public.metric_definitions(id) on delete cascade,
  value numeric,
  period_month integer not null check (period_month between 1 and 12),
  period_year integer not null,
  note text,
  created_at timestamptz not null default now(),
  unique (startup_id, metric_id, period_month, period_year)
);
alter table public.metric_entries enable row level security;

create table public.metric_configs (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  metric_id uuid not null references public.metric_definitions(id) on delete cascade,
  is_active boolean not null default true,
  target_value numeric,
  display_order integer not null default 0,
  unique (startup_id, metric_id)
);
alter table public.metric_configs enable row level security;

-- ============ DATA ROOM ============
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  category doc_category not null,
  name text not null,
  file_url text,
  status doc_status not null default 'missing',
  stage_required text not null default 'all',
  is_critical boolean not null default false,
  uploaded_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;

-- ============ SCORE SNAPSHOTS ============
create table public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  total_score numeric not null,
  legal_score numeric,
  growth_score numeric,
  dataroom_score numeric,
  pitch_score numeric,
  snapshot_date date not null default current_date
);
alter table public.score_snapshots enable row level security;

-- Admin notes (only visible to admins)
create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_notes enable row level security;

-- ============ TRIGGERS ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email)
  on conflict (id) do nothing;

  -- Default role: founder
  insert into public.user_roles (user_id, role)
  values (new.id, 'founder')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger startups_updated_at before update on public.startups
  for each row execute function public.set_updated_at();
create trigger startup_tasks_updated_at before update on public.startup_tasks
  for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ============ RLS POLICIES ============

-- profiles
create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Admins read all profiles" on public.profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- user_roles
create policy "Users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);
create policy "Admins read all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- startups
create policy "Members read their startups" on public.startups
  for select to authenticated using (public.is_startup_member(auth.uid(), id));
create policy "Admins read all startups" on public.startups
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Authenticated create startups" on public.startups
  for insert to authenticated with check (true);
create policy "Members update their startups" on public.startups
  for update to authenticated using (public.is_startup_member(auth.uid(), id));
create policy "Admins update all startups" on public.startups
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

-- startup_members
create policy "Users read own membership" on public.startup_members
  for select to authenticated using (user_id = auth.uid());
create policy "Admins read all members" on public.startup_members
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Users insert own membership" on public.startup_members
  for insert to authenticated with check (user_id = auth.uid());

-- roadmap_pillars (public read for authenticated)
create policy "Authenticated read pillars" on public.roadmap_pillars
  for select to authenticated using (true);

-- roadmap_tasks
create policy "Authenticated read tasks" on public.roadmap_tasks
  for select to authenticated using (true);

-- startup_tasks
create policy "Members read their startup tasks" on public.startup_tasks
  for select to authenticated using (public.is_startup_member(auth.uid(), startup_id));
create policy "Admins read all startup tasks" on public.startup_tasks
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Members insert their startup tasks" on public.startup_tasks
  for insert to authenticated with check (public.is_startup_member(auth.uid(), startup_id));
create policy "Members update their startup tasks" on public.startup_tasks
  for update to authenticated using (public.is_startup_member(auth.uid(), startup_id));

-- metric_definitions
create policy "Authenticated read metric defs" on public.metric_definitions
  for select to authenticated using (true);

-- metric_entries
create policy "Members read their entries" on public.metric_entries
  for select to authenticated using (public.is_startup_member(auth.uid(), startup_id));
create policy "Admins read all entries" on public.metric_entries
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Members insert their entries" on public.metric_entries
  for insert to authenticated with check (public.is_startup_member(auth.uid(), startup_id));
create policy "Members update their entries" on public.metric_entries
  for update to authenticated using (public.is_startup_member(auth.uid(), startup_id));
create policy "Members delete their entries" on public.metric_entries
  for delete to authenticated using (public.is_startup_member(auth.uid(), startup_id));

-- metric_configs
create policy "Members read their configs" on public.metric_configs
  for select to authenticated using (public.is_startup_member(auth.uid(), startup_id));
create policy "Admins read all configs" on public.metric_configs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Members manage their configs" on public.metric_configs
  for all to authenticated using (public.is_startup_member(auth.uid(), startup_id))
  with check (public.is_startup_member(auth.uid(), startup_id));

-- documents
create policy "Members read their documents" on public.documents
  for select to authenticated using (public.is_startup_member(auth.uid(), startup_id));
create policy "Admins read all documents" on public.documents
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Members manage their documents" on public.documents
  for all to authenticated using (public.is_startup_member(auth.uid(), startup_id))
  with check (public.is_startup_member(auth.uid(), startup_id));

-- score_snapshots
create policy "Members read their snapshots" on public.score_snapshots
  for select to authenticated using (public.is_startup_member(auth.uid(), startup_id));
create policy "Admins read all snapshots" on public.score_snapshots
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Members insert their snapshots" on public.score_snapshots
  for insert to authenticated with check (public.is_startup_member(auth.uid(), startup_id));

-- admin_notes (admin-only)
create policy "Admins read notes" on public.admin_notes
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins insert notes" on public.admin_notes
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update notes" on public.admin_notes
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete notes" on public.admin_notes
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ============ STORAGE BUCKET ============
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Members upload to their startup folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_startup_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

create policy "Members read their startup files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_startup_member(auth.uid(), (storage.foldername(name))[1]::uuid)
      or public.has_role(auth.uid(), 'admin')
    )
  );

create policy "Members update their startup files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and public.is_startup_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

create policy "Members delete their startup files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.is_startup_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
