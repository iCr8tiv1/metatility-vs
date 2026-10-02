# Metatility VS persistence contract

VS v0.3 is designed to move from preview JSON persistence to Supabase without changing the institutional model.

## Security boundary

- Supabase Auth owns identity.
- Browser clients may receive only the project URL and publishable key.
- Secret/service-role keys stay server-side only.
- `anon` has no access to VS tables.
- `authenticated` gets explicit table grants plus Row Level Security.
- Every row carries `owner_id = auth.uid()`.
- Child rows use `(concept_id, owner_id)` foreign keys so a user cannot attach their data to another user's concept.
- Simulation runs are stored separately from evidence and are constrained to `is_evidence = false`.

## Persistent objects

1. `vs_concepts`
2. `vs_scorecards`
3. `vs_assumptions`
4. `vs_experiments`
5. `vs_evidence`
6. `vs_decisions`
7. `vs_simulation_runs`
8. `vs_institutional_events`

## Intended auth flow

1. User signs up or signs in with Supabase Auth.
2. Client obtains an access token.
3. Data requests use the publishable key plus the user's JWT.
4. PostgreSQL RLS enforces ownership.
5. VS emits institutional events only for real concept/evidence/decision activity.
6. Simulations remain explicitly non-evidence even when their runs are persisted.

## Deployment environment

The application will need these variables once the dedicated Supabase project is selected:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

A secret/service-role key is not required for ordinary user CRUD because RLS should remain the authority.

## Current blocker

The connected Supabase account currently exposes an organization named `NOLVANT`. A dedicated VS project should not be created inside that organization without an explicit ownership decision. Once the target organization is confirmed, apply `supabase/schema.sql`, run Supabase security/performance advisors, test RLS with authenticated users, then switch the Railway app from preview storage to Supabase persistence.
