import { redirect } from "next/navigation";
import { createLead } from "@/app/actions/leads";
import { AppShell } from "@/app/_components/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    score?: string;
    recommendation?: string;
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

  const { data: leads } = workspace
    ? await supabase
        .from("genesis_leads")
        .select(
          "id,first_name,last_name,email,source,status,score,confidence,project_intent,created_at"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(25)
    : { data: [] };

  return (
    <AppShell active="Leads">
      <header className="page-header">
        <div>
          <p className="eyebrow">LEAD INTELLIGENCE</p>
          <h1>Leads</h1>
          <p className="muted">
            Capture project intent, run qualification, and route high-confidence
            opportunities into the approval queue.
          </p>
        </div>
      </header>

      {params.created ? (
        <div className="notice success">
          Lead processed. Genesis score: <strong>{params.score ?? "—"}</strong>.
          Recommendation:{" "}
          <strong>{params.recommendation?.replaceAll("_", " ") ?? "recorded"}</strong>.
        </div>
      ) : null}

      {params.error ? (
        <div className="notice error">{params.error}</div>
      ) : null}

      <section className="content-grid">
        <article className="panel">
          <p className="eyebrow">NEW LEAD</p>
          <h2>Capture project intent</h2>
          <form action={createLead} className="form-grid">
            <div className="two-fields">
              <label>
                First name
                <input name="firstName" required />
              </label>
              <label>
                Last name
                <input name="lastName" required />
              </label>
            </div>

            <div className="two-fields">
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" />
              </label>
            </div>

            <div className="two-fields">
              <label>
                Lead source
                <select name="source" defaultValue="manual">
                  <option value="manual">Manual</option>
                  <option value="website">Website</option>
                  <option value="organic_search">Organic search</option>
                  <option value="paid_search">Paid search</option>
                  <option value="social">Social</option>
                  <option value="referral">Referral</option>
                </select>
              </label>
              <label>
                Project type
                <input
                  name="projectType"
                  placeholder="Addition, renovation, outdoor living..."
                  required
                />
              </label>
            </div>

            <label>
              Project description
              <textarea
                name="projectDescription"
                placeholder="Describe what the homeowner wants to accomplish."
                rows={4}
              />
            </label>

            <div className="two-fields">
              <label>
                Declared budget
                <input
                  name="budget"
                  type="number"
                  min="0"
                  step="1000"
                  defaultValue="100000"
                />
              </label>
              <label>
                Target timing
                <select name="timeline" defaultValue="3-6">
                  <option value="0-3">0–3 months</option>
                  <option value="3-6">3–6 months</option>
                  <option value="6-12">6–12 months</option>
                  <option value="12+">12+ months</option>
                </select>
              </label>
            </div>

            <label className="checkbox-row">
              <input name="serviceAreaFit" type="checkbox" defaultChecked />
              <span>Inside the currently configured Bilden service area</span>
            </label>

            <label className="checkbox-row">
              <input name="decisionMaker" type="checkbox" defaultChecked />
              <span>Contact is a project decision-maker</span>
            </label>

            <button className="primary-button" type="submit">
              Capture + qualify lead
            </button>
          </form>
        </article>

        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECENT LEADS</p>
              <h2>Qualification queue</h2>
            </div>
            <span className="muted">{leads?.length ?? 0} shown</span>
          </div>

          {leads?.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Project</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const intent = lead.project_intent as {
                      project_type?: string;
                      declared_budget?: number;
                    };

                    return (
                      <tr key={lead.id}>
                        <td>
                          <strong>
                            {lead.first_name} {lead.last_name}
                          </strong>
                          <small>{lead.email}</small>
                        </td>
                        <td>
                          {intent?.project_type ?? "Unclassified"}
                          <small>
                            {Number(intent?.declared_budget ?? 0).toLocaleString(
                              "en-US",
                              {
                                style: "currency",
                                currency: "USD",
                                maximumFractionDigits: 0,
                              }
                            )}
                          </small>
                        </td>
                        <td>{lead.source}</td>
                        <td>
                          <span className="table-status">{lead.status}</span>
                        </td>
                        <td>{Math.round(Number(lead.score ?? 0))}</td>
                        <td>
                          {Math.round(Number(lead.confidence ?? 0) * 100)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="placeholder">
              No leads yet. Use the form to run the first Genesis qualification.
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
