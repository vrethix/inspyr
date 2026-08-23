"use client";

import { useActionState } from "react";
import { updateMemory } from "@/lib/actions";

export function MemoryForm({ initial }: {
  initial: { objective: string; audience: string; voice: string; pillars: string[]; avoid: string[]; priorities: string[] };
}) {
  const [state, action, pending] = useActionState(updateMemory, null as { ok?: boolean } | null);

  return (
    <form action={action} className="form-narrow">
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 10 }}>Saved.</div>}
      <label>
        <span className="label-text">Objective</span>
        <input name="objective" defaultValue={initial.objective} />
      </label>
      <label>
        <span className="label-text">Audience</span>
        <input name="audience" defaultValue={initial.audience} />
      </label>
      <label>
        <span className="label-text">Voice</span>
        <input name="voice" defaultValue={initial.voice} />
      </label>
      <label>
        <span className="label-text">Content pillars</span>
        <textarea name="pillars" defaultValue={initial.pillars.join("\n")} />
      </label>
      <label>
        <span className="label-text">Topics to avoid</span>
        <textarea name="avoid" defaultValue={initial.avoid.join("\n")} style={{ minHeight: 56 }} />
      </label>
      <label>
        <span className="label-text">Priorities this cycle</span>
        <textarea name="priorities" defaultValue={initial.priorities.join("\n")} style={{ minHeight: 46 }} />
      </label>
      <button type="submit" data-variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
