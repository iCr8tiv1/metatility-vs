import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { initializeGenesisFoundation, selectFoundationWorkspace } from "@/app/actions/foundation";
import { SubmitButton } from "@/app/work/_components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { getFoundationWorkspace } from "@/lib/genesis/workspace";
import { FOUNDATION_LIMITS, FOUNDATION_MODEL } from "@/lib/genesis/foundation-contract";

export default async function FoundationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login");
  const { workspace, workspaces, error: workspaceError } = await getFoundationWorkspace(supabase, auth.claims.sub);
  const [contracts, readiness, attempts, agents] = workspace && !workspaceError ? await Promise.all([
    supabase.from("genesis_operating_contracts").select("id,contract_key,version,specification,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    supabase.rpc("genesis_workforce_readiness", { p_workspace_id: workspace.id, p_task_ids: [] }),
    supabase.from("genesis_work_attempts").select("run_id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("genesis_agents").select("id,agent_key,status").eq("workspace_id", workspace.id),
  ]) : [null, null, null, null];
  const foundationAvailable = !!workspace && !workspaceError && !!contracts && !contracts.error && !!readiness && !readiness.error && !!attempts && !attempts.error;
  const currentContract = contracts?.data?.find((contract) => contract.contract_key === "genesis-foundation" && contract.version === 1);
  const activeAgents = agents?.data?.filter((agent) => agent.status === "active").length;
  const modelConfigurationDetected = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  const message = params.status === "initialized" ? "Foundation initialized. Its operating contract and missing workforce roles are ready."
    : params.status === "initialization-failed" ? "Foundation initialization could not be confirmed. Check the database connection and installed schema before retrying."
    : params.status === "workspace-error" ? "Your workspace could not be loaded. Check its connection and access." : null;

  return <AppShell active="Foundation">
    <header className="page-header"><div><p className="eyebrow">GENESIS FOUNDATION</p><h1>Foundation status</h1><p className="muted">Operating contracts, access, execution, and the evidence needed before introducing a business pilot.</p></div><Link href="/work" className="secondary-button">Open work</Link></header>
    {message ? <p className={`notice ${params.status === "initialized" ? "success" : "error"}`} role="status">{message}</p> : null}
    <section className="panel">
      <div className="panel-heading"><div><h2>{workspace?.name ?? "Set up your workspace"}</h2><p className="muted">Work, run history, contracts, and decisions are scoped to your authenticated workspace.</p></div></div>
      {workspaces.length > 1 ? <form action={selectFoundationWorkspace} className="foundation-task-actions"><label htmlFor="workspace">Workspace</label><select id="workspace" name="workspaceId" defaultValue={workspace?.id}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><SubmitButton className="secondary-button" pendingLabel="Switching…">Switch workspace</SubmitButton></form> : null}
      <div className="table-scroll"><table><thead><tr><th>Boundary</th><th>Observed state</th><th>What this establishes</th></tr></thead><tbody>
        <tr><td>Identity</td><td>Signed in</td><td>Supabase verified this session. Foundation changes require workspace ownership.</td></tr>
        <tr><td>Workspace database</td><td>{workspaceError ? "Unavailable" : workspace ? "Reachable" : "No workspace yet"}</td><td>{workspace ? "Your owned workspace was read successfully." : "Initialize a workspace after the base schema and foundation migration are installed."}</td></tr>
        <tr><td>Lifecycle functions</td><td>{foundationAvailable ? "Responding" : "Needs setup"}</td><td>The readiness function and protected attempt table must both be accessible.</td></tr>
        <tr><td>Operating contract</td><td>{currentContract ? "BSPP v1" : "Not initialized"}</td><td>A version is pinned to each assignment and preserved with every attempt.</td></tr>
        <tr><td>Workforce</td><td>{agents?.error || activeAgents === undefined ? "Unavailable" : `${activeAgents} active roles`}</td><td>Only a supported active role may claim eligible work.</td></tr>
        <tr><td>Model service</td><td>{modelConfigurationDetected ? "Configuration detected" : "Configuration not detected"}</td><td>A successful model run must still be verified. Configuration alone is not a health check.</td></tr>
        <tr><td>Recorded foundation attempts</td><td>{attempts?.error || !attempts ? "Unavailable" : attempts.count ?? 0}</td><td>Attempts include generated, failed, expired, and cancelled work; this is not an acceptance count.</td></tr>
      </tbody></table></div>
      {!currentContract && !workspaceError ? <form action={initializeGenesisFoundation} style={{ marginTop: 20 }}>
        {workspace ? <input name="workspaceId" type="hidden" value={workspace.id} /> : null}
        <p className="muted">Initialize the internal operating contract and missing roles. Existing agents and work are preserved.</p>
        <SubmitButton className="primary-button" pendingLabel="Initializing…">Initialize foundation</SubmitButton>
      </form> : null}
    </section>
    <section className="panel" style={{ marginTop: 24 }}>
      <div className="panel-heading"><div><h2>Current execution boundary</h2><p className="muted">BSPP means Business System Program Protocol: the contract controlling how Genesis accepts, executes, and reviews work.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Control</th><th>Foundation v1</th></tr></thead><tbody>
        <tr><td>Allowed work</td><td>Analysis, planning, drafting, qualification of supplied records, measurement, and research using supplied context.</td></tr>
        <tr><td>External tools</td><td>None attached to this runtime. Publishing, contact, spending, and credential access are outside the contract.</td></tr>
        <tr><td>Model and limits</td><td>{FOUNDATION_MODEL}; at most {FOUNDATION_LIMITS.maxOutputTokens.toLocaleString()} output tokens and {FOUNDATION_LIMITS.maxRuntimeSeconds} seconds per attempt.</td></tr>
        <tr><td>Review</td><td>Every proposed plan and produced result requires an operator decision. Dependency work waits for accepted evidence.</td></tr>
        <tr><td>Memory</td><td>Model suggestions remain candidates. Only explicitly approved, scoped, unexpired memory can enter a later context.</td></tr>
        <tr><td>Recovery</td><td>Retries preserve attempts. Cancellation and lease expiry prevent late results from replacing the current state.</td></tr>
        <tr><td>Existing work</td><td>Historical output without an acceptance record is unverified. New objectives enter the governed foundation lifecycle.</td></tr>
      </tbody></table></div>
    </section>
    <section className="panel" style={{ marginTop: 24 }}><h2>Foundation acceptance gate</h2><p>Before adding a business, verify a complete authenticated objective → proposed plan → accepted plan → task result → accepted result loop. Then verify workspace isolation, duplicate submission handling, blocked dependencies, revision, cancellation, and interrupted-run recovery in the deployed environment.</p><p className="muted">A successful build, a responding database, and generated output each prove different things. Pilot readiness requires the complete operating loop and recorded evidence.</p><Link href="/work">Inspect work and evidence →</Link></section>
  </AppShell>;
}
