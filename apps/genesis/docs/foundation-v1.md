# Genesis Foundation v1 — implementation and acceptance record

Recorded: **2026-10-17**. Branch: **genesis-foundation-completion**, based on **genesis-ai-workforce-ui** at `e42cdfea35eeb9fbd8690ede54ffb1b51ee7bc41`.

## Outcome and scope

This increment turns the existing workforce prototype into a bounded, reviewable operating loop. It addresses partial command writes, duplicate submission, unchecked model output, premature completion, dependency release, mutable attempt evidence, and recovery after interruption. Operator surfaces distinguish observed state, generated output, and accepted work.

The development sequence is Genesis first, then business pilots. Tests use neutral synthetic objectives and isolated databases. No business pilot, external connector, live message, publication, or spend is introduced by this change.

This record describes implemented code and local evidence. It does not certify the deployed platform. The actual base schema, environment configuration, and application-to-database binding remain unverified. The [deployment checklist](foundation-infrastructure.md) defines the required environment checks.

## The operating contract

Business System Program Protocol (BSPP) v1 is an immutable workspace contract with key `genesis-foundation` and version `1`. A task pins a contract version. Every claim stores the contract and frozen execution context with its attempt. The runtime validates the returned contract before it calls a model.

| Control | Enforced behavior |
| --- | --- |
| Execution | Explicit operator invocation; `internal_only`. No external tools are attached. |
| Authority | All publishing, contact, spending, and credential permissions must be false. The model cannot expand them. |
| Review | Required for every Director plan and specialist result, regardless of the model's `requiresHumanReview` value. |
| Model path | Existing `openai/gpt-5.6-sol` through `vercel-ai-gateway`; local fixtures do not establish provider availability. |
| Input | Objective up to 2,400 characters; serialized execution context up to 60,000 characters. |
| Output | Up to 8,000 generated tokens and 60,000 serialized output characters, with additional field and array bounds. |
| Time | 240-second generation deadline; database attempt lease of 15 minutes. |
| Attempts | Maximum three claims per task, including failed, expired, and revised attempts. |
| Planning | One to six supported specialist assignments; unique keys; dependencies reference distinct earlier work items. |
| Evidence | Findings classify support as supplied context, internal inference, or hypothesis. Accepted dependencies retain exact task and run references. |
| Memory | Only approved, relevant, currently valid memory enters context. Generated candidates are retained in output and never automatically promoted. |
| Usage | Persist SDK-reported usage fields. Unknown fields remain unknown; token counts do not establish dollar cost. |

Compatible specialist keys are `market_intelligence`, `campaign_planner`, `content_seo`, `lead_intelligence`, `nurture`, and `analytics`. Initialization creates missing generic roles and the contract, preserving existing roles and work. It does not seed objectives, customer records, or persona identities.

## Lifecycle and operator decisions

### Submit and plan

Command submission binds the authenticated owner, originating workspace, objective text, and idempotency key. One database transaction creates the command ledger, objective, proposed plan, Director task, assignment, and event. A repeated key with the same command returns the existing package; conflicting reuse is rejected. If persistence cannot be confirmed, the form preserves the draft and key so an unchanged retry does not create another objective.

The Director claims one eligible task and generates a bounded structured plan. SQL validates the output again before persisting the attempt and creating specialist assignments. A rejected child assignment or failed final event rolls back the whole completion transaction. The plan remains proposed and its result awaits review.

Accepting the exact Director run activates its plan and eligible children. Revision preserves the prior output and review, cancels obsolete unfinished decomposition, and prepares a new attempt within budget. Stale run IDs cannot review the replacement result.

### Execute and accept

Claim eligibility is shared with the UI readiness function. It checks owner and workspace, task and plan state, supported active agent, contract, scheduled availability, prerequisite acceptance, authorization requirements, and attempt budget. The claim transaction records a running attempt and freezes the input used by the model.

Specialist context includes accepted dependency outputs with their task ID, run ID, and acceptance evidence. Generation changes a task to `awaiting_review`; it does not complete the task. Acceptance is a separate exact-run decision. A dependent assignment can run only after its prerequisites are accepted. Final required acceptance completes the plan and objective.

Task review and preexecution authorization are different decisions. An authorized invocation can still fail or produce a result that needs revision. Plan acceptance does not authorize publishing, communication, or spending.

### Recover without erasing evidence

| Situation | Result |
| --- | --- |
| Invalid or excessive model output | Record a sanitized failure; do not accept output or persist partial child decomposition. |
| Model/provider error | New Foundation runs record a bounded failure code rather than raw provider exceptions. Historical error text saved by the prior implementation is not retrospectively sanitized. |
| Completion response lost or ambiguous | Report that persistence is unconfirmed. Do not overwrite a possibly committed result with a failure. Inspect or recover the recorded attempt. |
| Explicit retry | Preserve the prior attempt and create a new one only if eligible and within budget. |
| Requested revision | Preserve output and exact-run feedback; the next attempt receives that feedback. |
| Cancel Director task | Cancel unfinished work in the plan; a late callback cannot replace the cancellation. |
| Cancel specialist task | Cancel it and unfinished dependents; preserve independent work and pause the plan. |
| Resume a partially cancelled plan | Explicitly acknowledge the remaining scope. Cancelled assignments stay excluded; remaining required work must still be accepted. |
| Lease expires | Explicit recovery marks interrupted work for recovery; a late result cannot replace the recovered state. |
| Pause an agent | Block future claims. Already running work requires task cancellation to stop its accepted lifecycle. |

The heartbeat RPC is available, but this runtime does not depend on a background heartbeat loop: its generation deadline is shorter than the lease. There is no unattended scheduler or durable worker in this increment.

## Persistence and access boundaries

The migration adds operating contracts, command idempotency records, protected attempts, exact-run reviews, and task authorizations. Existing tasks gain contract, active-run, attempt-count, origin, and acceptance fields. Historical completed output without a foundation acceptance record is displayed as unverified.

Public lifecycle RPCs are narrow invoker wrappers over private checked functions. The private implementation uses a fixed search path and validates authenticated identity and workspace ownership. Anonymous access is revoked for new foundation tables. Authenticated direct changes to plans, tasks, assignments, and dependencies are revoked; lifecycle changes go through checked functions. Cross-workspace reference guards prevent owned rows from attaching another workspace's records.

Canonical attempt input, contract reference, terminal output, usage, and terminal history are protected against mutation. Deleting a linked legacy run cannot erase its canonical attempt. Reviews are version-specific evidence. Existing legacy event and agent-run tables are not claimed as a fully immutable event store; protected attempts and reviews are the foundation's canonical execution evidence.

The workspace owner is the trusted operator. This design does not cryptographically attest that a result came from a particular model provider, and it does not introduce team-member roles or delegated administration. Terminal-history deletion protection also means account/workspace deletion needs a separately designed retention and erasure workflow; ad hoc cascading deletion is not that workflow.

## Public RPC contract

Task and run operations include `p_workspace_id`. Mutations check their returned result or error; they do not display unconditional success after a failed write.

| RPC | Purpose and additional inputs |
| --- | --- |
| `genesis_initialize_foundation` | Optional workspace ID and name; initialize a neutral contract and missing roles. |
| `genesis_submit_command` | Command text and idempotency key; atomically create or replay a work package. |
| `genesis_workforce_readiness` | Optional task ID array; report eligibility, blockers, remaining attempts, authorization, and review feedback. |
| `genesis_claim_work` | Kind, model, provider, optional task ID; claim eligible work and return its frozen context. |
| `genesis_heartbeat_work` | Run ID; renew a currently valid owned attempt lease. |
| `genesis_complete_director` | Run ID, bounded Director output, reported usage; persist proposed decomposition for review. |
| `genesis_complete_work` | Run ID, bounded specialist output, reported usage; persist a result for review. |
| `genesis_fail_work` | Run ID and sanitized error; fail the currently running attempt. |
| `genesis_review_work` | Task ID, exact run ID, `accept` or `revise`, notes; review that version. Revision requires feedback. |
| `genesis_authorize_work` | Task ID, `approve` or `reject`, notes; record a preexecution decision for the task and contract. |
| `genesis_retry_work` | Task ID; requeue eligible failed work within budget. |
| `genesis_cancel_work` | Task ID; cancel work and affected unfinished scope. |
| `genesis_recover_stale_work` | Recover expired attempts in the owned workspace. |
| `genesis_resume_plan` | Plan ID; resume remaining scope after cancellation. |
| `genesis_set_agent_status` | Agent ID, requested status, expected previous status; compare-and-set pause/resume with an audit event. |

The application review form uses `accepted` and `revision_requested`; its server action maps them to the SQL decisions above. A claim returns `task`, `agent`, `run_id`, `attempt`, `contract`, `context`, and `lease_expires_at`. The integration suite passes this actual SQL JSON directly into the TypeScript runtime.

## Operator experience

The Command Center uses observed foundation work, review, failure, and acceptance counts. Query failures appear as unavailable data. Compact queue counts are labelled as assignments displayed, rather than implied global totals. Running work has indeterminate progress; it does not display invented completion percentages.

Work provides active, review, and history views, full structured output, evidence gaps, prior attempts, exact-run acceptance, revision feedback, and readiness reasons. Ineligible transitions are disabled where the UI can establish that state and independently rejected by SQL. Changing a hidden field or enabling a button cannot grant authority.

Foundation distinguishes verified identity, readable workspace, responding lifecycle functions, initialized contract, active roles, configuration detection, and recorded attempts. Configuration detection is not provider health. `/api/health` reports process liveness and `dependencies_verified: false`; it is not a database, authentication, or model acceptance check.

Workspace selection applies to the foundation, command, work, agent, and knowledge surfaces. Inherited business routes need a separate workspace-consistency pass. Registering a Knowledge source records metadata; it does not fetch or verify that source or promote it to trusted memory.

## Local verification

Commands run from `apps/genesis` with the committed lockfile and Node 24.19.0. Suites use neutral data and no live model calls.

| Check | Evidence and scope |
| --- | --- |
| TypeScript | `npm run typecheck` passes; Next route types are generated before TypeScript checking. |
| Runtime | `npm run test:runtime`: 14 tests cover contract rejection, routing, context limits, output validation, ambiguous persistence, safe failures, exact review identity, and graph constraints. |
| Database | `npm run test:db`: two passing SQL suites exercise lifecycle, permissions, rollback, accepted dependencies, approved memory, pause/schedule/authorization gates, bounded retries, cancellation, recovery, and history protection. The migration is applied twice before each suite. |
| Runtime ↔ SQL | `npm run test:integration`: two passing tests exercise actual SQL claims through the real runtime, from idempotent submission to final acceptance, and malformed-output failure. Only model generation is substituted. |
| Browser components | `npm run test:browser`: 12 tests pass against actual React components/CSS with isolated action stubs at 360- and 1280-pixel widths. Screenshots were visually reviewed. |
| Production compilation | `npm run build` passes compilation, TypeScript, and page generation. |
| Actual server smoke | Liveness returns 200 with neutral or absent Supabase configuration. With neutral public configuration, protected routes redirect to login and the login form renders. No outbound calls were attempted. Real authentication remains unverified. |

The browser run used Playwright Test 1.64.1 with official Chromium Headless Shell 141.0.7390.37 after the matching archive download failed. [The browser record](../tests/browser/README.md) documents the executable override and scope. CI installs the browser requested by the pinned package instead.

The SQL runner uses PGlite 0.5.10 (reported engine PostgreSQL 18.6), an explicitly **inferred** base schema, and simulated Auth identity. It removes only the workforce snapshot's unsupported `pgcrypto` extension declaration; the engine supplies UUID generation. This establishes proposed SQL and runtime compatibility there, not compatibility with a hosted database. It does not exercise simultaneous database connections, Supabase HTTP/PostgREST, live Auth, hosted request cancellation, or the live provider.

The deletion-protection assertion accounts for the observed RESTRICT error-code difference between PostgreSQL 17 and 18 while separately verifying the actual RESTRICT constraint and surviving history. The migration's protection is unchanged.

Only the exact `/api/health` path bypasses session initialization. Application routes, including login, still require the public Supabase URL and publishable key; without them the tested routes return 500 rather than expose application data. This configuration error is not a successful authentication result.

The checked-in GitHub workflow runs installation, type checking, runtime/database/integration tests, browser tests, and the build. Its presence is not proof of a successful hosted CI run; the PR must establish that result separately.

## Migration and rollout gate

Migration: `supabase/migrations/20261017214829_genesis_foundation_v1.sql`, named using the Supabase CLI migration generator. It assumes existing Genesis base relations plus `supabase/genesis_v01_workforce.sql`.

The full base schema was not found in source. Current hosted schema, migration metadata, configuration, and database binding have not been verified. These missing checks block a deployment claim. The inferred test fixture must never be installed into an existing project as a replacement base schema.

Before applying the migration to a hosted environment:

1. Establish authorized access to the intended deployment, verify its application root and public Supabase URL binding, and identify an isolated development database target.
2. Obtain metadata-only base DDL, migration history, constraints, policies, functions, and grants from the verified source. Do not copy customer rows to create a test environment.
3. Commit a faithful reproducible base schema and check this migration against it on the hosted PostgreSQL major version. Confirm extension and privilege compatibility, rollback, and genuine concurrent claim/review/cancel races.
4. Apply to the isolated target and check real anonymous and authenticated API roles, including two independent owners and cross-workspace attempts.
5. Configure and verify Auth redirects, canonical site origin, workspace selection, and server-side model access in the actual deployment with neutral input.
6. Complete the authenticated command → plan → review → specialist → review loop on desktop and mobile. Verify server action transport, cookies, exact-run review, double submission, revision, cancellation, timeout recovery, late callbacks, and safe provider failure.
7. Record the deployed commit, migration version, environment, result IDs, and observed outcomes. Recheck existing authenticated routes and relevant security/performance advisors before release.

The existing `main` merge gate remains in force. A build, local fixture, historical READY deployment, or generated answer does not close this gate.

## Remaining Genesis development

The broader foundation still needs the verified schema and live loop above, trusted memory curation with provenance and retention, consistent workspace handling across inherited routes, and operational observability with real budgets and capacity limits. Current attempt and token caps are not a complete monetary budget system.

Genesis Base, specialist lifecycle management beyond this registry, Engine Studio, and planned canvases remain subsequent implementation work. Unattended workers, external research, publishing, sending, spending, and business adapters each require their own reviewed contract and acceptance evidence.

Business subjects are introduced after the shared foundation is accepted. They should consume verified Genesis interfaces as test subjects, rather than supply assumptions that define the core platform.
