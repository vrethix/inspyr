"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/lib/actions";

/**
 * §4 — one user, multiple identities. The same source item must be allowed to
 * produce different opportunities per workspace, which only works if voice,
 * audience and pillars are captured per workspace up front.
 */
export function WorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, null as { error?: string } | null);

  return (
    <form action={action} className="form-narrow">
      {state?.error && <div className="error">{state.error}</div>}

      <div className="row">
        <label>
          <span className="label-text">Workspace name</span>
          <input name="name" required placeholder="AITorch" />
        </label>
        <label>
          <span className="label-text">Timezone</span>
          <input name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} />
        </label>
      </div>

      <label>
        <span className="label-text">Objective</span>
        <span className="label-hint">What growing actually means here.</span>
        <input name="objective" placeholder="Grow subscribers among technical AI builders" />
      </label>

      <label>
        <span className="label-text">Audience</span>
        <span className="label-hint">Who you are writing for.</span>
        <input name="audience" placeholder="AI engineers, technical founders, serious learners" />
      </label>

      <label>
        <span className="label-text">Voice</span>
        <input name="voice" placeholder="Explanatory, evidence-driven, no hype" />
      </label>

      <label>
        <span className="label-text">Content pillars</span>
        <span className="label-hint">One per line. These drive relevance scoring.</span>
        <textarea name="pillars" placeholder={"AI infrastructure\nrobotics\ninference engineering\ntutorials"} />
      </label>

      <label>
        <span className="label-text">Topics to avoid</span>
        <span className="label-hint">One per line. Penalised in ranking.</span>
        <textarea name="avoid" placeholder={"funding news\ncelebrity drama"} style={{ minHeight: 56 }} />
      </label>

      <label>
        <span className="label-text">Priorities this cycle</span>
        <span className="label-hint">Optional. Boosts matching topics.</span>
        <textarea name="priorities" style={{ minHeight: 46 }} />
      </label>

      <button type="submit" data-variant="primary" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
