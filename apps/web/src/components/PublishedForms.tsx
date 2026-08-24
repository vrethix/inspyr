"use client";

import { useActionState } from "react";
import { addPublication, logMetrics } from "@/lib/actions";
import { CHANNEL_METRICS, METRIC_LABELS, type MetricKey } from "@inspyr/shared";

export function AddPublicationForm() {
  const [state, action, pending] = useActionState(
    addPublication, null as { error?: string; ok?: boolean } | null,
  );

  return (
    <form action={action} className="form-narrow">
      {state?.error && <div className="error">{state.error}</div>}
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 8 }}>Added.</div>}

      <label>
        <span className="label-text">What did you publish?</span>
        <input name="title" required placeholder="Thread about agent wallet permissions" />
      </label>

      <div className="row">
        <label>
          <span className="label-text">Where</span>
          <select name="channel">
            <option value="x">X</option>
            <option value="linkedin">LinkedIn</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </select>
        </label>
        <label>
          <span className="label-text">Days ago</span>
          <input name="daysAgo" inputMode="numeric" placeholder="0" defaultValue="0" />
        </label>
      </div>

      <label>
        <span className="label-text">Link</span>
        <span className="label-hint">Optional.</span>
        <input name="externalUrl" placeholder="https://…" />
      </label>

      <label>
        <span className="label-text">Topics</span>
        <span className="label-hint">One per line. Inspyr learns which topics work for you.</span>
        <textarea name="topics" style={{ minHeight: 56 }} placeholder={"agent wallets\nprivacy"} />
      </label>

      <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
    </form>
  );
}

export function MetricsForm({ publicationId, channel }: { publicationId: string; channel: string }) {
  const [state, action, pending] = useActionState(
    logMetrics, null as { error?: string; ok?: boolean; explanation?: string } | null,
  );
  const keys = (CHANNEL_METRICS[channel] ?? CHANNEL_METRICS.x!) as MetricKey[];

  return (
    <form action={action} style={{ marginTop: 8 }}>
      <input type="hidden" name="publicationId" value={publicationId} />
      {state?.error && <div className="error">{state.error}</div>}
      {state?.ok && (
        <div className="note" style={{ color: "var(--ok)", marginBottom: 8 }}>
          {state.explanation}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        {keys.map((key) => (
          <label key={key} style={{ marginBottom: 0 }}>
            <span className="label-text" style={{ fontSize: 11.5 }}>{METRIC_LABELS[key]}</span>
            <input name={key} inputMode="numeric" placeholder="—" />
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8 }}>
        <label style={{ marginBottom: 0, width: 120 }}>
          <span className="label-text" style={{ fontSize: 11.5 }}>Hours after posting</span>
          <select name="horizonHours" defaultValue="24">
            <option value="1">1</option>
            <option value="24">24</option>
            <option value="168">7 days</option>
          </select>
        </label>
        <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save numbers"}</button>
      </div>
    </form>
  );
}
