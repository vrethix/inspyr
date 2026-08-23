import { z } from "zod";

/**
 * Every AI output that enters product state passes through one of these.
 * BUILD_SPEC_v0.1 §28.7 — typed schemas and validation, no free-form text
 * reaching the database.
 */

/** Understanding Worker output — BUILD_SPEC_v0.1 §6.2 */
export const UnderstandingSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(1200),
  topics: z.array(z.string().min(2).max(60)).max(12),
  entities: z.array(z.string().min(1).max(80)).max(20),
  claims: z.array(
    z.object({
      text: z.string().min(1).max(400),
      /** Whether the claim is supported by the source text itself. */
      supported: z.boolean(),
    }),
  ).max(12),
  content_type: z.enum([
    "announcement", "research", "tutorial", "opinion", "release",
    "discussion", "news", "reference", "other",
  ]),
  /** 0-100. How much the source itself justifies confidence in the facts. */
  source_confidence: z.number().min(0).max(100),
});
export type Understanding = z.infer<typeof UnderstandingSchema>;

export const ANGLE_KINDS = [
  "explain", "argue", "teach", "founder_story",
  "contrarian", "playbook", "visual_breakdown",
] as const;
export const AngleKindSchema = z.enum(ANGLE_KINDS);
export type AngleKind = z.infer<typeof AngleKindSchema>;

export const AngleSchema = z.object({
  kind: AngleKindSchema,
  headline: z.string().min(1).max(160),
  thesis: z.string().min(1).max(500),
  why_this_workspace: z.string().min(1).max(400),
});
export type Angle = z.infer<typeof AngleSchema>;

/**
 * Opportunity Scout synthesis. Note what is NOT here: no score, no lift, no
 * percentage. ARCHITECTURE_v0.2 §1.1 — the LLM never writes a number that
 * enters product state. Scores come from the ranker.
 */
export const OpportunitySynthesisSchema = z.object({
  title: z.string().min(1).max(200),
  why_it_matters: z.string().min(1).max(700),
  why_it_fits: z.string().min(1).max(700),
  why_now: z.string().min(1).max(400),
  recommended_angle: AngleKindSchema,
  angles: z.array(AngleSchema).min(2).max(4),
  recommended_outputs: z.array(
    z.object({
      platform: z.enum(["x", "linkedin", "instagram", "youtube"]),
      format: z.string().min(1).max(80),
      rationale: z.string().min(1).max(300),
    }),
  ).min(1).max(4),
});
export type OpportunitySynthesis = z.infer<typeof OpportunitySynthesisSchema>;

/**
 * Guard against fabricated metrics leaking out of a model.
 * BUILD_SPEC_v0.1 §28 + ARCHITECTURE_v0.2 §19.23 — asserted in tests, and
 * enforced at runtime on every AI output before it is persisted.
 */
const NUMERIC_CLAIM_PATTERNS: RegExp[] = [
  /\b\d[\d,]*\s*(?:k|m|bn)?\s*(?:impressions|views|followers|subscribers|likes|saves|replies|shares|clicks)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:x|×)\s*(?:baseline|lift|more|better|higher)?\b/i,
  /\b\d+(?:\.\d+)?\s*%\s*(?:lift|increase|conversion|engagement|growth|ctr|retention|confidence)?/i,
  /\bconfidence[:\s]+\d+/i,
];

export function findFabricatedMetrics(text: string): string[] {
  const hits: string[] = [];
  for (const re of NUMERIC_CLAIM_PATTERNS) {
    const m = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
    if (m) hits.push(...m.map((s) => s.trim()));
  }
  return [...new Set(hits)];
}

/**
 * Scans every string field of a validated AI object. Any metric-shaped claim is
 * a build failure, not a warning — the model has no basis for it.
 */
export function assertNoFabricatedMetrics(
  value: unknown,
  context: string,
  /**
   * Keys holding text quoted verbatim from a source (e.g. `claims`) are exempt:
   * a number the source itself stated is evidence, not fabrication. Everything
   * the model WROTE is checked.
   */
  opts: { skipKeys?: string[] } = {},
): void {
  const skip = new Set(opts.skipKeys ?? []);
  const found: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") found.push(...findFabricatedMetrics(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) if (!skip.has(k)) walk(val);
    }
  };
  walk(value);
  if (found.length) {
    throw new Error(
      `[${context}] model output contains fabricated metrics: ${JSON.stringify(found)}. ` +
      `Models predict, LLMs explain (ARCHITECTURE_v0.2 §1.1).`,
    );
  }
}
