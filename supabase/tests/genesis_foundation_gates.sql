-- LOCAL ONLY: isolated neutral tests for eligibility, authorization, cancellation,
-- scope-changing resume, approved memory, input bounds, and transaction rollback.
-- PGlite executes sequential sessions; real multi-worker lock contention remains
-- a deployment verification step against PostgreSQL, not a claim of this suite.
begin;
create temporary table foundation_gate_state(k text primary key,v jsonb not null);
grant all on foundation_gate_state to authenticated;
create function pg_temp.assert_gate(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;$f$;
create function pg_temp.expect_gate_failure(statement text,expected_state text,label text) returns void language plpgsql as $f$
begin
  begin execute statement;
  exception when others then
    if sqlstate=expected_state then return; end if;
    raise exception 'FAILED: % (expected %, got %: %)',label,expected_state,sqlstate,sqlerrm;
  end;
  raise exception 'FAILED: % (statement unexpectedly succeeded)',label;
end;$f$;
create function pg_temp.gate_plan() returns jsonb language sql as $f$
select '{"recommendedAction":"Test independent and dependent internal work.","rationale":"A cancellation should preserve independent work for an explicit scoped resume.","primaryMetric":"Accepted remaining outputs","expectedLearning":"Whether cancellation and resume preserve state.","requiresHumanReview":false,"workItems":[{"key":"source","dependsOn":[],"agentKey":"market_intelligence","title":"Review supplied source","description":"Inspect the neutral source statement.","taskType":"research","priority":1,"successCriteria":"Identify supplied information."},{"key":"dependent","dependsOn":["source"],"agentKey":"analytics","title":"Measure accepted source","description":"Use the accepted source output.","taskType":"measurement","priority":1,"successCriteria":"Reference the accepted source."},{"key":"independent","dependsOn":[],"agentKey":"content_seo","title":"Draft neutral outline","description":"Draft an internal outline independent of the source review.","taskType":"drafting","priority":3,"successCriteria":"Return a bounded draft."}]}'::jsonb;
$f$;
create function pg_temp.gate_result() returns jsonb language sql as $f$
select '{"summary":"Neutral internal draft produced.","confidence":0.8,"findings":[],"deliverables":[{"title":"Neutral outline","type":"draft","content":"A. Objective. B. Acceptance. C. Review."}],"evidenceGaps":[],"recommendedNextAction":"Review the outline.","requiresHumanReview":false,"memoryCandidates":[]}'::jsonb;
$f$;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000011');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
insert into foundation_gate_state values('setup',public.genesis_initialize_foundation(null,'Neutral gating workspace'));
insert into foundation_gate_state values('command',public.genesis_submit_command((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'Exercise neutral foundation gates.','neutral-gates-0001'));
select pg_temp.assert_gate((public.genesis_workforce_readiness((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),null)->0->>'can_run')::boolean,'readiness initially agrees with claim eligibility');
select public.genesis_set_agent_status((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select id from public.genesis_agents where agent_key='director'),'paused','active');
select pg_temp.assert_gate(public.genesis_claim_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'director','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'paused Director is not claimed');
select pg_temp.assert_gate(not (public.genesis_workforce_readiness((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),null)->0->>'can_run')::boolean,'readiness matches paused agent gate');
do $test$
declare w uuid:=(select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'); a uuid:=(select id from public.genesis_agents where agent_key='director');
begin
  perform pg_temp.expect_gate_failure(format('select public.genesis_set_agent_status(%L,%L,%L,%L)',w,a,'paused','active'),'55000','stale agent status transition cannot overwrite a newer state');
  perform pg_temp.assert_gate((select count(*)=1 from public.genesis_events where event_type='agent.status_changed'),'failed CAS writes no audit event');
  perform public.genesis_set_agent_status(w,a,'active','paused');
  perform pg_temp.assert_gate((select count(*)=2 from public.genesis_events where event_type='agent.status_changed'),'status and audit event persist together');
end;
$test$;
reset role;
update public.genesis_tasks set scheduled_for=now()+interval '1 hour';
set local role authenticated;
select pg_temp.assert_gate(public.genesis_claim_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'director','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'future scheduled task cannot be claimed');
reset role;
update public.genesis_tasks set scheduled_for=null,requires_approval=true;
insert into public.genesis_agent_memory(workspace_id,owner_id,memory_scope,memory_type,subject,content,review_status,valid_until)
select (s.v->>'workspace_id')::uuid,'00000000-0000-4000-8000-000000000011','workspace','fact',x.subject,'Neutral foundation context.',x.review_status,x.expires
from foundation_gate_state s cross join (values ('Approved current','approved',null::timestamptz),('Unreviewed candidate','pending',null::timestamptz),('Expired approval','approved',now()-interval '1 minute')) x(subject,review_status,expires) where s.k='setup';
insert into public.genesis_agent_memory(workspace_id,owner_id,agent_id,memory_scope,scope_ref_id,memory_type,subject,content,review_status)
select a.workspace_id,a.owner_id,a.id,x.scope,x.ref,'fact',x.subject,'Neutral scoped memory.','approved'
from public.genesis_agents a cross join (values
  ('agent',null::uuid,'Approved agent memory'),
  ('objective','90000000-0000-4000-8000-000000000099'::uuid,'Unrelated objective memory'),
  ('task','90000000-0000-4000-8000-000000000098'::uuid,'Unrelated task memory'),
  ('company',null::uuid,'Company-wide memory without a company contract')
) x(scope,ref,subject) where a.agent_key='director';
set local role authenticated;
select pg_temp.assert_gate(public.genesis_claim_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'director','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'execution authority is required even for a ready task');
select pg_temp.assert_gate((public.genesis_workforce_readiness((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),null)->0->>'authorization_required')::boolean,'readiness exposes approval requirement');
select public.genesis_authorize_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select (v->>'task_id')::uuid from foundation_gate_state where k='command'),'approve','Internal test only.');
insert into foundation_gate_state values('director',public.genesis_claim_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'director','openai/gpt-5.6-sol','vercel-ai-gateway'));
select pg_temp.assert_gate((select jsonb_array_length(v->'context'->'memory'->'workspace')=1 and v->'context'->'memory'->'workspace'->0->>'subject'='Approved current' from foundation_gate_state where k='director'),'only approved nonexpired scoped memory reaches context');
select pg_temp.assert_gate((select jsonb_array_length(v->'context'->'memory'->'agent')=1 and v->'context'->'memory'->'agent'->0->>'subject'='Approved agent memory' from foundation_gate_state where k='director'),'agent memory excludes unrelated task objective and company scopes');
select public.genesis_complete_director((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select (v->>'run_id')::uuid from foundation_gate_state where k='director'),pg_temp.gate_plan(),'{}');
select public.genesis_review_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select (v->>'task_id')::uuid from foundation_gate_state where k='command'),(select (v->>'run_id')::uuid from foundation_gate_state where k='director'),'accept','Accept test plan.');
insert into foundation_gate_state values('source',public.genesis_claim_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'specialist','openai/gpt-5.6-sol','vercel-ai-gateway'));
select pg_temp.assert_gate((select v->'task'->>'work_item_key'='source' from foundation_gate_state where k='source'),'first eligible independent source is claimed');
select public.genesis_cancel_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select (v->'task'->>'id')::uuid from foundation_gate_state where k='source'));
select pg_temp.assert_gate((select count(*)=2 from public.genesis_tasks where work_item_key in ('source','dependent') and status='cancelled'),'cancellation cascades only through dependencies');
select pg_temp.assert_gate((select status='ready' from public.genesis_tasks where work_item_key='independent'),'independent task is retained');
select pg_temp.assert_gate((select status='paused' from public.genesis_plans),'specialist cancellation pauses the plan');
select pg_temp.assert_gate(public.genesis_claim_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'specialist','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'paused plan cannot claim retained independent work');
do $test$
declare w uuid:=(select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'); r uuid:=(select (v->>'run_id')::uuid from foundation_gate_state where k='source');
begin
  perform pg_temp.expect_gate_failure(format('select public.genesis_complete_work(%L,%L,%L::jsonb,%L::jsonb)',w,r,pg_temp.gate_result(),'{}'),'55000','cancelled worker cannot store a late result');
  perform pg_temp.expect_gate_failure(format('select public.genesis_fail_work(%L,%L,%L)',w,r,'late failure'),'55000','cancelled worker cannot overwrite cancellation');
end;
$test$;
select public.genesis_resume_plan((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select (v->>'plan_id')::uuid from foundation_gate_state where k='command'));
insert into foundation_gate_state values('independent',public.genesis_claim_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'specialist','openai/gpt-5.6-sol','vercel-ai-gateway'));
select pg_temp.assert_gate((select v->'task'->>'work_item_key'='independent' from foundation_gate_state where k='independent'),'explicit resume runs remaining independent work');
select public.genesis_complete_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select (v->>'run_id')::uuid from foundation_gate_state where k='independent'),pg_temp.gate_result(),'{}');
select public.genesis_review_work((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),(select (v->'task'->>'id')::uuid from foundation_gate_state where k='independent'),(select (v->>'run_id')::uuid from foundation_gate_state where k='independent'),'accept','Accept remaining scope.');
select pg_temp.assert_gate((select status='completed' from public.genesis_plans),'accepted remaining work completes explicitly revised scope');
select pg_temp.assert_gate((select payload->>'cancelled_task_count'='2' from public.genesis_events where event_type='plan.completed'),'completion records cancelled scope count');

-- Fail the final event write and prove command transaction leaves no partial rows.
reset role;
create function pg_temp.reject_command_event() returns trigger language plpgsql as $f$
begin if new.event_type='objective.created' then raise exception 'Controlled event persistence failure'; end if; return new; end;$f$;
create trigger test_reject_command_event before insert on public.genesis_events for each row execute function pg_temp.reject_command_event();
set local role authenticated;
do $test$
declare w uuid:=(select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup');
begin
  perform pg_temp.expect_gate_failure(format('select public.genesis_submit_command(%L,%L,%L)',w,'Neutral rollback test.','neutral-rollback-final'),'P0001','last write failure rolls back command package');
  perform pg_temp.assert_gate((select count(*)=1 from public.genesis_objectives),'rollback removes orphan objective');
  perform pg_temp.assert_gate((select count(*)=1 from public.genesis_commands),'rollback removes command idempotency placeholder');
  perform pg_temp.assert_gate((select count(*)=1 from public.genesis_plans),'rollback removes orphan plan');
end;
$test$;
reset role;
drop trigger test_reject_command_event on public.genesis_events;
set local role authenticated;
insert into foundation_gate_state values('large',public.genesis_submit_command((select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'),'Neutral input budget test.','neutral-input-size-01'));
reset role;
update public.genesis_tasks set description=repeat('x',60001) where id=(select (v->>'task_id')::uuid from foundation_gate_state where k='large');
set local role authenticated;
do $test$
declare w uuid:=(select (v->>'workspace_id')::uuid from foundation_gate_state where k='setup'); t uuid:=(select (v->>'task_id')::uuid from foundation_gate_state where k='large');
begin
  perform pg_temp.expect_gate_failure(format('select public.genesis_claim_work(%L,%L,%L,%L,%L)',w,'director','openai/gpt-5.6-sol','vercel-ai-gateway',t),'22023','oversized prompt cannot start a run');
  perform pg_temp.assert_gate((select status='ready' and attempt_count=0 from public.genesis_tasks where id=t),'input validation failure preserves ready state and attempt budget');
end;
$test$;
reset role;
select 'PASS: shared readiness predicate, active/scheduled/authorized gates, approved memory, cancel/recovery fencing, resume scope, and final-write rollback' as result;
rollback;
