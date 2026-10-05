import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

type CampaignMetadata = {
  rationale?: string;
  audience_strategy?: string;
  test_design?: {
    testWindow?: string;
    successCondition?: string;
    failureCondition?: string;
    learningGoal?: string;
  };
  activation_approved?: boolean;
  execution_status?: string;
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ planned?: string; error?: string }>;
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

  const { data: campaigns } = workspace
    ? await supabase
        .from("genesis_campaigns")
        .select(
          "id,name,channel,status,hypothesis,offer,primary_metric,target_value,budget,spend,metadata,audience_id,market_brief_id,created_at"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const campaignIds = (campaigns ?? []).map((campaign) => campaign.id);
  const audienceIds = (campaigns ?? [])
    .map((campaign) => campaign.audience_id)
    .filter((id): id is string => Boolean(id));

  const [{ data: assets }, { data: audiences }, { data: approvals }] =
    await Promise.all([
      campaignIds.length
        ? supabase
            .from("genesis_campaign_assets")
            .select(
              "id,campaign_id,asset_type,channel,title,content,status,metadata"
            )
            .in("campaign_id", campaignIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      audienceIds.length
        ? supabase
            .from("genesis_audiences")
            .select("id,name,description")
            .in("id", audienceIds)
        : Promise.resolve({ data: [] }),
      campaignIds.length
        ? supabase
            .from("genesis_approvals")
            .select("id,status,payload")
            .eq("workspace_id", workspace?.id ?? "")
            .eq("action_type", "activate_campaign")
            .in(
              "status",
              ["pending", "approved", "rejected"]
            )
            .order("requested_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  const assetsByCampaign = new Map<string, typeof assets>();

  for (const asset of assets ?? []) {
    const list = assetsByCampaign.get(asset.campaign_id) ?? [];
    list.push(asset);
    assetsByCampaign.set(asset.campaign_id, list);
  }

  const audienceById = new Map(
    (audiences ?? []).map((audience) => [audience.id, audience])
  );

  const approvalByCampaign = new Map<
    string,
    { id: string; status: string; payload: unknown }
  >();

  for (const approval of approvals ?? []) {
    const payload = approval.payload as { campaign_id?: string };
    if (payload.campaign_id && !approvalByCampaign.has(payload.campaign_id)) {
      approvalByCampaign.set(payload.campaign_id, approval);
    }
  }

  return (
    <AppShell active="Campaigns">
      <header className="page-header">
        <div>
          <p className="eyebrow">CAMPAIGN EXPERIMENTS</p>
          <h1>Campaigns</h1>
          <p className="muted">
            Genesis turns market and audience hypotheses into measurable tests.
            External execution remains blocked until approved and connected.
          </p>
        </div>
      </header>

      {params.planned ? (
        <div className="notice success">
          Campaign Planner created a campaign experiment and routed activation
          into the approval queue.
        </div>
      ) : null}

      {params.error ? <div className="notice error">{params.error}</div> : null}

      <section className="campaign-grid">
        {campaigns?.length ? (
          campaigns.map((campaign) => {
            const metadata = (campaign.metadata ?? {}) as CampaignMetadata;
            const audience = campaign.audience_id
              ? audienceById.get(campaign.audience_id)
              : undefined;
            const campaignAssets = assetsByCampaign.get(campaign.id) ?? [];
            const approval = approvalByCampaign.get(campaign.id);

            return (
              <article className="panel campaign-card" key={campaign.id}>
                <div className="panel-heading">
                  <div>
                    <div className="inline-badges">
                      <span className="table-status">{campaign.status}</span>
                      <span className="table-status">
                        {campaign.channel.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h2>{campaign.name}</h2>
                    <p className="muted">
                      {audience?.name ?? "Audience not linked"}
                    </p>
                  </div>
                  <div className="campaign-control-state">
                    {metadata.activation_approved ? (
                      <span className="status-pill">Approved</span>
                    ) : approval?.status === "pending" ? (
                      <span className="risk-pill">Review required</span>
                    ) : (
                      <span className="table-status">
                        {approval?.status ?? "not reviewed"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="campaign-section">
                  <span>Hypothesis</span>
                  <p>{campaign.hypothesis || "Not defined"}</p>
                </div>

                <div className="campaign-section">
                  <span>Offer</span>
                  <p>{campaign.offer || "Not defined"}</p>
                </div>

                <div className="approval-facts">
                  <div>
                    <span>Primary metric</span>
                    <strong>{campaign.primary_metric || "Learning"}</strong>
                  </div>
                  <div>
                    <span>Target</span>
                    <strong>
                      {campaign.target_value === null
                        ? "Baseline first"
                        : String(campaign.target_value)}
                    </strong>
                  </div>
                  <div>
                    <span>Budget</span>
                    <strong>
                      {Number(campaign.budget ?? 0).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      })}
                    </strong>
                  </div>
                  <div>
                    <span>Execution</span>
                    <strong>
                      {metadata.execution_status?.replaceAll("_", " ") ??
                        "approval pending"}
                    </strong>
                  </div>
                </div>

                {metadata.rationale ? (
                  <div className="campaign-section">
                    <span>Planner rationale</span>
                    <p>{metadata.rationale}</p>
                  </div>
                ) : null}

                {metadata.test_design ? (
                  <div className="test-design">
                    <div>
                      <span>Test window</span>
                      <strong>{metadata.test_design.testWindow}</strong>
                    </div>
                    <div>
                      <span>Success condition</span>
                      <strong>{metadata.test_design.successCondition}</strong>
                    </div>
                    <div>
                      <span>Failure condition</span>
                      <strong>{metadata.test_design.failureCondition}</strong>
                    </div>
                    <div>
                      <span>Learning goal</span>
                      <strong>{metadata.test_design.learningGoal}</strong>
                    </div>
                  </div>
                ) : null}

                <div className="campaign-section">
                  <div className="panel-heading">
                    <div>
                      <span>Draft asset briefs</span>
                    </div>
                    <small className="muted">
                      {campaignAssets.length} assets
                    </small>
                  </div>

                  <div className="asset-list">
                    {campaignAssets.map((asset) => (
                      <div className="asset-row" key={asset.id}>
                        <div>
                          <strong>{asset.title}</strong>
                          <span>
                            {asset.asset_type.replaceAll("_", " ")} ·{" "}
                            {asset.status}
                          </span>
                        </div>
                        <p>{asset.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <article className="panel">
            <p className="eyebrow">NO CAMPAIGNS YET</p>
            <h2>Start from Market Intelligence</h2>
            <p className="muted">
              Create a market brief, select an audience hypothesis, and Genesis
              will create the first measurable campaign experiment.
            </p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
