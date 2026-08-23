import type {
  Platform, DraftContent, XDraft, LinkedInDraft, InstagramDraft, YouTubeDraft,
} from "@inspyr/shared";

/**
 * Deterministic drafts for when no model is configured.
 *
 * Deliberately skeletal. These are scaffolds that show the shape a channel
 * wants, not content — and the UI labels them as such, so a heuristic draft is
 * never mistaken for a written one.
 */

interface Input {
  title: string;
  whyItMatters: string;
  angle: string;
  angleThesis: string;
  audience: string;
  sources: { title: string; url: string | null; summary: string }[];
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function heuristicDraft(channel: Platform, input: Input): DraftContent {
  const source = input.sources[0];
  const rationale =
    `Scaffold only — no model configured. Structure follows the ${channel} format for a `
    + `"${input.angle}" angle; the writing still has to be done.`;

  switch (channel) {
    case "x": {
      const draft: XDraft = {
        action_type: "thread",
        hook_type: "statement",
        cta_type: "follow",
        rationale,
        posts: [
          clip(input.angleThesis, 280),
          clip(input.whyItMatters, 280),
          clip(`What this changes for ${input.audience || "builders"}: —`, 280),
          ...(source?.url ? [clip(`Source: ${source.url}`, 280)] : []),
        ],
      };
      return draft;
    }
    case "linkedin": {
      const draft: LinkedInDraft = {
        action_type: "post",
        hook_type: "statement",
        cta_type: "reply",
        rationale,
        hook: clip(input.angleThesis, 220),
        body: [
          input.whyItMatters,
          "",
          "What it means in practice: —",
          "",
          "The principle underneath: —",
          "",
          source?.url ? `Source: ${source.url}` : "",
        ].filter(Boolean).join("\n"),
      };
      return draft;
    }
    case "instagram": {
      const draft: InstagramDraft = {
        action_type: "carousel",
        hook_type: "question",
        cta_type: "save",
        rationale,
        first_frame: clip(input.title, 120),
        slides: [
          { heading: clip(input.title, 90), body: "", visual: "Title frame, high contrast." },
          { heading: "The problem", body: clip(input.whyItMatters, 280), visual: "Before state." },
          { heading: "What changed", body: clip(input.angleThesis, 280), visual: "After state." },
          { heading: "How it works", body: "—", visual: "Step diagram." },
          { heading: "Why it matters", body: "—", visual: "Implication." },
          { heading: "Takeaway", body: "—", visual: "One sentence, large type." },
        ],
        caption: clip(`${input.whyItMatters}\n\n${source?.url ?? ""}`.trim(), 2200),
      };
      return draft;
    }
    case "youtube": {
      const draft: YouTubeDraft = {
        action_type: "explainer_video",
        hook_type: "question",
        cta_type: "subscribe",
        rationale,
        title: clip(input.title, 70),
        thumbnail_concept: "Single subject, one short phrase, no face required.",
        opening_30s: clip(input.angleThesis, 900),
        sections: [
          { heading: "What happened", beats: [clip(input.whyItMatters, 300)], retention_risk: "Viewers who already know this leave here." },
          { heading: "How it works", beats: ["—"], retention_risk: "Density spike; keep one idea per beat." },
          { heading: "Why it matters", beats: ["—"], retention_risk: "Abstraction without an example loses people." },
        ],
        description: clip([input.whyItMatters, source?.url].filter(Boolean).join("\n\n"), 1500),
      };
      return draft;
    }
  }
}
