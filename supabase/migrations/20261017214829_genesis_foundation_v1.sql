-- Genesis foundation lifecycle, v1.
-- Additive to genesis_v01_workforce.sql and the existing Genesis base tables.
-- No business fixtures, external tools, credentials, or remote writes are seeded.
-- This file must be applied as a migration by the database owner after its base
-- schema prerequisites have been verified. It is intentionally not auto-applied.
begin;

create schema if not exists genesis_private;
revoke all on schema genesis_private from public, anon;
grant usage on schema genesis_private to authenticated;

create table if not exists public.genesis_operating_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  contract_key text not null,
  version integer not null check (version > 0),
  specification jsonb not null check (jsonb_typeof(specification) = 'object'),
  created_at timestamptz not null default now(),
  unique (workspace_id, contract_key, version)
);

alter table public.genesis_tasks
  add column if not exists contract_version_id uuid references public.genesis_operating_contracts(id),
  add column if not exists active_run_id uuid references public.genesis_agent_runs(id),
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists created_from_run_id uuid references public.genesis_agent_runs(id),
  add column if not exists work_item_key text,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references auth.users(id);

alter table public.genesis_plans
  add column if not exists contract_version_id uuid references public.genesis_operating_contracts(id);

-- Legacy and generated memory is unapproved until an explicit later curation
-- workflow approves it. This release never promotes model candidates to memory.
alter table public.genesis_agent_memory
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected'));

alter table public.genesis_tasks drop constraint if exists genesis_tasks_status_check;
alter table public.genesis_tasks add constraint genesis_tasks_status_check
  check (status in ('queued','ready','running','blocked','awaiting_approval',
                   'awaiting_review','completed','failed','cancelled'));

create unique index if not exists genesis_tasks_proposal_key_idx
  on public.genesis_tasks(created_from_run_id, work_item_key)
  where created_from_run_id is not null and work_item_key is not null;
create index if not exists genesis_tasks_active_run_idx
  on public.genesis_tasks(active_run_id) where active_run_id is not null;

create table if not exists public.genesis_commands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  command_text text not null check (length(command_text) between 1 and 2400),
  objective_id uuid references public.genesis_objectives(id),
  plan_id uuid references public.genesis_plans(id),
  task_id uuid references public.genesis_tasks(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.genesis_work_attempts (
  run_id uuid primary key references public.genesis_agent_runs(id) on delete restrict,
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.genesis_tasks(id) on delete cascade,
  contract_version_id uuid not null references public.genesis_operating_contracts(id),
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('running','produced','failed','cancelled','expired')),
  lease_expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,
  input jsonb not null default '{}'::jsonb,
  model text not null default 'openai/gpt-5.6-sol',
  provider text not null default 'vercel-ai-gateway',
  usage jsonb,
  output jsonb,
  error text,
  unique (task_id, attempt_number)
);
create index if not exists genesis_work_attempts_expiry_idx
  on public.genesis_work_attempts(workspace_id, lease_expires_at) where status = 'running';
alter table public.genesis_work_attempts add column if not exists input jsonb not null default '{}'::jsonb;
alter table public.genesis_work_attempts add column if not exists model text not null default 'openai/gpt-5.6-sol';
alter table public.genesis_work_attempts add column if not exists provider text not null default 'vercel-ai-gateway';
alter table public.genesis_work_attempts add column if not exists usage jsonb;
alter table public.genesis_work_attempts drop constraint if exists genesis_work_attempts_run_id_fkey;
alter table public.genesis_work_attempts add constraint genesis_work_attempts_run_id_fkey
  foreign key(run_id) references public.genesis_agent_runs(id) on delete restrict;

create or replace function genesis_private.guard_attempt_history()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
  if new.run_id is distinct from old.run_id or new.task_id is distinct from old.task_id
    or new.workspace_id is distinct from old.workspace_id or new.owner_id is distinct from old.owner_id
    or new.contract_version_id is distinct from old.contract_version_id or new.attempt_number is distinct from old.attempt_number
    or new.input is distinct from old.input or new.started_at is distinct from old.started_at
    or new.model is distinct from old.model or new.provider is distinct from old.provider
    or (old.status<>'running' and new is distinct from old) then
    raise exception using errcode='55000',message='Attempt input and terminal history are immutable.';
  end if;
  return new;
end;
$fn$;
drop trigger if exists genesis_attempt_history_immutable on public.genesis_work_attempts;
create trigger genesis_attempt_history_immutable before update on public.genesis_work_attempts
  for each row execute function genesis_private.guard_attempt_history();

create or replace function genesis_private.guard_attempt_delete()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
  if old.status<>'running' then
    raise exception using errcode='55000',message='Terminal foundation attempt history cannot be deleted.';
  end if;
  return old;
end;
$fn$;
drop trigger if exists genesis_attempt_delete_guard on public.genesis_work_attempts;
create trigger genesis_attempt_delete_guard before delete on public.genesis_work_attempts
  for each row execute function genesis_private.guard_attempt_delete();

create or replace function genesis_private.guard_contract_history()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
  if new is distinct from old then
    raise exception using errcode='55000',message='Operating contracts are immutable; create a new version.';
  end if;
  return new;
end;
$fn$;
drop trigger if exists genesis_contract_history_immutable on public.genesis_operating_contracts;
create trigger genesis_contract_history_immutable before update on public.genesis_operating_contracts
  for each row execute function genesis_private.guard_contract_history();

create table if not exists public.genesis_work_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.genesis_tasks(id) on delete cascade,
  run_id uuid not null unique references public.genesis_work_attempts(run_id),
  decision text not null check (decision in ('accept','revise')),
  notes text not null default '' check (length(notes) <= 4000),
  reviewed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.genesis_work_authorizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.genesis_tasks(id) on delete cascade,
  contract_version_id uuid not null references public.genesis_operating_contracts(id),
  decision text not null check (decision in ('approve','reject')),
  notes text not null default '' check (length(notes) <= 4000),
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (task_id, contract_version_id)
);

-- Existing owner-only RLS policies do not prove that a supplied workspace or
-- reference belongs to that owner. Validate new/changed relationships even for
-- direct legacy Data API inserts. Existing data is preserved for later audit.
create or replace function genesis_private.validate_reference_scope()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare r jsonb:=to_jsonb(new); w uuid:=(r->>'workspace_id')::uuid; o uuid:=(r->>'owner_id')::uuid; ref uuid; k text;
begin
  if not exists(select 1 from public.genesis_workspaces where id=w and owner_id=o) then
    raise exception using errcode='23514',message='Record owner must own its workspace.';
  end if;
  foreach k in array array['agent_id','primary_agent_id','director_agent_id'] loop
    ref:=(r->>k)::uuid;
    if ref is not null and not exists(select 1 from public.genesis_agents where id=ref and workspace_id=w and owner_id=o) then
      raise exception using errcode='23514',message='Agent reference must belong to the same owner and workspace.';
    end if;
  end loop;
  ref:=(r->>'objective_id')::uuid;
  if ref is not null and not exists(select 1 from public.genesis_objectives where id=ref and workspace_id=w and owner_id=o) then
    raise exception using errcode='23514',message='Objective reference must belong to the same owner and workspace.';
  end if;
  ref:=(r->>'plan_id')::uuid;
  if ref is not null and not exists(select 1 from public.genesis_plans where id=ref and workspace_id=w and owner_id=o) then
    raise exception using errcode='23514',message='Plan reference must belong to the same owner and workspace.';
  end if;
  foreach k in array array['task_id','parent_task_id','depends_on_task_id'] loop
    ref:=(r->>k)::uuid;
    if ref is not null and not exists(select 1 from public.genesis_tasks where id=ref and workspace_id=w and owner_id=o) then
      raise exception using errcode='23514',message='Task reference must belong to the same owner and workspace.';
    end if;
  end loop;
  ref:=(r->>'contract_version_id')::uuid;
  if ref is not null and not exists(select 1 from public.genesis_operating_contracts where id=ref and workspace_id=w and owner_id=o) then
    raise exception using errcode='23514',message='Operating contract must belong to the same owner and workspace.';
  end if;
  foreach k in array array['run_id','active_run_id','created_from_run_id'] loop
    ref:=(r->>k)::uuid;
    if ref is not null and not exists(select 1 from public.genesis_agent_runs where id=ref and workspace_id=w and owner_id=o) then
      raise exception using errcode='23514',message='Run reference must belong to the same owner and workspace.';
    end if;
  end loop;
  return new;
end;
$fn$;
do $scope_triggers$
declare n text;
begin
  foreach n in array array['genesis_agents','genesis_objectives','genesis_agent_runs','genesis_events','genesis_agent_memory',
    'genesis_plans','genesis_tasks','genesis_task_assignments','genesis_task_dependencies','genesis_operating_contracts',
    'genesis_commands','genesis_work_attempts','genesis_work_reviews','genesis_work_authorizations'] loop
    execute format('drop trigger if exists genesis_reference_scope on public.%I',n);
    execute format('create trigger genesis_reference_scope before insert or update on public.%I for each row execute function genesis_private.validate_reference_scope()',n);
  end loop;
end;
$scope_triggers$;

-- Public reads retain owner isolation. Mutation is available only through the
-- scoped state-machine functions below; model output never grants permissions.
do $policies$
declare n text;
begin
  foreach n in array array['genesis_operating_contracts','genesis_commands',
    'genesis_work_attempts','genesis_work_reviews','genesis_work_authorizations'] loop
    execute format('alter table public.%I enable row level security', n);
    execute format('drop policy if exists foundation_owner_read on public.%I', n);
    execute format('create policy foundation_owner_read on public.%I for select to authenticated using ((select auth.uid()) = owner_id and exists (select 1 from public.genesis_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))', n);
    execute format('revoke all on table public.%I from public, anon, authenticated', n);
    execute format('grant select on table public.%I to authenticated', n);
    execute format('grant all on table public.%I to service_role', n);
  end loop;
end;
$policies$;

-- These are the lifecycle tables whose direct client mutation would otherwise
-- bypass approval, dependency, accepted-output, and stale-attempt checks.
revoke insert, update, delete on public.genesis_tasks, public.genesis_plans,
  public.genesis_task_assignments, public.genesis_task_dependencies from authenticated;

create or replace function genesis_private.require_workspace(p_workspace_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $fn$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null or not exists (
    select 1 from public.genesis_workspaces w
    where w.id = p_workspace_id and w.owner_id = v_owner
  ) then
    raise exception using errcode = '42501', message = 'Workspace access denied.';
  end if;
  return v_owner;
end;
$fn$;

create or replace function genesis_private.foundation_contract(p_workspace_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $fn$
declare v_owner uuid; v_contract uuid;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  insert into public.genesis_operating_contracts(workspace_id,owner_id,contract_key,version,specification)
  values (p_workspace_id,v_owner,'genesis-foundation',1,jsonb_build_object(
    'purpose','Produce and review bounded internal work from operator-supplied context.',
    'objective','Preserve traceable command-to-accepted-output execution.',
    'executionMode','internal_only',
    'allowedWorkTypes',jsonb_build_array('research','analysis','planning','drafting','qualification','measurement'),
    'specialistAgentKeys',jsonb_build_array('market_intelligence','campaign_planner','content_seo','lead_intelligence','nurture','analytics'),
    'permissions',jsonb_build_object('externalActions',false,'publishing',false,'customerContact',false,'spending',false,'credentialAccess',false),
    'requiredInputs',jsonb_build_array('operator_command','success_criteria'),
    'requiredOutputs',jsonb_build_array('summary','deliverables','evidence_gaps'),
    'coordinationRules','Dependencies require accepted outputs; a proposal requires operator acceptance.',
    'successCriteria','A stored result meets task criteria and is accepted by the workspace owner.',
    'maxAttempts',3,'maxWorkItems',6,'leaseSeconds',900,'resultReviewRequired',true,
    'max_input_chars',60000,'max_output_tokens',8000,'max_runtime_seconds',240
  )) on conflict (workspace_id,contract_key,version) do nothing;
  select id into strict v_contract from public.genesis_operating_contracts
    where workspace_id = p_workspace_id and owner_id = v_owner
      and contract_key = 'genesis-foundation' and version = 1;
  return v_contract;
end;
$fn$;

create or replace function genesis_private.emit_event(
  p_workspace_id uuid,p_type text,p_entity_type text,p_entity_id uuid,p_key text,p_payload jsonb)
returns void language plpgsql security invoker set search_path = '' as $fn$
begin
  insert into public.genesis_events(workspace_id,owner_id,event_type,source_system,entity_type,entity_id,idempotency_key,payload)
  values (p_workspace_id,genesis_private.require_workspace(p_workspace_id),p_type,
    'genesis_foundation_v1',p_entity_type,p_entity_id,p_key,p_payload);
end;
$fn$;

create or replace function genesis_private.text_in_bounds(p_value jsonb,p_min integer,p_max integer)
returns boolean language sql immutable security invoker set search_path='' as $fn$
  select case when jsonb_typeof(p_value)='string'
    then length(btrim(p_value #>> '{}',E' \t\n\r')) between p_min and p_max else false end;
$fn$;
create or replace function genesis_private.number_in_bounds(p_value jsonb,p_min numeric,p_max numeric,p_integer boolean default false)
returns boolean language sql immutable security invoker set search_path='' as $fn$
  select case when jsonb_typeof(p_value)='number' then
    (p_value #>> '{}')::numeric between p_min and p_max
      and (not p_integer or trunc((p_value #>> '{}')::numeric)=(p_value #>> '{}')::numeric)
    else false end;
$fn$;

create or replace function genesis_private.valid_director_output(p_output jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $fn$
declare i jsonb; d jsonb;
begin
  if jsonb_typeof(p_output) is distinct from 'object' or length(p_output::text)>60000 then return false; end if;
  if exists(select 1 from jsonb_object_keys(p_output) k where k not in ('recommendedAction','rationale','primaryMetric','expectedLearning','requiresHumanReview','workItems')) then return false; end if;
  if not genesis_private.text_in_bounds(p_output->'recommendedAction',1,1800)
    or not genesis_private.text_in_bounds(p_output->'rationale',1,2400)
    or not genesis_private.text_in_bounds(p_output->'primaryMetric',1,700)
    or not genesis_private.text_in_bounds(p_output->'expectedLearning',1,900)
    or jsonb_typeof(p_output->'requiresHumanReview') is distinct from 'boolean'
    or jsonb_typeof(p_output->'workItems') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_output->'workItems') not between 1 and 6 then return false; end if;
  for i in select value from jsonb_array_elements(p_output->'workItems') loop
    if jsonb_typeof(i) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(i) k where k not in ('key','dependsOn','agentKey','title','description','taskType','priority','successCriteria')) then return false; end if;
    if not genesis_private.text_in_bounds(i->'key',1,48) or (i->>'key') !~ '^[a-z][a-z0-9_-]{0,47}$'
      or jsonb_typeof(i->'dependsOn') is distinct from 'array'
      or coalesce(i->>'agentKey','') not in ('market_intelligence','campaign_planner','content_seo','lead_intelligence','nurture','analytics')
      or not genesis_private.text_in_bounds(i->'title',1,160)
      or not genesis_private.text_in_bounds(i->'description',1,1200)
      or coalesce(i->>'taskType','') not in ('research','analysis','planning','drafting','qualification','measurement')
      or not genesis_private.number_in_bounds(i->'priority',1,5,true)
      or not genesis_private.text_in_bounds(i->'successCriteria',1,700) then return false; end if;
    if jsonb_array_length(i->'dependsOn')>6 then return false; end if;
    for d in select value from jsonb_array_elements(i->'dependsOn') loop
      if not genesis_private.text_in_bounds(d,1,48) or (d #>> '{}') !~ '^[a-z][a-z0-9_-]{0,47}$' then return false; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(i->'dependsOn'))<>jsonb_array_length(i->'dependsOn') then return false; end if;
  end loop;
  return true;
end;
$fn$;

create or replace function genesis_private.valid_specialist_output(p_output jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $fn$
declare i jsonb;
begin
  if jsonb_typeof(p_output) is distinct from 'object' or length(p_output::text)>60000 then return false; end if;
  if exists(select 1 from jsonb_object_keys(p_output) k where k not in ('summary','confidence','findings','deliverables','evidenceGaps','recommendedNextAction','requiresHumanReview','memoryCandidates')) then return false; end if;
  if not genesis_private.text_in_bounds(p_output->'summary',1,1800)
    or not genesis_private.number_in_bounds(p_output->'confidence',0,1)
    or not genesis_private.text_in_bounds(p_output->'recommendedNextAction',1,900)
    or jsonb_typeof(p_output->'requiresHumanReview') is distinct from 'boolean'
    or jsonb_typeof(p_output->'findings') is distinct from 'array'
    or jsonb_typeof(p_output->'deliverables') is distinct from 'array'
    or jsonb_typeof(p_output->'evidenceGaps') is distinct from 'array'
    or jsonb_typeof(p_output->'memoryCandidates') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_output->'findings')>8 or jsonb_array_length(p_output->'deliverables') not between 1 and 6
    or jsonb_array_length(p_output->'evidenceGaps')>8 or jsonb_array_length(p_output->'memoryCandidates')>6 then return false; end if;
  for i in select value from jsonb_array_elements(p_output->'deliverables') loop
    if jsonb_typeof(i) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(i) k where k not in ('title','type','content')) then return false; end if;
    if not genesis_private.text_in_bounds(i->'title',1,160) or not genesis_private.text_in_bounds(i->'content',1,5000)
      or coalesce(i->>'type','') not in ('brief','analysis','plan','draft','qualification','measurement') then return false; end if;
  end loop;
  for i in select value from jsonb_array_elements(p_output->'findings') loop
    if jsonb_typeof(i) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(i) k where k not in ('finding','evidenceStatus','evidence','implication')) then return false; end if;
    if not genesis_private.text_in_bounds(i->'finding',1,700) or not genesis_private.text_in_bounds(i->'evidence',1,900)
      or not genesis_private.text_in_bounds(i->'implication',1,700)
      or coalesce(i->>'evidenceStatus','') not in ('supplied_context','internal_inference','hypothesis') then return false; end if;
  end loop;
  for i in select value from jsonb_array_elements(p_output->'evidenceGaps') loop
    if not genesis_private.text_in_bounds(i,1,500) then return false; end if;
  end loop;
  for i in select value from jsonb_array_elements(p_output->'memoryCandidates') loop
    if jsonb_typeof(i) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(i) k where k not in ('memoryType','subject','content','confidence','importance')) then return false; end if;
    if coalesce(i->>'memoryType','') not in ('fact','preference','decision','lesson','pattern','summary')
      or not genesis_private.text_in_bounds(i->'subject',1,180) or not genesis_private.text_in_bounds(i->'content',1,1800)
      or not genesis_private.number_in_bounds(i->'confidence',0,1) or not genesis_private.number_in_bounds(i->'importance',1,5,true) then return false; end if;
  end loop;
  return true;
end;
$fn$;

create or replace function genesis_private.submit_command(
  p_workspace_id uuid,p_command text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_owner uuid; v_contract uuid; v_command public.genesis_commands%rowtype;
  v_director public.genesis_agents%rowtype; v_objective uuid; v_plan uuid; v_task uuid; v_title text;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  p_command := btrim(p_command);
  if p_command is null or length(p_command) not between 1 and 2400
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'Invalid command or idempotency key.';
  end if;
  insert into public.genesis_commands(workspace_id,owner_id,idempotency_key,command_text)
  values(p_workspace_id,v_owner,p_idempotency_key,p_command)
  on conflict (workspace_id,idempotency_key) do nothing returning * into v_command;
  if v_command.id is null then
    select * into strict v_command from public.genesis_commands
      where workspace_id = p_workspace_id and owner_id = v_owner and idempotency_key = p_idempotency_key;
    if v_command.command_text <> p_command then
      raise exception using errcode = '22023', message = 'Idempotency key was already used for a different command.';
    end if;
    return jsonb_build_object('objective_id',v_command.objective_id,'plan_id',v_command.plan_id,'task_id',v_command.task_id,'replayed',true);
  end if;
  select * into v_director from public.genesis_agents
    where workspace_id = p_workspace_id and owner_id = v_owner and agent_key = 'director' and status = 'active';
  if v_director.id is null then
    raise exception using errcode = '22023', message = 'An active Director is required.';
  end if;
  v_contract := genesis_private.foundation_contract(p_workspace_id);
  v_title := left(regexp_replace(p_command,'\s+',' ','g'),84);
  insert into public.genesis_objectives(workspace_id,owner_id,title,objective,status,metrics)
    values(p_workspace_id,v_owner,v_title,p_command,'active',jsonb_build_object('source','operator_command','foundation_version',1)) returning id into v_objective;
  insert into public.genesis_plans(workspace_id,owner_id,objective_id,director_agent_id,title,summary,status,strategy,success_metrics,constraints,contract_version_id)
    values(p_workspace_id,v_owner,v_objective,v_director.id,'Director plan: ' || v_title,p_command,'proposed',
      jsonb_build_object('mode','director_decomposition','source','operator_command'), '[]'::jsonb,
      jsonb_build_object('external_actions_allowed',false,'result_review_required',true),v_contract) returning id into v_plan;
  insert into public.genesis_tasks(workspace_id,owner_id,plan_id,objective_id,primary_agent_id,title,description,task_type,status,priority,autonomy_level,requires_approval,input,context,contract_version_id)
    values(p_workspace_id,v_owner,v_plan,v_objective,v_director.id,'Interpret objective and propose a work plan',p_command,'strategy','ready',2,
      least(coalesce(v_director.autonomy_level,2),3),false,jsonb_build_object('operator_command',p_command),
      jsonb_build_object('source','command_center','role','workforce_orchestration'),v_contract) returning id into v_task;
  insert into public.genesis_task_assignments(workspace_id,owner_id,task_id,agent_id,assignment_role,status)
    values(p_workspace_id,v_owner,v_task,v_director.id,'owner','assigned');
  update public.genesis_commands set objective_id=v_objective,plan_id=v_plan,task_id=v_task where id=v_command.id;
  perform genesis_private.emit_event(p_workspace_id,'objective.created','objective',v_objective,'foundation-command:' || v_command.id,
    jsonb_build_object('objective_id',v_objective,'plan_id',v_plan,'task_id',v_task,'contract_version_id',v_contract));
  return jsonb_build_object('objective_id',v_objective,'plan_id',v_plan,'task_id',v_task,'replayed',false);
end;
$fn$;

create or replace function genesis_private.initialize_foundation(p_workspace_id uuid default null,p_name text default 'Genesis')
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_owner uuid:=auth.uid(); v_workspace uuid; v_created boolean:=false; v_contract uuid; a record; v_count integer;
begin
  if v_owner is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception using errcode='22023',message='Workspace name must contain 1 to 120 characters.'; end if;
  -- Serialize same-owner initialization without taking an application-wide lock.
  perform 1 from auth.users where id=v_owner for update;
  if not found then raise exception using errcode='42501',message='Authenticated user is unavailable.'; end if;
  if p_workspace_id is not null then
    perform genesis_private.require_workspace(p_workspace_id); v_workspace:=p_workspace_id;
  else
    select id into v_workspace from public.genesis_workspaces where owner_id=v_owner order by created_at,id limit 1;
    if v_workspace is null then
      insert into public.genesis_workspaces(owner_id,name,slug) values(v_owner,btrim(p_name),'genesis-' || v_owner::text) returning id into v_workspace;
      v_created:=true;
    end if;
  end if;
  for a in select * from (values
    ('director','Genesis Director','director','Translate an operator objective into bounded, reviewable internal work.'),
    ('market_intelligence','Research Specialist','specialist','Organize supplied evidence and distinguish facts from hypotheses.'),
    ('campaign_planner','Planning Specialist','specialist','Develop bounded internal plans and define measurable acceptance criteria.'),
    ('content_seo','Drafting Specialist','specialist','Produce clear internal drafts from supplied context.'),
    ('lead_intelligence','Evidence Reviewer','specialist','Assess supplied information and identify gaps without inventing facts.'),
    ('nurture','Follow-through Specialist','specialist','Develop internal follow-through plans without contacting anyone.'),
    ('analytics','Measurement Specialist','specialist','Define and assess measurements against supplied evidence.')
  ) as seed(agent_key,name,role,mission) loop
    if not exists(select 1 from public.genesis_agents where workspace_id=v_workspace and owner_id=v_owner and agent_key=a.agent_key) then
      insert into public.genesis_agents(workspace_id,owner_id,agent_key,name,role,mission,status,autonomy_level,tools,kpis)
        values(v_workspace,v_owner,a.agent_key,a.name,a.role,a.mission,'active',2,'[]'::jsonb,'[]'::jsonb);
    end if;
  end loop;
  v_contract:=genesis_private.foundation_contract(v_workspace);
  select count(*) into v_count from public.genesis_agents where workspace_id=v_workspace and owner_id=v_owner and agent_key in
    ('director','market_intelligence','campaign_planner','content_seo','lead_intelligence','nurture','analytics');
  return jsonb_build_object('workspace_id',v_workspace,'created',v_created,'contract_version_id',v_contract,'agent_count',v_count);
end;
$fn$;

create or replace function genesis_private.work_blockers(p_workspace_id uuid,p_task_id uuid,p_kind text default null)
returns text[] language plpgsql security invoker set search_path='' as $fn$
declare v_owner uuid; t public.genesis_tasks%rowtype; a public.genesis_agents%rowtype;
  p public.genesis_plans%rowtype; v_reasons text[]:=array[]::text[]; v_kind text;
begin
  v_owner:=genesis_private.require_workspace(p_workspace_id);
  select * into t from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner;
  if t.id is null then return array['Task is unavailable.']; end if;
  if t.status<>'ready' then v_reasons:=array_append(v_reasons,'Task is ' || replace(t.status,'_',' ') || '.'); end if;
  select * into a from public.genesis_agents where id=t.primary_agent_id and workspace_id=p_workspace_id and owner_id=v_owner;
  if a.id is null or a.status<>'active' then v_reasons:=array_append(v_reasons,'Assigned agent is unavailable or paused.'); end if;
  v_kind:=case when a.agent_key='director' then 'director' else 'specialist' end;
  if p_kind is not null and p_kind<>v_kind then v_reasons:=array_append(v_reasons,'Task belongs to a different runtime.'); end if;
  if v_kind='specialist' and (a.id is null or a.agent_key not in ('market_intelligence','campaign_planner','content_seo','lead_intelligence','nurture','analytics')
    or t.task_type not in ('research','analysis','planning','drafting','qualification','measurement')) then
    v_reasons:=array_append(v_reasons,'Task has no supported internal specialist profile.');
  end if;
  if v_kind='director' and (t.parent_task_id is not null or t.task_type<>'strategy') then
    v_reasons:=array_append(v_reasons,'Task is not a Director coordination task.');
  end if;
  select * into p from public.genesis_plans where id=t.plan_id and workspace_id=p_workspace_id and owner_id=v_owner;
  if p.id is null or (v_kind='director' and p.status<>'proposed') or (v_kind='specialist' and p.status<>'active') then
    v_reasons:=array_append(v_reasons,case when p.status='paused' then 'Plan is paused; review the cancelled scope and resume remaining work.' else 'Plan is not approved for this execution.' end);
  end if;
  if not exists (select 1 from public.genesis_objectives where id=t.objective_id and workspace_id=p_workspace_id and owner_id=v_owner and status='active') then
    v_reasons:=array_append(v_reasons,'Objective is not active.');
  end if;
  if not exists (select 1 from public.genesis_operating_contracts where id=t.contract_version_id and workspace_id=p_workspace_id and owner_id=v_owner and contract_key='genesis-foundation' and version=1) then
    v_reasons:=array_append(v_reasons,'A supported foundation operating contract is required.');
  end if;
  if t.attempt_count>=3 then v_reasons:=array_append(v_reasons,'The three-attempt budget is exhausted.'); end if;
  if t.scheduled_for>now() then v_reasons:=array_append(v_reasons,'Scheduled start time has not arrived.'); end if;
  if t.requires_approval and not exists (select 1 from public.genesis_work_authorizations z where z.task_id=t.id and z.workspace_id=p_workspace_id
    and z.owner_id=v_owner and z.contract_version_id=t.contract_version_id and z.decision='approve') then
    v_reasons:=array_append(v_reasons,'Execution authorization is required.');
  end if;
  if exists (select 1 from public.genesis_task_dependencies d left join public.genesis_tasks dt
    on dt.id=d.depends_on_task_id and dt.workspace_id=p_workspace_id and dt.owner_id=v_owner
    where d.task_id=t.id and (d.workspace_id<>p_workspace_id or d.owner_id<>v_owner or d.dependency_type<>'finish_to_start'
      or dt.id is null or dt.status<>'completed' or dt.accepted_at is null)) then
    v_reasons:=array_append(v_reasons,'All dependencies require accepted outputs.');
  end if;
  return v_reasons;
end;
$fn$;

create or replace function genesis_private.workforce_readiness(p_workspace_id uuid,p_task_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_owner uuid; v_result jsonb;
begin
  v_owner:=genesis_private.require_workspace(p_workspace_id);
  if p_task_ids is not null and cardinality(p_task_ids)>500 then raise exception using errcode='22023',message='Readiness accepts at most 500 task IDs.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('task_id',t.id,'can_run',cardinality(b.reasons)=0,
    'blockers',to_jsonb(b.reasons),'current_run_id',t.active_run_id,
    'remaining_attempts',greatest(0,3-t.attempt_count),
    'authorization_required',t.requires_approval and t.contract_version_id is not null and not exists(
      select 1 from public.genesis_work_authorizations z where z.task_id=t.id and z.workspace_id=p_workspace_id and z.owner_id=v_owner and z.contract_version_id=t.contract_version_id and z.decision='approve'),
    'review_note',(select notes from public.genesis_work_reviews r where r.task_id=t.id order by r.created_at desc,r.id desc limit 1),
    'review_decision',(select decision from public.genesis_work_reviews r where r.task_id=t.id order by r.created_at desc,r.id desc limit 1))), '[]'::jsonb)
  into v_result from public.genesis_tasks t cross join lateral
    (select genesis_private.work_blockers(p_workspace_id,t.id,null) as reasons) b
    where t.workspace_id=p_workspace_id and t.owner_id=v_owner and (p_task_ids is null or t.id=any(p_task_ids));
  return v_result;
end;
$fn$;

create or replace function genesis_private.claim_work(
  p_workspace_id uuid,p_kind text,p_model text,p_provider text,p_task_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_owner uuid; v_task public.genesis_tasks%rowtype; v_agent public.genesis_agents%rowtype;
  v_run uuid; v_contract public.genesis_operating_contracts%rowtype; v_context jsonb;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  if p_kind not in ('director','specialist') or p_kind is null
     or p_model is distinct from 'openai/gpt-5.6-sol'
     or p_provider is distinct from 'vercel-ai-gateway' then
    raise exception using errcode='22023', message='Invalid runtime kind or model metadata.';
  end if;
  select t.* into v_task from public.genesis_tasks t
    where t.workspace_id=p_workspace_id and t.owner_id=v_owner and t.status='ready'
      and (p_task_id is null or t.id=p_task_id)
      and cardinality(genesis_private.work_blockers(p_workspace_id,t.id,p_kind))=0
    order by t.priority,t.created_at,t.id for update of t skip locked limit 1;
  if v_task.id is null then return null; end if;
  -- Recheck after row-lock acquisition so a concurrent status transition cannot
  -- be mistaken for an eligible snapshot.
  if cardinality(genesis_private.work_blockers(p_workspace_id,v_task.id,p_kind))<>0 then return null; end if;
  select * into strict v_agent from public.genesis_agents where id=v_task.primary_agent_id;
  select * into strict v_contract from public.genesis_operating_contracts where id=v_task.contract_version_id;
  v_context:=jsonb_build_object(
    'task',jsonb_build_object('id',v_task.id,'title',v_task.title,'description',v_task.description,'taskType',v_task.task_type,'priority',v_task.priority,'input',v_task.input,'context',v_task.context),
    'agent',jsonb_build_object('key',v_agent.agent_key,'name',v_agent.name,'role',v_agent.role,'autonomyLevel',v_agent.autonomy_level),
    'objective',(select jsonb_build_object('id',o.id,'title',o.title,'objective',o.objective,'metrics',o.metrics,'status',o.status) from public.genesis_objectives o where o.id=v_task.objective_id and o.workspace_id=p_workspace_id and o.owner_id=v_owner),
    'plan',(select jsonb_build_object('id',p.id,'title',p.title,'summary',p.summary,'status',p.status,'strategy',p.strategy,'success_metrics',p.success_metrics,'constraints',p.constraints) from public.genesis_plans p where p.id=v_task.plan_id and p.workspace_id=p_workspace_id and p.owner_id=v_owner),
    'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('task_id',dt.id,'title',dt.title,'output',a.output,'accepted_at',dt.accepted_at,'run_id',a.run_id) order by dt.id),'[]'::jsonb)
      from public.genesis_task_dependencies d join public.genesis_tasks dt on dt.id=d.depends_on_task_id
      join public.genesis_work_attempts a on a.run_id=dt.active_run_id and a.task_id=dt.id and a.status='produced'
      join public.genesis_work_reviews r on r.run_id=a.run_id and r.task_id=dt.id and r.decision='accept'
      where d.task_id=v_task.id and d.workspace_id=p_workspace_id and d.owner_id=v_owner and dt.workspace_id=p_workspace_id and dt.owner_id=v_owner and dt.status='completed' and dt.accepted_at is not null),
    'previousReview',(select jsonb_build_object('decision',r.decision,'notes',r.notes,'run_id',r.run_id) from public.genesis_work_reviews r where r.task_id=v_task.id and r.workspace_id=p_workspace_id and r.owner_id=v_owner order by r.created_at desc,r.id desc limit 1),
    'workforce',(select coalesce(jsonb_agg(jsonb_build_object('agent_key',a.agent_key,'name',a.name,'role',a.role,'autonomyLevel',a.autonomy_level) order by a.agent_key),'[]'::jsonb)
      from public.genesis_agents a where a.workspace_id=p_workspace_id and a.owner_id=v_owner and a.status='active' and a.agent_key in ('market_intelligence','campaign_planner','content_seo','lead_intelligence','nurture','analytics')),
    'memory',jsonb_build_object('agent',coalesce((select jsonb_agg(to_jsonb(m)) from (select memory_type,subject,content,confidence,importance from public.genesis_agent_memory
      where workspace_id=p_workspace_id and owner_id=v_owner and agent_id=v_agent.id and review_status='approved'
        and (memory_scope='agent' or (memory_scope='task' and scope_ref_id=v_task.id) or (memory_scope='objective' and scope_ref_id=v_task.objective_id))
        and valid_from<=now() and (valid_until is null or valid_until>now()) order by importance desc,created_at desc limit 12) m),'[]'::jsonb),
      'workspace',coalesce((select jsonb_agg(to_jsonb(m)) from (select memory_type,subject,content,confidence,importance from public.genesis_agent_memory
      where workspace_id=p_workspace_id and owner_id=v_owner and agent_id is null and memory_scope='workspace' and review_status='approved' and valid_from<=now() and (valid_until is null or valid_until>now()) order by importance desc,created_at desc limit 8) m),'[]'::jsonb)),
    'operatingContract',v_contract.specification,
    'executionBoundary',jsonb_build_object('mode','internal_work_only','externalActionsAllowed',false,'publishingAllowed',false,'customerContactAllowed',false,'paidSpendAllowed',false,'materialBudgetChangeAllowed',false)
  );
  if length(v_context::text)>60000 then raise exception using errcode='22023',message='Execution context exceeds the 60000-character budget; narrow the command.'; end if;
  insert into public.genesis_agent_runs(workspace_id,owner_id,agent_id,objective_id,status,input,provider,model,started_at)
    values(p_workspace_id,v_owner,v_agent.id,v_task.objective_id,'running',
      jsonb_build_object('task_id',v_task.id,'runtime','genesis_foundation_v1','attempt',v_task.attempt_count+1,'contract_version_id',v_contract.id,'context',v_context),
      p_provider,p_model,now()) returning id into v_run;
  insert into public.genesis_work_attempts(run_id,workspace_id,owner_id,task_id,contract_version_id,attempt_number,status,lease_expires_at,input)
    values(v_run,p_workspace_id,v_owner,v_task.id,v_contract.id,v_task.attempt_count+1,'running',now()+interval '15 minutes',v_context);
  update public.genesis_tasks set status='running',active_run_id=v_run,attempt_count=attempt_count+1,
    progress=5,started_at=now(),completed_at=null,accepted_at=null,accepted_by=null,last_error=null,updated_at=now()
    where id=v_task.id returning * into v_task;
  update public.genesis_task_assignments set status='working',completed_at=null
    where task_id=v_task.id and workspace_id=p_workspace_id and owner_id=v_owner and agent_id=v_agent.id;
  perform genesis_private.emit_event(p_workspace_id,'task.started','task',v_task.id,'foundation-started:' || v_run,
    jsonb_build_object('run_id',v_run,'attempt',v_task.attempt_count,'agent_id',v_agent.id,'contract_version_id',v_contract.id));
  return jsonb_build_object('task',to_jsonb(v_task),'agent',to_jsonb(v_agent),'run_id',v_run,
    'attempt',v_task.attempt_count,'contract',to_jsonb(v_contract),'context',v_context,'lease_expires_at',now()+interval '15 minutes');
end;
$fn$;

-- Lock task before attempt everywhere to avoid inverted lock order. Completion,
-- failure, heartbeat, and cancellation all use the same attempt identity.
create or replace function genesis_private.lock_live_work(p_workspace_id uuid,p_run_id uuid)
returns public.genesis_tasks language plpgsql security invoker set search_path = '' as $fn$
declare v_owner uuid; v_task public.genesis_tasks%rowtype; v_attempt public.genesis_work_attempts%rowtype; v_task_id uuid;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  select task_id into v_task_id from public.genesis_work_attempts
    where run_id=p_run_id and workspace_id=p_workspace_id and owner_id=v_owner;
  if v_task_id is null then raise exception using errcode='42501',message='Run access denied.'; end if;
  perform 1 from public.genesis_plans where id=(select plan_id from public.genesis_tasks where id=v_task_id)
    and workspace_id=p_workspace_id and owner_id=v_owner for update;
  select * into strict v_task from public.genesis_tasks
    where id=v_task_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  select * into strict v_attempt from public.genesis_work_attempts where run_id=p_run_id for update;
  if v_task.status<>'running' or v_task.active_run_id is distinct from p_run_id
      or v_attempt.status<>'running' or v_attempt.lease_expires_at<=now() then
    raise exception using errcode='55000',message='Stale or inactive run; result cannot be applied.';
  end if;
  return v_task;
end;
$fn$;

create or replace function genesis_private.heartbeat_work(p_workspace_id uuid,p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_task public.genesis_tasks%rowtype;
begin
  v_task := genesis_private.lock_live_work(p_workspace_id,p_run_id);
  update public.genesis_work_attempts set heartbeat_at=now(),lease_expires_at=now()+interval '15 minutes' where run_id=p_run_id;
  return jsonb_build_object('run_id',p_run_id,'lease_expires_at',now()+interval '15 minutes');
end;
$fn$;

create or replace function genesis_private.complete_director(
  p_workspace_id uuid,p_run_id uuid,p_output jsonb,p_usage jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_task public.genesis_tasks%rowtype; v_agent public.genesis_agents%rowtype; v_item jsonb;
  v_keys jsonb:='{}'::jsonb; v_child uuid; v_dep text; v_count integer:=0; v_existing jsonb;
begin
  perform genesis_private.require_workspace(p_workspace_id);
  select a.output into v_existing from public.genesis_work_attempts a join public.genesis_tasks t on t.id=a.task_id
    where a.run_id=p_run_id and a.workspace_id=p_workspace_id and a.owner_id=auth.uid() and a.status='produced'
      and t.active_run_id=p_run_id and t.status in ('awaiting_review','completed');
  if v_existing is not null then
    if v_existing=p_output then return jsonb_build_object('run_id',p_run_id,'replayed',true); end if;
    raise exception using errcode='55000',message='A different result is already stored for this run.';
  end if;
  v_task := genesis_private.lock_live_work(p_workspace_id,p_run_id);
  if not exists (select 1 from public.genesis_agents where id=v_task.primary_agent_id and agent_key='director' and workspace_id=p_workspace_id and owner_id=auth.uid()) then
    raise exception using errcode='22023',message='This is not a Director run.';
  end if;
  if not genesis_private.valid_director_output(p_output) or jsonb_typeof(p_usage) is distinct from 'object' or length(p_usage::text)>10000 then
    raise exception using errcode='22023',message='Invalid bounded Director output or usage.';
  end if;
  if jsonb_typeof(p_output) is distinct from 'object' or jsonb_typeof(p_output->'workItems') is distinct from 'array'
      or jsonb_array_length(p_output->'workItems') not between 1 and 6
      or coalesce(length(btrim(p_output->>'recommendedAction')),0) not between 1 and 1800
      or coalesce(length(btrim(p_output->>'rationale')),0) not between 1 and 4000
      or coalesce(length(btrim(p_output->>'primaryMetric')),0) not between 1 and 700
      or coalesce(length(btrim(p_output->>'expectedLearning')),0) not between 1 and 1800
      or jsonb_typeof(p_output->'requiresHumanReview') is distinct from 'boolean'
      or jsonb_typeof(p_usage) is distinct from 'object' then
    raise exception using errcode='22023',message='Invalid Director output.';
  end if;
  perform 1 from public.genesis_plans where id=v_task.plan_id and workspace_id=p_workspace_id and owner_id=auth.uid() and status='proposed' for update;
  if not found then raise exception using errcode='55000',message='Plan no longer accepts a proposal.'; end if;
  for v_item in select value from jsonb_array_elements(p_output->'workItems') loop
    if jsonb_typeof(v_item) is distinct from 'object' or coalesce(v_item->>'key','') !~ '^[a-z][a-z0-9_-]{0,47}$'
      or v_keys ? (v_item->>'key')
      or coalesce(v_item->>'agentKey','') not in ('market_intelligence','campaign_planner','content_seo','lead_intelligence','nurture','analytics')
      or coalesce(v_item->>'taskType','') not in ('research','analysis','planning','drafting','qualification','measurement')
      or coalesce(length(btrim(v_item->>'title')),0) not between 1 and 160
      or coalesce(length(btrim(v_item->>'description')),0) not between 1 and 1200
      or coalesce(length(btrim(v_item->>'successCriteria')),0) not between 1 and 700
      or not genesis_private.number_in_bounds(v_item->'priority',1,5,true)
      or jsonb_typeof(v_item->'dependsOn') is distinct from 'array' or jsonb_array_length(v_item->'dependsOn')>6 then
      raise exception using errcode='22023',message='Invalid or duplicate work item.';
    end if;
    select * into v_agent from public.genesis_agents where workspace_id=p_workspace_id and owner_id=auth.uid()
      and agent_key=v_item->>'agentKey' and status='active';
    if v_agent.id is null then raise exception using errcode='22023',message='A proposed specialist is unavailable.'; end if;
    insert into public.genesis_tasks(workspace_id,owner_id,plan_id,objective_id,primary_agent_id,parent_task_id,title,description,task_type,status,priority,autonomy_level,requires_approval,input,context,contract_version_id,created_from_run_id,work_item_key)
      values(p_workspace_id,auth.uid(),v_task.plan_id,v_task.objective_id,v_agent.id,v_task.id,v_item->>'title',v_item->>'description',v_item->>'taskType','queued',(v_item->>'priority')::numeric::smallint,
        least(coalesce(v_agent.autonomy_level,2),3),false,jsonb_build_object('operator_command',v_task.description,'success_criteria',v_item->>'successCriteria'),
        jsonb_build_object('generated_by','genesis_director','director_run_id',p_run_id,'specialist_agent_key',v_item->>'agentKey'),v_task.contract_version_id,p_run_id,v_item->>'key') returning id into v_child;
    insert into public.genesis_task_assignments(workspace_id,owner_id,task_id,agent_id,assignment_role,status)
      values(p_workspace_id,auth.uid(),v_child,v_agent.id,'owner','assigned');
    for v_dep in select value #>> '{}' from jsonb_array_elements(v_item->'dependsOn') loop
      if v_dep is null or not (v_keys ? v_dep) then
        raise exception using errcode='22023',message='Dependencies must reference earlier unique work-item keys.';
      end if;
      insert into public.genesis_task_dependencies(workspace_id,owner_id,task_id,depends_on_task_id,dependency_type)
        values(p_workspace_id,auth.uid(),v_child,(v_keys->>v_dep)::uuid,'finish_to_start');
    end loop;
    v_keys := v_keys || jsonb_build_object(v_item->>'key',v_child);
    v_count := v_count+1;
  end loop;
  update public.genesis_plans set strategy=strategy || jsonb_build_object('director_run_id',p_run_id,'decomposition','proposed_work_items','primary_metric',p_output->>'primaryMetric','expected_learning',p_output->>'expectedLearning'),
    success_metrics=jsonb_build_array(jsonb_build_object('metric',p_output->>'primaryMetric','source','director_proposal')),updated_at=now() where id=v_task.plan_id;
  update public.genesis_agent_runs set status='completed',output=p_output,usage=p_usage,completed_at=now() where id=p_run_id;
  update public.genesis_work_attempts set status='produced',output=p_output,usage=p_usage,finished_at=now() where run_id=p_run_id;
  update public.genesis_tasks set status='awaiting_review',progress=90,output=p_output || jsonb_build_object('agent_run_id',p_run_id,'specialist_tasks_created',v_count),updated_at=now() where id=v_task.id;
  perform genesis_private.emit_event(p_workspace_id,'plan.proposed','plan',v_task.plan_id,'foundation-proposal:' || p_run_id,
    jsonb_build_object('run_id',p_run_id,'task_id',v_task.id,'task_count',v_count));
  return jsonb_build_object('task_id',v_task.id,'plan_id',v_task.plan_id,'run_id',p_run_id,'task_count',v_count,'status','awaiting_review','replayed',false);
end;
$fn$;

create or replace function genesis_private.complete_work(
  p_workspace_id uuid,p_run_id uuid,p_output jsonb,p_usage jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_task public.genesis_tasks%rowtype; v_item jsonb; v_existing jsonb;
begin
  perform genesis_private.require_workspace(p_workspace_id);
  select a.output into v_existing from public.genesis_work_attempts a join public.genesis_tasks t on t.id=a.task_id
    where a.run_id=p_run_id and a.workspace_id=p_workspace_id and a.owner_id=auth.uid() and a.status='produced'
      and t.active_run_id=p_run_id and t.status in ('awaiting_review','completed');
  if v_existing is not null then
    if v_existing=p_output then return jsonb_build_object('run_id',p_run_id,'replayed',true); end if;
    raise exception using errcode='55000',message='A different result is already stored for this run.';
  end if;
  v_task := genesis_private.lock_live_work(p_workspace_id,p_run_id);
  if not exists (select 1 from public.genesis_agents where id=v_task.primary_agent_id and workspace_id=p_workspace_id and owner_id=auth.uid()
      and agent_key in ('market_intelligence','campaign_planner','content_seo','lead_intelligence','nurture','analytics')) then
    raise exception using errcode='22023',message='This is not a supported specialist run.';
  end if;
  if not genesis_private.valid_specialist_output(p_output) or jsonb_typeof(p_usage) is distinct from 'object' or length(p_usage::text)>10000 then
    raise exception using errcode='22023',message='Invalid bounded specialist output or usage.';
  end if;
  if jsonb_typeof(p_output) is distinct from 'object'
      or coalesce(length(btrim(p_output->>'summary')),0) not between 1 and 1800
      or jsonb_typeof(p_output->'confidence') is distinct from 'number'
      or (p_output->>'confidence')::numeric not between 0 and 1
      or jsonb_typeof(p_output->'deliverables') is distinct from 'array'
      or jsonb_array_length(p_output->'deliverables') not between 1 and 6
      or jsonb_typeof(p_output->'findings') is distinct from 'array' or jsonb_array_length(p_output->'findings')>8
      or jsonb_typeof(p_output->'evidenceGaps') is distinct from 'array' or jsonb_array_length(p_output->'evidenceGaps')>8
      or coalesce(length(btrim(p_output->>'recommendedNextAction')),0) not between 1 and 900
      or jsonb_typeof(p_output->'requiresHumanReview') is distinct from 'boolean'
      or jsonb_typeof(p_output->'memoryCandidates') is distinct from 'array' or jsonb_array_length(p_output->'memoryCandidates')>6
      or jsonb_typeof(p_usage) is distinct from 'object' then
    raise exception using errcode='22023',message='Invalid specialist output.';
  end if;
  for v_item in select value from jsonb_array_elements(p_output->'deliverables') loop
    if coalesce(length(btrim(v_item->>'title')),0) not between 1 and 160
        or coalesce(v_item->>'type','') not in ('brief','analysis','plan','draft','qualification','measurement')
        or coalesce(length(btrim(v_item->>'content')),0) not between 1 and 5000 then
      raise exception using errcode='22023',message='Invalid deliverable.';
    end if;
  end loop;
  update public.genesis_agent_runs set status='completed',output=p_output,usage=p_usage,completed_at=now() where id=p_run_id;
  update public.genesis_work_attempts set status='produced',output=p_output,usage=p_usage,finished_at=now() where run_id=p_run_id;
  update public.genesis_tasks set status='awaiting_review',progress=90,output=p_output || jsonb_build_object('agent_run_id',p_run_id),updated_at=now() where id=v_task.id;
  perform genesis_private.emit_event(p_workspace_id,'task.output_produced','task',v_task.id,'foundation-output:' || p_run_id,
    jsonb_build_object('run_id',p_run_id,'deliverable_count',jsonb_array_length(p_output->'deliverables'),'accepted',false));
  return jsonb_build_object('task_id',v_task.id,'run_id',p_run_id,'status','awaiting_review','replayed',false);
end;
$fn$;

create or replace function genesis_private.fail_work(p_workspace_id uuid,p_run_id uuid,p_error text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_task public.genesis_tasks%rowtype;
begin
  v_task := genesis_private.lock_live_work(p_workspace_id,p_run_id);
  p_error := left(coalesce(nullif(btrim(p_error),''),'Runtime failed.'),2000);
  update public.genesis_agent_runs set status='failed',error=p_error,completed_at=now() where id=p_run_id;
  update public.genesis_work_attempts set status='failed',error=p_error,finished_at=now() where run_id=p_run_id;
  update public.genesis_tasks set status='failed',progress=0,last_error=p_error,completed_at=now(),updated_at=now() where id=v_task.id;
  update public.genesis_task_assignments set status='assigned',completed_at=null where task_id=v_task.id and workspace_id=p_workspace_id and owner_id=auth.uid();
  perform genesis_private.emit_event(p_workspace_id,'task.failed','task',v_task.id,'foundation-failed:' || p_run_id,jsonb_build_object('run_id',p_run_id,'error',p_error));
  return jsonb_build_object('task_id',v_task.id,'run_id',p_run_id,'status','failed');
end;
$fn$;

create or replace function genesis_private.refresh_plan(p_workspace_id uuid,p_plan_id uuid)
returns void language plpgsql security invoker set search_path = '' as $fn$
begin
  -- This helper only promotes dependency-blocked work created by this runtime.
  update public.genesis_tasks t set status=case when t.requires_approval and not exists (
      select 1 from public.genesis_work_authorizations z where z.task_id=t.id and z.contract_version_id=t.contract_version_id and z.decision='approve')
    then 'awaiting_approval' else 'ready' end, last_error=null,updated_at=now()
    where t.workspace_id=p_workspace_id and t.owner_id=auth.uid() and t.plan_id=p_plan_id
      and t.created_from_run_id is not null and t.status in ('queued','blocked')
      and exists (select 1 from public.genesis_plans p where p.id=t.plan_id and p.status='active')
      and not exists (select 1 from public.genesis_task_dependencies d join public.genesis_tasks dt on dt.id=d.depends_on_task_id
        where d.task_id=t.id and (dt.status<>'completed' or dt.accepted_at is null));
  update public.genesis_tasks t set status='blocked',last_error='Waiting for accepted dependency outputs.',updated_at=now()
    where t.workspace_id=p_workspace_id and t.owner_id=auth.uid() and t.plan_id=p_plan_id and t.status='queued'
      and exists (select 1 from public.genesis_plans p where p.id=t.plan_id and p.status='active');
  if exists (select 1 from public.genesis_tasks where plan_id=p_plan_id and parent_task_id is not null and status<>'cancelled')
    and not exists (select 1 from public.genesis_tasks where plan_id=p_plan_id and status not in ('completed','cancelled'))
    and exists (select 1 from public.genesis_plans where id=p_plan_id and status='active') then
    update public.genesis_plans set status='completed',completed_at=now(),updated_at=now() where id=p_plan_id;
    update public.genesis_objectives set status='completed' where id=(select objective_id from public.genesis_plans where id=p_plan_id)
      and workspace_id=p_workspace_id and owner_id=auth.uid();
    perform genesis_private.emit_event(p_workspace_id,'plan.completed','plan',p_plan_id,'foundation-plan-accepted:' || p_plan_id,
      jsonb_build_object('basis','all_remaining_outputs_accepted','cancelled_task_count',
        (select count(*) from public.genesis_tasks where plan_id=p_plan_id and status='cancelled')));
  end if;
end;
$fn$;

create or replace function genesis_private.review_work(
  p_workspace_id uuid,p_task_id uuid,p_run_id uuid,p_decision text,p_notes text default '')
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_owner uuid; v_task public.genesis_tasks%rowtype; v_director boolean; v_review public.genesis_work_reviews%rowtype;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  if p_decision not in ('accept','revise') or p_decision is null or coalesce(length(p_notes),0)>4000
    or (p_decision='revise' and coalesce(length(btrim(p_notes)),0)=0) then
    raise exception using errcode='22023',message='A revision requires a note; decision must be accept or revise.';
  end if;
  perform 1 from public.genesis_plans where id=(select plan_id from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner) for update;
  select * into v_task from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  if v_task.id is null then raise exception using errcode='42501',message='Task access denied.'; end if;
  select * into v_review from public.genesis_work_reviews where run_id=p_run_id and task_id=p_task_id;
  if v_review.id is not null then
    if v_review.decision=p_decision and v_review.notes=coalesce(p_notes,'') then return jsonb_build_object('task_id',p_task_id,'replayed',true); end if;
    raise exception using errcode='55000',message='This result already has a different review decision.';
  end if;
  if v_task.status<>'awaiting_review' or v_task.active_run_id is distinct from p_run_id
    or not exists (select 1 from public.genesis_work_attempts where run_id=p_run_id and task_id=p_task_id and status='produced') then
    raise exception using errcode='55000',message='Only the current produced output can be reviewed.';
  end if;
  if p_decision='revise' and v_task.attempt_count>=3 then
    raise exception using errcode='55000',message='Attempt budget exhausted; create a new command with the revised objective.';
  end if;
  select agent_key='director' into v_director from public.genesis_agents where id=v_task.primary_agent_id;
  perform 1 from public.genesis_plans where id=v_task.plan_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  insert into public.genesis_work_reviews(workspace_id,owner_id,task_id,run_id,decision,notes,reviewed_by)
    values(p_workspace_id,v_owner,p_task_id,p_run_id,p_decision,coalesce(p_notes,''),v_owner);
  if p_decision='accept' then
    update public.genesis_tasks set status='completed',progress=100,completed_at=now(),accepted_at=now(),accepted_by=v_owner,updated_at=now() where id=p_task_id;
    update public.genesis_task_assignments set status='completed',completed_at=now() where task_id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner;
    if v_director then
      update public.genesis_plans set status='active',approved_at=now(),starts_at=coalesce(starts_at,now()),updated_at=now() where id=v_task.plan_id and status='proposed';
    end if;
    perform genesis_private.emit_event(p_workspace_id,'task.accepted','task',p_task_id,'foundation-accepted:' || p_run_id,
      jsonb_build_object('run_id',p_run_id,'reviewed_by',v_owner));
    perform genesis_private.refresh_plan(p_workspace_id,v_task.plan_id);
  else
    if v_director then
      update public.genesis_tasks set status='cancelled',last_error='Superseded by a requested Director revision.',completed_at=now(),updated_at=now()
        where created_from_run_id=p_run_id and workspace_id=p_workspace_id and owner_id=v_owner and status in ('queued','blocked','ready','awaiting_approval');
      update public.genesis_task_assignments set status='declined' where task_id in (select id from public.genesis_tasks where created_from_run_id=p_run_id)
        and workspace_id=p_workspace_id and owner_id=v_owner;
    end if;
    update public.genesis_tasks set status='ready',active_run_id=null,progress=0,started_at=null,completed_at=null,last_error=null,
      context=context || jsonb_build_object('revision_request',p_notes,'previous_run_id',p_run_id),updated_at=now() where id=p_task_id;
    update public.genesis_task_assignments set status='assigned',completed_at=null where task_id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner;
    perform genesis_private.emit_event(p_workspace_id,'task.revision_requested','task',p_task_id,'foundation-revision:' || p_run_id,jsonb_build_object('run_id',p_run_id,'notes',p_notes));
  end if;
  return jsonb_build_object('task_id',p_task_id,'run_id',p_run_id,'status',case when p_decision='accept' then 'completed' else 'ready' end,'replayed',false);
end;
$fn$;

create or replace function genesis_private.retry_work(p_workspace_id uuid,p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_owner uuid; v_task public.genesis_tasks%rowtype;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  select * into v_task from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  if v_task.id is null then raise exception using errcode='42501',message='Task access denied.'; end if;
  if v_task.status<>'failed' or v_task.attempt_count>=3 or v_task.contract_version_id is null then
    raise exception using errcode='55000',message='Only a failed foundation task with remaining attempts can be retried.';
  end if;
  if not exists (select 1 from public.genesis_plans where id=v_task.plan_id and workspace_id=p_workspace_id and owner_id=v_owner and status in ('active','proposed')) then
    raise exception using errcode='55000',message='The plan is not active.';
  end if;
  update public.genesis_tasks set status='ready',active_run_id=null,progress=0,started_at=null,completed_at=null,last_error=null,updated_at=now() where id=p_task_id;
  update public.genesis_task_assignments set status='assigned',completed_at=null where task_id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner;
  perform genesis_private.emit_event(p_workspace_id,'task.requeued','task',p_task_id,'foundation-retry:' || p_task_id || ':' || v_task.attempt_count,
    jsonb_build_object('previous_run_id',v_task.active_run_id,'next_attempt',v_task.attempt_count+1));
  return jsonb_build_object('task_id',p_task_id,'status','ready');
end;
$fn$;

create or replace function genesis_private.authorize_work(
  p_workspace_id uuid,p_task_id uuid,p_decision text,p_notes text default '')
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_owner uuid; v_task public.genesis_tasks%rowtype;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  if p_decision not in ('approve','reject') or p_decision is null or coalesce(length(p_notes),0)>4000 then
    raise exception using errcode='22023',message='Invalid authorization decision.';
  end if;
  perform 1 from public.genesis_plans where id=(select plan_id from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner) for update;
  select * into v_task from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  if v_task.id is null then raise exception using errcode='42501',message='Task access denied.'; end if;
  if not v_task.requires_approval or v_task.status not in ('ready','awaiting_approval','queued','blocked') or v_task.contract_version_id is null then
    raise exception using errcode='55000',message='This task does not await execution authorization.';
  end if;
  insert into public.genesis_work_authorizations(workspace_id,owner_id,task_id,contract_version_id,decision,notes,decided_by)
    values(p_workspace_id,v_owner,p_task_id,v_task.contract_version_id,p_decision,coalesce(p_notes,''),v_owner);
  if p_decision='approve' then
    update public.genesis_tasks set status='ready',completed_at=null,updated_at=now() where id=p_task_id;
  else
    perform genesis_private.cancel_work(p_workspace_id,p_task_id);
  end if;
  perform genesis_private.emit_event(p_workspace_id,'task.authorization_decided','task',p_task_id,'foundation-authorization:' || p_task_id,
    jsonb_build_object('decision',p_decision,'contract_version_id',v_task.contract_version_id));
  return jsonb_build_object('task_id',p_task_id,'decision',p_decision);
end;
$fn$;

create or replace function genesis_private.cancel_work(p_workspace_id uuid,p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_owner uuid; v_task public.genesis_tasks%rowtype; v_cancel public.genesis_tasks%rowtype; v_count integer:=0; v_director boolean; v_ids uuid[];
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  perform 1 from public.genesis_plans where id=(select plan_id from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner) for update;
  select * into v_task from public.genesis_tasks where id=p_task_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  if v_task.id is null then raise exception using errcode='42501',message='Task access denied.'; end if;
  if v_task.status='cancelled' then return jsonb_build_object('task_id',p_task_id,'replayed',true); end if;
  if v_task.status='completed' then raise exception using errcode='55000',message='Accepted work cannot be cancelled.'; end if;
  select agent_key='director' into v_director from public.genesis_agents where id=v_task.primary_agent_id;
  if v_director then
    select array_agg(id) into v_ids from public.genesis_tasks where plan_id=v_task.plan_id and workspace_id=p_workspace_id and owner_id=v_owner;
  else
    with recursive downstream(id) as (
      select p_task_id
      union
      select d.task_id from public.genesis_task_dependencies d join downstream s on d.depends_on_task_id=s.id
        where d.workspace_id=p_workspace_id and d.owner_id=v_owner
    ) select array_agg(id) into v_ids from downstream;
  end if;
  -- A Director cancellation terminates its plan. A specialist cancellation
  -- fences that task and dependent tasks, and pauses the plan for the operator.
  -- Independent in-flight results may still be retained and reviewed.
  for v_cancel in select * from public.genesis_tasks where plan_id=v_task.plan_id and workspace_id=p_workspace_id and owner_id=v_owner
      and id=any(v_ids) and status not in ('completed','cancelled') order by id for update loop
    if v_cancel.active_run_id is not null then
      update public.genesis_work_attempts set status='cancelled',error='Cancelled by the workspace owner.',finished_at=now()
        where run_id=v_cancel.active_run_id and status='running';
      update public.genesis_agent_runs set status='failed',error='Cancelled by the workspace owner.',completed_at=now()
        where id=v_cancel.active_run_id and status='running';
    end if;
    update public.genesis_tasks set status='cancelled',last_error='Work cancelled by the workspace owner.',completed_at=now(),updated_at=now() where id=v_cancel.id;
    update public.genesis_task_assignments set status='declined' where task_id=v_cancel.id and workspace_id=p_workspace_id and owner_id=v_owner;
    v_count:=v_count+1;
  end loop;
  update public.genesis_plans set status=case when v_director then 'cancelled' else 'paused' end,
    constraints=constraints || jsonb_build_object('pause_reason','Work was cancelled; review the cancelled scope before resuming remaining work.','cancelled_task_id',p_task_id),updated_at=now()
    where id=v_task.plan_id and workspace_id=p_workspace_id and owner_id=v_owner;
  if v_director then
    update public.genesis_objectives set status='cancelled' where id=v_task.objective_id and workspace_id=p_workspace_id and owner_id=v_owner;
  end if;
  perform genesis_private.emit_event(p_workspace_id,case when v_director then 'plan.cancelled' else 'plan.paused' end,'plan',v_task.plan_id,'foundation-cancelled:' || p_task_id,
    jsonb_build_object('requested_task_id',p_task_id,'cancelled_task_count',v_count));
  return jsonb_build_object('task_id',p_task_id,'plan_id',v_task.plan_id,'cancelled_task_count',v_count,'status','cancelled','plan_status',case when v_director then 'cancelled' else 'paused' end,'replayed',false);
end;
$fn$;

create or replace function genesis_private.recover_stale_work(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_owner uuid; v_task public.genesis_tasks%rowtype; v_count integer:=0;
begin
  v_owner := genesis_private.require_workspace(p_workspace_id);
  for v_task in select t.* from public.genesis_tasks t join public.genesis_work_attempts a on a.run_id=t.active_run_id
      where t.workspace_id=p_workspace_id and t.owner_id=v_owner and t.status='running'
        and a.status='running' and a.lease_expires_at<=now() order by t.id for update of t skip locked loop
    update public.genesis_work_attempts set status='expired',error='Runtime lease expired; operator retry required.',finished_at=now()
      where run_id=v_task.active_run_id and status='running' and lease_expires_at<=now();
    if not found then continue; end if;
    update public.genesis_agent_runs set status='failed',error='Runtime lease expired; operator retry required.',completed_at=now() where id=v_task.active_run_id;
    update public.genesis_tasks set status='failed',progress=0,last_error='Runtime lease expired; operator retry required.',completed_at=now(),updated_at=now() where id=v_task.id;
    update public.genesis_task_assignments set status='assigned',completed_at=null where task_id=v_task.id and workspace_id=p_workspace_id and owner_id=v_owner;
    perform genesis_private.emit_event(p_workspace_id,'task.lease_expired','task',v_task.id,'foundation-expired:' || v_task.active_run_id,
      jsonb_build_object('run_id',v_task.active_run_id,'attempt',v_task.attempt_count));
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('recovered_count',v_count);
end;
$fn$;

create or replace function genesis_private.resume_plan(p_workspace_id uuid,p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_owner uuid; v_plan public.genesis_plans%rowtype; v_count integer; v_seq integer;
begin
  v_owner:=genesis_private.require_workspace(p_workspace_id);
  select * into v_plan from public.genesis_plans where id=p_plan_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  if v_plan.id is null then raise exception using errcode='42501',message='Plan access denied.'; end if;
  if v_plan.status<>'paused' or not exists(select 1 from public.genesis_tasks t
    join public.genesis_agents a on a.id=t.primary_agent_id and a.agent_key='director'
    join public.genesis_work_reviews r on r.run_id=t.active_run_id and r.task_id=t.id and r.decision='accept'
    where t.plan_id=p_plan_id and t.workspace_id=p_workspace_id and t.owner_id=v_owner and t.parent_task_id is null and t.status='completed' and t.accepted_at is not null) then
    raise exception using errcode='55000',message='Only a paused plan with an accepted Director proposal can resume.';
  end if;
  select count(*) into v_count from public.genesis_tasks where plan_id=p_plan_id and status='cancelled';
  if not exists(select 1 from public.genesis_tasks where plan_id=p_plan_id and parent_task_id is not null and status<>'cancelled') then
    raise exception using errcode='55000',message='No uncancelled work remains; create a new command.';
  end if;
  v_seq:=coalesce((v_plan.constraints->>'resume_count')::integer,0)+1;
  update public.genesis_plans set status='active',constraints=(constraints-'pause_reason') || jsonb_build_object('cancelled_task_count',v_count,'resume_count',v_seq,'scope_change_acknowledged_by',v_owner),updated_at=now() where id=p_plan_id;
  perform genesis_private.emit_event(p_workspace_id,'plan.resumed','plan',p_plan_id,'foundation-resumed:' || p_plan_id || ':' || v_seq,
    jsonb_build_object('cancelled_task_count',v_count,'scope_change_acknowledged_by',v_owner));
  perform genesis_private.refresh_plan(p_workspace_id,p_plan_id);
  return jsonb_build_object('plan_id',p_plan_id,'status',(select status from public.genesis_plans where id=p_plan_id),'cancelled_task_count',v_count);
end;
$fn$;

create or replace function genesis_private.set_agent_status(
  p_workspace_id uuid,p_agent_id uuid,p_status text,p_expected_status text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_owner uuid; v_agent public.genesis_agents%rowtype;
begin
  v_owner:=genesis_private.require_workspace(p_workspace_id);
  if p_status is null or p_status not in ('active','paused') or p_expected_status is null or p_expected_status not in ('active','paused') then
    raise exception using errcode='22023',message='Agent status must be active or paused.';
  end if;
  select * into v_agent from public.genesis_agents where id=p_agent_id and workspace_id=p_workspace_id and owner_id=v_owner for update;
  if v_agent.id is null then raise exception using errcode='42501',message='Agent access denied.'; end if;
  if v_agent.status<>p_expected_status then raise exception using errcode='55000',message='Agent status changed; refresh before retrying.'; end if;
  if v_agent.status=p_status then return jsonb_build_object('agent_id',p_agent_id,'previous_status',v_agent.status,'status',p_status,'changed',false); end if;
  update public.genesis_agents set status=p_status,updated_at=now() where id=p_agent_id;
  perform genesis_private.emit_event(p_workspace_id,'agent.status_changed','agent',p_agent_id,'foundation-agent-status:' || gen_random_uuid(),
    jsonb_build_object('previous_status',v_agent.status,'status',p_status,'changed_by',v_owner,'affects','future_claims'));
  return jsonb_build_object('agent_id',p_agent_id,'previous_status',v_agent.status,'status',p_status,'changed',true);
end;
$fn$;

-- Narrow public RPCs are SECURITY INVOKER; the private mutation implementations
-- deliberately hold table privileges and authenticate/workspace-scope every call.
create or replace function public.genesis_submit_command(p_workspace_id uuid,p_command text,p_idempotency_key text)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.submit_command(p_workspace_id,p_command,p_idempotency_key)';
create or replace function public.genesis_claim_work(p_workspace_id uuid,p_kind text,p_model text,p_provider text,p_task_id uuid default null)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.claim_work(p_workspace_id,p_kind,p_model,p_provider,p_task_id)';
create or replace function public.genesis_heartbeat_work(p_workspace_id uuid,p_run_id uuid)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.heartbeat_work(p_workspace_id,p_run_id)';
create or replace function public.genesis_complete_director(p_workspace_id uuid,p_run_id uuid,p_output jsonb,p_usage jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.complete_director(p_workspace_id,p_run_id,p_output,p_usage)';
create or replace function public.genesis_complete_work(p_workspace_id uuid,p_run_id uuid,p_output jsonb,p_usage jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.complete_work(p_workspace_id,p_run_id,p_output,p_usage)';
create or replace function public.genesis_fail_work(p_workspace_id uuid,p_run_id uuid,p_error text)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.fail_work(p_workspace_id,p_run_id,p_error)';
create or replace function public.genesis_review_work(p_workspace_id uuid,p_task_id uuid,p_run_id uuid,p_decision text,p_notes text default '')
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.review_work(p_workspace_id,p_task_id,p_run_id,p_decision,p_notes)';
create or replace function public.genesis_retry_work(p_workspace_id uuid,p_task_id uuid)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.retry_work(p_workspace_id,p_task_id)';
create or replace function public.genesis_authorize_work(p_workspace_id uuid,p_task_id uuid,p_decision text,p_notes text default '')
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.authorize_work(p_workspace_id,p_task_id,p_decision,p_notes)';
create or replace function public.genesis_cancel_work(p_workspace_id uuid,p_task_id uuid)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.cancel_work(p_workspace_id,p_task_id)';
create or replace function public.genesis_recover_stale_work(p_workspace_id uuid)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.recover_stale_work(p_workspace_id)';
create or replace function public.genesis_workforce_readiness(p_workspace_id uuid,p_task_ids uuid[] default null)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.workforce_readiness(p_workspace_id,p_task_ids)';
create or replace function public.genesis_initialize_foundation(p_workspace_id uuid default null,p_name text default 'Genesis')
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.initialize_foundation(p_workspace_id,p_name)';
create or replace function public.genesis_resume_plan(p_workspace_id uuid,p_plan_id uuid)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.resume_plan(p_workspace_id,p_plan_id)';
create or replace function public.genesis_set_agent_status(p_workspace_id uuid,p_agent_id uuid,p_status text,p_expected_status text)
returns jsonb language sql security invoker set search_path='' as 'select genesis_private.set_agent_status(p_workspace_id,p_agent_id,p_status,p_expected_status)';

do $grants$
declare f record;
begin
  for f in select p.oid::regprocedure as signature,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='genesis_private' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    if f.prosecdef then execute format('grant execute on function %s to authenticated',f.signature); end if;
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('genesis_submit_command','genesis_claim_work','genesis_heartbeat_work',
        'genesis_complete_director','genesis_complete_work','genesis_fail_work','genesis_review_work',
        'genesis_retry_work','genesis_authorize_work','genesis_cancel_work','genesis_recover_stale_work','genesis_workforce_readiness','genesis_initialize_foundation','genesis_resume_plan','genesis_set_agent_status') loop
    execute format('revoke all on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end;
$grants$;

notify pgrst, 'reload schema';
commit;
