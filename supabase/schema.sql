begin;

create extension if not exists pgcrypto;

create table if not exists public.vs_concepts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  model_type text not null default 'generic',
  stage text not null default 'Idea / Thesis',
  status text not null default 'Exploring',
  one_liner text not null default '',
  problem text not null default '',
  customer text not null default '',
  solution text not null default '',
  business_model text not null default '',
  distribution text not null default '',
  advantage text not null default '',
  why_now text not null default '',
  objective text not null default '',
  unit_label text not null default 'unit',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.vs_scorecards (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null,
  owner_id uuid not null,
  dimensions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (concept_id),
  constraint vs_scorecards_concept_owner_fk foreign key (concept_id, owner_id)
    references public.vs_concepts(id, owner_id) on delete cascade
);

create table if not exists public.vs_assumptions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null,
  owner_id uuid not null,
  title text not null,
  category text not null default 'General',
  impact_if_false smallint not null default 3 check (impact_if_false between 1 and 5),
  confidence smallint not null default 1 check (confidence between 1 and 5),
  test_cost smallint not null default 2 check (test_cost between 1 and 5),
  evidence_level text not null default 'E0' check (evidence_level in ('E0','E1','E2','E3','E4','E5','E6')),
  status text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vs_assumptions_concept_owner_fk foreign key (concept_id, owner_id)
    references public.vs_concepts(id, owner_id) on delete cascade
);

create table if not exists public.vs_experiments (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null,
  assumption_id uuid,
  owner_id uuid not null,
  hypothesis text not null,
  method text not null,
  success_condition text not null default '',
  budget numeric(14,2) not null default 0,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vs_experiments_concept_owner_fk foreign key (concept_id, owner_id)
    references public.vs_concepts(id, owner_id) on delete cascade,
  constraint vs_experiments_assumption_fk foreign key (assumption_id)
    references public.vs_assumptions(id) on delete set null
);

create table if not exists public.vs_evidence (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null,
  assumption_id uuid,
  experiment_id uuid,
  owner_id uuid not null,
  level text not null check (level in ('E0','E1','E2','E3','E4','E5','E6')),
  direction text not null default 'neutral' check (direction in ('supports','neutral','contradicts')),
  summary text not null,
  source text not null default 'Manual entry',
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint vs_evidence_concept_owner_fk foreign key (concept_id, owner_id)
    references public.vs_concepts(id, owner_id) on delete cascade,
  constraint vs_evidence_assumption_fk foreign key (assumption_id)
    references public.vs_assumptions(id) on delete set null,
  constraint vs_evidence_experiment_fk foreign key (experiment_id)
    references public.vs_experiments(id) on delete set null
);

create table if not exists public.vs_decisions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null,
  owner_id uuid not null,
  title text not null,
  decision text not null,
  rationale text not null default '',
  evidence_ids uuid[] not null default '{}',
  assumption_ids uuid[] not null default '{}',
  review_condition text not null default '',
  decision_owner text not null default 'Metatility',
  created_at timestamptz not null default now(),
  constraint vs_decisions_concept_owner_fk foreign key (concept_id, owner_id)
    references public.vs_concepts(id, owner_id) on delete cascade
);

create table if not exists public.vs_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null,
  owner_id uuid not null,
  model_type text not null,
  inputs jsonb not null,
  outputs jsonb not null,
  is_evidence boolean not null default false check (is_evidence = false),
  created_at timestamptz not null default now(),
  constraint vs_simulation_runs_concept_owner_fk foreign key (concept_id, owner_id)
    references public.vs_concepts(id, owner_id) on delete cascade
);

create table if not exists public.vs_institutional_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  concept_id uuid,
  schema_version text not null default '1.1',
  source_system text not null default 'metatility-vs',
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vs_events_concept_owner_fk foreign key (concept_id, owner_id)
    references public.vs_concepts(id, owner_id) on delete cascade
);

create index if not exists vs_concepts_owner_idx on public.vs_concepts(owner_id, created_at desc);
create index if not exists vs_assumptions_concept_idx on public.vs_assumptions(owner_id, concept_id);
create index if not exists vs_experiments_concept_idx on public.vs_experiments(owner_id, concept_id);
create index if not exists vs_evidence_concept_idx on public.vs_evidence(owner_id, concept_id, observed_at desc);
create index if not exists vs_decisions_concept_idx on public.vs_decisions(owner_id, concept_id, created_at desc);
create index if not exists vs_simulations_concept_idx on public.vs_simulation_runs(owner_id, concept_id, created_at desc);
create index if not exists vs_events_owner_time_idx on public.vs_institutional_events(owner_id, occurred_at desc);

alter table public.vs_concepts enable row level security;
alter table public.vs_scorecards enable row level security;
alter table public.vs_assumptions enable row level security;
alter table public.vs_experiments enable row level security;
alter table public.vs_evidence enable row level security;
alter table public.vs_decisions enable row level security;
alter table public.vs_simulation_runs enable row level security;
alter table public.vs_institutional_events enable row level security;

revoke all on public.vs_concepts from anon;
revoke all on public.vs_scorecards from anon;
revoke all on public.vs_assumptions from anon;
revoke all on public.vs_experiments from anon;
revoke all on public.vs_evidence from anon;
revoke all on public.vs_decisions from anon;
revoke all on public.vs_simulation_runs from anon;
revoke all on public.vs_institutional_events from anon;

grant select, insert, update, delete on public.vs_concepts to authenticated, service_role;
grant select, insert, update, delete on public.vs_scorecards to authenticated, service_role;
grant select, insert, update, delete on public.vs_assumptions to authenticated, service_role;
grant select, insert, update, delete on public.vs_experiments to authenticated, service_role;
grant select, insert, update, delete on public.vs_evidence to authenticated, service_role;
grant select, insert, update, delete on public.vs_decisions to authenticated, service_role;
grant select, insert, update, delete on public.vs_simulation_runs to authenticated, service_role;
grant select, insert, update, delete on public.vs_institutional_events to authenticated, service_role;

-- Every authenticated user can only operate on rows they own.
create policy "vs_concepts_select_own" on public.vs_concepts for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_concepts_insert_own" on public.vs_concepts for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "vs_concepts_update_own" on public.vs_concepts for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vs_concepts_delete_own" on public.vs_concepts for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "vs_scorecards_select_own" on public.vs_scorecards for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_scorecards_insert_own" on public.vs_scorecards for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "vs_scorecards_update_own" on public.vs_scorecards for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vs_scorecards_delete_own" on public.vs_scorecards for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "vs_assumptions_select_own" on public.vs_assumptions for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_assumptions_insert_own" on public.vs_assumptions for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "vs_assumptions_update_own" on public.vs_assumptions for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vs_assumptions_delete_own" on public.vs_assumptions for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "vs_experiments_select_own" on public.vs_experiments for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_experiments_insert_own" on public.vs_experiments for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "vs_experiments_update_own" on public.vs_experiments for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vs_experiments_delete_own" on public.vs_experiments for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "vs_evidence_select_own" on public.vs_evidence for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_evidence_insert_own" on public.vs_evidence for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "vs_evidence_update_own" on public.vs_evidence for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vs_evidence_delete_own" on public.vs_evidence for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "vs_decisions_select_own" on public.vs_decisions for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_decisions_insert_own" on public.vs_decisions for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "vs_decisions_update_own" on public.vs_decisions for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vs_decisions_delete_own" on public.vs_decisions for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "vs_simulation_runs_select_own" on public.vs_simulation_runs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_simulation_runs_insert_own" on public.vs_simulation_runs for insert to authenticated with check ((select auth.uid()) = owner_id and is_evidence = false);
create policy "vs_simulation_runs_update_own" on public.vs_simulation_runs for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and is_evidence = false);
create policy "vs_simulation_runs_delete_own" on public.vs_simulation_runs for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "vs_events_select_own" on public.vs_institutional_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vs_events_insert_own" on public.vs_institutional_events for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "vs_events_update_own" on public.vs_institutional_events for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vs_events_delete_own" on public.vs_institutional_events for delete to authenticated using ((select auth.uid()) = owner_id);

commit;
