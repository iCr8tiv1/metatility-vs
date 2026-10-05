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
