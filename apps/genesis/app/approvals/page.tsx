import { redirect } from "next/navigation";
import {
  approveBildenHandoff,
  rejectBildenHandoff,
} from "@/app/actions/leads";
import {
  approveCampaignActivation,
  rejectCampaignActivation,
} from "@/app/actions/demand-engine";
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
    .filter((approval) => approval.action_type === "create_bilden_opportunity")
    .map((approval) => {
      const payload = approval.payload as { lead_id?: string };
      return payload.lead_id;
    })
    .filter((id): id is string => Boolean(id));

  const campaignIds = (approvals ?? [])
    .filter((approval) => approval.action_type === "activate_campaign")
    .map((approval) => {
      const payload = approval.payload as { campaign_id?: string };
      return payload.campaign_id;
    })
    .filter((id): id is string => Boolean(id));

  const [{ data: leads }, { data: campaigns }] = await Promise.all([
    leadIds.length
      ? supabase
          .from("genesis_leads")
          .select(
            "id,first_name,last_name,email,score,confidence,project_intent"
          )
          .in("id", leadIds)
      : Promise.resolve({ data: [] }),
    campaignIds.length
      ? supabase
          .from("genesis_campaigns")
          .select(
            "id,name,channel,status,hypothesis,offer,primary_metric,target_value,budget,metadata"
          )
          .in("id", campaignIds)
      : Promise.resolve({ data: [] }),
  ]);

  const leadById = new Map((leads ?? []).map((lead) => [lead.id, lead]));
  const campaignById = new Map(
    (campaigns ?? []).map((campaign) => [campaign.id, campaign])
  );

  return (
    <AppShell active="Approvals">
      <header className="page-header">
        <div>
          <p className="eyebrow">HUMAN CONTROL LAYER</p>
          <h1>Approvals</h1>
          <p className="muted">
            Genesis may recommend consequential actions, but handoffs,
            publishing, customer contact, and spend remain bounded by explicit
            human approval.
          </p>
        </div>
        <span className="status-pill">
          {approvals?.length ?? 0} waiting
        </span>
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
            if (approval.action_type === "activate_campaign") {
              const payload = approval.payload as {
                campaign_id?: string;
                channel?: string;
                proposed_budget?: number;
                external_execution_connected?: boolean;
              };
              const campaign = payload.campaign_id
                ? campaignById.get(payload.campaign_id)
                : undefined;

              return (
                <article className="panel approval-card" key={approval.id}>
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">CAMPAIGN ACTIVATION</p>
                      <h2>{campaign?.name ?? "Campaign experiment"}</h2>
                      <p className="muted">
                        {campaign?.channel.replaceAll("_", " ") ??
                          payload.channel?.replaceAll("_", " ") ??
                          "Channel not defined"}
                      </p>
                    </div>
                    <span className="risk-pill">
                      {approval.risk_level} risk
                    </span>
                  </div>

                  <div className="campaign-section">
                    <span>Hypothesis</span>
                    <p>
                      {campaign?.hypothesis ??
                        "Campaign hypothesis is unavailable."}
                    </p>
                  </div>

                  <div className="campaign-section">
                    <span>Offer</span>
                    <p>{campaign?.offer || "Offer not yet defined."}</p>
                  </div>

                  <div className="approval-facts">
                    <div>
                      <span>Primary metric</span>
                      <strong>
                        {campaign?.primary_metric || "Learning outcome"}
                      </strong>
                    </div>
                    <div>
                      <span>Target</span>
                      <strong>
                        {campaign?.target_value === null ||
                        campaign?.target_value === undefined
                          ? "Baseline first"
                          : String(campaign.target_value)}
                      </strong>
                    </div>
                    <div>
                      <span>Proposed spend</span>
                      <strong>
                        {Number(
                          payload.proposed_budget ?? campaign?.budget ?? 0
                        ).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        })}
                      </strong>
                    </div>
                    <div>
                      <span>Channel connector</span>
                      <strong>
                        {payload.external_execution_connected
                          ? "Connected"
                          : "Not connected"}
                      </strong>
                    </div>
                  </div>

                  <div className="notice">
                    Approval authorizes the campaign plan. It does not publish
                    or spend money while the external channel connector is
                    unavailable.
                  </div>

                  <div className="approval-actions">
                    <form action={approveCampaignActivation}>
                      <input
                        name="approvalId"
                        type="hidden"
                        value={approval.id}
                      />
                      <button className="primary-button" type="submit">
                        Approve campaign plan
                      </button>
                    </form>
                    <form action={rejectCampaignActivation}>
                      <input
                        name="approvalId"
                        type="hidden"
                        value={approval.id}
                      />
                      <button className="secondary-button" type="submit">
                        Return to planning
                      </button>
                    </form>
                  </div>
                </article>
              );
            }

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
                  <span className="risk-pill">
                    {approval.risk_level} risk
                  </span>
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
                    <input
                      name="approvalId"
                      type="hidden"
                      value={approval.id}
                    />
                    <button className="primary-button" type="submit">
                      Approve Bilden handoff
                    </button>
                  </form>
                  <form action={rejectBildenHandoff}>
                    <input
                      name="approvalId"
                      type="hidden"
                      value={approval.id}
                    />
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
              Qualified opportunities and campaign activation plans will appear
              here when Genesis reaches a consequential decision boundary.
            </p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
