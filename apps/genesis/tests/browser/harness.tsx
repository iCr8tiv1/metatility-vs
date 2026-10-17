import { createRoot } from "react-dom/client";
import { CommandForm } from "../../app/_components/command-form";
import { TaskCard, type TaskReadiness } from "../../app/work/_components/task-card";
import { agent, attempts, director, directorOutput, ids, task } from "./fixtures";
import "./harness-actions";
import "../../app/globals.css";

window.__foundationHarness = { calls: [], delayMs: 350 };
const scenario = new URLSearchParams(window.location.search).get("scenario") ?? "review";
const ready: TaskReadiness = { canRun: true, blockers: [], remainingAttempts: 1, authorizationRequired: false };
const baseProps = { agent, displayName: agent.name, readiness: ready, runId: ids.run, reviewNote: null, reviewDecision: null, openResult: true };

function Scenario() {
  if (scenario === "command") return <CommandForm requestId={ids.request} workspaceId={ids.workspace} />;
  if (scenario === "director") return <TaskCard {...baseProps} task={task({ task_type: "strategy", output: directorOutput })} agent={director} displayName={director.name} />;
  if (scenario === "ready") return <TaskCard {...baseProps} task={task({ status: "ready", output: {}, active_run_id: null, attempt_count: 0 })} runId={null} />;
  if (scenario === "blocked") return <TaskCard {...baseProps} task={task({ status: "ready", output: {}, active_run_id: null })} runId={null}
    readiness={{ ...ready, canRun: false, blockers: ["All dependencies require accepted outputs."] }} />;
  if (scenario === "failed") return <TaskCard {...baseProps} task={task({ status: "failed", output: {}, attempt_count: 3, last_error: "The bounded attempt failed." })}
    readiness={{ ...ready, canRun: false, blockers: ["The three-attempt budget is exhausted."], remainingAttempts: 0 }} />;
  if (scenario === "approval") return <TaskCard {...baseProps} task={task({ status: "awaiting_approval", requires_approval: true, output: {}, active_run_id: null })} runId={null}
    readiness={{ ...ready, canRun: false, authorizationRequired: true }} />;
  if (scenario === "invalid") return <TaskCard {...baseProps} task={task({ output: { summary: "Malformed fixture", deliverables: [null] } })} />;
  if (scenario === "missing-run") return <TaskCard {...baseProps} task={task({ active_run_id: null })} runId={null} />;
  if (scenario === "exhausted-review") return <TaskCard {...baseProps} task={task({ attempt_count: 3 })} readiness={{ ...ready, remainingAttempts: 0 }} />;
  if (scenario === "revision") return <TaskCard {...baseProps} task={task({ status: "ready", active_run_id: null, completed_at: null })} runId={null}
    reviewDecision="revise" reviewNote="Add the missing expected result." attempts={attempts} />;
  if (scenario === "history") return <TaskCard {...baseProps} task={task({ status: "completed", accepted_at: "2026-10-17T12:06:00.000Z" })}
    reviewDecision="accept" attempts={attempts.map((attempt, index) => index === 0 ? { ...attempt, reviewDecision: "accept" } : attempt)} />;
  if (scenario === "legacy") return <TaskCard {...baseProps} task={task({ status: "completed", accepted_at: null })} />;
  return <TaskCard {...baseProps} task={task()} />;
}

createRoot(document.getElementById("root")!).render(
  <main style={{ padding: "24px 16px", maxWidth: 1120, margin: "0 auto" }}>
    <div className="foundation-work">
      <header className="page-header">
        <div><p className="eyebrow">NEUTRAL COMPONENT FIXTURES</p><h1>Genesis component verification</h1>
          <p>Simulated actions only. Live authentication, database access, and model execution are unverified by this harness.</p></div>
      </header>
      <Scenario />
    </div>
  </main>,
);
