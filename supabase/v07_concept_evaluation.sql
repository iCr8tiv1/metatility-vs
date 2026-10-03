-- Metatility VS v0.7 concept evaluation persistence
alter table public.vs_concepts
add column if not exists intake jsonb not null default '{}'::jsonb;

comment on column public.vs_concepts.intake is
'Structured concept-evaluation intake: current alternative, behavior change, buyer/user, switching friction, operations, technology dependency, capital path, validation path, capital requirement, and founder dependency.';
