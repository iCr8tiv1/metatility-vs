"use client";

import { useActionState, useState } from "react";
import { assignGenesisWork } from "@/app/actions/work";
import { foundationMessages } from "@/lib/genesis/foundation-contract";

export function CommandForm({ requestId, workspaceId }: { requestId: string; workspaceId: string }) {
  const [state, action, pending] = useActionState(assignGenesisWork, { objective: "", idempotencyKey: requestId });
  const [draft, setDraft] = useState("");
  const [editedRequestId, setEditedRequestId] = useState(requestId);
  // An unchanged retry reuses its request key. Editing a failed command is a
  // new intent and must not reuse the previous command's idempotency identity.
  const requestKey = state.code && draft.trim() === state.objective.trim() ? state.idempotencyKey : editedRequestId;
  return (
    <div style={{ flex: 1 }}>
      <form action={action} className="genesis-command-bar">
        <input name="idempotencyKey" type="hidden" value={requestKey} />
        <input name="workspaceId" type="hidden" value={workspaceId} />
        <span className="command-spark" aria-hidden="true">✦</span>
        <input aria-label="Assign Genesis an objective" name="objective" value={draft}
          onChange={(event) => { setDraft(event.target.value); if (state.code) setEditedRequestId(crypto.randomUUID()); }}
          placeholder="Give Genesis a clear objective…" type="text" maxLength={2400} required disabled={pending} />
        <span className="command-hint">Objective → Plan → Review</span>
        <button aria-label={pending ? "Saving objective" : "Assign work"} type="submit" disabled={pending}>{pending ? "…" : "→"}</button>
      </form>
      {state.code ? <p className="cc-notice error" role="alert">{foundationMessages[state.code] ?? "The objective could not be saved."}</p> : null}
    </div>
  );
}
