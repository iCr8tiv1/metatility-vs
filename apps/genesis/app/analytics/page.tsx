import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

type RecentEvent = {
  id: string;
  event_type: string;
  source_system: string;
  entity_type: string;
  created_at: string;
};

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (!workspace) {
    return (
      <AppShell active="Analytics">
        <div className="empty-state">
          <h1>Genesis workspace unavailable</h1>
        </div>
      </AppShell>
    );
  }

  const [
    { count: leads },
    { count: qualified },
    { count: nurture },
    { count: disqualified },
    { count: opportunities },
    { count: briefs },
    { count: audiences },
    { count: campaigns },
    { count: assets },
    { count: pendingApprovals },
    { count: nurturePlans },
    { count: approvedNurturePlans },
    { count: completedRuns },
    { count: failedRuns },
    { count: integrations },
    { count: connectedIntegrations },
    { data: recentEvents },
  ] = await Promise.all([
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "qualified"),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "nurture"),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "disqualified"),
    supabase
      .from("genesis_opportunities")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_market_briefs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_audiences")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_campaign_assets")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_approvals")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "pending"),
    supabase
      .from("genesis_nurture_plans")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_nurture_plans")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "approved"),
    supabase
      .from("genesis_agent_runs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "completed"),
    supabase
      .from("genesis_agent_runs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "failed"),
    supabase
      .from("genesis_integrations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_integrations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "connected"),
    supabase
      .from("genesis_events")
      .select("id,event_type,source_system,entity_type,created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const leadCount = leads ?? 0;
  const qualifiedCount = qualified ?? 0;
  const opportunityCount = opportunities ?? 0;
  const runCount = (completedRuns ?? 0) + (failedRuns ?? 0);
  const connectorCount = integrations ?? 0;
  const liveConnectorCount = connectedIntegrations ?? 0;

  return (
    <AppShell active="Analytics">
      <header className="page-header">
        <div>
          <p className="eyebrow">INTERNAL TELEMETRY</p>
          <h1>Analytics</h1>
          <p className="muted">
            Measure what Genesis can prove from its own event history. External
            traffic, spend, search, and downstream revenue remain unavailable
            until their connectors are live.
          </p>
        </div>
        <span className="status-pill">
          {liveConnectorCount}/{connectorCount} external feeds
        </span>
      </header>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Lead qualification</span>
          <strong>{percent(qualifiedCount, leadCount)}%</strong>
          <small>{qualifiedCount} qualified of {leadCount} leads</small>
        </article>
        <article className="metric-card">
          <span>Opportunity conversion</span>
          <strong>{percent(opportunityCount, qualifiedCount)}%</strong>
          <small>{opportunityCount} opportunities from qualified leads</small>
        </article>
        <article className="metric-card">
          <span>Agent reliability</span>
          <strong>{percent(completedRuns ?? 0, runCount)}%</strong>
          <small>{completedRuns ?? 0} completed · {failedRuns ?? 0} failed</small>
        </article>
        <article className="metric-card">
          <span>External evidence coverage</span>
          <strong>{percent(liveConnectorCount, connectorCount)}%</strong>
          <small>{liveConnectorCount} connected of {connectorCount} registered</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">GENESIS FUNNEL</p>
              <h2>Current operating state</h2>
            </div>
          </div>

          <div className="analytics-funnel">
            <div>
              <span>Market briefs</span>
              <strong>{briefs ?? 0}</strong>
            </div>
            <div>
              <span>Audiences</span>
              <strong>{audiences ?? 0}</strong>
            </div>
            <div>
              <span>Campaigns</span>
              <strong>{campaigns ?? 0}</strong>
            </div>
            <div>
              <span>Assets</span>
              <strong>{assets ?? 0}</strong>
            </div>
            <div>
              <span>Leads</span>
              <strong>{leadCount}</strong>
            </div>
            <div>
              <span>Nurture plans</span>
              <strong>{nurturePlans ?? 0}</strong>
            </div>
            <div>
              <span>Qualified</span>
              <strong>{qualifiedCount}</strong>
            </div>
            <div>
              <span>Opportunities</span>
              <strong>{opportunityCount}</strong>
            </div>
          </div>

          <div className="funnel-secondary">
            <span>Nurture: {nurture ?? 0}</span>
            <span>Disqualified: {disqualified ?? 0}</span>
            <span>Pending approvals: {pendingApprovals ?? 0}</span>
            <span>Approved nurture plans: {approvedNurturePlans ?? 0}</span>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">MEASUREMENT BOUNDARY</p>
          <h2>What Genesis cannot prove yet</h2>
          <ul className="compact-list analytics-gaps">
            <li>Website traffic and form conversion by source</li>
            <li>Observed search-query demand and organic visibility</li>
            <li>Paid-media spend, clicks, and platform conversions</li>
            <li>Email delivery, replies, and nurture engagement</li>
            <li>Bilden won/lost outcomes, revenue, and gross profit</li>
          </ul>
        </article>

        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EVENT STREAM</p>
              <h2>Recent Genesis activity</h2>
            </div>
            <span className="muted">
              {(recentEvents as RecentEvent[] | null)?.length ?? 0} events
            </span>
          </div>

          {(recentEvents as RecentEvent[] | null)?.length ? (
            <div className="event-list">
              {(recentEvents as RecentEvent[]).map((event) => (
                <div className="event-row" key={event.id}>
                  <div>
                    <strong>{event.event_type.replaceAll("_", " ")}</strong>
                    <span>
                      {event.entity_type} · {event.source_system}
                    </span>
                  </div>
                  <time>{new Date(event.created_at).toLocaleString()}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="placeholder">
              No Genesis events have been recorded yet.
            </div>
          )}
        </article>

        <article className="panel">
          <p className="eyebrow">NEXT MEASUREMENT STEP</p>
          <h2>Connect Web Forms + Analytics</h2>
          <p className="muted">
            Those two feeds turn the current internal telemetry into a real
            acquisition funnel: source → visit → lead → qualification →
            opportunity.
          </p>
        </article>
      </section>
    </AppShell>
  );
}
