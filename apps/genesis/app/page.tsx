import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { runGenesisDirector } from "@/app/actions/director";
import { randomUUID } from "node:crypto";
import { CommandForm } from "@/app/_components/command-form";
import { getFoundationWorkspace } from "@/lib/genesis/workspace";
import { foundationMessages } from "@/lib/genesis/foundation-contract";

import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

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
  name: string;
  role: string;
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

const floorPositions: Record<string, string> = { lead_intelligence: "maya", market_intelligence: "elias", campaign_planner: "nova", content_seo: "avery", analytics: "orion" };

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
  const working = running > 0;
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
            {working ? "Running" : agent?.status !== "active" ? "Paused" : waiting > 0 ? "Work queued" : "Available"}
          </span>
        </div>

        <div className="agent-pod-metrics">
          <div>
            <strong>{tasks.length}</strong>
            <span>Assignments shown</span>
          </div>
          <div>
            <strong>{running}</strong>
            <span>Running shown</span>
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
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();

  if (authError || !claimsData?.claims?.sub) redirect("/login");

  const { workspace, error: workspaceError } = await getFoundationWorkspace(supabase, claimsData.claims.sub);

  if (workspaceError || !workspace) {
    return (
      <main className="empty-state">
        <h1>Genesis workspace unavailable</h1>
        <p>The workspace could not be loaded. Check its connection and setup before assigning work.</p>
        <Link href="/foundation">Open foundation status</Link>
      </main>
    );
  }

  const activeTaskStatuses = [
    "queued",
    "ready",
    "running",
    "blocked",
    "awaiting_approval",
    "awaiting_review",
  ];

  const [agentResult, personaResult, taskResult, runResult, acceptedResult, failedResult, contractResult, reviewCountResult, runningCountResult] = await Promise.all([
    supabase.from("genesis_agents").select("id,agent_key,name,role,status,autonomy_level").eq("workspace_id", workspace.id).order("name"),
    supabase.from("genesis_agent_personas").select("agent_id,display_name,title,personality_summary,visual_identity").eq("workspace_id", workspace.id).eq("status", "active"),
    supabase.from("genesis_tasks").select("id,title,status,priority,progress,primary_agent_id,task_type,created_at", { count: "exact" })
      .eq("workspace_id", workspace.id).in("status", activeTaskStatuses).order("priority").order("created_at", { ascending: false }).limit(80),
    supabase.from("genesis_agent_runs").select("id,agent_id,status,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("genesis_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "completed").not("accepted_at", "is", null),
    supabase.from("genesis_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "failed"),
    supabase.from("genesis_operating_contracts").select("id,version").eq("workspace_id", workspace.id).eq("contract_key", "genesis-foundation").eq("version", 1).maybeSingle(),
    supabase.from("genesis_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["awaiting_review", "awaiting_approval"]),
    supabase.from("genesis_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "running"),
  ]);
  const dataUnavailable = [agentResult, personaResult, taskResult, runResult, acceptedResult, failedResult, contractResult, reviewCountResult, runningCountResult].some((result) => result.error);
  const agents = agentResult.data;
  const personas = personaResult.data;
  const tasks = taskResult.data;
  const runs = runResult.data;

  const agentRows = (agents ?? []) as Agent[];
  const registeredPersonas = (personas ?? []) as Persona[];
  const personaRows: Persona[] = agentRows.map((agent) => registeredPersonas.find((persona) => persona.agent_id === agent.id) ?? { agent_id: agent.id, display_name: agent.name, title: agent.role.replaceAll("_", " "), personality_summary: "", visual_identity: {} });
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
    (persona) => agentById.get(persona.agent_id)?.agent_key === "director"
  );
  const directorAgent = directorPersona
    ? agentById.get(directorPersona.agent_id)
    : agentRows.find((agent) => agent.agent_key === "director");

  const floorPersonas = Object.keys(floorPositions)
    .map((key) => personaRows.find((persona) => agentById.get(persona.agent_id)?.agent_key === key))
    .filter((persona): persona is Persona => Boolean(persona));

  const activeAgents = agentRows.filter((agent) => agent.status === "active").length;
  const reviewTasks = taskRows.filter((task) => task.status === "awaiting_review" || task.status === "awaiting_approval");
  const directorTask = taskRows.find((task) => task.primary_agent_id === directorAgent?.id && ["queued", "ready"].includes(task.status));
  const { data: directorReadiness } = directorTask ? await supabase.rpc("genesis_workforce_readiness", { p_workspace_id: workspace.id, p_task_ids: [directorTask.id] }) : { data: null };
  const directorCanRun = Array.isArray(directorReadiness) && directorReadiness[0]?.can_run === true;
  const displayCount = (value: number | null | undefined) => dataUnavailable ? "Unavailable" : value ?? 0;

  return (
    <AppShell active="Command Center">
      <div className="genesis-command-center">
        <header className="cc-topbar">
          <CommandForm requestId={randomUUID()} workspaceId={workspace.id} />

          <div className="cc-system-state">
            <span className="system-light" />
            <div>
              <strong>Genesis Core</strong>
              <span>{dataUnavailable ? "Connection needs attention" : `${activeAgents} agents configured`}</span>
            </div>
          </div>
        </header>

        {params.work ? <div className="cc-notice error">{foundationMessages[params.work] ?? "Check the work queue for the current result."}</div> : null}
        {dataUnavailable ? <div className="cc-notice error" role="alert">Some foundation records could not be loaded. <Link href="/foundation">Check foundation status</Link> before running work.</div> : null}
        <section className="cc-kpis">
          <article><span>Needs Your Review</span><strong>{displayCount(reviewCountResult.count)}</strong><small>Plans and outputs awaiting a decision</small></article>
          <article><span>Active Work</span><strong>{displayCount(taskResult.count)}</strong><small>{displayCount(runningCountResult.count)} runs in progress</small></article>
          <article><span>Accepted Outputs</span><strong>{displayCount(acceptedResult.count)}</strong><small>Explicitly accepted by an operator</small></article>
          <article><span>Needs Recovery</span><strong>{displayCount(failedResult.count)}</strong><small>Failed work retained for inspection</small></article>
          <article><span>Operating Contract</span><strong>{dataUnavailable ? "Check setup" : contractResult.data ? "BSPP v1" : "Not initialized"}</strong><small>Internal work · review required</small></article>
        </section>

        <div className="command-center-layout">
          <section className="workforce-space">
            <div className="workforce-space-head">
              <div>
                <p className="cc-eyebrow">GENESIS FOUNDATION</p>
                <h1>A dependable foundation for your work</h1>
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
                    className={`pod-${floorPositions[agent?.agent_key ?? ""]}`}
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
                        <strong>{displayCount(taskResult.count)}</strong>
                        <span>Open assignments</span>
                      </div>
                      <div>
                        <strong>{displayCount(reviewCountResult.count)}</strong>
                        <span>Awaiting decision</span>
                      </div>
                    </div>
                    <form action={runGenesisDirector}>
                      <input type="hidden" name="taskId" value={directorTask?.id ?? ""} />
                      <button className="director-run-button" type="submit" disabled={!directorCanRun || dataUnavailable}>
                        Propose next work plan
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
                        {task.status === "running" ? <progress aria-label="Execution in progress" /> : null}
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
                  <h2>{displayCount(reviewCountResult.count)} waiting</h2>
                </div>
                <Link href="/work?view=review">View all</Link>
              </div>

              <div className="decision-list">
                {reviewTasks.length ? reviewTasks.slice(0, 4).map((task) => (
                  <article className="decision-card" key={task.id}>
                    <div className="decision-card-top"><span className="decision-icon" aria-hidden="true">◇</span><div><strong>{task.title}</strong><span>{task.status === "awaiting_review" ? "Generated output ready for review" : "Execution authorization needed"}</span></div></div>
                    <Link href={`/work?view=review&task=${task.id}#task-${task.id}`}>Review work</Link>
                  </article>
                )) : <div className="rail-empty">{dataUnavailable ? "Review status unavailable." : "No work is waiting for your review."}</div>}
              </div>

            </section>

            <section className="rail-section">
              <div className="rail-heading">
                <div>
                  <p className="cc-eyebrow">AGENT ACTIVITY</p>
                  <h2>Recent execution</h2>
                </div>
                <Link href="/work?view=history">View all</Link>
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
                          <span>{run.status === "completed" ? "Generation finished · see work review" : run.status.replaceAll("_", " ")}</span>
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
              <p className="cc-eyebrow">FOUNDATION FIRST</p>
              <h2>Reliable work, visible evidence</h2>
              <p>Each assignment has a bounded contract, saved run, explicit review, and a recovery path. Business pilots follow foundation verification.</p>
              <Link href="/foundation">Inspect foundation status →</Link>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
