import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { generateNurturePlan } from "@/app/actions/nurture";
import { createClient } from "@/lib/supabase/server";

type SequenceStep = {
  dayOffset?: number;
  channel?: string;
  purpose?: string;
  subject?: string;
  message?: string;
  stopIf?: string[];
};

type PlanMetadata = {
  evidence_needed?: string[];
  email_connector_connected?: boolean;
  execution_status?: string;
  actual_delivery_allowed?: boolean;
};

function sequence(value: unknown) {
  return Array.isArray(value) ? (value as SequenceStep[]) : [];
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function NurturePage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  const [{ data: leads }, { data: plans }, { data: emailIntegration }] =
    workspace
      ? await Promise.all([
          supabase
            .from("genesis_leads")
            .select(
              "id,source,status,first_name,last_name,email,phone,score,confidence,property,project_intent,created_at"
            )
            .eq("workspace_id", workspace.id)
            .in("status", ["nurture", "new", "qualified"])
            .order("created_at", { ascending: false })
            .limit(30),
          supabase
            .from("genesis_nurture_plans")
            .select(
              "id,lead_id,status,permission_basis,strategy,readiness_assessment,sequence,exit_criteria,metadata,created_at,updated_at"
            )
            .eq("workspace_id", workspace.id)
            .order("created_at", { ascending: false })
            .limit(30),
          supabase
            .from("genesis_integrations")
            .select("status")
            .eq("workspace_id", workspace.id)
            .eq("integration_key", "email")
            .maybeSingle(),
        ])
      : [{ data: [] }, { data: [] }, { data: null }];

  const leadById = new Map((leads ?? []).map((lead) => [lead.id, lead]));
  const latestPlanByLead = new Map<string, (typeof plans extends Array<infer T> ? T : never)>();

  for (const plan of plans ?? []) {
    if (!latestPlanByLead.has(plan.lead_id)) {
      latestPlanByLead.set(plan.lead_id, plan as never);
    }
  }

  return (
    <AppShell active="Nurture">
      <header className="page-header">
        <div>
          <p className="eyebrow">LIFECYCLE INTELLIGENCE</p>
          <h1>Nurture</h1>
          <p className="muted">
            Create inquiry-specific follow-up plans for viable leads without
            allowing Genesis to send messages autonomously.
          </p>
        </div>
        <span className="status-pill">
          Email {emailIntegration?.status ?? "disconnected"}
        </span>
      </header>

      {params.created ? (
        <div className="notice success">
          Nurture drafted a follow-up plan and routed it to the approval queue.
        </div>
      ) : null}

      {params.error ? <div className="notice error">{params.error}</div> : null}

      <section className="content-grid">
        <article className="panel">
          <p className="eyebrow">ELIGIBLE LEADS</p>
          <h2>Choose a prospect</h2>
          <p className="muted small-copy">
            BILDEN website inquiries may be followed up about their submitted
            project. Other leads remain permission-unverified until a valid
            communication basis is recorded.
          </p>

          <div className="nurture-lead-list">
            {leads?.length ? (
              leads.map((lead) => {
                const intent = lead.project_intent as {
                  description?: string;
                  budget_range?: string;
                  timing?: string;
                  project_type?: string;
                };
                const existing = latestPlanByLead.get(lead.id);

                return (
                  <article className="nurture-lead-card" key={lead.id}>
                    <div className="panel-heading">
                      <div>
                        <strong>
                          {lead.first_name} {lead.last_name}
                        </strong>
                        <p className="muted">{lead.email}</p>
                      </div>
                      <span className="table-status">{lead.status}</span>
                    </div>

                    <p className="nurture-summary">
                      {intent?.description ||
                        intent?.project_type ||
                        "Project details are limited."}
                    </p>

                    <div className="inline-badges">
                      <span className="soft-tag">
                        Score {Math.round(Number(lead.score ?? 0))}
                      </span>
                      <span className="soft-tag">
                        {lead.source.replaceAll("_", " ")}
                      </span>
                      {intent?.budget_range ? (
                        <span className="soft-tag">{intent.budget_range}</span>
                      ) : null}
                    </div>

                    <form action={generateNurturePlan}>
                      <input name="leadId" type="hidden" value={lead.id} />
                      <button
                        className="secondary-button full-width"
                        type="submit"
                      >
                        {existing ? "Draft revised plan" : "Draft nurture plan"}
                      </button>
                    </form>
                  </article>
                );
              })
            ) : (
              <div className="placeholder">
                No leads are currently eligible for nurture planning.
              </div>
            )}
          </div>
        </article>

        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">NURTURE PLANS</p>
              <h2>Lifecycle review</h2>
            </div>
            <span className="muted">{plans?.length ?? 0} recent plans</span>
          </div>

          {plans?.length ? (
            <div className="nurture-plan-list">
              {plans.map((plan) => {
                const lead = leadById.get(plan.lead_id);
                const steps = sequence(plan.sequence);
                const exitCriteria = strings(plan.exit_criteria);
                const metadata = (plan.metadata ?? {}) as PlanMetadata;

                return (
                  <article className="brief-card" key={plan.id}>
                    <div className="panel-heading">
                      <div>
                        <div className="inline-badges">
                          <span className="table-status">{plan.status}</span>
                          <span className="table-status">
                            {plan.permission_basis.replaceAll("_", " ")}
                          </span>
                        </div>
                        <h2>
                          {lead
                            ? `${lead.first_name} ${lead.last_name}`
                            : "Lead unavailable"}
                        </h2>
                        <p className="muted">
                          {metadata.execution_status?.replaceAll("_", " ") ??
                            "review required"}
                        </p>
                      </div>
                    </div>

                    <div className="campaign-section">
                      <span>Readiness assessment</span>
                      <p>{plan.readiness_assessment}</p>
                    </div>

                    <div className="campaign-section">
                      <span>Strategy</span>
                      <p>{plan.strategy}</p>
                    </div>

                    <div className="nurture-sequence">
                      {steps.map((step, index) => (
                        <div className="nurture-step" key={index}>
                          <div className="nurture-step-marker">
                            Day {step.dayOffset ?? 0}
                          </div>
                          <div>
                            <strong>{step.subject || step.purpose}</strong>
                            <span>
                              {step.channel ?? "email"} · {step.purpose}
                            </span>
                            <p>{step.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {exitCriteria.length ? (
                      <div className="campaign-section">
                        <span>Exit criteria</span>
                        <div className="tag-cloud">
                          {exitCriteria.map((item) => (
                            <span className="soft-tag" key={item}>
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="notice">
                      Actual delivery allowed:{" "}
                      <strong>
                        {metadata.actual_delivery_allowed ? "yes" : "no"}
                      </strong>
                      . Approval reviews the plan only; it does not authorize
                      automatic sending.
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="placeholder">
              No nurture plans yet. Choose a viable lead and ask Genesis to
              draft the first plan.
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
