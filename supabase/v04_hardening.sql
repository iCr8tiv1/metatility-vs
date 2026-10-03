-- Metatility VS v0.4 ownership-integrity and event-ledger hardening.
-- Apply after the original v0.3 schema on a fresh environment.

begin;

alter table public.vs_assumptions add constraint vs_assumptions_id_owner_key unique (id, owner_id);
alter table public.vs_experiments add constraint vs_experiments_id_owner_key unique (id, owner_id);
alter table public.vs_evidence add constraint vs_evidence_id_owner_key unique (id, owner_id);
alter table public.vs_decisions add constraint vs_decisions_id_owner_key unique (id, owner_id);

alter table public.vs_experiments drop constraint if exists vs_experiments_assumption_fk;
alter table public.vs_experiments add constraint vs_experiments_assumption_owner_fk
  foreign key (assumption_id, owner_id) references public.vs_assumptions(id, owner_id)
  on delete set null (assumption_id);

alter table public.vs_evidence drop constraint if exists vs_evidence_assumption_fk;
alter table public.vs_evidence drop constraint if exists vs_evidence_experiment_fk;
alter table public.vs_evidence add constraint vs_evidence_assumption_owner_fk
  foreign key (assumption_id, owner_id) references public.vs_assumptions(id, owner_id)
  on delete set null (assumption_id);
alter table public.vs_evidence add constraint vs_evidence_experiment_owner_fk
  foreign key (experiment_id, owner_id) references public.vs_experiments(id, owner_id)
  on delete set null (experiment_id);

alter table public.vs_decisions drop column if exists evidence_ids;
alter table public.vs_decisions drop column if exists assumption_ids;

create table if not exists public.vs_decision_evidence (
  decision_id uuid not null,
  evidence_id uuid not null,
  owner_id uuid not null,
  primary key (decision_id, evidence_id),
  constraint vs_de_decision_owner_fk foreign key (decision_id, owner_id)
    references public.vs_decisions(id, owner_id) on delete cascade,
  constraint vs_de_evidence_owner_fk foreign key (evidence_id, owner_id)
    references public.vs_evidence(id, owner_id) on delete cascade
);

create table if not exists public.vs_decision_assumptions (
  decision_id uuid not null,
  assumption_id uuid not null,
  owner_id uuid not null,
  primary key (decision_id, assumption_id),
  constraint vs_da_decision_owner_fk foreign key (decision_id, owner_id)
    references public.vs_decisions(id, owner_id) on delete cascade,
  constraint vs_da_assumption_owner_fk foreign key (assumption_id, owner_id)
    references public.vs_assumptions(id, owner_id) on delete cascade
);

alter table public.vs_decision_evidence enable row level security;
alter table public.vs_decision_assumptions enable row level security;
revoke all on public.vs_decision_evidence, public.vs_decision_assumptions from anon;
grant select, insert, update, delete on public.vs_decision_evidence, public.vs_decision_assumptions to authenticated;

create policy vs_de_select_own on public.vs_decision_evidence for select to authenticated using ((select auth.uid()) = owner_id);
create policy vs_de_insert_own on public.vs_decision_evidence for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy vs_de_update_own on public.vs_decision_evidence for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy vs_de_delete_own on public.vs_decision_evidence for delete to authenticated using ((select auth.uid()) = owner_id);
create policy vs_da_select_own on public.vs_decision_assumptions for select to authenticated using ((select auth.uid()) = owner_id);
create policy vs_da_insert_own on public.vs_decision_assumptions for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy vs_da_update_own on public.vs_decision_assumptions for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy vs_da_delete_own on public.vs_decision_assumptions for delete to authenticated using ((select auth.uid()) = owner_id);

alter table public.vs_simulation_runs add column if not exists scenario text not null default 'base';
alter table public.vs_simulation_runs add constraint vs_simulation_runs_scenario_check
  check (scenario in ('conservative','base','upside','custom'));

revoke update, delete on public.vs_institutional_events from authenticated;
drop policy if exists vs_events_update_own on public.vs_institutional_events;
drop policy if exists vs_events_delete_own on public.vs_institutional_events;

create index if not exists vs_scorecards_concept_owner_idx on public.vs_scorecards(concept_id, owner_id);
create index if not exists vs_assumptions_concept_owner_fk_idx on public.vs_assumptions(concept_id, owner_id);
create index if not exists vs_experiments_concept_owner_fk_idx on public.vs_experiments(concept_id, owner_id);
create index if not exists vs_experiments_assumption_owner_idx on public.vs_experiments(assumption_id, owner_id);
create index if not exists vs_evidence_concept_owner_fk_idx on public.vs_evidence(concept_id, owner_id);
create index if not exists vs_evidence_assumption_owner_idx on public.vs_evidence(assumption_id, owner_id);
create index if not exists vs_evidence_experiment_owner_idx on public.vs_evidence(experiment_id, owner_id);
create index if not exists vs_decisions_concept_owner_fk_idx on public.vs_decisions(concept_id, owner_id);
create index if not exists vs_de_decision_owner_idx on public.vs_decision_evidence(decision_id, owner_id);
create index if not exists vs_de_evidence_owner_idx on public.vs_decision_evidence(evidence_id, owner_id);
create index if not exists vs_da_decision_owner_idx on public.vs_decision_assumptions(decision_id, owner_id);
create index if not exists vs_da_assumption_owner_idx on public.vs_decision_assumptions(assumption_id, owner_id);
create index if not exists vs_simulation_runs_concept_owner_fk_idx on public.vs_simulation_runs(concept_id, owner_id);
create index if not exists vs_events_concept_owner_idx on public.vs_institutional_events(concept_id, owner_id);

commit;
