-- Genesis AI Workforce OS schema snapshot
-- Captures the workforce tables created for genesis-ai-workforce-ui.
-- Depends on the existing Genesis base schema:
-- genesis_workspaces, genesis_agents, genesis_objectives, genesis_approvals,
-- auth.users, and genesis_nurture_plans.
--
-- Idempotent by design for the current v0.1 schema. This is a source-controlled
-- reproducibility snapshot of changes that were first applied through Supabase MCP.

begin;

create extension if not exists pgcrypto;

create table if not exists public.genesis_agent_personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.genesis_agents(id) on delete cascade,
  display_name text not null,
  title text not null,
  personality_summary text not null default '',
  communication_style text not null default '',
  decision_posture text not null default 'balanced',
  escalation_rules jsonb not null default '[]'::jsonb,
  visual_identity jsonb not null default '{}'::jsonb,
  voice_identity jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active','inactive','draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, agent_id),
  unique (workspace_id, display_name)
);

create table if not exists public.genesis_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  objective_id uuid references public.genesis_objectives(id) on delete set null,
  director_agent_id uuid references public.genesis_agents(id) on delete set null,
  title text not null,
  summary text not null default '',
  status text not null default 'draft'
    check (status in ('draft','proposed','approved','active','paused','completed','cancelled')),
  strategy jsonb not null default '{}'::jsonb,
  success_metrics jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  due_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.genesis_plans(id) on delete cascade,
  objective_id uuid references public.genesis_objectives(id) on delete set null,
  primary_agent_id uuid references public.genesis_agents(id) on delete set null,
  parent_task_id uuid references public.genesis_tasks(id) on delete set null,
  title text not null,
  description text not null default '',
  task_type text not null default 'analysis',
  status text not null default 'queued'
    check (status in ('queued','ready','running','blocked','awaiting_approval','completed','failed','cancelled')),
  priority smallint not null default 3 check (priority between 1 and 5),
  autonomy_level smallint not null default 2 check (autonomy_level between 0 and 5),
  requires_approval boolean not null default false,
  approval_id uuid references public.genesis_approvals(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  scheduled_for timestamptz,
  started_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_task_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.genesis_tasks(id) on delete cascade,
  agent_id uuid not null references public.genesis_agents(id) on delete cascade,
  assignment_role text not null default 'owner'
    check (assignment_role in ('owner','collaborator','reviewer','observer')),
  status text not null default 'assigned'
    check (status in ('assigned','accepted','working','completed','declined')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (task_id, agent_id, assignment_role)
);

create table if not exists public.genesis_task_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.genesis_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.genesis_tasks(id) on delete cascade,
  dependency_type text not null default 'finish_to_start'
    check (dependency_type in ('finish_to_start','start_to_start','finish_to_finish')),
  created_at timestamptz not null default now(),
  check (task_id <> depends_on_task_id),
  unique (task_id, depends_on_task_id)
);

create table if not exists public.genesis_agent_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.genesis_agents(id) on delete cascade,
  memory_scope text not null default 'agent'
    check (memory_scope in ('agent','workspace','company','objective','task')),
  scope_ref_id uuid,
  memory_type text not null default 'fact'
    check (memory_type in ('fact','preference','decision','lesson','pattern','summary')),
  subject text not null,
  content text not null,
  structured_data jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  importance smallint not null default 3 check (importance between 1 and 5),
  source_type text,
  source_ref text,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.genesis_agent_performance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.genesis_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.genesis_agents(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  tasks_assigned integer not null default 0 check (tasks_assigned >= 0),
  tasks_completed integer not null default 0 check (tasks_completed >= 0),
  tasks_failed integer not null default 0 check (tasks_failed >= 0),
  approvals_requested integer not null default 0 check (approvals_requested >= 0),
  average_cycle_seconds numeric,
  model_cost_usd numeric(12,4) not null default 0 check (model_cost_usd >= 0),
  influenced_pipeline numeric(18,2) not null default 0,
  influenced_revenue numeric(18,2) not null default 0,
  quality_score numeric(5,2),
  reliability_score numeric(5,2),
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (workspace_id, agent_id, period_start, period_end)
);

-- Query and foreign-key support indexes.
create index if not exists genesis_agent_personas_workspace_agent_idx
  on public.genesis_agent_personas(workspace_id, agent_id);
create index if not exists genesis_agent_personas_owner_idx
  on public.genesis_agent_personas(owner_id);
create index if not exists genesis_agent_personas_agent_idx
  on public.genesis_agent_personas(agent_id);

create index if not exists genesis_plans_workspace_status_idx
  on public.genesis_plans(workspace_id, status, created_at desc);
create index if not exists genesis_plans_objective_idx
  on public.genesis_plans(objective_id) where objective_id is not null;
create index if not exists genesis_plans_owner_idx
  on public.genesis_plans(owner_id);
create index if not exists genesis_plans_director_agent_idx
  on public.genesis_plans(director_agent_id) where director_agent_id is not null;

create index if not exists genesis_tasks_workspace_status_priority_idx
  on public.genesis_tasks(workspace_id, status, priority, created_at);
create index if not exists genesis_tasks_primary_agent_status_idx
  on public.genesis_tasks(primary_agent_id, status, created_at)
  where primary_agent_id is not null;
create index if not exists genesis_tasks_plan_idx
  on public.genesis_tasks(plan_id) where plan_id is not null;
create index if not exists genesis_tasks_objective_idx
  on public.genesis_tasks(objective_id) where objective_id is not null;
create index if not exists genesis_tasks_parent_idx
  on public.genesis_tasks(parent_task_id) where parent_task_id is not null;
create index if not exists genesis_tasks_owner_idx
  on public.genesis_tasks(owner_id);
create index if not exists genesis_tasks_approval_idx
  on public.genesis_tasks(approval_id) where approval_id is not null;

create index if not exists genesis_task_assignments_agent_status_idx
  on public.genesis_task_assignments(agent_id, status, assigned_at desc);
create index if not exists genesis_task_assignments_task_idx
  on public.genesis_task_assignments(task_id);
create index if not exists genesis_task_assignments_workspace_idx
  on public.genesis_task_assignments(workspace_id);
create index if not exists genesis_task_assignments_owner_idx
  on public.genesis_task_assignments(owner_id);

create index if not exists genesis_task_dependencies_task_idx
  on public.genesis_task_dependencies(task_id);
create index if not exists genesis_task_dependencies_depends_idx
  on public.genesis_task_dependencies(depends_on_task_id);
create index if not exists genesis_task_dependencies_workspace_idx
  on public.genesis_task_dependencies(workspace_id);
create index if not exists genesis_task_dependencies_owner_idx
  on public.genesis_task_dependencies(owner_id);

create index if not exists genesis_agent_memory_agent_scope_idx
  on public.genesis_agent_memory(agent_id, memory_scope, importance desc, created_at desc);
create index if not exists genesis_agent_memory_workspace_subject_idx
  on public.genesis_agent_memory(workspace_id, subject);
create index if not exists genesis_agent_memory_owner_idx
  on public.genesis_agent_memory(owner_id);

create index if not exists genesis_agent_performance_agent_period_idx
  on public.genesis_agent_performance(agent_id, period_start desc, period_end desc);
create index if not exists genesis_agent_performance_owner_idx
  on public.genesis_agent_performance(owner_id);

-- Cover a pre-existing composite Genesis FK reported by the performance advisor.
create index if not exists genesis_nurture_plans_workspace_owner_fk_idx
  on public.genesis_nurture_plans(workspace_id, owner_id);

-- RLS and Data API exposure.
alter table public.genesis_agent_personas enable row level security;
alter table public.genesis_plans enable row level security;
alter table public.genesis_tasks enable row level security;
alter table public.genesis_task_assignments enable row level security;
alter table public.genesis_task_dependencies enable row level security;
alter table public.genesis_agent_memory enable row level security;
alter table public.genesis_agent_performance enable row level security;

drop policy if exists genesis_agent_personas_owner_all on public.genesis_agent_personas;
create policy genesis_agent_personas_owner_all on public.genesis_agent_personas
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists genesis_plans_owner_all on public.genesis_plans;
create policy genesis_plans_owner_all on public.genesis_plans
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists genesis_tasks_owner_all on public.genesis_tasks;
create policy genesis_tasks_owner_all on public.genesis_tasks
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists genesis_task_assignments_owner_all on public.genesis_task_assignments;
create policy genesis_task_assignments_owner_all on public.genesis_task_assignments
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists genesis_task_dependencies_owner_all on public.genesis_task_dependencies;
create policy genesis_task_dependencies_owner_all on public.genesis_task_dependencies
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists genesis_agent_memory_owner_all on public.genesis_agent_memory;
create policy genesis_agent_memory_owner_all on public.genesis_agent_memory
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists genesis_agent_performance_owner_all on public.genesis_agent_performance;
create policy genesis_agent_performance_owner_all on public.genesis_agent_performance
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on table public.genesis_agent_personas from anon;
revoke all on table public.genesis_plans from anon;
revoke all on table public.genesis_tasks from anon;
revoke all on table public.genesis_task_assignments from anon;
revoke all on table public.genesis_task_dependencies from anon;
revoke all on table public.genesis_agent_memory from anon;
revoke all on table public.genesis_agent_performance from anon;

grant select, insert, update, delete
  on table public.genesis_agent_personas to authenticated, service_role;
grant select, insert, update, delete
  on table public.genesis_plans to authenticated, service_role;
grant select, insert, update, delete
  on table public.genesis_tasks to authenticated, service_role;
grant select, insert, update, delete
  on table public.genesis_task_assignments to authenticated, service_role;
grant select, insert, update, delete
  on table public.genesis_task_dependencies to authenticated, service_role;
grant select, insert, update, delete
  on table public.genesis_agent_memory to authenticated, service_role;
grant select, insert, update, delete
  on table public.genesis_agent_performance to authenticated, service_role;

-- Operator-facing persona seed. Re-runnable against existing active agent rows.
insert into public.genesis_agent_personas (
  workspace_id,
  owner_id,
  agent_id,
  display_name,
  title,
  personality_summary,
  communication_style,
  decision_posture,
  escalation_rules,
  visual_identity,
  voice_identity
)
select
  a.workspace_id,
  a.owner_id,
  a.id,
  case a.agent_key
    when 'lead_intelligence' then 'Maya'
    when 'market_intelligence' then 'Elias'
    when 'campaign_planner' then 'Nova'
    when 'content_seo' then 'Avery'
    when 'analytics' then 'Orion'
    when 'nurture' then 'Sofia'
    when 'director' then 'Genesis Director'
    else a.name
  end,
  case a.agent_key
    when 'lead_intelligence' then 'Lead Intelligence'
    when 'market_intelligence' then 'Market Intelligence'
    when 'campaign_planner' then 'Campaign Director'
    when 'content_seo' then 'Content Director'
    when 'analytics' then 'Performance Analyst'
    when 'nurture' then 'Nurture Director'
    when 'director' then 'AI Workforce Director'
    else a.role
  end,
  case a.agent_key
    when 'lead_intelligence' then 'Precise, commercially skeptical, and protective of sales capacity. Focuses on signal quality over lead volume.'
    when 'market_intelligence' then 'Investigative, strategic, and curious. Looks for demand shifts, competitive gaps, and asymmetric market opportunities.'
    when 'campaign_planner' then 'Decisive, experimental, and performance-driven. Turns strategy into executable campaigns and controlled tests.'
    when 'content_seo' then 'Editorial, brand-sensitive, and conversion-aware. Balances narrative quality with commercial performance.'
    when 'analytics' then 'Quantitative, skeptical, and evidence-first. Challenges weak conclusions and measures commercial impact.'
    when 'nurture' then 'Patient, context-aware, and timing-sensitive. Develops prospects without creating pressure or noise.'
    when 'director' then 'Calm executive orchestrator. Converts business objectives into coordinated plans and escalates consequential decisions.'
    else ''
  end,
  case a.agent_key
    when 'lead_intelligence' then 'Concise, evidence-based, recommendation-first.'
    when 'market_intelligence' then 'Structured briefings with evidence, uncertainty, and opportunity size.'
    when 'campaign_planner' then 'Direct plans with assumptions, budget, expected outcome, and next action.'
    when 'content_seo' then 'Clear editorial recommendations with brand and conversion rationale.'
    when 'analytics' then 'Quantitative summaries with confidence, caveats, and causal caution.'
    when 'nurture' then 'Respectful, context-rich, timing-aware recommendations.'
    when 'director' then 'Executive summaries, delegated actions, decision requests, and outcome reporting.'
    else ''
  end,
  case a.agent_key
    when 'lead_intelligence' then 'conservative'
    when 'analytics' then 'skeptical'
    when 'campaign_planner' then 'experimental'
    when 'director' then 'balanced'
    else 'balanced'
  end,
  case a.agent_key
    when 'lead_intelligence' then '["confidence_below_0.70","decision_authority_unclear","scope_outside_service_rules"]'::jsonb
    when 'campaign_planner' then '["paid_spend_change","public_launch","budget_threshold_exceeded"]'::jsonb
    when 'content_seo' then '["public_claim_requires_support","brand_policy_conflict","publish_external"]'::jsonb
    when 'director' then '["cross_company_action","material_budget_change","high_risk_external_action"]'::jsonb
    else '["confidence_below_0.65","requires_human_judgment"]'::jsonb
  end,
  jsonb_build_object(
    'style','photorealistic_synthetic_human',
    'environment','genesis_command_center',
    'accent',
      case a.agent_key
        when 'lead_intelligence' then 'emerald'
        when 'market_intelligence' then 'cyan'
        when 'campaign_planner' then 'violet'
        when 'content_seo' then 'silver'
        when 'analytics' then 'blue'
        when 'nurture' then 'amber'
        when 'director' then 'ice'
        else 'slate'
      end
  ),
  jsonb_build_object('enabled',false,'voice_profile',null)
from public.genesis_agents a
where a.status='active'
on conflict (workspace_id, agent_id) do update
set
  display_name=excluded.display_name,
  title=excluded.title,
  personality_summary=excluded.personality_summary,
  communication_style=excluded.communication_style,
  decision_posture=excluded.decision_posture,
  escalation_rules=excluded.escalation_rules,
  visual_identity=excluded.visual_identity,
  updated_at=now();

commit;
