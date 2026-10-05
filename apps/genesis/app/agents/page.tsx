import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { setAgentStatus } from "@/app/actions/control-plane";
import { createClient } from "@/lib/supabase/server";

type AgentRun = {
  id: string;
  agent_id: string;
  status: string;
  provider: string | null;
  model: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
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

  const { data: agents } = workspace
    ? await supabase
        .from("genesis_agents")
        .select(
          "id,agent_key,name,role,mission,status,autonomy_level,tools,kpis,created_at,updated_at"
        )
        .eq("workspace_id", workspace.id)
        .order("name")
    : { data: [] };

  const agentIds = (agents ?? []).map((agent) => agent.id);

  const { data: runs } = agentIds.length
    ? await supabase
        .from("genesis_agent_runs")
        .select(
          "id,agent_id,status,provider,model,started_at,completed_at,created_at"
        )
        .in("agent_id", agentIds)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };

  const latestRunByAgent = new Map<string, AgentRun>();

  for (const run of (runs ?? []) as AgentRun[]) {
    if (!latestRunByAgent.has(run.agent_id)) {
      latestRunByAgent.set(run.agent_id, run);
    }
  }

  return (
    <AppShell active="Agents">
      <header className="page-header">
        <div>
          <p className="eyebrow">AGENT GOVERNANCE</p>
          <h1>Agents</h1>
          <p className="muted">
            Inspect agent responsibilities, autonomy, tools, KPIs, and execution
            state. Pausing an agent now blocks its governed workflows.
          </p>
        </div>
        <span className="status-pill">{agents?.length ?? 0} registered</span>
      </header>

      {params.updated ? (
        <div className="notice success">
          Agent status updated: <strong>{params.updated}</strong>.
        </div>
      ) : null}

      {params.error ? <div className="notice error">{params.error}</div> : null}

      <section className="agent-governance-grid">
        {agents?.map((agent) => {
          const latestRun = latestRunByAgent.get(agent.id);
          const tools = stringList(agent.tools);
          const kpis = stringList(agent.kpis);
          const isActive = agent.status === "active";

          return (
            <article className="panel agent-governance-card" key={agent.id}>
              <div className="panel-heading">
                <div>
                  <div className="inline-badges">
                    <span className="table-status">{agent.status}</span>
                    <span className="table-status">
                      autonomy L{agent.autonomy_level}
                    </span>
                  </div>
                  <h2>{agent.name}</h2>
                  <p className="muted">{agent.role.replaceAll("_", " ")}</p>
                </div>

                <form action={setAgentStatus}>
                  <input name="agentId" type="hidden" value={agent.id} />
                  <input
                    name="status"
                    type="hidden"
                    value={isActive ? "paused" : "active"}
                  />
                  <button
                    className={isActive ? "secondary-button" : "primary-button"}
                    type="submit"
                  >
                    {isActive ? "Pause agent" : "Resume agent"}
                  </button>
                </form>
              </div>

              <p className="agent-mission">{agent.mission}</p>

              <div className="governance-section">
                <span>Permitted tool domains</span>
                <div className="tag-cloud">
                  {tools.length ? (
                    tools.map((tool) => (
                      <span className="soft-tag" key={tool}>
                        {tool.replaceAll("_", " ")}
                      </span>
                    ))
                  ) : (
                    <span className="muted">No tool domains registered.</span>
                  )}
                </div>
              </div>

              <div className="governance-section">
                <span>Primary KPIs</span>
                <div className="tag-cloud">
                  {kpis.length ? (
                    kpis.map((kpi) => (
                      <span className="soft-tag" key={kpi}>
                        {kpi.replaceAll("_", " ")}
                      </span>
                    ))
                  ) : (
                    <span className="muted">No KPIs registered.</span>
                  )}
                </div>
              </div>

              <div className="last-run">
                <div>
                  <span>Latest run</span>
                  <strong>{latestRun?.status ?? "No recorded run"}</strong>
                </div>
                <div>
                  <span>Model / engine</span>
                  <strong>
                    {latestRun?.model ??
                      (agent.agent_key === "lead_intelligence"
                        ? "deterministic qualification"
                        : "Not yet executed")}
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
