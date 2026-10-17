import Link from "next/link";
import {
  authorizeWorkforceTask,
  cancelWorkforceTask,
  retryFailedWorkforceTask,
  reviewWorkforceTask,
  runWorkforceTask,
} from "@/app/actions/workforce";
import { runGenesisDirector } from "@/app/actions/director";
import {
  directorOutputSchema,
  specialistAgentKeys,
  specialistTaskResultSchema,
} from "@/lib/genesis/foundation-contract";
import { SubmitButton } from "./submit-button";
import { TaskResult } from "./task-result";
import { AttemptHistory, type WorkAttempt } from "./attempt-history";

export type WorkTask = {
  id: string;
  title: string;
  description: string;
  task_type: string;
  status: string;
  priority: number;
  progress: number | null;
  primary_agent_id: string | null;
  plan_id: string | null;
  requires_approval: boolean;
  input: unknown;
  context: unknown;
  output: unknown;
  created_at: string;
  completed_at: string | null;
  last_error: string | null;
  due_at: string | null;
  active_run_id: string | null;
  attempt_count: number;
  accepted_at: string | null;
};

export type WorkAgent = {
  id: string;
  agent_key: string;
  name: string;
  status: string;
};

export type TaskReadiness = {
  canRun: boolean;
  blockers: string[];
  remainingAttempts: number | null;
  authorizationRequired: boolean;
};

const specialistKeys = new Set<string>(specialistAgentKeys);

const cancellableStatuses = new Set([
  "queued",
  "ready",
  "running",
  "blocked",
  "awaiting_approval",
  "awaiting_review",
  "failed",
]);

const statusLabels: Record<string, string> = {
  queued: "Queued",
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  awaiting_approval: "Authorization required",
  awaiting_review: "Generated · review pending",
  completed: "Accepted",
  failed: "Execution failed",
  cancelled: "Cancelled",
};

function outputRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function TaskCard({
  task,
  agent,
  displayName,
  readiness,
  runId,
  reviewNote,
  reviewDecision,
  attempts,
  historyFailedToLoad = false,
  openResult = false,
}: {
  task: WorkTask;
  agent: WorkAgent | undefined;
  displayName: string;
  readiness: TaskReadiness;
  runId: string | null;
  reviewNote: string | null;
  reviewDecision: "accept" | "revise" | null;
  attempts?: WorkAttempt[];
  historyFailedToLoad?: boolean;
  openResult?: boolean;
}) {
  const isDirector = agent?.agent_key === "director";
  const isSpecialist = agent ? specialistKeys.has(agent.agent_key) : false;
  const output = outputRecord(task.output);
  const input = outputRecord(task.input);
  const acceptanceCriteria = typeof input?.success_criteria === "string" ? input.success_criteria : null;
  const hasOutput = output !== null && Object.keys(output).length > 0;
  const hasReviewableOutput = (isDirector ? directorOutputSchema : specialistTaskResultSchema)
    .safeParse(task.output).success;
  const awaitingReview = task.status === "awaiting_review";
  const canExecute =
    (isDirector || isSpecialist) &&
    agent?.status === "active" &&
    readiness.canRun;
  const isQueued = task.status === "ready" || task.status === "queued";
  const revisionRequested = reviewDecision === "revise" && ["ready", "queued", "running", "blocked"].includes(task.status);
  const previousResult = hasOutput && !["completed", "awaiting_review"].includes(task.status);
  const statusLabel = revisionRequested
    ? task.status === "running" ? "Revision running" : task.status === "blocked" ? "Revision blocked" : "Revision requested"
    : task.status === "completed" && !task.accepted_at
      ? "Historical output · acceptance not recorded"
    : task.status === "completed" && isDirector
    ? "Plan accepted"
    : awaitingReview && isDirector
      ? "Plan proposed · review pending"
      : statusLabels[task.status] ?? task.status.replaceAll("_", " ");
  const statusClass =
    task.status === "completed" && task.accepted_at
      ? "accepted"
      : awaitingReview ? "pending" : revisionRequested ? "revision_requested" : task.status;
  const blockerId = `task-blockers-${task.id}`;
  const feedbackId = `task-feedback-${task.id}`;
  const approvalNoteId = `task-authorization-${task.id}`;

  return (
    <article className="foundation-task" id={`task-${task.id}`} aria-labelledby={`task-title-${task.id}`}>
      <header className="foundation-task-header">
        <div>
          <h3 id={`task-title-${task.id}`}>{task.title}</h3>
          <div className="foundation-task-meta">
            <span>{displayName}</span>
            <span>{task.task_type.replaceAll("_", " ")}</span>
            <span>Priority {task.priority}</span>
            {task.attempt_count > 0 ? <span>Attempt {task.attempt_count}</span> : null}
            {agent?.status !== "active" && agent ? (
              <span>Agent {agent.status.replaceAll("_", " ")}</span>
            ) : null}
          </div>
        </div>
        <span className={`foundation-status ${statusClass}`}>{statusLabel}</span>
      </header>

      {task.description ? <p className="foundation-task-description">{task.description}</p> : null}

      {acceptanceCriteria ? (
        <div className="foundation-task-criteria">
          <strong>Acceptance criteria</strong><p>{acceptanceCriteria}</p>
        </div>
      ) : null}

      {task.status === "running" ? (
        <div className="foundation-task-progress">
          <progress aria-label={`Execution in progress for ${task.title}`} />
          <span>Execution is in progress. Refresh this view to check for a result.</span>
        </div>
      ) : null}

      {task.last_error ? (
        <p className="foundation-task-blocker error" role={task.status === "failed" ? "status" : undefined}>
          {task.last_error}
        </p>
      ) : null}

      {readiness.blockers.length && !["completed", "cancelled", "running", "awaiting_review"].includes(task.status) ? (
        <div className="foundation-task-blocker" id={blockerId}>
          {readiness.blockers.length === 1 ? readiness.blockers[0] : (
            <ul>{readiness.blockers.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
          )}
        </div>
      ) : null}

      {reviewNote ? (
        <div className={`foundation-review-record ${revisionRequested ? "revision_requested" : ""}`}>
          <strong>{revisionRequested ? "Revision feedback" : "Review note"}</strong>
          <br />{reviewNote}
        </div>
      ) : null}

      <div className="foundation-task-actions">
        {isQueued && (isDirector || isSpecialist) ? (
          <form action={isDirector ? runGenesisDirector : runWorkforceTask}>
            <input type="hidden" name="taskId" value={task.id} />
            <SubmitButton
              className="primary-button"
              pendingLabel={isDirector ? "Planning…" : "Starting…"}
              disabled={!canExecute}
              aria-describedby={readiness.blockers.length ? blockerId : undefined}
            >
              {isDirector ? revisionRequested ? "Revise plan" : "Run Director" : revisionRequested ? "Run revision" : "Run this task"}
            </SubmitButton>
          </form>
        ) : null}

        {task.status === "failed" && (isSpecialist || isDirector) ? (
          <form action={retryFailedWorkforceTask}>
            <input type="hidden" name="taskId" value={task.id} />
            <SubmitButton className="secondary-button" pendingLabel="Requeueing…" disabled={readiness.remainingAttempts === 0}>
              Return to ready queue
            </SubmitButton>
          </form>
        ) : null}

        {cancellableStatuses.has(task.status) ? (
          <form action={cancelWorkforceTask}>
            <input type="hidden" name="taskId" value={task.id} />
            <SubmitButton className="foundation-quiet-button" pendingLabel="Cancelling…">
              {isDirector ? "Cancel plan" : "Cancel work"}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {cancellableStatuses.has(task.status) ? (
        <p className="foundation-subtle">{isDirector ? "Cancelling this plan also stops its unfinished assignments." : "Cancellation also stops dependent work and pauses this task’s plan."}</p>
      ) : null}

      {readiness.authorizationRequired && ["ready", "queued", "blocked", "awaiting_approval"].includes(task.status) ? (
        <form action={authorizeWorkforceTask} className="foundation-review">
          <input type="hidden" name="taskId" value={task.id} />
          <h4>Authorize this assignment</h4>
          <p>Review its instructions and scope before allowing execution.</p>
          <div>
            <label htmlFor={approvalNoteId}>Decision note</label>
            <textarea id={approvalNoteId} name="reviewNote" maxLength={2000} rows={3} />
          </div>
          <div className="foundation-task-actions">
            <SubmitButton className="primary-button" name="decision" value="approve" pendingLabel="Saving…">
              Authorize work
            </SubmitButton>
            <SubmitButton className="secondary-button" name="decision" value="reject" pendingLabel="Saving…">
              Reject request
            </SubmitButton>
          </div>
        </form>
      ) : null}

      {hasOutput ? (
        <details className="foundation-output" open={openResult}>
          <summary>{previousResult ? "Previous result & evidence" : "Full result & evidence"}</summary>
          {previousResult ? (
            <p className="foundation-callout">This is an earlier result. The current assignment has not produced a new accepted result.</p>
          ) : null}
          <TaskResult output={task.output} taskId={task.id} runId={runId} generatedAt={task.completed_at} isDirector={isDirector} />

          {awaitingReview && (isDirector || isSpecialist) && runId ? (
            <form action={reviewWorkforceTask} className="foundation-review">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="runId" value={runId} />
              <h4>{isDirector ? "Review this plan" : "Review this result"}</h4>
              <p>{isDirector ? "Accepting the plan releases eligible assignments. Request a revision to change the proposed work." : "Accept the result or request a revision with specific feedback."}</p>
              <div>
                <label htmlFor={feedbackId}>Feedback <span className="foundation-subtle">(required for a revision)</span></label>
                <textarea id={feedbackId} name="reviewNote" maxLength={2000} rows={3} required />
              </div>
              <div className="foundation-task-actions">
                <SubmitButton
                  className="primary-button"
                  name="decision"
                  value="accepted"
                  pendingLabel="Saving…"
                  formNoValidate
                  disabled={!hasReviewableOutput}
                >
                  {isDirector ? "Accept plan" : "Accept result"}
                </SubmitButton>
                <SubmitButton className="secondary-button" name="decision" value="revision_requested" pendingLabel="Saving…" disabled={readiness.remainingAttempts === 0}>
                  Request revision
                </SubmitButton>
              </div>
              {!hasReviewableOutput ? <p>The stored output does not satisfy the expected result format. Request a revision before accepting it.</p> : null}
              {readiness.remainingAttempts === 0 ? <p>This assignment has reached its allowed number of execution attempts.</p> : null}
            </form>
          ) : null}
        </details>
      ) : awaitingReview ? (
        <p className="foundation-task-blocker error">This task is awaiting review, but its saved result could not be loaded.</p>
      ) : null}

      {awaitingReview && !runId ? (
        <p className="foundation-task-blocker error">This result has no execution reference. Review is unavailable until the record is repaired.</p>
      ) : null}

      {attempts !== undefined ? (
        <AttemptHistory taskId={task.id} attempts={attempts} isDirector={isDirector} failedToLoad={historyFailedToLoad} />
      ) : task.attempt_count > 0 ? (
        <div className="foundation-history-link">
          <Link href={`/work?task=${task.id}&attempts=1#history-${task.id}`}>View attempt history</Link>
        </div>
      ) : null}
    </article>
  );
}
