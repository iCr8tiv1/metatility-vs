-- Run only in a disposable database after the local fixture and both snapshots.
-- All subjects below are neutral foundation scenarios. No real business records,
-- model calls, outbound actions, or remote database access are used.
begin;

create temporary table foundation_test_state(k text primary key,v jsonb not null);
grant all on foundation_test_state to authenticated;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;$f$;
create function pg_temp.expect_failure(statement text,expected_state text,label text) returns void language plpgsql as $f$
begin
  begin execute statement;
  exception when others then
    if sqlstate=expected_state then return; end if;
    raise exception 'FAILED: % (expected %, got %: %)',label,expected_state,sqlstate,sqlerrm;
  end;
  raise exception 'FAILED: % (statement unexpectedly succeeded)',label;
end;$f$;
create function pg_temp.director_result() returns jsonb language sql as $f$
select '{"recommendedAction":"Validate the neutral foundation flow.","rationale":"Each stage should preserve its inputs and require review.","primaryMetric":"Accepted outputs","expectedLearning":"Whether dependencies release only after acceptance.","requiresHumanReview":false,"workItems":[{"key":"research","dependsOn":[],"agentKey":"market_intelligence","title":"Review the supplied neutral scenario","description":"Identify the facts explicitly supplied in this foundation test.","taskType":"research","priority":2,"successCriteria":"Distinguish supplied facts from unknowns."},{"key":"measure","dependsOn":["research"],"agentKey":"analytics","title":"Define the acceptance measure","description":"Use the accepted research output to define a testable measure.","taskType":"measurement","priority":1,"successCriteria":"Return a measure grounded in the accepted dependency."}]}'::jsonb;
$f$;
create function pg_temp.specialist_result() returns jsonb language sql as $f$
select '{"summary":"The neutral foundation scenario was reviewed.","confidence":0.9,"findings":[{"finding":"The scenario requires human acceptance.","evidenceStatus":"supplied_context","evidence":"The supplied foundation contract requires result review.","implication":"Do not release dependent work before acceptance."}],"deliverables":[{"title":"Foundation review","type":"analysis","content":"The accepted output must be associated with its exact run and operating contract."}],"evidenceGaps":[],"recommendedNextAction":"Review this internal result.","requiresHumanReview":false,"memoryCandidates":[{"memoryType":"lesson","subject":"Review gate","content":"Acceptance must reference the exact run.","confidence":0.9,"importance":3}]}'::jsonb;
$f$;

insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
insert into public.genesis_workspaces(id,owner_id,slug,name) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','fixture-a','Neutral foundation A'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','fixture-b','Neutral foundation B');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into foundation_test_state values('setup',public.genesis_initialize_foundation('10000000-0000-4000-8000-000000000001','Neutral foundation A'));
select pg_temp.assert_true((select (v->>'agent_count')::int=7 from foundation_test_state where k='setup'),'seven neutral profiles initialized');
select public.genesis_initialize_foundation('10000000-0000-4000-8000-000000000001','Neutral foundation A');
select pg_temp.assert_true((select count(*)=7 from public.genesis_agents),'initialization is idempotent');
select pg_temp.expect_failure($q$select public.genesis_initialize_foundation('10000000-0000-4000-8000-000000000002','Other')$q$,'42501','cannot initialize another owner workspace');
select pg_temp.expect_failure($q$select public.genesis_submit_command('10000000-0000-4000-8000-000000000002','Neutral test','cross-owner-0001')$q$,'42501','cross-workspace command denied');
select pg_temp.expect_failure($q$insert into public.genesis_agents(workspace_id,owner_id,agent_key,name,role) values('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','director','Injected row','director')$q$,'23514','owner-only RLS cannot be used to poison a foreign workspace roster');
select pg_temp.expect_failure($q$select genesis_private.foundation_contract('10000000-0000-4000-8000-000000000001')$q$,'42501','private helper cannot be called by authenticated role');

insert into foundation_test_state values('command',public.genesis_submit_command('10000000-0000-4000-8000-000000000001','Validate a neutral foundation workflow.','neutral-command-0001'));
insert into foundation_test_state values('replay',public.genesis_submit_command('10000000-0000-4000-8000-000000000001','Validate a neutral foundation workflow.','neutral-command-0001'));
select pg_temp.assert_true((select (a.v->>'task_id')=(b.v->>'task_id') and (b.v->>'replayed')::boolean from foundation_test_state a,foundation_test_state b where a.k='command' and b.k='replay'),'idempotent command reuses complete work package');
select pg_temp.assert_true((select count(*)=1 from public.genesis_objectives),'duplicate submission creates one objective');
select pg_temp.assert_true((select count(*)=1 from public.genesis_tasks),'duplicate submission creates one Director task');
select pg_temp.expect_failure($q$select public.genesis_submit_command('10000000-0000-4000-8000-000000000001','Different command','neutral-command-0001')$q$,'22023','reused idempotency key with changed payload is rejected');
select pg_temp.expect_failure($q$update public.genesis_tasks set status='completed'$q$,'42501','direct lifecycle writes are denied');
select pg_temp.expect_failure($q$update public.genesis_operating_contracts set version=99$q$,'42501','contracts cannot be edited by authenticated callers');
select pg_temp.assert_true(public.genesis_claim_work('10000000-0000-4000-8000-000000000001','specialist','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'specialist runtime cannot claim Director');
select pg_temp.expect_failure($q$select public.genesis_claim_work('10000000-0000-4000-8000-000000000001','director','invented-model','invented-provider')$q$,'22023','model/provider labels must match contract');
insert into foundation_test_state values('director',public.genesis_claim_work('10000000-0000-4000-8000-000000000001','director','openai/gpt-5.6-sol','vercel-ai-gateway'));
select pg_temp.assert_true((select v->'task'->>'status'='running' and (v->>'attempt')::int=1 from foundation_test_state where k='director'),'claim returns current running state and attempt');
select pg_temp.assert_true((select a.input=s.v->'context' from public.genesis_work_attempts a,foundation_test_state s where s.k='director' and a.run_id=(s.v->>'run_id')::uuid),'immutable prompt snapshot equals returned context');
select pg_temp.assert_true((select v->'context'->'workforce'->0 ? 'agent_key' from foundation_test_state where k='director'),'runtime roster uses agent_key');
select pg_temp.assert_true(public.genesis_claim_work('10000000-0000-4000-8000-000000000001','director','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'duplicate claim cannot start a second attempt');

do $test$
declare r uuid:=(select (v->>'run_id')::uuid from foundation_test_state where k='director'); bad jsonb;
begin
  bad:=jsonb_set(pg_temp.director_result(),'{workItems,1,dependsOn}','["missing"]');
  perform pg_temp.expect_failure(format('select public.genesis_complete_director(%L,%L,%L::jsonb,%L::jsonb)','10000000-0000-4000-8000-000000000001',r,bad,'{}'),'22023','invalid decomposition rolls back');
  perform pg_temp.assert_true((select count(*)=1 from public.genesis_tasks),'no partial child tasks after invalid decomposition');
  perform pg_temp.assert_true((select count(*)=1 from public.genesis_task_assignments),'no partial assignments after invalid decomposition');
  perform pg_temp.assert_true((select status='running' from public.genesis_work_attempts where run_id=r),'invalid proposal does not terminate its valid attempt');
  perform public.genesis_complete_director('10000000-0000-4000-8000-000000000001',r,pg_temp.director_result(),'{}');
  perform pg_temp.assert_true((select status='awaiting_review' and accepted_at is null from public.genesis_tasks where active_run_id=r),'produced Director result is not accepted');
  perform pg_temp.assert_true((select count(*)=2 from public.genesis_tasks where status='queued'),'proposal children stay queued');
  perform pg_temp.assert_true(public.genesis_claim_work('10000000-0000-4000-8000-000000000001','specialist','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'unaccepted plan cannot execute');
  perform public.genesis_complete_director('10000000-0000-4000-8000-000000000001',r,pg_temp.director_result(),'{}');
  perform pg_temp.assert_true((select count(*)=3 from public.genesis_tasks),'completion replay does not duplicate decomposition');
  perform public.genesis_review_work('10000000-0000-4000-8000-000000000001',(select (v->>'task_id')::uuid from foundation_test_state where k='command'),r,'accept','Checked the neutral proposal.');
end;
$test$;
select pg_temp.assert_true((select status='ready' from public.genesis_tasks where work_item_key='research'),'acceptance releases independent child');
select pg_temp.assert_true((select status='blocked' from public.genesis_tasks where work_item_key='measure'),'dependent child waits for accepted output');
insert into foundation_test_state values('research',public.genesis_claim_work('10000000-0000-4000-8000-000000000001','specialist','openai/gpt-5.6-sol','vercel-ai-gateway'));
select pg_temp.assert_true((select v->'task'->>'work_item_key'='research' from foundation_test_state where k='research'),'higher priority blocked dependency is skipped');

do $test$
declare r uuid:=(select (v->>'run_id')::uuid from foundation_test_state where k='research'); bad jsonb; payload jsonb;
begin
  foreach bad in array array[
    jsonb_set(pg_temp.specialist_result(),'{findings}','[null]'),
    jsonb_set(pg_temp.specialist_result(),'{memoryCandidates}','[null]'),
    jsonb_set(pg_temp.specialist_result(),'{findings,0,evidenceStatus}','"invented_live_source"'),
    jsonb_set(pg_temp.specialist_result(),'{deliverables,0,content}','42'),
    jsonb_set(pg_temp.specialist_result(),'{memoryCandidates,0,importance}','1.5'),
    pg_temp.specialist_result() || jsonb_build_object('permissions',jsonb_build_object('externalActions',true)),
    jsonb_set(pg_temp.specialist_result(),'{deliverables,0,content}',to_jsonb(repeat('x',60001)))
  ] loop
    perform pg_temp.expect_failure(format('select public.genesis_complete_work(%L,%L,%L::jsonb,%L::jsonb)','10000000-0000-4000-8000-000000000001',r,bad,'{}'),'22023','bounded nested output validation rejects direct RPC bypass');
  end loop;
  payload:=jsonb_build_object('padding',repeat('x',10001));
  perform pg_temp.expect_failure(format('select public.genesis_complete_work(%L,%L,%L::jsonb,%L::jsonb)','10000000-0000-4000-8000-000000000001',r,pg_temp.specialist_result(),payload),'22023','usage payload is bounded');
  perform public.genesis_complete_work('10000000-0000-4000-8000-000000000001',r,pg_temp.specialist_result(),'{}');
  perform pg_temp.assert_true((select status='awaiting_review' and accepted_at is null from public.genesis_tasks where active_run_id=r),'model false review flag cannot bypass acceptance');
  perform pg_temp.assert_true((select count(*)=0 from public.genesis_agent_memory),'memory candidates are never automatically promoted');
  perform pg_temp.assert_true(public.genesis_claim_work('10000000-0000-4000-8000-000000000001','specialist','openai/gpt-5.6-sol','vercel-ai-gateway') is null,'produced dependency still blocks downstream claim');
  perform public.genesis_review_work('10000000-0000-4000-8000-000000000001',(select (v->'task'->>'id')::uuid from foundation_test_state where k='research'),r,'revise','Clarify the acceptance boundary.');
  perform pg_temp.expect_failure(format('select public.genesis_complete_work(%L,%L,%L::jsonb,%L::jsonb)','10000000-0000-4000-8000-000000000001',r,pg_temp.specialist_result(),'{}'),'55000','old completion cannot succeed after revision');
end;
$test$;
insert into foundation_test_state values('research2',public.genesis_claim_work('10000000-0000-4000-8000-000000000001','specialist','openai/gpt-5.6-sol','vercel-ai-gateway'));
select pg_temp.assert_true((select (v->>'attempt')::int=2 and v->'context'->'previousReview'->>'notes'='Clarify the acceptance boundary.' from foundation_test_state where k='research2'),'revision uses new attempt with prior review context');
do $test$
declare r uuid:=(select (v->>'run_id')::uuid from foundation_test_state where k='research2'); t uuid:=(select (v->'task'->>'id')::uuid from foundation_test_state where k='research2');
begin
  perform public.genesis_complete_work('10000000-0000-4000-8000-000000000001',r,pg_temp.specialist_result(),'{}');
  perform public.genesis_review_work('10000000-0000-4000-8000-000000000001',t,r,'accept','Accepted.');
  perform public.genesis_review_work('10000000-0000-4000-8000-000000000001',t,r,'accept','Accepted.');
  perform pg_temp.expect_failure(format('select public.genesis_review_work(%L,%L,%L,%L,%L)','10000000-0000-4000-8000-000000000001',t,r,'revise','Change it'),'55000','accepted result cannot be revised by a stale review');
end;
$test$;

-- Mutable legacy run output must never contaminate a dependency's canonical evidence.
update public.genesis_agent_runs set output='{"summary":"Tampered legacy cache"}' where id=(select (v->>'run_id')::uuid from foundation_test_state where k='research2');
insert into foundation_test_state values('measure',public.genesis_claim_work('10000000-0000-4000-8000-000000000001','specialist','openai/gpt-5.6-sol','vercel-ai-gateway'));
select pg_temp.assert_true((select v->'context'->'dependencies'->0->'output'->>'summary'='The neutral foundation scenario was reviewed.' from foundation_test_state where k='measure'),'dependency snapshot reads immutable accepted attempt output');
do $test$
declare r uuid:=(select (v->>'run_id')::uuid from foundation_test_state where k='measure'); t uuid:=(select (v->'task'->>'id')::uuid from foundation_test_state where k='measure');
begin
  perform public.genesis_complete_work('10000000-0000-4000-8000-000000000001',r,pg_temp.specialist_result(),'{}');
  perform public.genesis_review_work('10000000-0000-4000-8000-000000000001',t,r,'accept','Accepted measure.');
  perform pg_temp.assert_true((select status='completed' from public.genesis_plans where id=(select (v->>'plan_id')::uuid from foundation_test_state where k='command')),'all accepted outputs complete the plan');
end;
$test$;

-- Terminal attempt history remains immutable even to an accidental admin UPDATE.
reset role;
select pg_temp.expect_failure($q$update public.genesis_work_attempts set output='{}' where status='produced'$q$,'55000','terminal attempts cannot be rewritten');
select pg_temp.expect_failure($q$update public.genesis_operating_contracts set specification='{}'$q$,'55000','existing contract versions are immutable');
set local role authenticated;

-- Failure, retry, stale-worker recovery, and cancellation fencing.
insert into foundation_test_state values('recovery-command',public.genesis_submit_command('10000000-0000-4000-8000-000000000001','Verify a neutral interruption and retry.','neutral-command-0002'));
insert into foundation_test_state values('recovery1',public.genesis_claim_work('10000000-0000-4000-8000-000000000001','director','openai/gpt-5.6-sol','vercel-ai-gateway'));
select public.genesis_fail_work('10000000-0000-4000-8000-000000000001',(select (v->>'run_id')::uuid from foundation_test_state where k='recovery1'),'Controlled neutral failure.');
select public.genesis_retry_work('10000000-0000-4000-8000-000000000001',(select (v->>'task_id')::uuid from foundation_test_state where k='recovery-command'));
insert into foundation_test_state values('recovery2',public.genesis_claim_work('10000000-0000-4000-8000-000000000001','director','openai/gpt-5.6-sol','vercel-ai-gateway'));
do $test$
declare r uuid:=(select (v->>'run_id')::uuid from foundation_test_state where k='recovery1');
  -- PostgreSQL 18 reports restrict_violation; PostgreSQL 17 reports
  -- foreign_key_violation for the same ON DELETE RESTRICT protection.
  restrict_state text:=case when current_setting('server_version_num')::integer>=180000 then '23001' else '23503' end;
begin
  perform pg_temp.assert_true((select confdeltype='r' from pg_constraint
    where conrelid='public.genesis_work_attempts'::regclass and conname='genesis_work_attempts_run_id_fkey'),
    'attempt history keeps its ON DELETE RESTRICT foreign key');
  perform pg_temp.expect_failure(format('delete from public.genesis_agent_runs where id=%L',r),restrict_state,'legacy run delete cannot erase a retried failed attempt');
  perform pg_temp.assert_true((select status='failed' from public.genesis_work_attempts where run_id=r),'failed attempt survives legacy deletion attempt');
end;
$test$;
reset role;
select pg_temp.expect_failure($q$delete from public.genesis_work_attempts where status='failed'$q$,'55000','terminal attempt deletion is guarded');
update public.genesis_work_attempts set lease_expires_at=now()-interval '1 second' where run_id=(select (v->>'run_id')::uuid from foundation_test_state where k='recovery2');
set local role authenticated;
select pg_temp.assert_true((public.genesis_recover_stale_work('10000000-0000-4000-8000-000000000001')->>'recovered_count')::int=1,'expired attempt recovered once');
select pg_temp.assert_true((public.genesis_recover_stale_work('10000000-0000-4000-8000-000000000001')->>'recovered_count')::int=0,'recovery is idempotent');
select public.genesis_retry_work('10000000-0000-4000-8000-000000000001',(select (v->>'task_id')::uuid from foundation_test_state where k='recovery-command'));
insert into foundation_test_state values('recovery3',public.genesis_claim_work('10000000-0000-4000-8000-000000000001','director','openai/gpt-5.6-sol','vercel-ai-gateway'));
do $test$
declare old_run uuid:=(select (v->>'run_id')::uuid from foundation_test_state where k='recovery2'); new_run uuid:=(select (v->>'run_id')::uuid from foundation_test_state where k='recovery3');
begin
  perform pg_temp.expect_failure(format('select public.genesis_complete_director(%L,%L,%L::jsonb,%L::jsonb)','10000000-0000-4000-8000-000000000001',old_run,pg_temp.director_result(),'{}'),'55000','stale worker cannot finish a replacement attempt');
  perform pg_temp.assert_true((select status='running' from public.genesis_work_attempts where run_id=new_run),'stale completion does not change the current attempt');
  perform public.genesis_complete_director('10000000-0000-4000-8000-000000000001',new_run,pg_temp.director_result(),'{}');
  perform pg_temp.expect_failure(format('select public.genesis_review_work(%L,%L,%L,%L,%L)','10000000-0000-4000-8000-000000000001',(select v->>'task_id' from foundation_test_state where k='recovery-command'),new_run,'revise','Another revision'),'55000','revision budget rejects without losing produced output');
  perform pg_temp.assert_true((select status='awaiting_review' from public.genesis_tasks where active_run_id=new_run),'exhausted revision leaves reviewable result intact');
end;
$test$;
select public.genesis_cancel_work('10000000-0000-4000-8000-000000000001',(select (v->>'task_id')::uuid from foundation_test_state where k='recovery-command'));
select pg_temp.assert_true((select status='cancelled' from public.genesis_plans where id=(select (v->>'plan_id')::uuid from foundation_test_state where k='recovery-command')),'Director cancellation stops the plan');

-- Access denial remains effective for all records and RPCs under a second identity.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.genesis_work_attempts),'attempt RLS isolates another owner');
select pg_temp.assert_true((select count(*)=0 from public.genesis_operating_contracts),'contract RLS isolates another owner');
select pg_temp.expect_failure($q$select public.genesis_workforce_readiness('10000000-0000-4000-8000-000000000001',null)$q$,'42501','readiness cannot inspect another workspace');
select pg_temp.expect_failure($q$select public.genesis_submit_command('10000000-0000-4000-8000-000000000002','Neutral command without a Director.','neutral-no-director')$q$,'22023','failed command creation rolls back every record');
select pg_temp.assert_true((select count(*)=0 from public.genesis_commands),'failed submission left no idempotency placeholder');
select pg_temp.assert_true((select count(*)=0 from public.genesis_objectives),'failed submission left no orphan objective');

-- Fresh-owner initialization is owner-scoped and creates no sample objectives.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
insert into foundation_test_state values('new-owner',public.genesis_initialize_foundation(null,'Neutral foundation C'));
select pg_temp.assert_true((select (v->>'created')::boolean and (v->>'agent_count')::int=7 from foundation_test_state where k='new-owner'),'empty account can initialize neutral foundation');
select pg_temp.assert_true((select count(*)=0 from public.genesis_objectives),'initialization creates no business or sample objectives');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_failure($q$select public.genesis_initialize_foundation(null,'Anonymous')$q$,'42501','authenticated role without uid is denied');
set local role anon;
select pg_temp.expect_failure($q$select public.genesis_initialize_foundation(null,'Anonymous')$q$,'42501','anonymous caller cannot execute foundation RPC');
reset role;

select 'PASS: neutral foundation lifecycle, acceptance, revision, stale-attempt fencing, bounded JSON, idempotency, atomic rollback, and tenant isolation' as result;
rollback;
