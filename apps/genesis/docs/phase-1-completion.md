# Genesis Phase 1 — Core / Foundation Completion Record

Status: **code-complete; authenticated operator validation pending**

Branch: `genesis-ai-workforce-ui`  
Merge target: `genesis-v0.1`

## Phase 1 objective

Establish the governed operating substrate required for Genesis to function as an AI workforce instead of a collection of prompts.

The Phase 1 control plane is:

```text
Operator
  -> Objective
  -> Genesis Director
  -> Plan
  -> Tasks
  -> Agent assignments
  -> Agent runs
  -> Events / approvals / audit
  -> Genesis data
```

## Completion checklist

- [x] Standalone Genesis application under `apps/genesis`
- [x] Supabase authentication and password-recovery flow
- [x] Genesis workspace and owner-scoped data model
- [x] Agent registry with status, autonomy, tool domains, and KPIs
- [x] Persistent agent-persona records
- [x] Operator-facing identities for Director, Maya, Elias, Nova, Avery, Sofia, and Orion
- [x] Objectives
- [x] Plans
- [x] Tasks
- [x] Task assignments
- [x] Task dependencies
- [x] Agent-run audit records
- [x] Event architecture
- [x] Human approval layer
- [x] Agent memory table
- [x] Agent performance table
- [x] Command Center wired to real Genesis records
- [x] Work workspace wired to real Genesis records
- [x] Owner-scoped RLS on all new workforce tables
- [x] Anonymous table access revoked
- [x] Authenticated Data API grants explicitly present
- [x] Supporting query and foreign-key indexes
- [x] Workforce schema captured in source control at `supabase/genesis_v01_workforce.sql`
- [x] Rollback-only synthetic relationship smoke test
- [x] Supabase security advisor reviewed
- [x] Supabase performance advisor reviewed and unindexed Genesis FK corrected
- [x] Vercel preview build passes for current Phase 1 + runtime branch
- [ ] Authenticated operator creates one objective through the Command Center
- [ ] Director creates the corresponding plan and specialist work through the UI
- [ ] Work page reflects the persisted task state from the authenticated flow
- [ ] Existing authenticated routes receive final regression review

## Validation evidence

### Database relationship smoke test

A transaction created a synthetic objective, plan, Director task, specialist task,
assignment, finish-to-start dependency, agent memory row, and agent-performance
row, then verified their relationships and rolled the transaction back.

Result:

```text
phase1_schema_relationship_smoke_test = passed
synthetic rows persisted = 0
```

### RLS / access check

For every new workforce table:

- RLS enabled: yes
- owner-scoped authenticated policy: present
- anonymous table grants: 0
- authenticated Data API access: present

### Persona seed

Seven active persona records are present:

- Genesis Director
- Maya
- Elias
- Nova
- Avery
- Sofia
- Orion

### Advisor state

No new Genesis schema/RLS security finding was introduced.

The remaining security warning is an existing Supabase Auth setting:
**Leaked Password Protection Disabled**.

The performance advisor no longer reports an unindexed Genesis foreign key.
Unused-index informational findings are expected while the new v0.1 tables have
little or no workload history.

## Phase 1 exit criterion

Phase 1 is complete only after the authenticated operator flow proves that the
browser/session layer can create and read the same governed objects already
validated at the database layer.

Do not merge this work to `main` before that proof exists.

## Phase 2 boundary

Some Workforce Runtime v0.2 code already exists on this feature branch, but
further autonomy work should remain behind the Phase 1 validation gate.

Full unattended execution also requires a trusted server credential path.
The Vercel project currently has public Supabase configuration only; no
server-only Supabase secret is configured.
