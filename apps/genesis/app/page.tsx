import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { runGenesisDirector } from "@/app/actions/director";
import { assignGenesisWork } from "@/app/actions/work";
import { createClient } from "@/lib/supabase/server";

type Persona = {
  agent_id: string;
  display_name: string;
  title: string;
  personality_summary: string;
  visual_identity: unknown;
};

type Agent = {
  id: string;
  agent_key: string;
  status: string;
  autonomy_level: number;
};

type WorkTask = {
  id: string;
  title: string;
  status: string;
  priority: number;
  progress: number | string | null;
  primary_agent_id: string | null;
  task_type: string;
  created_at: string;
};

type AgentRun = {
  id: string;
  agent_id: string;
  status: string;
  created_at: string;
};

const portraitByPersona: Record<string, string> = {
  "Genesis Director": "/agents/director.webp",
  Maya: "/agents/maya.webp",
  Elias: "/agents/elias.webp",
  Nova: "/agents/nova.webp",
  Avery: "/agents/avery.webp",
  Orion: "/agents/orion.webp",
};

const preferredFloorOrder = ["Maya", "Elias", "Nova", "Avery", "Orion"];

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  });
}

function labelForAction(actionType: string) {
  const labels: Record<string, string> = {
    create_bilden_opportunity: "Create downstream opportunity",
    activate_campaign: "Approve campaign plan",
    review_content_package: "Review content package",
    approve_nurture_plan: "Approve nurture plan",
  };

  return labels[actionType] ?? actionType.replaceAll("_", " ");
}

function AgentPod({
  persona,
  agent,
  tasks,
  className = "",
}: {
  persona: Persona;
  agent?: Agent;
  tasks: WorkTask[];
  className?: string;
}) {
  const running = tasks.filter((task) => task.status === "running").length;
  const waiting = tasks.filter((task) =>
    ["queued", "ready", "blocked", "awaiting_approval"].includes(task.status)
  ).length;
  const working = running > 0 || waiting > 0;
  const portrait = portraitByPersona[persona.display_name];

  return (
    <article className={`agent-pod ${className}`}>
      <div className="agent-visual">
        {portrait ? (
          <img
            alt={`${persona.display_name}, ${persona.title}`}
            src={portrait}
          />
        ) : (
          <div className="agent-fallback">{persona.display_name.slice(0, 1)}</div>
        )}
        <div className="agent-halo" />
      </div>

      <div className="agent-pod-glass">
        <div className="agent-pod-heading">
          <div>
            <strong>{persona.display_name}</strong>
            <span>{persona.title}</span>
          </div>
          <span className={working ? "agent-live working" : "agent-live"}>
            <i />
            {working ? "Working" : agent?.status === "active" ? "Available" : "Paused"}
          </span>
        </div>

        <div className="agent-pod-metrics">
          <div>
            <strong>{tasks.length}</strong>
            <span>Active tasks</span>
          </div>
          <div>
            <strong>{running}</strong>
            <span>Running</span>
          </div>
          <div>
            <strong>{agent?.autonomy_level ?? 0}</strong>
            <span>Autonomy</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function CommandCenter({
  searchParams,
}: {
  searchParams: Promise<{ work?: string; director?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id,name")
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

  const activeTaskStatuses = [
    "queued",
    "ready",
    "running",
    "blocked",
    "awaiting_approval",
  ];

  const [
    { data: agents },
    { data: personas },
    { data: tasks },
    { data: approvals },
    { count: qualifiedLeadCount },
    { data: opportunities },
    { data: runs },
    { count: activeCampaignCount },
  ] = await Promise.all([
    supabase
      .from("genesis_agents")
      .select("id,agent_key,status,autonomy_level")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("genesis_agent_personas")
      .select("agent_id,display_name,title,personality_summary,visual_identity")
      .eq("workspace_id", workspace.id)
      .eq("status", "active"),
    supabase
      .from("genesis_tasks")
      .select("id,title,status,priority,progress,primary_agent_id,task_type,created_at")
      .eq("workspace_id", workspace.id)
      .in("status", activeTaskStatuses)
      .order("priority")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("genesis_approvals")
      .select("id,agent_id,action_type,risk_level,requested_at,payload")
      .eq("workspace_id", workspace.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(7),
    supabase
      .from("genesis_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "qualified"),
    supabase
      .from("genesis_opportunities")
      .select("estimated_value,status")
      .eq("workspace_id", workspace.id),
    supabase
      .from("genesis_agent_runs")
      .select("id,agent_id,status,created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("genesis_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .in("status", ["approved", "active"]),
  ]);

  const agentRows = (agents ?? []) as Agent[];
  const personaRows = (personas ?? []) as Persona[];
  const taskRows = (tasks ?? []) as WorkTask[];
  const runRows = (runs ?? []) as AgentRun[];

  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const personaByAgent = new Map(
    personaRows.map((persona) => [persona.agent_id, persona])
  );

  const tasksByAgent = new Map<string, WorkTask[]>();
  for (const task of taskRows) {
    if (!task.primary_agent_id) continue;
    const existing = tasksByAgent.get(task.primary_agent_id) ?? [];
    existing.push(task);
    tasksByAgent.set(task.primary_agent_id, existing);
  }

  const directorPersona = personaRows.find(
    (persona) => persona.display_name === "Genesis Director"
  );
  const directorAgent = directorPersona
    ? agentById.get(directorPersona.agent_id)
    : agentRows.find((agent) => agent.agent_key === "director");

  const floorPersonas = preferredFloorOrder
    .map((name) => personaRows.find((persona) => persona.display_name === name))
    .filter((persona): persona is Persona => Boolean(persona));

  const totalOpportunity = (opportunities ?? []).reduce(
    (sum, opportunity) => sum + Number(opportunity.estimated_value ?? 0),
    0
  );

  const activeAgents = agentRows.filter((agent) => agent.status === "active").length;
  const systemHealth = agentRows.length
    ? Math.round((activeAgents / agentRows.length) * 100)
    : 0;

  return (
    <AppShell active="Command Center">
      <div className="genesis-command-center">
        <header className="cc-topbar">
          <form action={assignGenesisWork} className="genesis-command-bar">
            <span className="command-spark">✦</span>
            <input
              aria-label="Ask Genesis or assign work"
              name="objective"
              placeholder="Ask Genesis or assign work..."
              type="text"
            />
            <span className="command-hint">Objective → Plan → Work</span>
            <button aria-label="Assign work" type="submit">
              →
            </button>
          </form>

          <div className="cc-system-state">
            <span className="system-light" />
            <div>
              <strong>Genesis Core</strong>
              <span>{activeAgents} agents available</span>
            </div>
          </div>
        </header>

        {params.work === "queued" ? (
          <div className="cc-notice success">
            Objective accepted. Genesis Director now owns the coordination task.
          </div>
        ) : null}

        {params.work && params.work !== "queued" ? (
          <div className="cc-notice error">
            Genesis could not create the work package: {params.work.replaceAll("-", " ")}.
          </div>
        ) : null}

        <section className="cc-kpis">
          <article>
            <span>Needs Your Decision</span>
            <strong>{approvals?.length ?? 0}</strong>
            <small>Human approval boundaries</small>
          </article>
          <article>
            <span>Active Work</span>
            <strong>{taskRows.length}</strong>
            <small>{taskRows.filter((task) => task.status === "running").length} running now</small>
          </article>
          <article>
            <span>Qualified Leads</span>
            <strong>{qualifiedLeadCount ?? 0}</strong>
            <small>Sales-ready commercial signals</small>
          </article>
          <article>
            <span>Commercial Opportunity</span>
            <strong>{formatMoney(totalOpportunity)}</strong>
            <small>Current opportunity value</small>
          </article>
          <article>
            <span>System Health</span>
            <strong>{systemHealth}%</strong>
            <small>{activeAgents}/{agentRows.length} agents active</small>
          </article>
        </section>

        <div className="command-center-layout">
          <section className="workforce-space">
            <div className="workforce-space-head">
              <div>
                <p className="cc-eyebrow">AI WORKFORCE · LIVE</p>
                <h1>Your commercial intelligence organization</h1>
              </div>
              <div className="workforce-head-actions">
                <Link href="/agents">Manage agents</Link>
                <Link href="/work">Open work queue</Link>
              </div>
            </div>

            <div className="agent-floor">
              <div className="lab-orbit orbit-one" />
              <div className="lab-orbit orbit-two" />
              <div className="lab-grid" />

              {floorPersonas.map((persona) => {
                const agent = agentById.get(persona.agent_id);
                return (
                  <AgentPod
                    agent={agent}
                    className={`pod-${persona.display_name.toLowerCase()}`}
                    key={persona.agent_id}
                    persona={persona}
                    tasks={tasksByAgent.get(persona.agent_id) ?? []}
                  />
                );
              })}

              {directorPersona ? (
                <article className="director-pod">
                  <div className="director-portrait">
                    <img
                      alt="Genesis Director, AI Workforce Director"
                      src={portraitByPersona["Genesis Director"]}
                    />
                    <span className="director-orbit" />
                  </div>
                  <div className="director-glass">
                    <p className="cc-eyebrow">ORCHESTRATION</p>
                    <h2>Genesis Director</h2>
                    <p>
                      Coordinates objectives, delegates work, and escalates
                      consequential decisions.
                    </p>
                    <div className="director-stats">
                      <div>
                        <strong>{activeAgents}</strong>
                        <span>Active agents</span>
                      </div>
                      <div>
                        <strong>{taskRows.length}</strong>
                        <span>Tasks in progress</span>
                      </div>
                      <div>
                        <strong>{approvals?.length ?? 0}</strong>
                        <span>Awaiting decision</span>
                      </div>
                    </div>
                    <form action={runGenesisDirector}>
                      <button className="director-run-button" type="submit">
                        Orchestrate current objective
                      </button>
                    </form>
                  </div>
                </article>
              ) : null}
            </div>

            <section className="active-work-strip">
              <div className="active-work-heading">
                <div>
                  <p className="cc-eyebrow">ACTIVE WORK</p>
                  <h2>What Genesis is doing</h2>
                </div>
                <Link href="/work">View all work →</Link>
              </div>
              <div className="active-work-grid">
                {taskRows.length ? (
                  taskRows.slice(0, 4).map((task) => {
                    const persona = task.primary_agent_id
                      ? personaByAgent.get(task.primary_agent_id)
                      : undefined;
                    return (
                      <article key={task.id}>
                        <div className="work-agent-chip">
                          <span>{persona?.display_name.slice(0, 1) ?? "G"}</span>
                          {persona?.display_name ?? "Genesis"}
                        </div>
                        <strong>{task.title}</strong>
                        <p>{task.task_type.replaceAll("_", " ")}</p>
                        <div className="mini-progress">
                          <span
                            style={{
                              width: `${Math.max(
                                task.status === "running" ? 16 : 5,
                                Math.min(100, Number(task.progress ?? 0))
                              )}%`,
                            }}
                          />
                        </div>
                        <small>{task.status.replaceAll("_", " ")}</small>
                      </article>
                    );
                  })
                ) : (
                  <div className="cc-empty-work">
                    Assign Genesis an objective above. The Director will create
                    a governed work package here.
                  </div>
                )}
              </div>
            </section>
          </section>

          <aside className="decision-rail">
            <section className="rail-section">
              <div className="rail-heading">
                <div>
                  <p className="cc-eyebrow">YOUR DECISIONS</p>
                  <h2>{approvals?.length ?? 0} waiting</h2>
                </div>
                <Link href="/approvals">View all</Link>
              </div>

              <div className="decision-list">
                {approvals?.length ? (
                  approvals.slice(0, 4).map((approval) => {
                    const persona = approval.agent_id
                      ? personaByAgent.get(approval.agent_id)
                      : undefined;

                    return (
                      <article className="decision-card" key={approval.id}>
                        <div className="decision-card-top">
                          <span className="decision-icon">◇</span>
                          <div>
                            <strong>{labelForAction(approval.action_type)}</strong>
                            <span>
                              {persona?.display_name ?? "Genesis"} ·{" "}
                              {approval.risk_level} risk
                            </span>
                          </div>
                        </div>
                        <Link href="/approvals">Review decision</Link>
                      </article>
                    );
                  })
                ) : (
                  <div className="rail-empty">
                    No consequential decisions are waiting.
                  </div>
                )}
              </div>
            </section>

            <section className="rail-section">
              <div className="rail-heading">
                <div>
                  <p className="cc-eyebrow">AGENT ACTIVITY</p>
                  <h2>Recent execution</h2>
                </div>
                <Link href="/analytics">View all</Link>
              </div>

              <div className="activity-list">
                {runRows.length ? (
                  runRows.slice(0, 6).map((run) => {
                    const persona = personaByAgent.get(run.agent_id);
                    return (
                      <div className="activity-row" key={run.id}>
                        <span className="activity-dot" />
                        <div>
                          <strong>{persona?.display_name ?? "Genesis agent"}</strong>
                          <span>{run.status.replaceAll("_", " ")}</span>
                        </div>
                        <time>
                          {new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                          }).format(new Date(run.created_at))}
                        </time>
                      </div>
                    );
                  })
                ) : (
                  <div className="rail-empty">No agent runs recorded yet.</div>
                )}
              </div>
            </section>

            <section className="rail-section commercial-state">
              <p className="cc-eyebrow">COMMERCIAL MACHINE</p>
              <h2>{activeCampaignCount ?? 0} governed campaigns</h2>
              <p>
                Genesis measures activity against qualified pipeline and
                downstream commercial outcomes rather than raw lead volume.
              </p>
              <Link href="/campaigns">Open demand engine →</Link>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
