import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import {
  createMarketBrief,
  planCampaign,
} from "@/app/actions/demand-engine";
import { createClient } from "@/lib/supabase/server";

type Hypothesis = {
  hypothesis?: string;
  rationale?: string;
  evidenceStatus?: string;
  confidence?: number;
};

type ChannelHypothesis = {
  channel?: string;
  rationale?: string;
  confidence?: number;
};

type AudienceRow = {
  id: string;
  market_brief_id: string | null;
  name: string;
  description: string;
  traits: unknown;
  problems: unknown;
  intents: unknown;
  objections: unknown;
  triggers: unknown;
  confidence: number;
  status: string;
};

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function hypotheses(value: unknown) {
  return Array.isArray(value) ? (value as Hypothesis[]) : [];
}

function channels(value: unknown) {
  return Array.isArray(value) ? (value as ChannelHypothesis[]) : [];
}

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    brief?: string;
    error?: string;
  }>;
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

  const { data: briefs } = workspace
    ? await supabase
        .from("genesis_market_briefs")
        .select(
          "id,title,geography,service_lines,business_goal,research_question,evidence_mode,status,summary,market_hypotheses,demand_signals,competitor_hypotheses,channel_hypotheses,evidence_gaps,confidence,created_at"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] };

  const briefIds = (briefs ?? []).map((brief) => brief.id);

  const { data: audiences } = briefIds.length
    ? await supabase
        .from("genesis_audiences")
        .select(
          "id,market_brief_id,name,description,traits,problems,intents,objections,triggers,confidence,status"
        )
        .in("market_brief_id", briefIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const audiencesByBrief = new Map<string, AudienceRow[]>();

  for (const audience of (audiences ?? []) as AudienceRow[]) {
    if (!audience.market_brief_id) continue;
    const existing = audiencesByBrief.get(audience.market_brief_id) ?? [];
    existing.push(audience);
    audiencesByBrief.set(audience.market_brief_id, existing);
  }

  return (
    <AppShell active="Intelligence">
      <header className="page-header">
        <div>
          <p className="eyebrow">MARKET INTELLIGENCE</p>
          <h1>Demand Intelligence</h1>
          <p className="muted">
            Convert business goals into testable market, audience, and channel
            hypotheses before Genesis creates campaigns.
          </p>
        </div>
        <span className="status-pill">Hypothesis-first</span>
      </header>

      {params.created ? (
        <div className="notice success">
          Market Intelligence completed the brief and created audience
          hypotheses.
        </div>
      ) : null}

      {params.error ? <div className="notice error">{params.error}</div> : null}

      <section className="content-grid">
        <article className="panel">
          <p className="eyebrow">NEW MARKET BRIEF</p>
          <h2>Define the question</h2>
          <p className="muted small-copy">
            Genesis currently operates in hypothesis mode. It will not invent
            market statistics or claim live competitive research until external
            evidence sources are connected.
          </p>

          <form action={createMarketBrief} className="form-grid">
            <label>
              Brief title
              <input
                name="title"
                placeholder="Bilden qualified-demand baseline"
                required
              />
            </label>

            <label>
              Geography
              <input
                name="geography"
                placeholder="Define the market or service territory"
                required
              />
            </label>

            <label>
              Service lines
              <input
                name="serviceLines"
                placeholder="Comma-separated: additions, renovations, outdoor living"
                required
              />
            </label>

            <label>
              Business goal
              <textarea
                name="businessGoal"
                rows={4}
                placeholder="Example: increase qualified residential project opportunities while learning which service line and channel produce the strongest sales-ready intent."
                required
              />
            </label>

            <label>
              Research question
              <textarea
                name="researchQuestion"
                rows={3}
                placeholder="What should Genesis learn before investing more marketing effort?"
              />
            </label>

            <button className="primary-button" type="submit">
              Run Market Intelligence
            </button>
          </form>
        </article>

        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">INTELLIGENCE REGISTER</p>
              <h2>Market briefs</h2>
            </div>
            <span className="muted">{briefs?.length ?? 0} recent briefs</span>
          </div>

          {briefs?.length ? (
            <div className="brief-list">
              {briefs.map((brief) => {
                const briefAudiences =
                  audiencesByBrief.get(brief.id) ?? [];
                const marketHypotheses = hypotheses(brief.market_hypotheses);
                const channelHypotheses = channels(brief.channel_hypotheses);
                const evidenceGaps = strings(brief.evidence_gaps);
                const serviceLines = strings(brief.service_lines);

                return (
                  <section className="brief-card" key={brief.id}>
                    <div className="panel-heading">
                      <div>
                        <div className="inline-badges">
                          <span className="table-status">{brief.status}</span>
                          <span className="table-status">
                            {brief.evidence_mode}
                          </span>
                        </div>
                        <h2>{brief.title}</h2>
                        <p className="muted">
                          {brief.geography} · {serviceLines.join(" · ")}
                        </p>
                      </div>
                      <div className="confidence-score">
                        <strong>
                          {Math.round(Number(brief.confidence ?? 0) * 100)}%
                        </strong>
                        <span>confidence</span>
                      </div>
                    </div>

                    {brief.summary ? (
                      <p className="brief-summary">{brief.summary}</p>
                    ) : (
                      <p className="muted">
                        Genesis has not completed this brief yet.
                      </p>
                    )}

                    {marketHypotheses.length ? (
                      <div className="intelligence-section">
                        <h3>Market hypotheses</h3>
                        <div className="hypothesis-list">
                          {marketHypotheses.map((item, index) => (
                            <div className="hypothesis-row" key={index}>
                              <div>
                                <strong>{item.hypothesis}</strong>
                                <p>{item.rationale}</p>
                              </div>
                              <span>
                                {Math.round(
                                  Number(item.confidence ?? 0) * 100
                                )}
                                %
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {channelHypotheses.length ? (
                      <div className="intelligence-section">
                        <h3>Channel hypotheses</h3>
                        <div className="tag-cloud">
                          {channelHypotheses.map((item, index) => (
                            <span className="soft-tag" key={index}>
                              {item.channel?.replaceAll("_", " ")} ·{" "}
                              {Math.round(
                                Number(item.confidence ?? 0) * 100
                              )}
                              %
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {evidenceGaps.length ? (
                      <div className="intelligence-section">
                        <h3>Evidence gaps</h3>
                        <ul className="compact-list">
                          {evidenceGaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {briefAudiences.length ? (
                      <div className="intelligence-section">
                        <div className="panel-heading">
                          <div>
                            <h3>Audience hypotheses</h3>
                            <p className="muted">
                              Choose one audience to turn into a campaign test.
                            </p>
                          </div>
                        </div>

                        <div className="audience-grid">
                          {briefAudiences.map((audience) => (
                            <article
                              className="audience-card"
                              key={audience.id}
                            >
                              <div className="panel-heading">
                                <strong>{audience.name}</strong>
                                <span className="table-status">
                                  {Math.round(
                                    Number(audience.confidence ?? 0) * 100
                                  )}
                                  %
                                </span>
                              </div>
                              <p>{audience.description}</p>

                              <div className="audience-detail">
                                <span>Problems</span>
                                <p>
                                  {strings(audience.problems)
                                    .slice(0, 3)
                                    .join(" · ") || "Not yet defined"}
                                </p>
                              </div>

                              <div className="audience-detail">
                                <span>Triggers</span>
                                <p>
                                  {strings(audience.triggers)
                                    .slice(0, 3)
                                    .join(" · ") || "Not yet defined"}
                                </p>
                              </div>

                              <form action={planCampaign}>
                                <input
                                  name="briefId"
                                  type="hidden"
                                  value={brief.id}
                                />
                                <input
                                  name="audienceId"
                                  type="hidden"
                                  value={audience.id}
                                />
                                <button
                                  className="secondary-button full-width"
                                  type="submit"
                                >
                                  Plan campaign experiment
                                </button>
                              </form>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="placeholder">
              No market briefs yet. Define the first demand question to activate
              Market Intelligence.
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
