# Genesis

Genesis is Metatility's AI Marketing Operating System. Bilden is its first downstream operating customer.

## Current v0.1 scope

### Control plane

- Command Center
- Supabase authentication
- owner-scoped RLS and explicit Data API grants
- agent registry and autonomy levels
- objectives
- events and agent-run audit history
- approvals and recommendations
- knowledge-source and integration registries
- Bilden API/event contract

### Active agent fleet

- Genesis Director
- Market Intelligence
- Campaign Planner
- Content + SEO
- Lead Intelligence
- Nurture
- Analytics

All model-backed supervisory and planning agents currently use Vercel AI Gateway through AI SDK 7 with structured output and a bounded human-control layer.

### Lead-to-opportunity workflow

Genesis currently supports:

```text
Lead capture
  -> Lead Intelligence
  -> qualification + confidence
  -> approval request
  -> Bilden-ready opportunity
  -> downstream outcome event contract
```

Lead qualification is deliberately auditable. Every qualification records the input, score, recommendation, agent run, events, and any required approval.

### Demand Engine

Genesis now supports:

```text
Business objective
  -> Market Intelligence brief
  -> market/channel hypotheses
  -> audience hypotheses
  -> Campaign Planner
  -> measurable campaign experiment
  -> draft asset briefs
  -> human activation approval
  -> external channel connector (future)
```

#### Market Intelligence

Market Intelligence is evidence-aware and currently defaults to `hypothesis` mode.

In hypothesis mode Genesis must not claim it performed live market research and must not fabricate:

- market size
- search volume
- competitor facts
- pricing
- demographics
- conversion benchmarks
- campaign performance

Instead it produces falsifiable hypotheses, confidence values, audience candidates, channel hypotheses, and explicit evidence gaps.

#### Audiences

Audience records remain linked to the market brief that generated them. They are treated as testable audience hypotheses, not permanent personas or assumed facts.

#### Campaign Planner

Campaign Planner creates one bounded experiment at a time with:

- campaign hypothesis
- target audience
- primary channel
- offer
- primary metric
- optional target value
- test window
- success condition
- failure condition
- learning goal
- draft asset briefs

Campaign planning does not publish content, contact customers, or spend money.

#### Campaign approval

Campaign activation enters the common Genesis approval queue.

Approval marks the campaign plan as approved, but external execution stays blocked with `execution_status = awaiting_connector` until an approved channel connector exists.

## Data domains

Genesis uses dedicated tables for:

- workspaces
- agents
- objectives
- market briefs
- audiences
- campaigns
- campaign assets
- leads
- touchpoints
- qualifications
- opportunities
- events
- agent runs
- approvals
- recommendations
- knowledge sources
- integrations

Anonymous Data API privileges are revoked across the Genesis namespace. Authenticated access is constrained by RLS.

## Architecture

```text
Metatility
  |
  +-- Genesis
       |
       +-- Director / control layer
       |
       +-- Demand Engine
       |    +-- Market Intelligence
       |    +-- Audience Intelligence
       |    +-- Campaign Planner
       |    +-- Content + SEO
       |
       +-- Revenue Engine
       |    +-- Lead Intelligence
       |    +-- Nurture
       |    +-- Analytics
       |
       +-- Human approval layer
       |
       +-- Bilden bridge
```

## Current external boundaries

Not connected yet:

- live external market research
- website lead ingestion
- search/analytics data
- email delivery
- paid advertising platforms
- social publishing
- live Bilden opportunity receiver

Until those connectors are implemented, Genesis remains a governed planning and qualification system rather than an autonomous external execution system.

## Development status

The application is isolated under `apps/genesis` and remains on `genesis-v0.1`.

Do not merge to `main` until the first live end-to-end operational loop has been verified with real operator input:

1. create a Market Intelligence brief
2. review generated audience hypotheses
3. create a campaign experiment
4. approve the campaign plan
5. capture or ingest a real lead
6. qualify the lead
7. approve a Bilden opportunity
8. receive a downstream outcome event
9. verify attribution and audit history


## Current development checkpoint — control plane + telemetry

Genesis now also includes operator workspaces for:

- **Agents** — inspect agent mission, autonomy level, tool domains, KPIs, recent execution, and pause/resume governed agents.
- **Knowledge** — register evidence sources with source type, scope, trust level, verification status, and activation state. Credentials are explicitly excluded from knowledge metadata.
- **Integrations** — view connector readiness, capabilities, connection order, sync state, and execution boundaries.
- **Analytics** — measure Genesis's internal funnel, agent-run reliability, approval activity, event history, and external-evidence coverage.

Paused agents are enforced at the workflow layer for Director, Market Intelligence, Campaign Planner, Content + SEO, and Lead Intelligence.

The external capability registry currently contains:

1. Web Forms
2. Analytics
3. Search Data
4. Email
5. Bilden
6. Paid Media
7. Social Publishing

All remain disconnected until a real connector is configured. This is intentional: Genesis must not imply that external evidence, publishing, communication, spend, or downstream revenue feedback exists when the corresponding connector is not live.

### Security checkpoint

Genesis currently has:

- RLS enabled across all 17 Genesis public tables.
- 17 Genesis RLS policies.
- zero anonymous table grants across the Genesis namespace.
- server-side execution boundaries for model-backed workflows.
- human approval boundaries around opportunity handoff, content release, campaign activation, publishing, communication, and spend.

Supabase's security advisor still reports **Leaked Password Protection Disabled** in Auth. That setting must be enabled in the Supabase Auth dashboard.

### Next live-loop dependency

The next operational milestone is **Web Forms ingestion**.

The Genesis Vercel project currently has only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No backend Supabase secret is configured in Vercel. A public ingestion endpoint must therefore remain blocked until a server-only credential or an equivalently secure webhook authentication path is provisioned. Do not place a Supabase secret key in browser code or public environment variables.


## Revenue Engine — Nurture

Genesis now includes a governed Nurture workflow:

```text
Viable lead
  -> Nurture agent
  -> readiness assessment
  -> permission-constrained sequence
  -> human plan approval
  -> awaiting Email connector
```

Nurture cannot upgrade communication permission beyond the evidence supplied by the lead source. BILDEN website inquiries are limited to inquiry-related follow-up unless broader consent is explicitly recorded. Other leads default to `unknown_or_unverified`.

Approval accepts the plan only. It does not authorize automatic sending.

## BILDEN website ingestion bridge

The first live-data connector is implemented but not yet activated:

- Supabase Edge Function: `genesis-lead-intake` version 2.
- BILDEN branch: `genesis-intake-bridge`.
- BILDEN draft PR: #1.
- JobTread remains the primary inquiry destination.
- Genesis receives a secondary copy only after JobTread reports success.
- Intake is idempotent by BILDEN inquiry ID.
- Abuse throttling uses a one-way client token; raw visitor IP is not stored.
- High-scoring leads enter the existing BILDEN handoff approval queue.

Activation remains blocked until the same encrypted `GENESIS_WEBFORM_INGEST_SECRET` is configured in Cloudflare Pages and the Metatility Supabase Edge Function environment, followed by one end-to-end test.


## Analytics agent

Genesis Analytics is now an executable, evidence-bounded agent rather than a passive dashboard role.

It reads observed Genesis telemetry only:

- lead counts, sources, status, score, and confidence
- campaign status/channel/budget/spend recorded inside Genesis
- opportunity counts/status/estimated value
- approval queue state
- nurture-plan state and permission basis
- registered integration status
- agent-run reliability and recorded cost
- recent Genesis events

It must not infer external traffic, search demand, paid-media results, email engagement, won/lost revenue, or profitability when the corresponding connector is disconnected.

Each Analytics run writes:

- structured observations
- explicit measurement gaps
- one recommended next experiment
- primary metric
- success condition
- required evidence
- confidence
- an auditable agent run and event

The Analytics workspace exposes an operator-triggered **Run Analytics Agent** control and displays the latest Analytics recommendation.


## AI Workforce OS — current feature branch

The `genesis-ai-workforce-ui` branch advances Genesis from a conventional marketing control plane into an operator-facing AI workforce system.

### Workforce identity

Each active Genesis agent now has a persistent persona record in `genesis_agent_personas` with:

- display identity and role
- personality summary
- communication style
- decision posture
- escalation rules
- visual identity metadata
- future voice identity metadata

Current operator-facing identities:

- Genesis Director — AI Workforce Director
- Maya — Lead Intelligence
- Elias — Market Intelligence
- Nova — Campaign Director
- Avery — Content Director
- Orion — Performance Analyst
- Sofia — Nurture Director

The personas are interfaces to real agent records, not decorative characters.

### Work operating system

Genesis now has first-class work objects:

- `genesis_plans`
- `genesis_tasks`
- `genesis_task_assignments`
- `genesis_task_dependencies`
- `genesis_agent_memory`
- `genesis_agent_performance`

The Command Center universal input creates a real governed chain:

```text
Operator command
  -> objective
  -> proposed Director plan
  -> ready Director task
  -> task assignment
  -> objective.created event
```

The new `/work` workspace reads these objects directly and exposes active work, ownership, progress, approval boundaries, priority, and open plans.

### Command Center

The Command Center is now a spatial AI-workforce interface rather than a generic dashboard.

Live data drives:

- agent availability and autonomy
- active-task and running-task counts
- pending human decisions
- qualified-lead counts
- commercial opportunity value
- recent agent execution
- governed campaign activity

Photorealistic synthetic personas are stored locally under `public/agents/` and are intentionally distinct from real employees.

### Governance

The workforce tables use owner-scoped RLS, explicit authenticated/service-role grants, anonymous grant revocation, and indexed foreign keys. Consequential actions remain bounded by the existing approval layer.

### Validation gate

Do not merge this branch until:

1. an authenticated operator loads the Command Center preview successfully
2. a command submitted through “Ask Genesis or assign work…” creates one objective, plan, Director task, assignment, and event
3. the new work appears on `/work`
4. the Command Center reflects the resulting active-work count
5. existing Agents, Campaigns, Leads, Approvals, Analytics, auth, and password-recovery routes remain functional
6. mobile behavior is reviewed
7. no new Supabase security-advisor findings are introduced

The next runtime milestone is Director task decomposition: one approved/high-level objective should become bounded specialist tasks for the appropriate workforce agents.
