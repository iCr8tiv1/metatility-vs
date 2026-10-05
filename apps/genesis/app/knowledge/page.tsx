import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import {
  createKnowledgeSource,
  setKnowledgeSourceStatus,
} from "@/app/actions/control-plane";
import { createClient } from "@/lib/supabase/server";

type KnowledgeMetadata = {
  trust_level?: string;
  scope?: string | null;
  notes?: string | null;
  verification_status?: string;
  credentials_stored?: boolean;
};

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    updated?: string;
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

  const { data: sources } = workspace
    ? await supabase
        .from("genesis_knowledge_sources")
        .select(
          "id,source_type,name,uri,status,metadata,last_synced_at,created_at,updated_at"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <AppShell active="Knowledge">
      <header className="page-header">
        <div>
          <p className="eyebrow">EVIDENCE CONTROL</p>
          <h1>Knowledge</h1>
          <p className="muted">
            Register the sources Genesis may rely on and classify their trust
            level. A registered source is not automatically treated as verified.
          </p>
        </div>
        <span className="status-pill">{sources?.length ?? 0} sources</span>
      </header>

      {params.created ? (
        <div className="notice success">Knowledge source registered.</div>
      ) : null}
      {params.updated ? (
        <div className="notice success">
          Knowledge source status updated: <strong>{params.updated}</strong>.
        </div>
      ) : null}
      {params.error ? <div className="notice error">{params.error}</div> : null}

      <section className="content-grid">
        <article className="panel">
          <p className="eyebrow">REGISTER SOURCE</p>
          <h2>Add evidence context</h2>
          <p className="muted small-copy">
            Do not enter passwords, API keys, tokens, or other credentials here.
            Connector secrets belong in the integration provider&apos;s secure
            environment configuration.
          </p>

          <form action={createKnowledgeSource} className="form-grid">
            <label>
              Source name
              <input
                name="name"
                placeholder="Bilden brand standards"
                required
              />
            </label>

            <label>
              Source type
              <select name="sourceType" defaultValue="internal_document">
                <option value="internal_document">Internal document</option>
                <option value="brand_standard">Brand standard</option>
                <option value="service_catalog">Service catalog</option>
                <option value="case_study">Case study</option>
                <option value="pricing_reference">Pricing reference</option>
                <option value="faq">FAQ / knowledge base</option>
                <option value="web_reference">Web reference</option>
                <option value="policy">Policy / operating rule</option>
              </select>
            </label>

            <label>
              Trust level
              <select name="trustLevel" defaultValue="internal">
                <option value="authoritative">Authoritative</option>
                <option value="internal">Internal</option>
                <option value="reference">Reference</option>
                <option value="unverified">Unverified</option>
              </select>
            </label>

            <label>
              URI or source location
              <input
                name="uri"
                placeholder="Optional URL, file reference, or internal location"
              />
            </label>

            <label>
              Scope
              <input
                name="scope"
                placeholder="Example: Bilden residential services and messaging"
              />
            </label>

            <label>
              Operator notes
              <textarea
                name="notes"
                rows={4}
                placeholder="What Genesis may use this source for, known limitations, or review requirements."
              />
            </label>

            <button className="primary-button" type="submit">
              Register knowledge source
            </button>
          </form>
        </article>

        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SOURCE REGISTER</p>
              <h2>Available evidence</h2>
            </div>
          </div>

          {sources?.length ? (
            <div className="knowledge-list">
              {sources.map((source) => {
                const metadata = (source.metadata ?? {}) as KnowledgeMetadata;
                const active = source.status === "active";

                return (
                  <article className="knowledge-row" key={source.id}>
                    <div className="knowledge-main">
                      <div className="inline-badges">
                        <span className="table-status">{source.status}</span>
                        <span className="table-status">
                          {metadata.trust_level ?? "unclassified"}
                        </span>
                        <span className="table-status">
                          {source.source_type.replaceAll("_", " ")}
                        </span>
                      </div>
                      <strong>{source.name}</strong>
                      <p className="muted">
                        {metadata.scope || "No scope restriction recorded."}
                      </p>
                      {source.uri ? (
                        <small className="muted">{source.uri}</small>
                      ) : null}
                      {metadata.notes ? (
                        <p className="knowledge-note">{metadata.notes}</p>
                      ) : null}
                    </div>

                    <form action={setKnowledgeSourceStatus}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <input
                        name="status"
                        type="hidden"
                        value={active ? "paused" : "active"}
                      />
                      <button className="secondary-button" type="submit">
                        {active ? "Pause source" : "Activate source"}
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="placeholder">
              No knowledge sources are registered yet. Until sources are added,
              Genesis should continue treating market and customer assertions as
              hypotheses rather than evidence.
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
