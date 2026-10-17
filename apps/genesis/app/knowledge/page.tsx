import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import {
  createKnowledgeSource,
  setKnowledgeSourceStatus,
} from "@/app/actions/control-plane";
import { createClient } from "@/lib/supabase/server";
import { getFoundationWorkspace } from "@/lib/genesis/workspace";
import { SubmitButton } from "@/app/work/_components/submit-button";

type KnowledgeMetadata = {
  trust_level?: string;
  scope?: string | null;
  notes?: string | null;
  verification_status?: string;
  credentials_stored?: boolean;
};

function KnowledgeLoadError({ message }: { message: string }) {
  return <AppShell active="Knowledge">
    <header className="page-header"><div><p className="eyebrow">EVIDENCE CONTROL</p><h1>Knowledge</h1></div></header>
    <div className="notice error" role="alert">{message} <a href="/knowledge">Reload Knowledge</a></div>
  </AppShell>;
}

function sourceWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function sourceMetadata(value: unknown): KnowledgeMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  return {
    trust_level: typeof candidate.trust_level === "string" ? candidate.trust_level : undefined,
    scope: typeof candidate.scope === "string" ? candidate.scope : null,
    notes: typeof candidate.notes === "string" ? candidate.notes : null,
    verification_status: typeof candidate.verification_status === "string" ? candidate.verification_status : undefined,
  };
}

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
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const ownerId = claimsData?.claims?.sub;

  if (claimsError || !ownerId) redirect("/login");

  const { workspace, error: workspaceError } = await getFoundationWorkspace(supabase, ownerId);
  if (workspaceError || !workspace) return <KnowledgeLoadError message="Your selected workspace could not be loaded." />;

  const { data: sources, error: sourcesError } = await supabase
        .from("genesis_knowledge_sources")
        .select(
          "id,source_type,name,uri,status,metadata,last_synced_at,created_at,updated_at"
        )
        .eq("workspace_id", workspace.id)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });
  if (sourcesError) return <KnowledgeLoadError message="Knowledge references could not be loaded. Refresh before adding or changing a source." />;

  return (
    <AppShell active="Knowledge">
      <header className="page-header">
        <div>
          <p className="eyebrow">EVIDENCE CONTROL</p>
          <h1>Knowledge</h1>
          <p className="muted">
            Register references for {workspace.name} and classify their trust
            levels. Registration records a reference; its content still needs
            to be supplied and reviewed before use.
          </p>
        </div>
        <span className="status-pill">{sources?.length ?? 0} sources</span>
      </header>

      {params.created === "1" ? (
        <div className="notice success" role="status">Knowledge source registered.</div>
      ) : null}
      {params.updated && ["active", "paused", "archived"].includes(params.updated) ? (
        <div className="notice success" role="status">
          Knowledge source status updated: <strong>{params.updated}</strong>.
        </div>
      ) : null}
      {params.error ? <div className="notice error" role="alert">{params.error}</div> : null}

      <section className="content-grid">
        <article className="panel">
          <p className="eyebrow">REGISTER SOURCE</p>
          <h2>Add a reference</h2>
          <p className="muted small-copy">
            Do not enter passwords, API keys, tokens, or other credentials here.
            Connector secrets belong in the integration provider&apos;s secure
            environment configuration.
          </p>

          <form action={createKnowledgeSource} className="form-grid">
            <input name="workspaceId" type="hidden" value={workspace.id} />
            <label>
              Source name
              <input
                name="name"
                placeholder="Operating standards"
                maxLength={160}
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
                maxLength={2000}
                placeholder="Optional URL, file reference, or internal location"
              />
            </label>

            <label>
              Scope
              <input
                name="scope"
                maxLength={500}
                placeholder="Example: internal planning and review"
              />
            </label>

            <label>
              Operator notes
              <textarea
                name="notes"
                rows={4}
                maxLength={5000}
                placeholder="What Genesis may use this source for, known limitations, or review requirements."
              />
            </label>

            <SubmitButton className="primary-button" pendingLabel="Registering…">
              Register knowledge source
            </SubmitButton>
          </form>
        </article>

        <article className="panel span-two">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SOURCE REGISTER</p>
              <h2>Registered references</h2>
            </div>
          </div>

          {sources?.length ? (
            <div className="knowledge-list">
              {sources.map((source) => {
                const metadata = sourceMetadata(source.metadata);
                const active = source.status === "active";
                const webUrl = typeof source.uri === "string" ? sourceWebUrl(source.uri) : null;

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
                        <span className="table-status">{metadata.verification_status?.replaceAll("_", " ") ?? "unverified"}</span>
                      </div>
                      <strong>{source.name}</strong>
                      <p className="muted">
                        {metadata.scope || "Scope not specified."}
                      </p>
                      {source.uri ? (
                        webUrl ? <a href={webUrl} target="_blank" rel="noopener noreferrer"><small>{source.uri}</small></a> : <small className="muted">{source.uri}</small>
                      ) : null}
                      {metadata.notes ? (
                        <p className="knowledge-note">{metadata.notes}</p>
                      ) : null}
                    </div>

                    <form action={setKnowledgeSourceStatus}>
                      <input name="workspaceId" type="hidden" value={workspace.id} />
                      <input name="sourceId" type="hidden" value={source.id} />
                      <input name="expectedStatus" type="hidden" value={source.status} />
                      <input
                        name="status"
                        type="hidden"
                        value={active ? "paused" : "active"}
                      />
                      <SubmitButton className="secondary-button" pendingLabel="Saving…" disabled={!["active", "paused", "archived"].includes(source.status)}>
                        {active ? "Pause source" : "Activate source"}
                      </SubmitButton>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="placeholder">
              No knowledge sources are registered in this workspace. Add a
              reference and describe its intended use and limitations.
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
