"use client";

import { useActionState, useState } from "react";
import { addSource, importContent } from "@/lib/actions";

const TYPES = [
  { value: "rss", label: "RSS / Atom feed", hint: "Blog, newsletter, or any feed URL" },
  { value: "url", label: "Web page", hint: "A single article or page" },
  { value: "note", label: "Note", hint: "Something you wrote or want to remember" },
  { value: "github", label: "GitHub releases", hint: "owner/name" },
  { value: "youtube", label: "YouTube channel", hint: "Channel URL with /channel/ID" },
];

export function SourceForm() {
  const [type, setType] = useState("rss");
  const [state, action, pending] = useActionState(addSource, null as { error?: string; ok?: boolean } | null);
  const active = TYPES.find((t) => t.value === type)!;

  return (
    <form action={action} className="form-narrow">
      {state?.error && <div className="error">{state.error}</div>}

      <label>
        <span className="label-text">Type</span>
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      {type === "note" ? (
        <>
          <label>
            <span className="label-text">Title</span>
            <input name="label" placeholder="What this note is about" />
          </label>
          <label>
            <span className="label-text">Note</span>
            <textarea name="text" required placeholder="Something you learned, shipped, read or decided." />
          </label>
        </>
      ) : (
        <>
          <label>
            <span className="label-text">{type === "github" ? "Repository" : "URL"}</span>
            <span className="label-hint">{active.hint}</span>
            <input name="url" required placeholder={type === "github" ? "vercel/next.js" : "https://…"} />
          </label>
          <label>
            <span className="label-text">Label</span>
            <span className="label-hint">Optional.</span>
            <input name="label" />
          </label>
        </>
      )}

      <button type="submit" data-variant="primary" disabled={pending}>
        {pending ? "Adding and syncing…" : "Add source"}
      </button>
    </form>
  );
}

/**
 * §22 — import the last 30-90 days of content. Without it, novelty and fatigue
 * have no baseline and every recommendation looks equally new.
 */
export function ImportForm() {
  const [state, action, pending] = useActionState(
    importContent, null as { error?: string; ok?: boolean; count?: number } | null,
  );
  return (
    <form action={action} className="form-narrow">
      {state?.error && <div className="error">{state.error}</div>}
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 8 }}>
        Imported {state.count} item{state.count === 1 ? "" : "s"}.
      </div>}
      <label>
        <span className="label-text">Paste what you have already published</span>
        <span className="label-hint">One per line. Optionally <code>YYYY-MM-DD | text</code>.</span>
        <textarea name="content" required style={{ minHeight: 120 }}
          placeholder={"2026-08-18 | Why inference batching beats bigger GPUs\n2026-08-15 | A short thread on robot policy transfer"} />
      </label>
      <button type="submit" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
    </form>
  );
}
