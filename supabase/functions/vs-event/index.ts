import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const allowedOrigins = new Set([
  "https://vs.metatility.io",
  "https://metatility-vs-v04-production.up.railway.app",
]);
function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://vs.metatility.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const sourceMap: Record<string, { table: string; type: string }> = {
  "concept.created": { table: "vs_concepts", type: "concept" },
  "concept.updated": { table: "vs_concepts", type: "concept" },
  "experiment.created": { table: "vs_experiments", type: "experiment" },
  "evidence.recorded": { table: "vs_evidence", type: "evidence" },
  "assumption.status_changed": { table: "vs_assumptions", type: "assumption" },
  "decision.made": { table: "vs_decisions", type: "decision" },
};

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers });

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const pubKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const userClient = createClient(url, pubKeys.default, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, secretKeys.default, { auth: { persistSession: false } });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return Response.json({ error: "unauthorized" }, { status: 401, headers });

  const body = await req.json().catch(() => ({}));
  const eventType = String(body.event_type ?? "");
  const entityId = String(body.entity_id ?? "");
  const spec = sourceMap[eventType];
  if (!spec || !entityId || eventType.startsWith("simulation.")) {
    return Response.json({ error: "unsupported_event" }, { status: 400, headers });
  }

  const { data: row, error: rowError } = await userClient
    .from(spec.table)
    .select("*")
    .eq("id", entityId)
    .single();

  if (rowError || !row) return Response.json({ error: "source_row_not_found" }, { status: 404, headers });

  const conceptId = spec.type === "concept" ? row.id : row.concept_id;
  const payload: Record<string, unknown> = {
    provenance: { table: spec.table, row_id: row.id },
  };

  if (spec.type === "concept") Object.assign(payload, {
    name: row.name, type: row.type, model_type: row.model_type, stage: row.stage,
    status: row.status, one_liner: row.one_liner,
    problem: row.problem, customer: row.customer, solution: row.solution,
    business_model: row.business_model, distribution: row.distribution,
    advantage: row.advantage, why_now: row.why_now, objective: row.objective,
    intake: row.intake ?? {}
  });
  if (spec.type === "experiment") Object.assign(payload, {
    assumption_id: row.assumption_id, hypothesis: row.hypothesis, method: row.method,
    success_condition: row.success_condition, budget: row.budget, status: row.status
  });
  if (spec.type === "evidence") Object.assign(payload, {
    assumption_id: row.assumption_id, experiment_id: row.experiment_id, level: row.level,
    direction: row.direction, summary: row.summary, source: row.source, observed_at: row.observed_at
  });
  if (spec.type === "assumption") Object.assign(payload, {
    title: row.title, category: row.category, status: row.status,
    evidence_level: row.evidence_level, confidence: row.confidence
  });
  if (spec.type === "decision") Object.assign(payload, {
    title: row.title, decision: row.decision, rationale: row.rationale,
    review_condition: row.review_condition, decision_owner: row.decision_owner
  });

  const { data: existing } = await admin
    .from("vs_institutional_events")
    .select("id,payload")
    .eq("owner_id", authData.user.id)
    .eq("event_type", eventType)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: false })
    .limit(1);

  if (existing?.[0] && JSON.stringify(existing[0].payload) === JSON.stringify(payload)) {
    return Response.json({ ok: true, id: existing[0].id, duplicate: true }, { headers });
  }

  const { data: inserted, error: insertError } = await admin
    .from("vs_institutional_events")
    .insert({
      owner_id: authData.user.id,
      concept_id: conceptId,
      schema_version: "1.2",
      source_system: "metatility-vs",
      event_type: eventType,
      entity_type: spec.type,
      entity_id: entityId,
      payload,
    })
    .select("id")
    .single();

  if (insertError) return Response.json({ error: insertError.message }, { status: 500, headers });
  return Response.json({ ok: true, id: inserted.id, duplicate: false }, { headers });
});