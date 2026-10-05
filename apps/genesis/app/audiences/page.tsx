import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function AudiencesPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) redirect("/login");

  const { data: workspace } = await supabase
    .from("genesis_workspaces")
    .select("id")
    .eq("slug", "genesis")
    .single();

  const { data: audiences } = workspace
    ? await supabase
        .from("genesis_audiences")
        .select(
          "id,market_brief_id,name,description,geography,traits,problems,intents,objections,triggers,exclusions,confidence,status,created_at"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] };

  const briefIds = (audiences ?? [])
    .map((audience) => audience.market_brief_id)
    .filter((id): id is string => Boolean(id));

  const { data: briefs } = briefIds.length
    ? await supabase
        .from("genesis_market_briefs")
        .select("id,title,geography,evidence_mode,status")
        .in("id", briefIds)
    : { data: [] };

  const briefById = new Map(
    (briefs ?? []).map((brief) => [brief.id, brief])
  );

  return (
    <AppShell active="Audiences">
      <header className="page-header">
        <div>
          <p className="eyebrow">AUDIENCE INTELLIGENCE</p>
          <h1>Audiences</h1>
          <p className="muted">
            Audience records are hypotheses tied back to the market brief that
            produced them, not permanent personas treated as fact.
          </p>
        </div>
      </header>

      <section className="audience-library">
        {audiences?.length ? (
          audiences.map((audience) => {
            const brief = audience.market_brief_id
              ? briefById.get(audience.market_brief_id)
              : undefined;

            return (
              <article className="panel audience-profile" key={audience.id}>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">
                      {brief?.title ?? "MARKET HYPOTHESIS"}
                    </p>
                    <h2>{audience.name}</h2>
                    <p className="muted">
                      {brief?.geography ?? "Geography not linked"}
                    </p>
                  </div>
                  <div className="confidence-score">
                    <strong>
                      {Math.round(Number(audience.confidence ?? 0) * 100)}%
                    </strong>
                    <span>confidence</span>
                  </div>
                </div>

                <p>{audience.description}</p>

                <div className="audience-profile-grid">
                  <div>
                    <span>Traits</span>
                    <ul>
                      {strings(audience.traits).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>Problems</span>
                    <ul>
                      {strings(audience.problems).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>Intent signals</span>
                    <ul>
                      {strings(audience.intents).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>Objections</span>
                    <ul>
                      {strings(audience.objections).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>Triggers</span>
                    <ul>
                      {strings(audience.triggers).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>Exclusions</span>
                    <ul>
                      {strings(audience.exclusions).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <article className="panel">
            <p className="eyebrow">NO AUDIENCES YET</p>
            <h2>Audience hypotheses originate in Market Intelligence</h2>
            <p className="muted">
              Run the first market brief to generate and register candidate
              audience segments.
            </p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
