import type { DraftContent, XDraft, LinkedInDraft, InstagramDraft, YouTubeDraft } from "@inspyr/shared";

/**
 * The part worth hearing.
 *
 * Reading a hook and hearing it are different. A line that scans fine on the
 * page often sounds wrong out loud — too long a breath, a clause that lands
 * flat, a number that is hard to say. Hearing the first fifteen seconds before
 * committing to film anything is cheap and catches most of it.
 */

/** Roughly 15 seconds of speech at a normal pace. */
export const PREVIEW_CHAR_LIMIT = 380;

export interface HookPreview {
  text: string;
  /** What part of the draft this is, for the label in the UI. */
  label: string;
  truncated: boolean;
}

function clip(text: string, limit = PREVIEW_CHAR_LIMIT): { text: string; truncated: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return { text: clean, truncated: false };
  // Cut at a sentence end if there is one nearby, so it does not stop mid-thought.
  const window = clean.slice(0, limit);
  const lastStop = Math.max(window.lastIndexOf("."), window.lastIndexOf("?"), window.lastIndexOf("!"));
  const cut = lastStop > limit * 0.5 ? window.slice(0, lastStop + 1) : window;
  return { text: cut.trim(), truncated: true };
}

export function hookPreview(channel: string, content: DraftContent): HookPreview | null {
  switch (channel) {
    case "x": {
      const d = content as XDraft;
      if (d.action_type === "no_action" || !d.posts.length) return null;
      const { text, truncated } = clip(d.posts[0]!);
      return { text, label: "First post", truncated };
    }
    case "linkedin": {
      const d = content as LinkedInDraft;
      if (d.action_type === "no_action") return null;
      const { text, truncated } = clip(d.hook);
      return { text, label: "Hook", truncated };
    }
    case "instagram": {
      const d = content as InstagramDraft;
      if (d.action_type === "no_action") return null;
      const first = d.slides[0];
      const source = [d.first_frame, first?.heading, first?.body].filter(Boolean).join(". ");
      const { text, truncated } = clip(source);
      return { text, label: "Opening", truncated };
    }
    case "youtube": {
      const d = content as YouTubeDraft;
      if (d.action_type === "no_action") return null;
      const { text, truncated } = clip(d.opening_30s);
      return { text, label: "First 30 seconds", truncated };
    }
    default:
      return null;
  }
}


/**
 * The whole script, as one continuous piece of speech.
 *
 * Distinct from the preview: this is what a creator actually puts under a
 * video. Headings, slide numbers and visual directions are stage directions —
 * they are read by the person making the video, never spoken aloud.
 */
export function fullScript(channel: string, content: DraftContent): string | null {
  switch (channel) {
    case "x": {
      const d = content as XDraft;
      if (d.action_type === "no_action" || !d.posts.length) return null;
      return d.posts.join("\n\n");
    }
    case "linkedin": {
      const d = content as LinkedInDraft;
      if (d.action_type === "no_action") return null;
      return `${d.hook}\n\n${d.body}`;
    }
    case "instagram": {
      const d = content as InstagramDraft;
      if (d.action_type === "no_action") return null;
      // Slide bodies only. "Visual: title frame, high contrast" is a direction,
      // not a line to read out.
      const spoken = d.slides
        .map((s) => [s.heading, s.body].filter(Boolean).join(". "))
        .filter((line) => line.trim().length > 0);
      return [d.first_frame, ...spoken].filter(Boolean).join("\n\n");
    }
    case "youtube": {
      const d = content as YouTubeDraft;
      if (d.action_type === "no_action") return null;
      const body = d.sections.flatMap((s) => s.beats).filter((b) => b.trim() && b !== "—");
      return [d.opening_30s, ...body].join("\n\n");
    }
    default:
      return null;
  }
}

/** Fish charges nothing today, but a 20-minute script is still a bad request. */
export const FULL_SCRIPT_CHAR_LIMIT = 6000;

export function scriptDurationEstimate(text: string): number {
  // ~150 words per minute is a normal narration pace.
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / 150) * 60);
}
