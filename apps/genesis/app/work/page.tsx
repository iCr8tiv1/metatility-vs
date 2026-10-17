import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { recoverStaleWorkforceTasks, resumeGenesisPlan } from "@/app/actions/workforce";
import { foundationMessages, foundationSuccessCodes } from "@/lib/genesis/foundation-contract";
import { getFoundationWorkspace } from "@/lib/genesis/workspace";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "./_components/submit-button";
import { TaskCard, type TaskReadiness, type WorkAgent, type WorkTask } from "./_components/task-card";
import type { WorkAttempt } from "./_components/attempt-history";

export const maxDuration = 300;

const PAGE_SIZE = 20;
const taskColumns = "id,title,description,task_type,status,priority,progress,primary_agent_id,plan_id,requires_approval,input,context,output,created_at,completed_at,last_error,due_at,active_run_id,attempt_count,accepted_at";
const activeStatuses = ["queued", "ready", "running", "blocked", "awaiting_approval", "failed"];
const historyStatuses = ["completed", "cancelled"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type WorkView = "active" | "review" | "history";

type ReadinessRow = {
  task_id: string;
  can_run: boolean;
  blockers: string[];
  current_run_id: string | null;
  review_note: string | null;
  review_decision: "accept" | "revise" | null;
  remaining_attempts: number;
  authorization_required: boolean;
};

function validReadiness(value: unknown): value is ReadinessRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.task_id === "string" && typeof item.can_run === "boolean" &&
    Array.isArray(item.blockers) && item.blockers.every((reason) => typeof reason === "string");
}

function workUrl(view: WorkView, page = 1) {
  return `/work?view=${view}${page > 1 ? `&page=${page}` : ""}`;
}

function viewForTask(status: string): WorkView {
  return status === "awaiting_review" ? "review" : historyStatuses.includes(status) ? "history" : "active";
}

function LoadError({ message }: { message: string }) {
  return (
    <AppShell active="Work">
      <div className="foundation-work">
        <header className="page-header">
          <div><p className="eyebrow">GENESIS FOUNDATION</p><h1>Work</h1></div>
        </header>
        <div className="foundation-notice error" role="alert">
          <span>{message}</span>
          <a href="/work">Reload Work</a>
        </div>
      </div>
    </AppShell>
  );
}

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ runtime?: string; task?: string; view?: string; page?: string; attempts?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;
  if (claimsError || !ownerId) redirect("/login");

  const { workspace, error: workspaceError } = await getFoundationWorkspace(supabase, ownerId);
  if (workspaceError || !workspace) {
    return <LoadError message="Your Genesis workspace could not be loaded. Refresh to check the connection and your access." />;
  }

  const countTasks = (statuses: string[]) => supabase.from("genesis_tasks")
    .select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("owner_id", ownerId).in("status", statuses);
  const focusedId = params.task && uuidPattern.test(params.task) ? params.task : null;
  const [agentsResult, personasResult, plansResult, focusedResult, activeCountResult, reviewCountResult,
    historyCountResult, runningCountResult, queuedCountResult, attentionCountResult] = await Promise.all([
    supabase.from("genesis_agents").select("id,agent_key,name,status").eq("workspace_id", workspace.id),
    supabase.from("genesis_agent_personas").select("agent_id,display_name").eq("workspace_id", workspace.id).eq("status", "active"),
    supabase.from("genesis_plans").select("id,title,summary,status,created_at")
      .eq("workspace_id", workspace.id).eq("owner_id", ownerId)
      .in("status", ["draft", "proposed", "approved", "active", "paused"])
      .order("created_at", { ascending: false }).limit(10),
    focusedId ? supabase.from("genesis_tasks").select(taskColumns).eq("workspace_id", workspace.id)
      .eq("owner_id", ownerId).eq("id", focusedId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    countTasks(activeStatuses), countTasks(["awaiting_review"]), countTasks(historyStatuses),
    countTasks(["running"]), countTasks(["ready", "queued"]), countTasks(["blocked", "awaiting_approval", "failed"]),
  ]);

  if ([agentsResult, personasResult, plansResult, activeCountResult, reviewCountResult, historyCountResult,
    runningCountResult, queuedCountResult, attentionCountResult].some((result) => result.error)) {
    return <LoadError message="Work records could not be loaded reliably. Refresh before running or reviewing an assignment." />;
  }

  const focusedTask = focusedResult.data as WorkTask | null;
  const requestedView = params.view === "review" || params.view === "history" || params.view === "active" ? params.view : null;
  const view: WorkView = requestedView ?? (focusedTask ? viewForTask(focusedTask.status) : "active");
  const requestedPage = Number(params.page ?? 1);
  const total = view === "review" ? reviewCountResult.count ?? 0 : view === "history" ? historyCountResult.count ?? 0 : activeCountResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(totalPages, Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const statuses = view === "review" ? ["awaiting_review"] : view === "history" ? historyStatuses : activeStatuses;
  let taskQuery = supabase.from("genesis_tasks").select(taskColumns)
    .eq("workspace_id", workspace.id).eq("owner_id", ownerId).in("status", statuses);
  taskQuery = view === "active" ? taskQuery.order("priority").order("created_at", { ascending: false }) : taskQuery.order("updated_at", { ascending: false });
  const tasksResult = await taskQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (tasksResult.error) return <LoadError message="The task list could not be loaded. Refresh to try again." />;

  const tasks = (tasksResult.data ?? []) as WorkTask[];
  const pinnedTask = focusedTask && !tasks.some((task) => task.id === focusedTask.id) ? focusedTask : null;
  const visibleTasks = pinnedTask ? [pinnedTask, ...tasks] : tasks;
  const historyRequested = Boolean(focusedTask && params.attempts === "1");
  const [readinessResult, attemptsResult, reviewsResult] = await Promise.all([
    visibleTasks.length ? supabase.rpc("genesis_workforce_readiness", {
      p_workspace_id: workspace.id, p_task_ids: visibleTasks.map((task) => task.id),
    }) : Promise.resolve({ data: [], error: null }),
    historyRequested && focusedTask ? supabase.from("genesis_work_attempts")
      .select("run_id,task_id,attempt_number,status,output,error,started_at,finished_at")
      .eq("workspace_id", workspace.id).eq("owner_id", ownerId).eq("task_id", focusedTask.id)
      .order("attempt_number", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    historyRequested && focusedTask ? supabase.from("genesis_work_reviews")
      .select("run_id,decision,notes,created_at")
      .eq("workspace_id", workspace.id).eq("owner_id", ownerId).eq("task_id", focusedTask.id)
      .order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);
  const reviewByRun = new Map((reviewsResult.data ?? []).map((review) => [review.run_id, review]));
  const focusedAttempts: WorkAttempt[] = (attemptsResult.data ?? []).map((attempt) => {
    const review = reviewByRun.get(attempt.run_id);
    return { ...attempt,
      reviewDecision: review?.decision === "accept" || review?.decision === "revise" ? review.decision : null,
      reviewNote: typeof review?.notes === "string" ? review.notes : null,
    };
  });
  const readinessRows = Array.isArray(readinessResult.data) ? readinessResult.data.filter(validReadiness) : [];
  const readinessByTask = new Map(readinessRows.map((row) => [row.task_id, row]));
  const readinessUnavailable = Boolean(readinessResult.error) || visibleTasks.some((task) => !readinessByTask.has(task.id));
  const agentById = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent as WorkAgent]));
  const nameById = new Map((personasResult.data ?? []).map((persona) => [persona.agent_id, persona.display_name]));
  const runtimeMessage = params.runtime ? foundationMessages[params.runtime] : null;
  const runtimeSucceeded = params.runtime ? foundationSuccessCodes.has(params.runtime) : false;
  const running = runningCountResult.count ?? 0;
  const queued = queuedCountResult.count ?? 0;
  const awaitingReview = reviewCountResult.count ?? 0;
  const needsAttention = attentionCountResult.count ?? 0;
  const headings = {
    active: { title: "Active work", description: "Run a specific assignment, resolve a blocker, or recover a failed attempt." },
    review: { title: "Ready for your review", description: "Read the output and evidence. Acceptance releases work that depends on it." },
    history: { title: "Work history", description: "Reviewed results, historical outputs, and cancelled assignments remain available here." },
  };

  function renderTask(task: WorkTask) {
    const agent = task.primary_agent_id ? agentById.get(task.primary_agent_id) : undefined;
    const row = readinessByTask.get(task.id);
    const readiness: TaskReadiness = {
      canRun: row?.can_run === true,
      blockers: row ? row.blockers : ["Task eligibility could not be checked. Refresh before running this assignment."],
      remainingAttempts: typeof row?.remaining_attempts === "number" ? row.remaining_attempts : null,
      authorizationRequired: row?.authorization_required === true,
    };
    return <TaskCard key={task.id} task={task} agent={agent}
      displayName={task.primary_agent_id ? nameById.get(task.primary_agent_id) ?? agent?.name ?? "Unassigned" : "Unassigned"}
      readiness={readiness} runId={task.active_run_id}
      reviewNote={typeof row?.review_note === "string" ? row.review_note : null}
      reviewDecision={row?.review_decision === "accept" || row?.review_decision === "revise" ? row.review_decision : null}
      attempts={historyRequested && focusedTask?.id === task.id ? focusedAttempts : undefined}
      historyFailedToLoad={Boolean(attemptsResult.error || reviewsResult.error)}
      openResult={focusedTask?.id === task.id || (!focusedTask && view === "review" && tasks[0]?.id === task.id)} />;
  }

  return (
    <AppShell active="Work">
      <div className="foundation-work">
        <header className="page-header">
          <div><p className="eyebrow">GENESIS FOUNDATION</p><h1>Work</h1>
            <p className="muted">Assign an objective, review its plan, and follow each task through execution and acceptance.</p></div>
          <Link className="foundation-primary-link" href="/">Assign an objective</Link>
        </header>

        {runtimeMessage ? <div className={`foundation-notice ${runtimeSucceeded ? "" : "error"}`} role={runtimeSucceeded ? "status" : "alert"}>
          <span>{runtimeMessage}</span>{focusedTask ? <a href={`#task-${focusedTask.id}`}>View assignment</a> : null}
        </div> : null}
        {params.task && (!focusedId || focusedResult.error || !focusedTask) ? <div className="foundation-notice error" role="alert">The selected assignment could not be found in this workspace.</div> : null}
        {readinessUnavailable ? <div className="foundation-notice error" role="alert">Some task eligibility checks are unavailable. Execution controls remain disabled for those assignments.</div> : null}

        <section className="metric-grid" aria-label="Work status">
          <article className="metric-card"><span>Awaiting review</span><strong>{awaitingReview}</strong><small>Generated plans and results</small></article>
          <article className="metric-card"><span>Running</span><strong>{running}</strong><small>Recorded active executions</small></article>
          <article className="metric-card"><span>Ready or queued</span><strong>{queued}</strong><small>Readiness is checked per task</small></article>
          <article className="metric-card"><span>Needs attention</span><strong>{needsAttention}</strong><small>Blocked, failed, or awaiting authorization</small></article>
        </section>

        <nav aria-label="Work views" className="foundation-tabs">
          <Link href={workUrl("active")} aria-current={view === "active" ? "page" : undefined}>Active <span>{activeCountResult.count ?? 0}</span></Link>
          <Link href={workUrl("review")} aria-current={view === "review" ? "page" : undefined}>Review <span>{awaitingReview}</span></Link>
          <Link href={workUrl("history")} aria-current={view === "history" ? "page" : undefined}>History <span>{historyCountResult.count ?? 0}</span></Link>
        </nav>

        <section aria-labelledby="work-list-heading">
          <div className="foundation-section-heading">
            <div><h2 id="work-list-heading">{headings[view].title}</h2><p>{headings[view].description}</p></div>
            <div className="foundation-task-actions" style={{ marginTop: 0 }}>
              <a className="foundation-refresh" href={workUrl(view, page)}>Refresh view</a>
              {running > 0 ? <form action={recoverStaleWorkforceTasks}><SubmitButton className="foundation-quiet-button" pendingLabel="Checking…">Check interrupted work</SubmitButton></form> : null}
            </div>
          </div>
          {pinnedTask ? <section className="foundation-focused-task" aria-label="Selected assignment"><p className="eyebrow">SELECTED ASSIGNMENT</p>{renderTask(pinnedTask)}</section> : null}
          <div className="foundation-task-list">
            {tasks.length ? tasks.map(renderTask) : <div className="foundation-empty">
              <h3>{view === "review" ? "No results awaiting review" : view === "history" ? "Your work history starts here" : "No active assignments"}</h3>
              <p>{view === "review" ? "Plans and specialist outputs appear here when their execution finishes." : view === "history" ? "Accepted results and cancelled work will stay available for reference." : "Create an objective in the Command Center to begin a governed work package."}</p>
              <Link className="foundation-primary-link" href={view === "review" ? workUrl("active") : "/"}>{view === "review" ? "View active work" : "Open Command Center"}</Link>
            </div>}
          </div>
          {total > PAGE_SIZE ? <nav className="foundation-pagination" aria-label="Task pages">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <div>{page > 1 ? <Link href={workUrl(view, page - 1)}>Previous</Link> : null}{page < totalPages ? <Link href={workUrl(view, page + 1)}>Next</Link> : null}</div>
          </nav> : null}
        </section>

        {plansResult.data?.length ? <details className="foundation-plans">
          <summary>Recent open plans ({plansResult.data.length})</summary>
          <div className="plan-list">{plansResult.data.map((plan) => <article className="plan-row" key={plan.id}>
            <span className="foundation-status">{plan.status.replaceAll("_", " ")}</span><strong>{plan.title}</strong><p>{plan.summary}</p>
            {plan.status === "paused" ? <>
              <p>Resume the remaining scope. Cancelled assignments stay excluded.</p>
              <form action={resumeGenesisPlan}>
                <input type="hidden" name="planId" value={plan.id} />
                <SubmitButton className="secondary-button" pendingLabel="Resuming…">Resume remaining work</SubmitButton>
              </form>
            </> : null}
          </article>)}</div>
        </details> : null}
      </div>
    </AppShell>
  );
}
