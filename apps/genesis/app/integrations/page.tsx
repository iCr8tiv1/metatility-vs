import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

type IntegrationRow = {
  id: string;
  integration_key: string;
  display_name: string;
  status: string;
  capabilities: unknown;
  last_sync_at: string | null;
  updated_at: string;
};

const connectionPlan: Record<
  string,
  { priority: number; purpose: string; unlocks: string }
> = {
  website: {
    priority: 1,
    purpose: "Capture real inbound leads and first-touch attribution.",
    unlocks: "Live lead ingestion and qualification.",
  },
  analytics: {
    priority: 2,
    purpose: "Observe traffic, conversion events, and attribution paths.",
    unlocks: "Evidence-backed funnel and campaign measurement.",
  },
  search_data: {
    priority: 3,
    purpose: "Ground SEO and search hypotheses in observed query data.",
    unlocks: "Evidence-backed search opportunity discovery.",
  },
  email: {
    priority: 4,
    purpose: "Deliver approved nurture and campaign email.",
    unlocks: "Nurture execution and reply-event feedback.",
  },
  bilden: {
    priority: 5,
    purpose: "Push approved opportunities downstream and receive outcomes.",
    unlocks: "Closed-loop revenue and profitability attribution.",
  },
  paid_media: {
    priority: 6,
    purpose: "Execute approved paid campaigns with spend controls.",
    unlocks: "Measured paid acquisition experiments.",
  },
  social: {
    priority: 7,
    purpose: "Publish approved social content and observe engagement.",
    unlocks: "Governed social distribution and attribution.",
  },
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  const { data: integrations } = workspace
    ? await supabase
        .from("genesis_integrations")
        .select(
          "id,integration_key,display_name,status,capabilities,last_sync_at,updated_at"
        )
        .eq("workspace_id", workspace.id)
        .order("display_name")
    : { data: [] };

  const ordered = ([...(integrations ?? [])] as IntegrationRow[]).sort(
    (a, b) =>
      (connectionPlan[a.integration_key]?.priority ?? 999) -
      (connectionPlan[b.integration_key]?.priority ?? 999)
  );

  const connectedCount = ordered.filter(
    (integration) => integration.status === "connected"
  ).length;

  return (
    <AppShell active="Integrations">
      <header className="page-header">
        <div>
          <p className="eyebrow">EXTERNAL SYSTEM BOUNDARY</p>
          <h1>Integrations</h1>
          <p className="muted">
            Genesis can plan internally without connectors, but observed
            evidence and external execution only become available after an
            approved integration is connected.
          </p>
        </div>
        <span className="status-pill">
          {connectedCount}/{ordered.length} connected
        </span>
      </header>

      <div className="notice">
        Genesis does not store API keys, passwords, or provider secrets in these
        records. Credentials should remain in provider-specific secure
        environment configuration.
      </div>

      <section className="integration-grid">
        {ordered.map((integration) => {
          const plan = connectionPlan[integration.integration_key];
          const capabilities = stringList(integration.capabilities);

          return (
            <article className="panel integration-card" key={integration.id}>
              <div className="panel-heading">
                <div>
                  <div className="inline-badges">
                    {plan ? (
                      <span className="table-status">
                        priority {plan.priority}
                      </span>
                    ) : null}
                    <span className="table-status">{integration.status}</span>
                  </div>
                  <h2>{integration.display_name}</h2>
                </div>
                <span
                  className={
                    integration.status === "connected"
                      ? "status-pill"
                      : "risk-pill"
                  }
                >
                  {integration.status === "connected"
                    ? "Live"
                    : "Connector required"}
                </span>
              </div>

              <p className="integration-purpose">
                {plan?.purpose ?? "External capability registered."}
              </p>

              <div className="governance-section">
                <span>Capabilities</span>
                <div className="tag-cloud">
                  {capabilities.map((capability) => (
                    <span className="soft-tag" key={capability}>
                      {capability.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              </div>

              <div className="integration-unlocks">
                <span>When connected</span>
                <strong>
                  {plan?.unlocks ?? "Registered capabilities become available."}
                </strong>
              </div>

              <div className="last-run">
                <div>
                  <span>Last sync</span>
                  <strong>
                    {integration.last_sync_at
                      ? new Date(integration.last_sync_at).toLocaleString()
                      : "Never"}
                  </strong>
                </div>
                <div>
                  <span>Execution state</span>
                  <strong>
                    {integration.status === "connected"
                      ? "Available to governed workflows"
                      : "Blocked"}
                  </strong>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
