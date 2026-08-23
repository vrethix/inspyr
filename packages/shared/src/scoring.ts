import { z } from "zod";

/**
 * BUILD_SPEC_v0.1 §7 — interpretable components, never a single magical score
 * from an LLM. Every component is persisted so the reasoning panel can be
 * generated FROM them.
 */
export const SCORE_COMPONENTS = [
  "workspace_relevance",
  "audience_fit",
  "freshness",
  "novelty",
  "source_confidence",
  "historical_topic_fit",
  "strategic_priority",
  "format_potential",
] as const;

export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

/** Weights from BUILD_SPEC_v0.1 §7. Sum = 1.00. */
export const COMPONENT_WEIGHTS: Record<ScoreComponent, number> = {
  workspace_relevance: 0.22,
  audience_fit: 0.18,
  freshness: 0.14,
  novelty: 0.13,
  source_confidence: 0.08,
  historical_topic_fit: 0.12,
  strategic_priority: 0.08,
  format_potential: 0.05,
};

export const ScoreComponentsSchema = z.object(
  Object.fromEntries(SCORE_COMPONENTS.map((k) => [k, z.number().min(0).max(100)])) as Record<
    ScoreComponent,
    z.ZodNumber
  >,
);
export type ScoreComponents = Record<ScoreComponent, number>;

/**
 * Bounded adjustments applied after the weighted base.
 * BUILD_SPEC_v0.1 §7 plus ARCHITECTURE_v0.2 §3.4 (audience fatigue).
 * Each is clamped so no single signal can dominate the interpretable base.
 */
export const ADJUSTMENT_BOUNDS = {
  approval_affinity:   { min: 0,   max: 8 },
  skip_affinity:       { min: -12, max: 0 },
  recently_covered:    { min: -20, max: 0 },
  duplicate_story:     { min: -30, max: 0 },
  topic_fatigue:       { min: -18, max: 0 },
} as const;

export type AdjustmentKey = keyof typeof ADJUSTMENT_BOUNDS;
export type Adjustments = Partial<Record<AdjustmentKey, number>>;

export function clampAdjustment(key: AdjustmentKey, value: number): number {
  const { min, max } = ADJUSTMENT_BOUNDS[key];
  return Math.min(max, Math.max(min, value));
}

export function weightedBase(components: ScoreComponents): number {
  let total = 0;
  for (const key of SCORE_COMPONENTS) {
    total += COMPONENT_WEIGHTS[key] * components[key];
  }
  return total;
}

export function finalScore(components: ScoreComponents, adjustments: Adjustments): number {
  let score = weightedBase(components);
  for (const [k, v] of Object.entries(adjustments) as [AdjustmentKey, number][]) {
    score += clampAdjustment(k, v);
  }
  return Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
}

/**
 * Confidence is a function of evidence, never of model enthusiasm.
 * ARCHITECTURE_v0.2 §1.2 — nothing writes a number without naming its basis.
 */
export const EVIDENCE_TIERS = ["workspace", "channel_baseline", "category_prior", "none"] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

/** ARCHITECTURE_v0.2 §5.5 degradation thresholds (starting parameters). */
export const EVIDENCE_THRESHOLDS = { pointEstimate: 12, intervalOnly: 4 } as const;

export type EvidenceDisplay = "point_estimate" | "interval_only" | "ordering_only";

export function evidenceDisplay(tier: EvidenceTier, sampleSize: number): EvidenceDisplay {
  if (tier === "none") return "ordering_only";
  if (sampleSize >= EVIDENCE_THRESHOLDS.pointEstimate) return "point_estimate";
  if (sampleSize >= EVIDENCE_THRESHOLDS.intervalOnly) return "interval_only";
  return "ordering_only";
}
