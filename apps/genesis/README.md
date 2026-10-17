# Genesis

Genesis is Metatility's operating foundation for governed AI work. Development is **foundation first**: establish dependable identity, work orchestration, contracts, execution, evidence, review, and recovery before introducing business pilots.

The current branch implements **Foundation v1**, a bounded, operator-triggered work lifecycle. It is a locally verified development increment. Live authenticated acceptance remains open; the complete Genesis platform is not yet finished.

## Start here

- [Foundation implementation and acceptance record](docs/foundation-v1.md): behavior, limits, tests, migration prerequisites, and next gates.
- [Deployment verification checklist](docs/foundation-infrastructure.md): prerequisites for authenticated environment acceptance.
- [Component browser verification](tests/browser/README.md): what the browser suite proves and what it substitutes.
- [Historical development notes](docs/history-before-foundation.md): previous marketing, workforce, and integration milestones. These are historical records, not current live verification.

## Current operating loop

1. An authenticated workspace owner submits an objective. One transaction creates the command, objective, proposed plan, Director task, assignment, and event. Retrying the same submission returns the same work package.
2. The operator runs its Director task. Genesis claims the eligible task and freezes its contract and input context in a protected attempt record.
3. The Director proposes up to six specialist assignments and their dependencies. The output awaits an explicit review; generation does not accept the plan.
4. The operator accepts that exact result version, releasing eligible specialist work.
5. Each specialist produces a structured result from supplied context and accepted dependency evidence. Its result also requires review.
6. Accepted evidence releases dependent work. The plan completes when its remaining required work is accepted. Revision, retry, cancellation, and interrupted-run recovery preserve prior attempts and decisions.

The supplied role registry includes Director, Market Intelligence, Campaign Planner, Content + SEO, Lead Intelligence, Nurture, and Analytics. Existing role names are retained for compatibility. Neutral foundation fixtures do not initialize a business, leads, campaigns, or pilot objectives.

## Operator surfaces

| Surface | Foundation responsibility |
| --- | --- |
| Command Center `/` | Submit objectives; inspect observed queue, review, failure, and acceptance counts. |
| Work `/work` | Run eligible work; read complete results; accept or revise an exact run; inspect attempts; cancel, retry, authorize, recover, or resume remaining work. |
| Foundation `/foundation` | Select an owned workspace; initialize its contract and missing roles; inspect database access, contract presence, configuration detection, and acceptance requirements. |
| Agents `/agents` | Inspect agents in the selected workspace; pause or resume future claims using a checked, audited transition. |
| Knowledge `/knowledge` | Register scoped source metadata. Registration does not fetch or verify external content. |

Other inherited marketing and integration routes remain in the application. They have not been certified by this foundation increment, and several still use the earlier single-workspace lookup. Extending or activating them follows the foundation acceptance gate.

## Execution boundary

The versioned Business System Program Protocol (BSPP) contract permits internal analysis, planning, drafting, qualification of supplied records, measurement, and research using supplied context. This runtime attaches no external tools and grants no publishing, sending, spending, or credential-access authority.

Every produced plan and result requires review. Model memory suggestions remain candidates; only approved, scoped, unexpired memory enters later contexts. Missing observations remain unavailable rather than becoming invented health, progress, cost, or business results.

Limits per attempt are 60,000 input characters, 8,000 output tokens, a 240-second generation deadline, and 60,000 output characters. Tasks have a three-attempt budget. The database claim lease is 15 minutes, allowing explicit recovery after an interrupted invocation. Token usage is recorded as reported; no dollar cost is inferred.

## Development

Run commands from `apps/genesis`. The verified local runtime is Node 24; CI also uses Node 24. The committed lockfile pins dependencies.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run build
```

`npm test` runs runtime tests, two disposable database suites, and runtime-to-SQL integration tests. These checks need no live credentials or business data. Browser tests use the real React components with isolated action stubs; they are not a deployed authentication test.

For interactive local development, configure `.env.example` values in an authorized development environment, then run `npm run dev`. Supabase public configuration is required for authenticated application operation. Model execution uses Vercel AI Gateway and requires a working server-side Gateway credential or Vercel OIDC identity. Configuration detection alone does not prove service access. Never put server credentials in public variables.

## Database installation prerequisite

The proposed migration is `../../supabase/migrations/20261017214829_genesis_foundation_v1.sql`.

It depends on the existing Genesis base schema and `../../supabase/genesis_v01_workforce.sql`. The complete live base schema is missing from this repository and has not been verified. **The test base fixture is inferred and must never be installed as a production schema.** Do not run a blanket migration push against an existing project until its application binding, base schema, migration history, and compatibility are verified.

## Release gate

The next gate is an isolated, authenticated deployment that proves the complete command → proposed plan → accepted plan → specialist result → accepted result loop, plus session isolation, stale reviews, duplicate submissions, dependency blocking, revision, cancellation, and recovery. Native multi-connection PostgreSQL contention and live provider failure behavior also require verification.

Authorized live-environment verification remains a prerequisite. The application's current database binding, schema, environment configuration, and authenticated operation have not been established by these local tests. See the deployment checklist for the required checks.

Do not merge to `main` or introduce a business pilot based on local tests alone. Follow-on Genesis work includes a reproducible verified base schema, live operational acceptance, trusted memory curation, broader workspace consistency, and the remaining Genesis Base / Engine Studio / canvas capabilities. External execution and unattended workers require their own explicit contracts and operational verification.
