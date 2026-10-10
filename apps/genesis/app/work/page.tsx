import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

const activeStatuses = ["queued", "ready", "running", "blocked", "awaiting_approval"];

function titleCase(value: string) {
  return value.replaceAll("_", " ");
}

export default async function WorkPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  if (!workspace) return null;

  const [
    { data: tasks },
    { data: plans },
    { data: personas },
  ] = await Promise.all([
    supabase
      .from("genesis_tasks")
      .select("id,title,description,task_type,status,priority,progress,primary_agent_id,requires_approval,due_at,created_at")
      .eq("workspace_id", workspace.id)
      .in("status", activeStatuses)
      .order("priority")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("genesis_plans")
      .select("id,title,summary,status,objective_id,created_at,due_at")
      .eq("workspace_id", workspace.id)
      .in("status", ["proposed", "approved", "active", "paused"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("genesis_agent_personas")
      .select("agent_id,display_name,title")
      .eq("workspace_id", workspace.id)
      .eq("status", "active"),
  ]);

  const personaByAgent = new Map(
    (personas ?? []).map((persona) => [persona.agent_id, persona])
  );

  const running = (tasks ?? []).filter((task) => task.status === "running").length;
  const awaiting = (tasks ?? []).filter(
    (task) => task.status === "awaiting_approval"
  ).length;

  return (
    <AppShell active="Work">
      <header className="page-header">
        <div>
          <p className="eyebrow">AI WORK OPERATING SYSTEM</p>
          <h1>Work</h1>
          <p className="muted">
            Every visible assignment in Genesis maps to a real task, owner,
            dependency, approval boundary, and outcome record.
          </p>
        </div>
        <span className="status-pill">{tasks?.length ?? 0} active tasks</span>
      </header>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Running now</span>
          <strong>{running}</strong>
          <small>Agents actively executing work</small>
        </article>
        <article className="metric-card">
          <span>Ready / queued</span>
          <strong>
            {(tasks ?? []).filter((task) =>
              ["ready", "queued"].includes(task.status)
            ).length}
          </strong>
          <small>Work available for execution</small>
        </article>
        <article className="metric-card">
          <span>Awaiting approval</span>
          <strong>{awaiting}</strong>
          <small>Human decision boundary reached</small>
        </article>
        <article className="metric-card">
          <span>Open plans</span>
          <strong>{plans?.length ?? 0}</strong>
          <small>Objectives being coordinated</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LIVE QUEUE</p>
              <h2>Agent work</h2>
            </div>
          </div>

          <div className="work-queue">
            {tasks?.length ? (
              tasks.map((task) => {
                const persona = task.primary_agent_id
                  ? personaByAgent.get(task.primary_agent_id)
                  : undefined;

                return (
                  <div className="work-item" key={task.id}>
                    <div className="work-item-top">
                      <div>
                        <strong>{task.title}</strong>
                        <span>
                          {persona?.display_name ?? "Unassigned"} ·{" "}
                          {titleCase(task.task_type)}
                        </span>
                      </div>
                      <span className={`work-status ${task.status}`}>
                        {titleCase(task.status)}
                      </span>
                    </div>
                    <p>{task.description}</p>
                    <div className="work-progress">
                      <div
                        style={{
                          width: `${Math.max(
                            3,
                            Math.min(100, Number(task.progress ?? 0))
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="work-meta">
                      <span>Priority {task.priority}</span>
                      <span>
                        {task.requires_approval
                          ? "Approval required"
                          : "Within current authority"}
                      </span>
                      {task.due_at ? (
                        <span>
                          Due {new Date(task.due_at).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="placeholder">
                No active work yet. Assign an objective from the Command Center.
              </div>
            )}
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">ACTIVE PLANS</p>
          <h2>Director coordination</h2>
          <div className="plan-list">
            {plans?.length ? (
              plans.map((plan) => (
                <div className="plan-row" key={plan.id}>
                  <span className="table-status">{plan.status}</span>
                  <strong>{plan.title}</strong>
                  <p>{plan.summary}</p>
                </div>
              ))
            ) : (
              <p className="muted">No open plans.</p>
            )}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
