import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import {
  retryFailedWorkforceTask,
  runNextWorkforceTask,
} from "@/app/actions/workforce";
import { createClient } from "@/lib/supabase/server";

const activeStatuses = ["queued", "ready", "running", "blocked", "awaiting_approval"];

function titleCase(value: string) {
  return value.replaceAll("_", " ");
}

function runtimeMessage(value?: string) {
  const messages: Record<string, string> = {
    completed: "One specialist task completed and its result was persisted.",
    "no-ready-work": "No ready specialist work is waiting.",
    "workspace-error": "Genesis workspace is unavailable.",
    "agent-unavailable": "The assigned agent is paused or unavailable.",
    "claim-conflict": "Another runtime claimed that task first. Refresh and continue.",
    "run-create-error": "Genesis could not create the agent run.",
    "execution-error": "The specialist task failed. The failure was recorded for review.",
    requeued: "The failed task was returned to the ready queue.",
    "retry-invalid": "Genesis could not identify the task to retry.",
    "retry-unavailable": "That failed task is no longer available for retry.",
  };

  return value ? messages[value] ?? value.replaceAll("-", " ") : "";
}

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ runtime?: string; task?: string }>;
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

  if (!workspace) return null;

  const [
    { data: tasks },
    { data: plans },
    { data: personas },
    { data: completedTasks },
    { data: failedTasks },
  ] = await Promise.all([
    supabase
      .from("genesis_tasks")
      .select(
        "id,title,description,task_type,status,priority,progress,primary_agent_id,requires_approval,due_at,created_at",
      )
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
    supabase
      .from("genesis_tasks")
      .select(
        "id,title,task_type,status,primary_agent_id,output,completed_at,created_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(8),
    supabase
      .from("genesis_tasks")
      .select(
        "id,title,task_type,primary_agent_id,last_error,completed_at,created_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("status", "failed")
      .order("completed_at", { ascending: false })
      .limit(8),
  ]);

  const personaByAgent = new Map(
    (personas ?? []).map((persona) => [persona.agent_id, persona]),
  );

  const running = (tasks ?? []).filter((task) => task.status === "running").length;
  const ready = (tasks ?? []).filter((task) =>
    ["ready", "queued"].includes(task.status),
  ).length;
  const awaiting = (tasks ?? []).filter(
    (task) => task.status === "awaiting_approval",
  ).length;

  return (
    <AppShell active="Work">
      <header className="page-header">
        <div>
          <p className="eyebrow">AI WORK OPERATING SYSTEM</p>
          <h1>Work</h1>
          <p className="muted">
            Every visible assignment in Genesis maps to a real task, owner,
            execution record, memory trail, and business outcome path.
          </p>
        </div>
        <span className="status-pill">{tasks?.length ?? 0} active tasks</span>
      </header>

      {params.runtime ? (
        <div
          className={
            params.runtime === "completed" || params.runtime === "requeued"
              ? "notice success"
              : params.runtime === "no-ready-work"
                ? "notice"
                : "notice error"
          }
        >
          {runtimeMessage(params.runtime)}
        </div>
      ) : null}

      <section className="runtime-control panel">
        <div>
          <p className="eyebrow">WORKFORCE RUNTIME · V0.2</p>
          <h2>Execute governed specialist work</h2>
          <p className="muted">
            Genesis claims the highest-priority ready task, runs the assigned
            specialist inside its current authority, records the agent run,
            persists deliverables and memory, and emits a completion event.
            External actions remain blocked.
          </p>
        </div>
        <form action={runNextWorkforceTask}>
          <button
            className="primary-button"
            disabled={ready === 0 || running > 0}
            type="submit"
          >
            {running > 0
              ? "Agent currently working"
              : ready > 0
                ? "Run next specialist task"
                : "No ready work"}
          </button>
        </form>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Running now</span>
          <strong>{running}</strong>
          <small>Agents actively executing work</small>
        </article>
        <article className="metric-card">
          <span>Ready / queued</span>
          <strong>{ready}</strong>
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
                            Math.min(100, Number(task.progress ?? 0)),
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

      {failedTasks?.length ? (
        <section className="panel failed-work-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECOVERY QUEUE</p>
              <h2>Failed specialist work</h2>
            </div>
          </div>
          <div className="completed-work-list">
            {failedTasks.map((task) => {
              const persona = task.primary_agent_id
                ? personaByAgent.get(task.primary_agent_id)
                : undefined;

              return (
                <article className="completed-work-row failed" key={task.id}>
                  <div>
                    <span className="work-status blocked">failed</span>
                    <strong>{task.title}</strong>
                    <p>
                      {persona?.display_name ?? "Genesis"} ·{" "}
                      {titleCase(task.task_type)}
                    </p>
                  </div>
                  <div className="completed-work-result">
                    <p>
                      {task.last_error ??
                        "Execution failed without an error message."}
                    </p>
                    <form action={retryFailedWorkforceTask}>
                      <input name="taskId" type="hidden" value={task.id} />
                      <button className="secondary-button" type="submit">
                        Return to ready queue
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel completed-work-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">COMPLETED WORK</p>
            <h2>Recent specialist deliverables</h2>
          </div>
        </div>

        <div className="completed-work-list">
          {completedTasks?.length ? (
            completedTasks.map((task) => {
              const persona = task.primary_agent_id
                ? personaByAgent.get(task.primary_agent_id)
                : undefined;
              const output = task.output as
                | {
                    summary?: string;
                    confidence?: number;
                    recommendedNextAction?: string;
                    deliverables?: Array<{ title?: string; type?: string }>;
                  }
                | null;

              return (
                <article className="completed-work-row" key={task.id}>
                  <div>
                    <span className="table-status">completed</span>
                    <strong>{task.title}</strong>
                    <p>
                      {persona?.display_name ?? "Genesis"} ·{" "}
                      {titleCase(task.task_type)}
                    </p>
                  </div>
                  <div className="completed-work-result">
                    <p>{output?.summary ?? "Work completed."}</p>
                    <span>
                      {output?.confidence === undefined
                        ? "Confidence not recorded"
                        : `${Math.round(Number(output.confidence) * 100)}% confidence`}
                      {" · "}
                      {output?.deliverables?.length ?? 0} deliverables
                    </span>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="muted">
              Specialist results will appear here after the runtime completes
              its first task.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
