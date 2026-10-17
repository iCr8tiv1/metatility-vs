/**
 * Local contract integration: actual runtime + public PostgreSQL RPCs.
 *
 * The base tables come from an explicitly inferred, disposable fixture. They
 * are not verified production DDL. PGlite does not test Supabase/PostgREST,
 * concurrent connections, deployed hosting, or a live model provider. Only
 * model generation is replaced here with neutral deterministic outputs.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  FOUNDATION_MODEL, FOUNDATION_PROVIDER,
  type DirectorOutput, type SpecialistTaskResult,
} from "../lib/genesis/foundation-contract";
import {
  claimedWorkSchema, executeFoundationWork, FoundationStoreError,
  type ClaimedWork, type FoundationGenerator, type FoundationRunStore,
  type RuntimeKind,
} from "../lib/genesis/runtime";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const supabaseRoot = resolve(repositoryRoot, "supabase");

async function foundationMigrationPath() {
  const directory = resolve(supabaseRoot, "migrations");
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const matches = files.filter((name) => name.endsWith("_genesis_foundation_v1.sql"));
  assert.ok(matches.length <= 1, "Exactly one foundation v1 migration may exist.");
  return matches.length ? resolve(directory, matches[0]) : resolve(supabaseRoot, "genesis_foundation_v1.sql");
}

async function createFixtureDatabase() {
  const db = new PGlite();
  try {
    await db.exec(await readFile(resolve(supabaseRoot, "tests/genesis_foundation_base_fixture.sql"), "utf8"));
    // PGlite has core gen_random_uuid(), but not the optional pgcrypto extension.
    // Preserve the tracked workforce SQL otherwise; never rewrite constraints,
    // permissions, transaction boundaries, or any foundation migration text.
    const workforceSql = await readFile(resolve(supabaseRoot, "genesis_v01_workforce.sql"), "utf8");
    await db.exec(workforceSql.replace(/^create extension if not exists pgcrypto;\r?$/m, ""));
    await db.exec(await readFile(await foundationMigrationPath(), "utf8"));
    const ownerId = randomUUID();
    await db.query("insert into auth.users(id) values ($1::uuid)", [ownerId]);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ownerId]);
    return { db, ownerId };
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function value<T>(db: PGlite, sql: string, parameters: unknown[] = []): Promise<T> {
  const result = await db.query<{ result: T }>(sql, parameters);
  assert.equal(result.rows.length, 1, "The query must return one scalar result.");
  return result.rows[0].result;
}

/** The same public RPC boundary used by the app, under the authenticated role. */
class PGliteFoundationRunStore implements FoundationRunStore {
  readonly claims: unknown[] = [];

  constructor(readonly db: PGlite, readonly workspaceId: string) {}

  private async rpc(sql: string, parameters: unknown[]) {
    try {
      return await value<unknown>(this.db, sql, parameters);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
        throw new FoundationStoreError(error.code);
      }
      throw error;
    }
  }

  async claim(kind: RuntimeKind, taskId?: string) {
    const raw = await this.rpc(
      "select public.genesis_claim_work($1::uuid,$2::text,$3::text,$4::text,$5::uuid) as result",
      [this.workspaceId, kind, FOUNDATION_MODEL, FOUNDATION_PROVIDER, taskId ?? null],
    );
    this.claims.push(raw);
    // Do not project, rename, patch, or pre-parse any claim fields here.
    // executeFoundationWork must consume exactly the JSON returned by SQL.
    return raw;
  }

  async complete(kind: RuntimeKind, runId: string, output: unknown, usage: Record<string, unknown>) {
    const sql = kind === "director"
      ? "select public.genesis_complete_director($1::uuid,$2::uuid,$3::jsonb,$4::jsonb) as result"
      : "select public.genesis_complete_work($1::uuid,$2::uuid,$3::jsonb,$4::jsonb) as result";
    await this.rpc(sql, [this.workspaceId, runId, JSON.stringify(output), JSON.stringify(usage)]);
  }

  async fail(runId: string, error: string) {
    await this.rpc("select public.genesis_fail_work($1::uuid,$2::uuid,$3::text) as result", [this.workspaceId, runId, error]);
  }
}

type Command = { objective_id: string; plan_id: string; task_id: string; replayed: boolean };
type Initialization = { workspace_id: string; contract_version_id: string; created: boolean; agent_count: number };

function initialize(db: PGlite) {
  return value<Initialization>(db,
    "select public.genesis_initialize_foundation(null,$1::text) as result", ["Neutral foundation integration"]);
}

function submit(db: PGlite, workspaceId: string, key = randomUUID()) {
  return value<Command>(db,
    "select public.genesis_submit_command($1::uuid,$2::text,$3::text) as result",
    [workspaceId, "Evaluate the review and dependency gates of a synthetic internal checklist.", key]);
}

function accept(db: PGlite, workspaceId: string, taskId: string, runId: string) {
  return value(db,
    "select public.genesis_review_work($1::uuid,$2::uuid,$3::uuid,'accept',$4::text) as result",
    [workspaceId, taskId, runId, "Checked this exact neutral result and its acceptance criteria."]);
}

const directorOutput: DirectorOutput = {
  recommendedAction: "Review the supplied checklist, then define a verification measure.",
  rationale: "A dependent measurement needs an explicitly accepted research result.",
  primaryMetric: "Checklist steps with an observable acceptance criterion",
  expectedLearning: "Whether an accepted output is supplied to dependent work",
  requiresHumanReview: false,
  workItems: [
    {
      key: "research", dependsOn: [], agentKey: "market_intelligence", taskType: "research", priority: 2,
      title: "Review the neutral checklist", description: "Use only the supplied synthetic operating contract.",
      successCriteria: "Identify the review boundary and state the evidence source.",
    },
    {
      key: "measure", dependsOn: ["research"], agentKey: "analytics", taskType: "measurement", priority: 1,
      title: "Define a checklist measure", description: "Use the accepted research result as the supplied evidence.",
      successCriteria: "Give an observable check associated with the accepted research output.",
    },
  ],
};

const specialistOutput: SpecialistTaskResult = {
  summary: "The neutral checklist requires explicit acceptance before dependent work.", confidence: 0.9,
  findings: [{
    finding: "Producing an output does not accept the work.", evidenceStatus: "supplied_context",
    evidence: "The supplied operating contract requires result review.",
    implication: "Keep dependent work blocked until the operator accepts this exact result.",
  }],
  deliverables: [{ title: "Review boundary", type: "analysis", content: "Record the accepted task and run before releasing its dependent checklist measure." }],
  evidenceGaps: [], recommendedNextAction: "Review this internal result.", requiresHumanReview: false,
  memoryCandidates: [{ memoryType: "lesson", subject: "Review gate", content: "Associate acceptance with the exact run.", confidence: 0.9, importance: 2 }],
};

test("actual runtime and SQL RPCs preserve review gates, idempotency, and accepted dependency snapshots", async () => {
  const { db, ownerId } = await createFixtureDatabase();
  try {
    const initial = await initialize(db);
    assert.equal(initial.created, true);
    assert.equal(initial.agent_count, 7);
    assert.equal(await value(db, "select count(*)::int as result from public.genesis_objectives"), 0);
    const again = await initialize(db);
    assert.equal(again.workspace_id, initial.workspace_id);
    assert.equal(again.contract_version_id, initial.contract_version_id);
    assert.equal(again.created, false);
    assert.equal(again.agent_count, 7);

    const key = randomUUID();
    const command = await submit(db, initial.workspace_id, key);
    const replay = await submit(db, initial.workspace_id, key);
    assert.equal(command.replayed, false);
    assert.deepEqual(replay, { ...command, replayed: true });
    for (const table of ["genesis_commands", "genesis_objectives", "genesis_plans", "genesis_tasks"]) {
      assert.equal(await value(db, `select count(*)::int as result from public.${table}`), 1, `Idempotent submission created one ${table} row.`);
    }

    const store = new PGliteFoundationRunStore(db, initial.workspace_id);
    const generations: { kind: RuntimeKind; work: ClaimedWork; prompt: string }[] = [];
    const generator: FoundationGenerator = {
      async generate(kind, work, prompt) {
        generations.push({ kind, work, prompt });
        return { output: kind === "director" ? directorOutput : specialistOutput, usage: { inputTokens: 100, outputTokens: 150 } };
      },
    };

    const director = await executeFoundationWork(store, generator, "director", command.task_id);
    assert.equal(director.code, "awaiting-review");
    assert.equal(director.taskId, command.task_id);
    assert.ok(director.runId);
    assert.equal(generations.length, 1);
    assert.equal(await value(db, "select status as result from public.genesis_tasks where id=$1::uuid", [command.task_id]), "awaiting_review");
    assert.equal(await value(db, "select status as result from public.genesis_plans where id=$1::uuid", [command.plan_id]), "proposed");
    const children = (await db.query<{ id: string; work_item_key: string }>(
      "select id,work_item_key from public.genesis_tasks where parent_task_id=$1::uuid", [command.task_id],
    )).rows;
    assert.equal(children.length, 2);
    const research = children.find((row) => row.work_item_key === "research");
    const measure = children.find((row) => row.work_item_key === "measure");
    assert.ok(research && measure);
    assert.equal((await executeFoundationWork(store, generator, "specialist", research.id)).code, "not-eligible");
    assert.equal(generations.length, 1, "A proposed plan cannot invoke a specialist generator.");

    await accept(db, initial.workspace_id, command.task_id, director.runId);
    assert.equal(await value(db, "select status as result from public.genesis_plans where id=$1::uuid", [command.plan_id]), "active");
    assert.equal((await executeFoundationWork(store, generator, "specialist", measure.id)).code, "not-eligible");
    const first = await executeFoundationWork(store, generator, "specialist");
    assert.equal(first.code, "awaiting-review");
    assert.equal(first.taskId, research.id, "The blocked measurement cannot win priority over ready research.");
    assert.ok(first.runId);
    assert.deepEqual(generations[1].work.context.dependencies, []);
    assert.equal((await executeFoundationWork(store, generator, "specialist", measure.id)).code, "not-eligible");
    assert.equal(generations.length, 2, "A produced dependency does not release its child.");
    assert.equal(await value(db, "select accepted_at is null as result from public.genesis_tasks where id=$1::uuid", [research.id]), true);
    await accept(db, initial.workspace_id, research.id, first.runId);

    const final = await executeFoundationWork(store, generator, "specialist", measure.id);
    assert.equal(final.code, "awaiting-review");
    assert.equal(final.taskId, measure.id);
    assert.ok(final.runId);
    const dependencies = generations[2].work.context.dependencies as {
      task_id: string; run_id: string; accepted_at: string; output: unknown;
    }[];
    assert.equal(dependencies.length, 1);
    assert.equal(dependencies[0].task_id, research.id);
    assert.equal(dependencies[0].run_id, first.runId);
    assert.ok(dependencies[0].accepted_at);
    assert.deepEqual(dependencies[0].output, specialistOutput);
    assert.equal(await value(db, "select status as result from public.genesis_plans where id=$1::uuid", [command.plan_id]), "active");
    await accept(db, initial.workspace_id, measure.id, final.runId);
    assert.equal(await value(db, "select status as result from public.genesis_plans where id=$1::uuid", [command.plan_id]), "completed");
    assert.equal(await value(db, "select status as result from public.genesis_objectives where id=$1::uuid", [command.objective_id]), "completed");
    assert.equal(await value(db, "select count(*)::int as result from public.genesis_tasks where plan_id=$1::uuid and status='completed' and accepted_at is not null and accepted_by=$2::uuid", [command.plan_id, ownerId]), 3);
    assert.equal(await value(db, "select count(*)::int as result from public.genesis_work_reviews where decision='accept'"), 3);
    assert.equal(await value(db, "select count(*)::int as result from public.genesis_agent_memory"), 0, "Model memory candidates were not promoted.");

    const realClaims = store.claims.filter((raw) => raw !== null);
    assert.equal(realClaims.length, 3);
    for (const raw of realClaims) {
      const parsed = claimedWorkSchema.safeParse(raw);
      assert.equal(parsed.success, true, "Unmodified database JSON must satisfy the runtime contract.");
      assert.ok(parsed.success);
      const generation = generations.find((entry) => entry.work.run_id === parsed.data.run_id);
      assert.ok(generation);
      assert.equal(generation.prompt, JSON.stringify(parsed.data.context));
      assert.deepEqual(await value(db, "select input as result from public.genesis_work_attempts where run_id=$1::uuid", [parsed.data.run_id]), parsed.data.context);
      assert.equal(await value(db, "select status as result from public.genesis_work_attempts where run_id=$1::uuid", [parsed.data.run_id]), "produced");
    }
  } finally {
    await db.close();
  }
});

test("malformed deterministic model output is persisted as a failed actual database attempt", async () => {
  const { db } = await createFixtureDatabase();
  try {
    const initial = await initialize(db);
    const command = await submit(db, initial.workspace_id);
    const store = new PGliteFoundationRunStore(db, initial.workspace_id);
    let generations = 0;
    const generator: FoundationGenerator = {
      async generate() {
        generations += 1;
        return { output: { ...directorOutput, workItems: [] }, usage: {} };
      },
    };
    const result = await executeFoundationWork(store, generator, "director", command.task_id);
    assert.equal(result.code, "output-invalid");
    assert.equal(generations, 1);
    assert.ok(result.runId);
    assert.equal(claimedWorkSchema.safeParse(store.claims[0]).success, true);
    assert.deepEqual(await value(db,
      "select jsonb_build_object('status',status,'output',output,'error',error) as result from public.genesis_work_attempts where run_id=$1::uuid", [result.runId]),
    { status: "failed", output: null, error: "Foundation runtime stopped: output-invalid." });
    assert.equal(await value(db, "select status as result from public.genesis_agent_runs where id=$1::uuid", [result.runId]), "failed");
    assert.equal(await value(db, "select status as result from public.genesis_tasks where id=$1::uuid", [command.task_id]), "failed");
    assert.equal(await value(db, "select count(*)::int as result from public.genesis_tasks where parent_task_id=$1::uuid", [command.task_id]), 0);
    assert.equal(await value(db, "select count(*)::int as result from public.genesis_work_reviews"), 0);
  } finally {
    await db.close();
  }
});
