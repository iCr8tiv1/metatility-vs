# Genesis foundation: deployment verification checklist

This public record describes verification prerequisites. It intentionally excludes connected-service account identifiers, infrastructure inventory, credentials, and private access diagnostics.

## Current proof

The branch contains the implementation and neutral local evidence described in [Foundation v1](foundation-v1.md). Compilation and local tests do not establish hosted authentication, database compatibility, model access, or operational readiness.

## Required environment checks

| Area | Evidence required before acceptance |
| --- | --- |
| Source | Exact deployed commit, application root, dependency lockfile, and successful hosted build. |
| Database binding | Authorized verification of the deployment's intended database project. |
| Base schema | Faithful metadata-only DDL and migration history for existing Genesis relations, constraints, policies, functions, and grants. |
| Isolation | A development database with neutral records; no copied customer rows. |
| Migration | Compatibility with the verified base schema and intended PostgreSQL version; rollback and genuine concurrent-session checks. |
| Authentication | Real session creation, redirects, password recovery, canonical origin, anonymous denial, and independent-owner isolation. |
| Model service | Working server-side provider identity, successful bounded generation, recorded usage, and safe failure behavior. |
| Work lifecycle | Authenticated command, proposed plan, exact-run review, specialist work, accepted dependency evidence, and final acceptance. |
| Recovery | Duplicate submissions, stale reviews, revision, cancellation, expiry, late callbacks, and explicit retry. |
| Operator interface | Desktop and mobile review of the authenticated deployment and regressions in existing routes. |

## Schema provenance

The existing `supabase/genesis_v01_workforce.sql` snapshot depends on earlier Genesis base relations that are not fully captured in this repository. The tests reconstruct only a local fixture needed to exercise the proposed contract. That fixture is not recovered deployment DDL and must never be installed as a production base schema.

Capture and review actual metadata before considering hosted migration. Do not infer current policies or schema from an old completion record or from application field usage.

## Configuration and authority

Application operation requires the documented public Supabase configuration and a verified Auth setup. Model execution requires a working server-side Gateway credential or deployment identity. Presence of environment variables is not a service health check. Keep credentials out of browser variables, source control, and public review material.

The exact `/api/health` route reports process liveness without establishing dependencies. Application routes still use session checks. The foundation is explicitly operator-triggered and internal-only; this increment grants no unattended or external execution authority.

## Release decision

Record the deployed commit, installed migration, environment, exact result versions, and observed outcomes after the complete authenticated loop succeeds. Local success alone does not close the existing `main` merge gate or authorize introduction of a business pilot.
