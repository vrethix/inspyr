"use client";

import { useActionState, useState } from "react";
import { saveDraft } from "@/lib/actions";
import type { DraftContent, XDraft, LinkedInDraft, InstagramDraft, YouTubeDraft } from "@inspyr/shared";

/**
 * §5.4 — a native editor per channel, not one textarea reused four times.
 * The editing surface differs because the artefact differs.
 */
export function DraftEditor({ draftId, opportunityId, channel, initial, readOnly }: {
  draftId: string;
  opportunityId: string;
  channel: string;
  initial: DraftContent;
  readOnly?: boolean;
}) {
  const [content, setContent] = useState<DraftContent>(initial);
  const [state, action, pending] = useActionState(saveDraft, null as { error?: string; ok?: boolean } | null);
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);

  const patch = (fields: Partial<DraftContent>) =>
    setContent((c) => ({ ...c, ...fields }) as DraftContent);

  return (
    <form action={action}>
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="content" value={JSON.stringify(content)} />

      {state?.error && <div className="error">{state.error}</div>}
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 8 }}>Saved as a new version.</div>}

      {channel === "x" && <XEditor draft={content as XDraft} patch={patch} readOnly={readOnly} />}
      {channel === "linkedin" && <LinkedInEditor draft={content as LinkedInDraft} patch={patch} readOnly={readOnly} />}
      {channel === "instagram" && <InstagramEditor draft={content as InstagramDraft} patch={patch} readOnly={readOnly} />}
      {channel === "youtube" && <YouTubeEditor draft={content as YouTubeDraft} patch={patch} readOnly={readOnly} />}

      {!readOnly && (
        <div className="actions">
          <button type="submit" data-variant="primary" disabled={!dirty || pending}>
            {pending ? "Saving…" : dirty ? "Save edit" : "No changes"}
          </button>
          {dirty && (
            <button type="button" onClick={() => setContent(initial)}>Revert</button>
          )}
        </div>
      )}
      {dirty && (
        <p className="note" style={{ marginTop: 6 }}>
          Your edit is stored as a diff. How much you rewrite is the clearest signal Inspyr gets.
        </p>
      )}
    </form>
  );
}

function CharCount({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <span className="mono" style={{ fontSize: 11, color: over ? "var(--accent)" : "var(--ink-3)" }}>
      {value.length}/{limit}
    </span>
  );
}

function XEditor({ draft, patch, readOnly }: { draft: XDraft; patch: (f: Partial<XDraft>) => void; readOnly?: boolean }) {
  if (draft.action_type === "no_action") return <NoAction instead={draft.instead} />;
  return (
    <>
      {draft.posts.map((post, i) => (
        <label key={i}>
          <span className="label-text" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Post {i + 1}</span>
            <CharCount value={post} limit={280} />
          </span>
          <textarea
            value={post}
            readOnly={readOnly}
            style={{ minHeight: 66 }}
            onChange={(e) => {
              const posts = [...draft.posts];
              posts[i] = e.target.value;
              patch({ posts });
            }}
          />
        </label>
      ))}
      {!readOnly && (
        <button type="button" onClick={() => patch({ posts: [...draft.posts, ""] })}
          style={{ marginBottom: 12 }}>+ Add post</button>
      )}
    </>
  );
}

function LinkedInEditor({ draft, patch, readOnly }: { draft: LinkedInDraft; patch: (f: Partial<LinkedInDraft>) => void; readOnly?: boolean }) {
  if (draft.action_type === "no_action") return <NoAction instead={draft.instead} />;
  return (
    <>
      <label>
        <span className="label-text" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Hook</span><CharCount value={draft.hook} limit={220} />
        </span>
        <span className="label-hint">These lines appear before &ldquo;see more&rdquo;.</span>
        <textarea value={draft.hook} readOnly={readOnly} style={{ minHeight: 58 }}
          onChange={(e) => patch({ hook: e.target.value })} />
      </label>
      <label>
        <span className="label-text" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Body</span><CharCount value={draft.body} limit={3000} />
        </span>
        <textarea value={draft.body} readOnly={readOnly} style={{ minHeight: 280 }}
          onChange={(e) => patch({ body: e.target.value })} />
      </label>
    </>
  );
}

function InstagramEditor({ draft, patch, readOnly }: { draft: InstagramDraft; patch: (f: Partial<InstagramDraft>) => void; readOnly?: boolean }) {
  if (draft.action_type === "no_action") return <NoAction instead={draft.instead} />;
  return (
    <>
      <label>
        <span className="label-text">First frame</span>
        <span className="label-hint">Must work as a standalone image, under ten words.</span>
        <input value={draft.first_frame} readOnly={readOnly}
          onChange={(e) => patch({ first_frame: e.target.value })} />
      </label>
      {draft.slides.map((slide, i) => (
        <div key={i} className="panel" style={{ marginBottom: 10 }}>
          <div className="panel-title">Slide {i + 1}</div>
          <input value={slide.heading} readOnly={readOnly} placeholder="Heading"
            style={{ marginBottom: 6 }}
            onChange={(e) => {
              const slides = [...draft.slides];
              slides[i] = { ...slides[i]!, heading: e.target.value };
              patch({ slides });
            }} />
          <textarea value={slide.body} readOnly={readOnly} placeholder="Body"
            style={{ minHeight: 52, marginBottom: 6 }}
            onChange={(e) => {
              const slides = [...draft.slides];
              slides[i] = { ...slides[i]!, body: e.target.value };
              patch({ slides });
            }} />
          <input value={slide.visual} readOnly={readOnly} placeholder="Visual direction"
            onChange={(e) => {
              const slides = [...draft.slides];
              slides[i] = { ...slides[i]!, visual: e.target.value };
              patch({ slides });
            }} />
        </div>
      ))}
      <label>
        <span className="label-text" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Caption</span><CharCount value={draft.caption} limit={2200} />
        </span>
        <textarea value={draft.caption} readOnly={readOnly} style={{ minHeight: 100 }}
          onChange={(e) => patch({ caption: e.target.value })} />
      </label>
    </>
  );
}

function YouTubeEditor({ draft, patch, readOnly }: { draft: YouTubeDraft; patch: (f: Partial<YouTubeDraft>) => void; readOnly?: boolean }) {
  if (draft.action_type === "no_action") return <NoAction instead={draft.instead} />;
  return (
    <>
      <label>
        <span className="label-text" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Title</span><CharCount value={draft.title} limit={70} />
        </span>
        <span className="label-hint">Promise a specific answer, not a topic.</span>
        <input value={draft.title} readOnly={readOnly}
          onChange={(e) => patch({ title: e.target.value })} />
      </label>
      <label>
        <span className="label-text">Thumbnail concept</span>
        <input value={draft.thumbnail_concept} readOnly={readOnly}
          onChange={(e) => patch({ thumbnail_concept: e.target.value })} />
      </label>
      <label>
        <span className="label-text">Opening 30 seconds</span>
        <span className="label-hint">Pays off the title immediately. No channel intro.</span>
        <textarea value={draft.opening_30s} readOnly={readOnly} style={{ minHeight: 96 }}
          onChange={(e) => patch({ opening_30s: e.target.value })} />
      </label>
      {draft.sections.map((section, i) => (
        <div key={i} className="panel" style={{ marginBottom: 10 }}>
          <div className="panel-title">Section {i + 1}</div>
          <input value={section.heading} readOnly={readOnly} style={{ marginBottom: 6 }}
            onChange={(e) => {
              const sections = [...draft.sections];
              sections[i] = { ...sections[i]!, heading: e.target.value };
              patch({ sections });
            }} />
          <textarea value={section.beats.join("\n")} readOnly={readOnly}
            style={{ minHeight: 78, marginBottom: 6 }}
            onChange={(e) => {
              const sections = [...draft.sections];
              sections[i] = { ...sections[i]!, beats: e.target.value.split("\n") };
              patch({ sections });
            }} />
          <div className="note" data-tone="warn">Retention risk: {section.retention_risk}</div>
        </div>
      ))}
      <label>
        <span className="label-text">Description</span>
        <textarea value={draft.description} readOnly={readOnly} style={{ minHeight: 90 }}
          onChange={(e) => patch({ description: e.target.value })} />
      </label>
    </>
  );
}

/** ARCHITECTURE_v0.2 §6 — no_action is a first-class output, not a failure. */
function NoAction({ instead }: { instead?: string }) {
  return (
    <div className="panel" style={{ borderColor: "var(--warn)" }}>
      <div className="panel-title">Recommendation: do not publish here</div>
      <p style={{ fontSize: 14 }}>
        {instead || "The strongest move on this channel is not to post this."}
      </p>
      <p className="note" style={{ marginTop: 6 }}>
        Choosing not to publish is a legitimate output. It is recorded like any other decision.
      </p>
    </div>
  );
}
