import { TaskResult } from "./task-result";

export type WorkAttempt = {
  run_id: string;
  task_id: string;
  attempt_number: number;
  status: string;
  output: unknown;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  reviewDecision: "accept" | "revise" | null;
  reviewNote: string | null;
};

const attemptLabels: Record<string, string> = {
  running: "Running",
  produced: "Output generated",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Interrupted",
};

export function AttemptHistory({
  taskId,
  attempts,
  isDirector,
  failedToLoad,
}: {
  taskId: string;
  attempts: WorkAttempt[];
  isDirector: boolean;
  failedToLoad: boolean;
}) {
  return (
    <section className="foundation-attempt-history" id={`history-${taskId}`} aria-label="Attempt history">
      <h4>Attempt history</h4>
      {failedToLoad ? (
        <p className="foundation-task-blocker error" role="alert">Attempt history could not be loaded. Refresh this view to try again.</p>
      ) : attempts.length ? (
        <div className="foundation-attempt-list">
          {attempts.map((attempt) => {
            const hasOutput = attempt.output !== null && typeof attempt.output === "object" &&
              !Array.isArray(attempt.output) && Object.keys(attempt.output).length > 0;
            return (
              <details className="foundation-attempt" key={attempt.run_id}>
                <summary>
                  <strong>Attempt {attempt.attempt_number}</strong>
                  <span>{attempt.reviewDecision === "accept" ? "Accepted" : attempt.reviewDecision === "revise" ? "Revision requested" : attemptLabels[attempt.status] ?? attempt.status}</span>
                </summary>
                <div className="foundation-attempt-content">
                  {attempt.error ? <p className="foundation-task-blocker error">{attempt.error}</p> : null}
                  {attempt.reviewNote ? <p className="foundation-review-record"><strong>Review note</strong><br />{attempt.reviewNote}</p> : null}
                  {hasOutput ? (
                    <TaskResult output={attempt.output} taskId={taskId} runId={attempt.run_id} generatedAt={attempt.finished_at} isDirector={isDirector} />
                  ) : (
                    <div className="foundation-subtle">
                      <p>No output was saved for this attempt.</p>
                      <p>Run <code>{attempt.run_id}</code></p>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="foundation-subtle">No foundation attempt records are stored for this assignment.</p>
      )}
    </section>
  );
}
