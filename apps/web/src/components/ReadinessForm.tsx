"use client";

import { useActionState } from "react";
import { updateReadiness } from "@/lib/actions";
import { READINESS_KEYS, READINESS_LABELS, type Readiness } from "@inspyr/shared";

/**
 * Ticking a box here changes what Inspyr recommends tomorrow. That is the whole
 * point: a blocked action names the one thing that unblocks it, and this is
 * where you say that thing now exists.
 */
export function ReadinessForm({ initial }: { initial: Readiness }) {
  const [state, action, pending] = useActionState(updateReadiness, null as { ok?: boolean } | null);

  return (
    <form action={action} className="form-narrow">
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 10 }}>Saved.</div>}
      {READINESS_KEYS.map((key) => (
        <label key={key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input type="checkbox" name={key} defaultChecked={initial[key] === true}
            style={{ width: "auto" }} />
          <span style={{ fontSize: 13.5 }}>{READINESS_LABELS[key]}</span>
        </label>
      ))}
      <button type="submit" disabled={pending} style={{ marginTop: 6 }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
