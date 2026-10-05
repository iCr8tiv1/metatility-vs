import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

const nav = [
  "Command Center",
  "Agents",
  "Campaigns",
  "Leads",
  "Audiences",
  "Content",
  "Intelligence",
  "Analytics",
  "Knowledge",
  "Integrations",
];

export default async function CommandCenter() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id,name,parent_organization,settings")
    .eq("slug", "genesis")
    .single();

  if (!workspace) {
    return (
      <main className="empty-state">
        <h1>Genesis workspace not found</h1>
        <p>The application is connected, but the workspace seed is missing.</p>
      </main>
    );
  }

  const [
    { data: agents },
    { data: objectives },
    { data: recommendations },
    { count: leadCount },
    { count: opportunityCount },
    { count: approvalCount },
  ] = await Promise.all([
    supabase
      .from("genesis_agents")
      .select("id,name,role,status,autonomy_level")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("genesis_objectives")
      .select("id,title,status,objective")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("genesis_recommendations")
      .select("id,title,summary,priority,status")
      .eq("workspace_id", workspace.id)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .limit(3),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_opportunities")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_approvals")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "pending"),
  ]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-row">
            <div className="brand-mark compact">G</div>
            <div>
              <strong>Genesis</strong>
              <span>by Metatility</span>
            </div>
          </div>

          <nav>
            {nav.map((item, index) => (
              <button
                className={index === 0 ? "nav-item active" : "nav-item"}
                key={item}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        <form action={signOut}>
          <button className="nav-item" type="submit">
            Sign out
          </button>
        </form>
      </aside>

      <main className="main-panel">
        <header className="page-header">
          <div>
            <p className="eyebrow">AI MARKETING OPERATING SYSTEM</p>
            <h1>Command Center</h1>
            <p className="muted">
              Genesis coordinates demand generation, qualification, and
              closed-loop marketing intelligence.
            </p>
          </div>
          <div className="status-pill">System online</div>
        </header>

        <section className="metric-grid">
          <article className="metric-card">
            <span>Active agents</span>
            <strong>{agents?.filter((a) => a.status === "active").length ?? 0}</strong>
            <small>Genesis agent fleet</small>
          </article>
          <article className="metric-card">
            <span>Leads</span>
            <strong>{leadCount ?? 0}</strong>
            <small>Marketing prospects captured</small>
          </article>
          <article className="metric-card">
            <span>Opportunities</span>
            <strong>{opportunityCount ?? 0}</strong>
            <small>Ready for downstream handoff</small>
          </article>
          <article className="metric-card">
            <span>Approvals</span>
            <strong>{approvalCount ?? 0}</strong>
            <small>Human decisions waiting</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel span-two">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">AGENT FLEET</p>
                <h2>Genesis team</h2>
              </div>
              <span className="muted">{agents?.length ?? 0} configured</span>
            </div>
            <div className="agent-list">
              {agents?.map((agent) => (
                <div className="agent-row" key={agent.id}>
                  <div className="agent-avatar">{agent.name.slice(0, 1)}</div>
                  <div className="agent-copy">
                    <strong>{agent.name}</strong>
                    <span>{agent.role.replaceAll("_", " ")}</span>
                  </div>
                  <div className="agent-meta">
                    <span className="status-dot" />
                    {agent.status}
                    <small>L{agent.autonomy_level}</small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <p className="eyebrow">CURRENT OBJECTIVE</p>
            {objectives?.[0] ? (
              <>
                <h2>{objectives[0].title}</h2>
                <p className="muted">{objectives[0].objective}</p>
                <div className="objective-status">{objectives[0].status}</div>
              </>
            ) : (
              <p className="muted">No active objective.</p>
            )}
          </article>

          <article className="panel span-two">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">RECOMMENDATIONS</p>
                <h2>What Genesis recommends next</h2>
              </div>
            </div>
            {recommendations?.length ? (
              <div className="recommendation-list">
                {recommendations.map((recommendation) => (
                  <div className="recommendation" key={recommendation.id}>
                    <div>
                      <strong>{recommendation.title}</strong>
                      <p>{recommendation.summary}</p>
                    </div>
                    <span>P{recommendation.priority}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="placeholder">
                Genesis is collecting the baseline data needed to produce its
                first recommendation.
              </div>
            )}
          </article>

          <article className="panel">
            <p className="eyebrow">FIRST CUSTOMER</p>
            <h2>Bilden</h2>
            <p className="muted">
              Integration target: qualified opportunity handoff followed by
              estimate, contract, project, revenue, and profitability feedback.
            </p>
            <div className="integration-state">Bridge staged</div>
          </article>
        </section>
      </main>
    </div>
  );
}
