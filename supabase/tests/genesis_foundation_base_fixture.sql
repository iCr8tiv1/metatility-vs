-- LOCAL TEST FIXTURE ONLY. Do not apply to a Supabase project.
-- The base Genesis database was inactive during development. These minimal
-- prerequisites are inferred from the tracked application's selects/inserts;
-- they are not a recovered or verified production schema.
-- Apply this fixture, genesis_v01_workforce.sql, then migrations/20261017214829_genesis_foundation_v1.sql
-- to a disposable PostgreSQL/PGlite database before the lifecycle test file.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to authenticated,anon,service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create table public.genesis_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  slug text not null,
  name text not null default 'Genesis',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,slug)
);
create table public.genesis_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id),
  owner_id uuid not null references auth.users(id),
  agent_key text not null,
  name text not null,
  role text not null,
  mission text not null default '',
  status text not null default 'active' check(status in ('active','paused','inactive','draft')),
  autonomy_level smallint not null default 2,
  tools jsonb not null default '[]',
  kpis jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,agent_key)
);
create table public.genesis_objectives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id),
  owner_id uuid not null references auth.users(id),
  title text not null,
  objective text not null,
  status text not null default 'active' check(status in ('draft','active','paused','completed','cancelled')),
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.genesis_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id),
  owner_id uuid not null references auth.users(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create table public.genesis_agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id),
  owner_id uuid not null references auth.users(id),
  agent_id uuid not null references public.genesis_agents(id),
  objective_id uuid references public.genesis_objectives(id),
  status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
  input jsonb not null default '{}',
  output jsonb,
  usage jsonb,
  provider text,
  model text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.genesis_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id),
  owner_id uuid not null references auth.users(id),
  event_type text not null,
  source_system text not null,
  entity_type text not null,
  entity_id uuid not null,
  idempotency_key text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(workspace_id,idempotency_key)
);
create table public.genesis_nurture_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id),
  owner_id uuid not null references auth.users(id)
);

do $rls$
declare n text;
begin
  foreach n in array array['genesis_workspaces','genesis_agents','genesis_objectives',
    'genesis_approvals','genesis_agent_runs','genesis_events','genesis_nurture_plans'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('create policy test_owner_all on public.%I for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',n);
    execute format('grant select,insert,update,delete on public.%I to authenticated,service_role',n);
  end loop;
end;
$rls$;
