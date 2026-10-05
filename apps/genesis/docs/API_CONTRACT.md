# Genesis v0.1 API Contract

Genesis is owned by Metatility. Bilden is the first downstream operating customer.

## Genesis owns

- market intelligence
- campaigns and content orchestration
- lead capture and enrichment
- qualification and nurture
- marketing attribution
- agent recommendations and approvals

## Bilden owns

- construction CRM opportunity execution
- estimating and proposals
- contracts
- projects and operations
- realized revenue and profitability

## Genesis -> Bilden

The first production handoff emits `opportunity.ready`, passes the configured approval policy, then sends a versioned payload containing:

- Genesis opportunity ID
- contact identity
- property context
- project intent
- qualification scores and confidence
- marketing attribution
- estimated commercial value

Bilden must return its canonical opportunity ID.

## Bilden -> Genesis

Genesis ingests idempotent outcome events:

- `bilden.opportunity.accepted`
- `bilden.estimate.created`
- `bilden.contract.signed`
- `bilden.project.completed`
- `bilden.revenue.recognized`

Each outcome event must include an idempotency key, Bilden entity ID, Genesis opportunity ID when applicable, event timestamp, schema version, and outcome payload.

## Security

- No Supabase secret/service-role key is permitted in browser code.
- External Bilden events must be verified with a server-only secret/signature or service identity.
- Genesis public tables use RLS.
- High-risk marketing actions require an approval record before execution.

## v0.1 success criteria

1. Capture a lead.
2. Run qualification.
3. Record an approval decision.
4. Create a Genesis opportunity.
5. Send the opportunity to Bilden.
6. Receive a downstream Bilden outcome event.
7. Attribute the outcome back to the originating lead/campaign.
