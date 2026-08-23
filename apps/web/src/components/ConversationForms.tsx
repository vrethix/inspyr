"use client";

import { useActionState } from "react";
import { addConversation, logReplyOutcome, updateAudienceSize, updateFacts } from "@/lib/actions";

export function AddConversationForm() {
  const [state, action, pending] = useActionState(
    addConversation, null as { error?: string; ok?: boolean; eligible?: boolean; score?: number } | null,
  );

  return (
    <form action={action} className="form-narrow">
      {state?.error && <div className="error">{state.error}</div>}
      {state?.ok && (
        <div className="note" style={{ color: state.eligible ? "var(--ok)" : "var(--warn)", marginBottom: 10 }}>
          {state.eligible
            ? `Worth entering — scored ${state.score?.toFixed(1)}.`
            : "Judged not worth entering. See the gate below."}
        </div>
      )}

      <label>
        <span className="label-text">Post URL</span>
        <input name="url" required placeholder="https://x.com/…/status/…" />
      </label>

      <div className="row">
        <label>
          <span className="label-text">Author</span>
          <input name="authorHandle" placeholder="@handle" />
        </label>
        <label>
          <span className="label-text">Their followers</span>
          <input name="authorFollowers" required inputMode="numeric" placeholder="8400" />
        </label>
      </div>

      <div className="row">
        <label>
          <span className="label-text">Replies already</span>
          <span className="label-hint">The number under the post.</span>
          <input name="replyDepth" required inputMode="numeric" placeholder="4" />
        </label>
        <label>
          <span className="label-text">Minutes old</span>
          <input name="ageMinutes" required inputMode="numeric" placeholder="12" />
        </label>
      </div>

      <label>
        <span className="label-text">What they said</span>
        <textarea name="text" required style={{ minHeight: 70 }}
          placeholder="Paste the post text so Inspyr can tell whether you have anything concrete to add." />
      </label>

      <button type="submit" data-variant="primary" disabled={pending}>
        {pending ? "Judging…" : "Should I reply?"}
      </button>
    </form>
  );
}

export function ReplyOutcomeForm({ targetId }: { targetId: string }) {
  const [state, action, pending] = useActionState(logReplyOutcome, null as { ok?: boolean } | null);

  return (
    <form action={action} style={{ marginTop: 10 }}>
      <input type="hidden" name="targetId" value={targetId} />
      {state?.ok && <div className="note" style={{ color: "var(--ok)" }}>Recorded. The prior moved.</div>}
      <div className="row" style={{ marginBottom: 8 }}>
        <input name="impressions" inputMode="numeric" placeholder="impressions" />
        <input name="engagements" inputMode="numeric" placeholder="engagements" />
        <input name="profileVisits" inputMode="numeric" placeholder="profile visits" />
        <input name="followsGained" inputMode="numeric" placeholder="follows" />
      </div>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "I replied — log the outcome"}</button>
      <p className="note" style={{ marginTop: 5 }}>
        Impressions are not success. A profile visit or a follow is.
      </p>
    </form>
  );
}

export function AudienceSizeForm({ initial }: { initial: Record<string, number> }) {
  const [state, action, pending] = useActionState(updateAudienceSize, null as { ok?: boolean } | null);
  return (
    <form action={action} className="form-narrow">
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 8 }}>Saved.</div>}
      <div className="row">
        {(["x", "linkedin", "instagram", "youtube"] as const).map((p) => (
          <label key={p}>
            <span className="label-text">{p}</span>
            <input name={p} inputMode="numeric" defaultValue={initial[p] ?? ""} placeholder="0" />
          </label>
        ))}
      </div>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save follower counts"}</button>
    </form>
  );
}

export function FactsForm({ initial }: { initial: string[] }) {
  const [state, action, pending] = useActionState(updateFacts, null as { ok?: boolean } | null);
  return (
    <form action={action} className="form-narrow">
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 8 }}>Saved.</div>}
      <label>
        <span className="label-text">What you can concretely contribute</span>
        <span className="label-hint">
          One per line. Specific facts, design decisions, measurements — the things that make a
          reply worth reading. Inspyr refuses replies where you have none of these to offer.
        </span>
        <textarea name="facts" defaultValue={initial.join("\n")} style={{ minHeight: 130 }}
          placeholder={"We scope agent wallet permissions per-session so a compromised agent cannot drain funds.\nOur paper trading mode runs the same execution path as live."} />
      </label>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
