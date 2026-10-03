-- Metatility VS v0.6 institutional ingestion layer
-- Production contract: authenticated clients can read their own IS records,
-- but only server-side service credentials can write derived institutional state.

create table if not exists public.is_event_inbox (
  source_event_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid,
  schema_version text not null,
  source_system text not null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','rejected')),
  processing_error text
);

create table if not exists public.is_entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  source_system text not null default 'metatility-vs',
  source_entity_id text not null,
  canonical_name text,
  attributes jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(owner_id, source_system, entity_type, source_entity_id)
);

create table if not exists public.is_relationships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_entity_id uuid not null references public.is_entities(id) on delete cascade,
  to_entity_id uuid not null references public.is_entities(id) on delete cascade,
  relationship_type text not null,
  source_event_id uuid not null references public.is_event_inbox(source_event_id) on delete restrict,
  attributes jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  unique(owner_id, from_entity_id, to_entity_id, relationship_type, source_event_id)
);

create table if not exists public.is_evidence_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_event_id uuid not null unique references public.is_event_inbox(source_event_id) on delete restrict,
  source_evidence_id text not null,
  concept_id uuid,
  assumption_id text,
  experiment_id text,
  evidence_level text not null check (evidence_level in ('E0','E1','E2','E3','E4','E5','E6')),
  direction text not null check (direction in ('supports','neutral','contradicts')),
  summary text not null,
  source text,
  observed_at timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create table if not exists public.is_decision_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_event_id uuid not null unique references public.is_event_inbox(source_event_id) on delete restrict,
  source_decision_id text not null,
  concept_id uuid,
  title text,
  decision text not null,
  rationale text,
  review_condition text,
  decision_owner text,
  provenance jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null
);

alter table public.is_event_inbox enable row level security;
alter table public.is_entities enable row level security;
alter table public.is_relationships enable row level security;
alter table public.is_evidence_records enable row level security;
alter table public.is_decision_records enable row level security;

revoke all on public.vs_institutional_events,
  public.is_event_inbox,
  public.is_entities,
  public.is_relationships,
  public.is_evidence_records,
  public.is_decision_records
from anon, authenticated;

grant select on public.vs_institutional_events,
  public.is_event_inbox,
  public.is_entities,
  public.is_relationships,
  public.is_evidence_records,
  public.is_decision_records
to authenticated;

grant select, insert, update, delete on public.is_event_inbox,
  public.is_entities,
  public.is_relationships,
  public.is_evidence_records,
  public.is_decision_records
to service_role;

drop policy if exists vs_events_insert_own on public.vs_institutional_events;
drop policy if exists vs_events_update_own on public.vs_institutional_events;
drop policy if exists vs_events_delete_own on public.vs_institutional_events;

drop policy if exists is_event_inbox_select_own on public.is_event_inbox;
create policy is_event_inbox_select_own on public.is_event_inbox
for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists is_entities_select_own on public.is_entities;
create policy is_entities_select_own on public.is_entities
for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists is_relationships_select_own on public.is_relationships;
create policy is_relationships_select_own on public.is_relationships
for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists is_evidence_records_select_own on public.is_evidence_records;
create policy is_evidence_records_select_own on public.is_evidence_records
for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists is_decision_records_select_own on public.is_decision_records;
create policy is_decision_records_select_own on public.is_decision_records
for select to authenticated
using ((select auth.uid()) = owner_id);

create index if not exists is_event_inbox_owner_time_idx
  on public.is_event_inbox(owner_id, received_at desc);
create index if not exists is_entities_owner_type_idx
  on public.is_entities(owner_id, entity_type, last_seen_at desc);
create index if not exists is_relationships_owner_from_idx
  on public.is_relationships(owner_id, from_entity_id);
create index if not exists is_relationships_owner_to_idx
  on public.is_relationships(owner_id, to_entity_id);
create index if not exists is_relationships_from_entity_fk_idx
  on public.is_relationships(from_entity_id);
create index if not exists is_relationships_to_entity_fk_idx
  on public.is_relationships(to_entity_id);
create index if not exists is_relationships_source_event_fk_idx
  on public.is_relationships(source_event_id);
create index if not exists is_evidence_owner_time_idx
  on public.is_evidence_records(owner_id, recorded_at desc);
create index if not exists is_decisions_owner_time_idx
  on public.is_decision_records(owner_id, decided_at desc);
