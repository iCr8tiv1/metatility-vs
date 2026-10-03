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
  const ownerId = authData.user.id;

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit ?? 250) || 250, 500));

  let query = userClient.from("vs_institutional_events").select("*").order("occurred_at", { ascending: true }).limit(limit);
  if (body.since) query = query.gt("occurred_at", String(body.since));

  const { data: rawEvents, error: eventError } = await query;
  if (eventError) return Response.json({ error: eventError.message }, { status: 500, headers });

  const events = (rawEvents ?? []).filter((e) =>
    e.entity_type !== "simulation" && !String(e.event_type ?? "").startsWith("simulation.")
  );

  async function entity(type: string, sourceId: string, name: string | null, attributes: Record<string, unknown>) {
    const { data: existing, error: readError } = await admin
      .from("is_entities")
      .select("id,canonical_name,attributes")
      .eq("owner_id", ownerId)
      .eq("source_system", "metatility-vs")
      .eq("entity_type", type)
      .eq("source_entity_id", sourceId)
      .maybeSingle();
    if (readError) throw readError;

    if (existing) {
      const { data, error } = await admin.from("is_entities")
        .update({
          canonical_name: name ?? existing.canonical_name,
          attributes: { ...(existing.attributes ?? {}), ...attributes },
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    }

    const { data, error } = await admin.from("is_entities").insert({
      owner_id: ownerId,
      entity_type: type,
      source_system: "metatility-vs",
      source_entity_id: sourceId,
      canonical_name: name,
      attributes,
    }).select("id").single();
    if (error) throw error;
    return data.id as string;
  }

  async function relationship(fromId: string, toId: string, type: string, event: any, attributes: Record<string, unknown> = {}) {
    const { error } = await admin.from("is_relationships").upsert({
      owner_id: ownerId,
      from_entity_id: fromId,
      to_entity_id: toId,
      relationship_type: type,
      source_event_id: event.id,
      attributes,
      observed_at: event.occurred_at,
    }, {
      onConflict: "owner_id,from_entity_id,to_entity_id,relationship_type,source_event_id",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }

  let processed = 0, skipped = 0, rejected = 0;
  let lastOccurredAt: string | null = null;

  for (const event of events) {
    lastOccurredAt = event.occurred_at;
    const { data: existingInbox } = await admin.from("is_event_inbox")
      .select("processing_status").eq("source_event_id", event.id).maybeSingle();

    if (existingInbox?.processing_status === "processed") {
      skipped++;
      continue;
    }

    const { error: inboxError } = await admin.from("is_event_inbox").upsert({
      source_event_id: event.id,
      owner_id: ownerId,
      concept_id: event.concept_id,
      schema_version: event.schema_version,
      source_system: event.source_system,
      event_type: event.event_type,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      occurred_at: event.occurred_at,
      payload: event.payload ?? {},
      processing_status: "received",
      processing_error: null,
    }, { onConflict: "source_event_id" });

    if (inboxError) {
      rejected++;
      continue;
    }

    try {
      const p = event.payload ?? {};
      let conceptEntity: string | null = null;
      if (event.concept_id) {
        conceptEntity = await entity("concept", String(event.concept_id), null, {
          concept_id: event.concept_id,
        });
      }

      if (event.event_type === "concept.created") {
        await entity("concept", String(event.entity_id), p.name ?? null, {
          type: p.type, model_type: p.model_type, stage: p.stage,
          status: p.status, one_liner: p.one_liner, provenance: p.provenance ?? null,
        });
      }

      if (event.event_type === "assumption.status_changed") {
        const assumptionEntity = await entity("assumption", String(event.entity_id), p.title ?? null, {
          category: p.category, status: p.status, evidence_level: p.evidence_level,
          confidence: p.confidence, provenance: p.provenance ?? null,
        });
        if (conceptEntity) await relationship(conceptEntity, assumptionEntity, "has_assumption", event);
      }

      if (event.event_type === "experiment.created") {
        const experimentEntity = await entity("experiment", String(event.entity_id), p.hypothesis ?? null, {
          method: p.method, success_condition: p.success_condition, budget: p.budget,
          status: p.status, provenance: p.provenance ?? null,
        });
        if (conceptEntity) await relationship(conceptEntity, experimentEntity, "has_experiment", event);
        if (p.assumption_id) {
          const assumptionEntity = await entity("assumption", String(p.assumption_id), null, {});
          await relationship(experimentEntity, assumptionEntity, "tests_assumption", event);
        }
      }

      if (event.event_type === "evidence.recorded") {
        const evidenceEntity = await entity("evidence", String(event.entity_id), p.summary ?? null, {
          level: p.level, direction: p.direction, source: p.source,
          observed_at: p.observed_at, provenance: p.provenance ?? null,
        });

        const { error: evidenceError } = await admin.from("is_evidence_records").upsert({
          owner_id: ownerId,
          source_event_id: event.id,
          source_evidence_id: String(event.entity_id),
          concept_id: event.concept_id,
          assumption_id: p.assumption_id ? String(p.assumption_id) : null,
          experiment_id: p.experiment_id ? String(p.experiment_id) : null,
          evidence_level: p.level,
          direction: p.direction,
          summary: p.summary,
          source: p.source,
          observed_at: p.observed_at,
          provenance: {
            source_event_id: event.id,
            source_system: event.source_system,
            source_table: p.provenance?.table ?? "vs_evidence",
            source_row_id: p.provenance?.row_id ?? event.entity_id,
          },
        }, { onConflict: "source_event_id" });
        if (evidenceError) throw evidenceError;

        if (conceptEntity) await relationship(conceptEntity, evidenceEntity, "has_evidence", event);
        if (p.assumption_id) {
          const assumptionEntity = await entity("assumption", String(p.assumption_id), null, {});
          const rel = p.direction === "supports" ? "supports_assumption" :
            p.direction === "contradicts" ? "contradicts_assumption" : "observes_assumption";
          await relationship(evidenceEntity, assumptionEntity, rel, event, { evidence_level: p.level });
        }
        if (p.experiment_id) {
          const experimentEntity = await entity("experiment", String(p.experiment_id), null, {});
          await relationship(evidenceEntity, experimentEntity, "result_of_experiment", event);
        }
      }

      if (event.event_type === "decision.made") {
        const decisionEntity = await entity("decision", String(event.entity_id), p.title ?? null, {
          decision: p.decision, rationale: p.rationale, review_condition: p.review_condition,
          decision_owner: p.decision_owner, provenance: p.provenance ?? null,
        });

        const { error: decisionError } = await admin.from("is_decision_records").upsert({
          owner_id: ownerId,
          source_event_id: event.id,
          source_decision_id: String(event.entity_id),
          concept_id: event.concept_id,
          title: p.title,
          decision: p.decision,
          rationale: p.rationale,
          review_condition: p.review_condition,
          decision_owner: p.decision_owner,
          provenance: {
            source_event_id: event.id,
            source_system: event.source_system,
            source_table: p.provenance?.table ?? "vs_decisions",
            source_row_id: p.provenance?.row_id ?? event.entity_id,
          },
          decided_at: event.occurred_at,
        }, { onConflict: "source_event_id" });
        if (decisionError) throw decisionError;

        if (conceptEntity) await relationship(conceptEntity, decisionEntity, "has_decision", event);
      }

      const { error: doneError } = await admin.from("is_event_inbox")
        .update({ processing_status: "processed", processing_error: null })
        .eq("source_event_id", event.id);
      if (doneError) throw doneError;
      processed++;
    } catch (error) {
      rejected++;
      await admin.from("is_event_inbox").update({
        processing_status: "rejected",
        processing_error: String(error?.message ?? error).slice(0, 1000),
      }).eq("source_event_id", event.id);
    }
  }

  return Response.json({
    ok: true,
    source_events: events.length,
    processed,
    skipped,
    rejected,
    last_occurred_at: lastOccurredAt,
    simulation_events_included: false,
  }, { headers });
});