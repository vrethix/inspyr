import { z } from "zod";
import { ACTION_TYPES, HOOK_TYPES, CTA_TYPES } from "./channels";

/**
 * BUILD_SPEC_v0.1 §5.4 — "Changing platform does NOT simply reformat the same
 * draft." Each channel therefore gets its own schema, not a shared blob with
 * optional fields. A tight contract is also what makes structured generation
 * reliable.
 */

export const ActionTypeSchema = z.enum(ACTION_TYPES);
export const HookTypeSchema = z.enum(HOOK_TYPES);
export const CtaTypeSchema = z.enum(CTA_TYPES);

const shared = {
  /** Why this shape, for this channel, for this audience. Prose, never numbers. */
  rationale: z.string().min(1).max(600),
  hook_type: HookTypeSchema,
  cta_type: CtaTypeSchema,
};

export const XDraftSchema = z.object({
  ...shared,
  action_type: z.enum(["post", "thread", "quote_post", "reply_sequence", "no_action"]),
  /** One entry per post. A single post is an array of one. Empty for no_action. */
  posts: z.array(z.string().min(1).max(280)).max(18),
  /** Only for no_action: what to do instead. */
  instead: z.string().max(400).optional(),
});
export type XDraft = z.infer<typeof XDraftSchema>;

export const LinkedInDraftSchema = z.object({
  ...shared,
  action_type: z.enum(["post", "article", "no_action"]),
  /** First two lines decide everything — they appear before "see more". */
  hook: z.string().min(1).max(220),
  body: z.string().min(1).max(3000),
  instead: z.string().max(400).optional(),
});
export type LinkedInDraft = z.infer<typeof LinkedInDraftSchema>;

export const InstagramDraftSchema = z.object({
  ...shared,
  action_type: z.enum(["carousel", "reel", "no_action"]),
  first_frame: z.string().max(120),
  slides: z.array(z.object({
    heading: z.string().min(1).max(90),
    body: z.string().max(280),
    visual: z.string().max(200),
  })).max(10),
  caption: z.string().max(2200),
  instead: z.string().max(400).optional(),
});
export type InstagramDraft = z.infer<typeof InstagramDraftSchema>;

export const YouTubeDraftSchema = z.object({
  ...shared,
  action_type: z.enum(["explainer_video", "no_action"]),
  title: z.string().min(1).max(70),
  thumbnail_concept: z.string().max(300),
  /** Must pay off the title immediately. No channel intro. */
  opening_30s: z.string().max(900),
  sections: z.array(z.object({
    heading: z.string().min(1).max(90),
    beats: z.array(z.string().max(300)).max(8),
    /** Where viewers are likely to leave, named honestly. */
    retention_risk: z.string().max(200),
  })).max(10),
  description: z.string().max(1500),
  instead: z.string().max(400).optional(),
});
export type YouTubeDraft = z.infer<typeof YouTubeDraftSchema>;

export const DRAFT_SCHEMAS = {
  x: XDraftSchema,
  linkedin: LinkedInDraftSchema,
  instagram: InstagramDraftSchema,
  youtube: YouTubeDraftSchema,
} as const;

export type DraftContent = XDraft | LinkedInDraft | InstagramDraft | YouTubeDraft;

/** Flattens any draft into the shape the constraint checker understands. */
export function draftSurface(channel: string, content: DraftContent): {
  items?: string[]; text?: string; title?: string; caption?: string;
} {
  switch (channel) {
    case "x":
      return { items: (content as XDraft).posts };
    case "linkedin": {
      const d = content as LinkedInDraft;
      return { text: `${d.hook}\n\n${d.body}` };
    }
    case "instagram": {
      const d = content as InstagramDraft;
      return {
        items: d.slides.map((s) => `${s.heading}\n${s.body}`),
        caption: d.caption,
      };
    }
    case "youtube": {
      const d = content as YouTubeDraft;
      return {
        title: d.title,
        text: [d.opening_30s, ...d.sections.flatMap((s) => s.beats)].join("\n"),
      };
    }
    default:
      return {};
  }
}

/** All human-readable text in a draft, for repetition and grounding checks. */
export function draftText(channel: string, content: DraftContent): string {
  const surface = draftSurface(channel, content);
  return [surface.title, surface.text, surface.caption, ...(surface.items ?? [])]
    .filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- review

/**
 * BUILD_SPEC_v0.1 §6.7 Quality Reviewer.
 *
 * Note the absence of scores. ARCHITECTURE_v0.2 §1.1 forbids an LLM writing a
 * number, so the reviewer returns categorical verdicts and specific findings;
 * the numbers beside them (constraint violations, repetition, grounding
 * coverage) are computed deterministically in code.
 */
export const ReviewSchema = z.object({
  voice: z.object({
    verdict: z.enum(["match", "drift", "off"]),
    note: z.string().max(400),
  }),
  clarity: z.object({
    verdict: z.enum(["clear", "muddy"]),
    note: z.string().max(400),
  }),
  hook: z.object({
    verdict: z.enum(["strong", "adequate", "weak"]),
    note: z.string().max(400),
  }),
  structure: z.object({
    verdict: z.enum(["native", "translated", "wrong_format"]),
    note: z.string().max(400),
  }),
  claims: z.array(z.object({
    text: z.string().max(300),
    status: z.enum(["supported", "unsupported", "contradicted"]),
    note: z.string().max(300),
  })).max(12),
  /** Exactly one. A list of suggestions is a way of not having an opinion. */
  one_improvement: z.string().min(1).max(400),
});
export type Review = z.infer<typeof ReviewSchema>;

export interface ComputedChecks {
  constraintViolations: string[];
  /** 0..1 lexical similarity to the closest thing already published. */
  repetitionRisk: number;
  closestPriorTitle: string | null;
  /** Fraction of the reviewer's claims marked supported. */
  groundingCoverage: number | null;
}
