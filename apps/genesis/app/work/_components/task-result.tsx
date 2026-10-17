function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const entry = record(item);
        return entry ? [entry] : [];
      })
    : [];
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const entry = text(item);
        return entry ? [entry] : [];
      })
    : [];
}

const evidenceLabels: Record<string, string> = {
  supplied_context: "Supplied context",
  internal_inference: "Internal inference",
  hypothesis: "Hypothesis",
};

export function TaskResult({
  output: value,
  taskId,
  generatedAt,
  isDirector = false,
  runId: explicitRunId,
}: {
  output: unknown;
  taskId: string;
  generatedAt: string | null;
  isDirector?: boolean;
  runId?: string | null;
}) {
  const output = record(value);
  const summary = text(output?.summary) ?? text(output?.recommendedAction) ?? text(output?.recommended_action);
  const deliverables = records(output?.deliverables);
  const findings = records(output?.findings);
  const evidenceGaps = textList(output?.evidenceGaps);
  const recommendedNextAction = text(output?.recommendedNextAction);
  const workItems = records(output?.workItems);
  const workTitleByKey = new Map(workItems.flatMap((item) => {
    const key = text(item.key);
    return key ? [[key, text(item.title) ?? key] as const] : [];
  }));
  const confidence = output?.confidence;
  const runId = explicitRunId ?? text(output?.agent_run_id) ?? text(output?.director_run_id);
  const parsedDate = generatedAt ? new Date(generatedAt) : null;
  const formattedDate =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }).format(parsedDate)
      : null;

  return (
    <div className="foundation-result">
      {summary ? <p className="foundation-result-summary">{summary}</p> : null}

      {output?.requiresHumanReview === true ? (
        <p className="foundation-callout">
          The agent flagged the recommended next action for human review.
        </p>
      ) : null}

      {isDirector ? (
        <>
          {text(output?.rationale) ? (
            <section className="foundation-result-section">
              <h4>Rationale</h4>
              <p className="foundation-prose">{text(output?.rationale)}</p>
            </section>
          ) : null}
          {text(output?.primaryMetric) ? (
            <section className="foundation-result-section">
              <h4>Success measure</h4>
              <p className="foundation-prose">{text(output?.primaryMetric)}</p>
            </section>
          ) : null}
          {text(output?.expectedLearning) ? (
            <section className="foundation-result-section">
              <h4>Expected learning</h4>
              <p className="foundation-prose">{text(output?.expectedLearning)}</p>
            </section>
          ) : null}
          <section className="foundation-result-section" aria-label="Proposed assignments">
            <h4>Proposed assignments</h4>
            {workItems.length ? workItems.map((item, index) => (
              <article className="foundation-deliverable" key={text(item.key) ?? index}>
                <div className="foundation-deliverable-heading">
                  <h5>{index + 1}. {text(item.title) ?? "Untitled assignment"}</h5>
                  <span>{text(item.agentKey)?.replaceAll("_", " ") ?? "Unassigned"}</span>
                </div>
                {text(item.description) ? <p className="foundation-prose">{text(item.description)}</p> : null}
                <p className="foundation-prose"><strong>Acceptance criteria: </strong>{text(item.successCriteria) ?? "Not specified"}</p>
                <p className="foundation-subtle">
                  {textList(item.dependsOn).length
                    ? `After acceptance of: ${textList(item.dependsOn).map((key) => workTitleByKey.get(key) ?? key).join("; ")}`
                    : "Available after the plan is accepted."}
                </p>
              </article>
            )) : (
              <p className="foundation-subtle">The Director proposed no specialist assignments. Review the response and rationale above.</p>
            )}
          </section>
        </>
      ) : deliverables.length ? (
        <section aria-label="Generated deliverables" className="foundation-result-section">
          <h4>Deliverables</h4>
          {deliverables.map((deliverable, index) => (
            <article className="foundation-deliverable" key={index}>
              <div className="foundation-deliverable-heading">
                <h5>{text(deliverable.title) ?? `Deliverable ${index + 1}`}</h5>
                {text(deliverable.type) ? (
                  <span>{text(deliverable.type)?.replaceAll("_", " ")}</span>
                ) : null}
              </div>
              {text(deliverable.content) ? (
                <div className="foundation-prose">{text(deliverable.content)}</div>
              ) : (
                <p className="foundation-callout">
                  This result does not contain the deliverable content. Review
                  its execution record before accepting it.
                </p>
              )}
            </article>
          ))}
        </section>
      ) : (
        <p className="foundation-subtle">
          No specialist deliverable content is stored on this task.
        </p>
      )}

      {findings.length ? (
        <section aria-label="Findings and supporting evidence" className="foundation-result-section">
          <h4>Findings &amp; evidence</h4>
          <ol className="foundation-findings">
            {findings.map((finding, index) => (
              <li key={index}>
                <span className="foundation-evidence-label">
                  {evidenceLabels[text(finding.evidenceStatus) ?? ""] ??
                    "Evidence not classified"}
                </span>
                <p><strong>{text(finding.finding) ?? "Finding not recorded"}</strong></p>
                <dl>
                  <div>
                    <dt>Evidence</dt>
                    <dd>{text(finding.evidence) ?? "No evidence was recorded."}</dd>
                  </div>
                  {text(finding.implication) ? (
                    <div>
                      <dt>Implication</dt>
                      <dd>{text(finding.implication)}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {!isDirector ? <section aria-label="Evidence gaps" className="foundation-result-section">
        <h4>Evidence gaps</h4>
        {evidenceGaps.length ? (
          <ul className="foundation-evidence-gaps">
            {evidenceGaps.map((gap, index) => <li key={index}>{gap}</li>)}
          </ul>
        ) : (
          <p className="foundation-subtle">
            {Array.isArray(output?.evidenceGaps)
              ? "The agent recorded no evidence gaps. Check the supporting material as part of your review."
              : "No evidence-gap assessment was saved for this result."}
          </p>
        )}
      </section> : null}

      {recommendedNextAction ? (
        <section className="foundation-result-section">
          <h4>Recommended next action</h4>
          <p className="foundation-prose">{recommendedNextAction}</p>
        </section>
      ) : null}

      <details className="foundation-provenance">
        <summary>Execution details</summary>
        <dl>
          <div><dt>Task</dt><dd><code>{taskId}</code></dd></div>
          {runId ? <div><dt>Run</dt><dd><code>{runId}</code></dd></div> : null}
          {formattedDate ? <div><dt>Generated</dt><dd>{formattedDate} UTC</dd></div> : null}
          {typeof confidence === "number" && Number.isFinite(confidence) ? (
            <div>
              <dt>Agent confidence</dt>
              <dd>
                {Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%
                <span className="foundation-subtle"> · self-reported</span>
              </dd>
            </div>
          ) : null}
        </dl>
      </details>
    </div>
  );
}
