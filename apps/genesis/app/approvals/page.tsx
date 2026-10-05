import { redirect } from "next/navigation";
import {
  approveBildenHandoff,
  rejectBildenHandoff,
} from "@/app/actions/leads";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ decision?: string; error?: string }>;
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

  const { data: approvals } = workspace
    ? await supabase
        .from("genesis_approvals")
        .select(
          "id,action_type,risk_level,status,payload,requested_at"
        )
        .eq("workspace_id", workspace.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
    : { data: [] };

  const leadIds = (approvals ?? [])
    .map((approval) => {
      const payload = approval.payload as { lead_id?: string };
      return payload.lead_id;
    })
    .filter((id): id is string => Boolean(id));

  const { data: leads } = leadIds.length
    ? await supabase
        .from("genesis_leads")
        .select(
          "id,first_name,last_name,email,score,confidence,project_intent"
        )
        .in("id", leadIds)
    : { data: [] };

  const leadById = new Map((leads ?? []).map((lead) => [lead.id, lead]));

  return (
    <AppShell active="Approvals">
      <header className="page-header">
        <div>
          <p className="eyebrow">HUMAN CONTROL LAYER</p>
          <h1>Approvals</h1>
          <p className="muted">
            Genesis can recommend consequential actions, but high-risk handoffs
            require an explicit human decision.
          </p>
        </div>
      </header>

      {params.decision ? (
        <div className="notice success">
          Approval decision recorded: <strong>{params.decision}</strong>.
        </div>
      ) : null}

      {params.error ? (
        <div className="notice error">{params.error}</div>
      ) : null}

      <section className="approval-grid">
        {approvals?.length ? (
          approvals.map((approval) => {
            const payload = approval.payload as {
              lead_id?: string;
              qualification_id?: string;
              estimated_value?: number;
              currency?: string;
            };
            const lead = payload.lead_id
              ? leadById.get(payload.lead_id)
              : undefined;
            const intent = lead?.project_intent as
              | {
                  project_type?: string;
                  description?: string;
                  timeline?: string;
                }
              | undefined;

            return (
              <article className="panel approval-card" key={approval.id}>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">BILDEN HANDOFF</p>
                    <h2>
                      {lead
                        ? `${lead.first_name} ${lead.last_name}`
                        : "Qualified lead"}
                    </h2>
                  </div>
                  <span className="risk-pill">{approval.risk_level} risk</span>
                </div>

                <div className="approval-facts">
                  <div>
                    <span>Project</span>
                    <strong>{intent?.project_type ?? "Unclassified"}</strong>
                  </div>
                  <div>
                    <span>Genesis score</span>
                    <strong>{Math.round(Number(lead?.score ?? 0))}/100</strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong>
                      {Math.round(Number(lead?.confidence ?? 0) * 100)}%
                    </strong>
                  </div>
                  <div>
                    <span>Declared value</span>
                    <strong>
                      {Number(payload.estimated_value ?? 0).toLocaleString(
                        "en-US",
                        {
                          style: "currency",
                          currency: payload.currency ?? "USD",
                          maximumFractionDigits: 0,
                        }
                      )}
                    </strong>
                  </div>
                </div>

                <p className="muted">
                  {intent?.description ||
                    "Genesis recommends creating a Bilden opportunity based on the current qualification record."}
                </p>

                <div className="approval-actions">
                  <form action={approveBildenHandoff}>
                    <input name="approvalId" type="hidden" value={approval.id} />
                    <button className="primary-button" type="submit">
                      Approve Bilden handoff
                    </button>
                  </form>
                  <form action={rejectBildenHandoff}>
                    <input name="approvalId" type="hidden" value={approval.id} />
                    <button className="secondary-button" type="submit">
                      Return to nurture
                    </button>
                  </form>
                </div>
              </article>
            );
          })
        ) : (
          <article className="panel">
            <p className="eyebrow">QUEUE CLEAR</p>
            <h2>No approvals waiting</h2>
            <p className="muted">
              High-scoring leads will appear here before Genesis creates a
              Bilden-ready opportunity.
            </p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
