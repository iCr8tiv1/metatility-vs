import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { setAgentStatus } from "@/app/actions/control-plane";
import { createClient } from "@/lib/supabase/server";
import { getFoundationWorkspace } from "@/lib/genesis/workspace";
import { SubmitButton } from "@/app/work/_components/submit-button";

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
    ? [...new Set(value.filter((item): item is string => typeof item === "string"))]
    : [];
}

function AgentsLoadError({ message }: { message: string }) {
  return <AppShell active="Agents">
    <header className="page-header"><div><p className="eyebrow">AGENT GOVERNANCE</p><h1>Agents</h1></div></header>
    <div className="notice error" role="alert">{message} <a href="/agents">Reload Agents</a></div>
  </AppShell>;
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (claimsError || !ownerId) redirect("/login");

  const { workspace, error: workspaceError } = await getFoundationWorkspace(supabase, ownerId);
  if (workspaceError || !workspace) return <AgentsLoadError message="Your selected workspace could not be loaded." />;

  const { data: agents, error: agentsError } = await supabase
        .from("genesis_agents")
        .select(
          "id,agent_key,name,role,mission,status,autonomy_level,tools,kpis,created_at,updated_at"
        )
        .eq("workspace_id", workspace.id)
        .eq("owner_id", ownerId)
        .order("name");
  if (agentsError) return <AgentsLoadError message="Agent records are unavailable. Refresh before changing an agent’s status." />;

  const agentIds = (agents ?? []).map((agent) => agent.id);

  const runResults = await Promise.all(agentIds.map((agentId) => supabase
        .from("genesis_agent_runs")
        .select(
          "id,agent_id,status,provider,model,started_at,completed_at,created_at"
        )
        .eq("workspace_id", workspace.id)
        .eq("owner_id", ownerId)
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle()));
  if (runResults.some((result) => result.error)) return <AgentsLoadError message="Recent agent execution records could not be loaded reliably." />;

  const latestRunByAgent = new Map<string, AgentRun>();

  for (const run of runResults.flatMap((result) => result.data ? [result.data] : []) as AgentRun[]) {
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
            Inspect responsibilities and execution in {workspace.name}.
            Pausing blocks new runs. Manage work already running from Work.
          </p>
        </div>
        <span className="status-pill">{agents?.length ?? 0} registered</span>
      </header>

      {params.updated === "active" || params.updated === "paused" ? (
        <div className="notice success" role="status">
          Agent status updated: <strong>{params.updated}</strong>.
        </div>
      ) : null}

      {params.error ? <div className="notice error" role="alert">{params.error}</div> : null}

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
                  <input name="workspaceId" type="hidden" value={workspace.id} />
                  <input name="agentId" type="hidden" value={agent.id} />
                  <input name="expectedStatus" type="hidden" value={agent.status} />
                  <input
                    name="status"
                    type="hidden"
                    value={isActive ? "paused" : "active"}
                  />
                  <SubmitButton
                    className={isActive ? "secondary-button" : "primary-button"}
                    pendingLabel="Saving…"
                    disabled={!["active", "paused"].includes(agent.status)}
                  >
                    {isActive ? "Pause agent" : "Resume agent"}
                  </SubmitButton>
                </form>
              </div>

              <p className="agent-mission">{agent.mission}</p>

              <div className="governance-section">
                <span>Registered tool domains</span>
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
                  <strong>{latestRun?.status === "completed" ? "Output generated" : latestRun?.status ?? "No recorded run"}</strong>
                </div>
                <div>
                  <span>Model / engine</span>
                  <strong>
                    {latestRun ? latestRun.model ?? "Model not recorded" : "No recorded run"}
                  </strong>
                </div>
              </div>
            </article>
          );
        })}
      </section>
      {!agents?.length ? <div className="placeholder">No agents are registered in this workspace. <a href="/foundation">Open Foundation setup</a>.</div> : null}
    </AppShell>
  );
}
