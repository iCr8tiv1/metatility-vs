import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

type AssetMetadata = {
  cta?: string;
  meta_description?: string | null;
  keywords?: string[];
  evidence_notes?: string[];
  original_brief?: string;
  generated_by?: string;
};

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ drafted?: string; error?: string }>;
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

  const { data: assets } = workspace
    ? await supabase
        .from("genesis_campaign_assets")
        .select(
          "id,campaign_id,asset_type,channel,title,content,status,metadata,created_at,updated_at"
        )
        .eq("workspace_id", workspace.id)
        .in("status", ["review", "approved", "draft"])
        .order("updated_at", { ascending: false })
        .limit(60)
    : { data: [] };

  const campaignIds = Array.from(
    new Set((assets ?? []).map((asset) => asset.campaign_id))
  );

  const { data: campaigns } = campaignIds.length
    ? await supabase
        .from("genesis_campaigns")
        .select("id,name,channel,status,metadata")
        .in("id", campaignIds)
    : { data: [] };

  const campaignById = new Map(
    (campaigns ?? []).map((campaign) => [campaign.id, campaign])
  );

  return (
    <AppShell active="Content">
      <header className="page-header">
        <div>
          <p className="eyebrow">CONTENT + SEO</p>
          <h1>Content Review</h1>
          <p className="muted">
            Genesis drafts campaign assets from approved strategy context.
            Nothing here is published automatically.
          </p>
        </div>
        <span className="status-pill">Human review required</span>
      </header>

      {params.drafted ? (
        <div className="notice success">
          Content + SEO generated a draft content package and routed it into
          the approval queue.
        </div>
      ) : null}

      {params.error ? <div className="notice error">{params.error}</div> : null}

      <section className="content-library">
        {assets?.length ? (
          assets.map((asset) => {
            const campaign = campaignById.get(asset.campaign_id);
            const metadata =
              asset.metadata &&
              typeof asset.metadata === "object" &&
              !Array.isArray(asset.metadata)
                ? (asset.metadata as AssetMetadata)
                : {};

            return (
              <article className="panel content-asset-card" key={asset.id}>
                <div className="panel-heading">
                  <div>
                    <div className="inline-badges">
                      <span className="table-status">
                        {asset.asset_type.replaceAll("_", " ")}
                      </span>
                      <span className="table-status">{asset.status}</span>
                    </div>
                    <h2>{asset.title}</h2>
                    <p className="muted">
                      {campaign?.name ?? "Campaign"} ·{" "}
                      {asset.channel.replaceAll("_", " ")}
                    </p>
                  </div>
                </div>

                {asset.status === "draft" && metadata.original_brief == null ? (
                  <div className="campaign-section">
                    <span>Asset brief</span>
                    <p>{asset.content}</p>
                  </div>
                ) : (
                  <>
                    <div className="campaign-section">
                      <span>Draft copy</span>
                      <div className="draft-copy">{asset.content}</div>
                    </div>

                    {metadata.cta ? (
                      <div className="campaign-section">
                        <span>Call to action</span>
                        <p>{metadata.cta}</p>
                      </div>
                    ) : null}

                    {metadata.meta_description ? (
                      <div className="campaign-section">
                        <span>Meta description</span>
                        <p>{metadata.meta_description}</p>
                      </div>
                    ) : null}

                    {strings(metadata.keywords).length ? (
                      <div className="campaign-section">
                        <span>SEO keywords</span>
                        <div className="tag-cloud">
                          {strings(metadata.keywords).map((keyword) => (
                            <span className="soft-tag" key={keyword}>
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {strings(metadata.evidence_notes).length ? (
                      <div className="campaign-section">
                        <span>Evidence / claim checks</span>
                        <ul className="compact-list">
                          {strings(metadata.evidence_notes).map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
              </article>
            );
          })
        ) : (
          <article className="panel">
            <p className="eyebrow">NO CONTENT YET</p>
            <h2>Generate from a campaign experiment</h2>
            <p className="muted">
              Campaign Planner creates asset briefs first. Content + SEO then
              converts those briefs into governed copy for review.
            </p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
