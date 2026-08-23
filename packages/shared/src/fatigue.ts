/**
 * ARCHITECTURE_v0.2 §3.4 — audience state.
 *
 * Audience response is not stationary. Five robotics posts in a row degrades
 * the sixth even when robotics is the workspace's strongest topic. This needs
 * no trained model and works from n=0, which makes it the first thing in the
 * product that produces a genuinely non-obvious recommendation:
 *
 *   "Robotics is your best topic AND you should not post it today."
 */

export interface FatigueInput {
  /** How similar the candidate is to the past item, 0..1 */
  similarity: number;
  /** Hours since that past item was published */
  ageHours: number;
}

export const FATIGUE_DEFAULTS = {
  /** Similarity below this contributes nothing. */
  similarityFloor: 0.35,
  /** Hours for a past item's influence to halve. */
  halfLifeHours: 48,
  /** Past items older than this are ignored entirely. */
  windowHours: 24 * 14,
  /** Fatigue score at which the penalty reaches its bound. */
  saturationAt: 2.5,
} as const;

export function decay(ageHours: number, halfLifeHours = FATIGUE_DEFAULTS.halfLifeHours): number {
  if (ageHours <= 0) return 1;
  return Math.pow(0.5, ageHours / halfLifeHours);
}

/**
 * Accumulated recency-weighted similarity to what was recently published.
 * 0 = nothing like this went out lately. Higher = the audience just saw this.
 */
export function fatigueScore(
  history: FatigueInput[],
  opts: Partial<typeof FATIGUE_DEFAULTS> = {},
): number {
  const cfg = { ...FATIGUE_DEFAULTS, ...opts };
  let total = 0;
  for (const h of history) {
    if (h.ageHours > cfg.windowHours) continue;
    if (h.similarity < cfg.similarityFloor) continue;
    total += h.similarity * decay(h.ageHours, cfg.halfLifeHours);
  }
  return Math.round(total * 1000) / 1000;
}

/** Maps a fatigue score onto the bounded ranking penalty (0 .. -18). */
export function fatiguePenalty(score: number, bound = -18): number {
  const saturated = Math.min(1, score / FATIGUE_DEFAULTS.saturationAt);
  return Math.round(saturated * bound * 100) / 100;
}

export type FatigueLevel = "none" | "light" | "moderate" | "heavy";

export function fatigueLevel(score: number): FatigueLevel {
  if (score < 0.35) return "none";
  if (score < 0.9) return "light";
  if (score < 1.8) return "moderate";
  return "heavy";
}

/** Plain-language explanation. Deterministic — no model involved. */
export function explainFatigue(
  dimension: string,
  key: string,
  score: number,
  recentCount: number,
): string | null {
  const level = fatigueLevel(score);
  if (level === "none") return null;
  const noun = recentCount === 1 ? "post" : "posts";
  const strength =
    level === "heavy" ? "expect a materially weaker response"
    : level === "moderate" ? "expect a weaker response than usual"
    : "expect slightly diminished response";
  return `${recentCount} recent ${noun} covered similar ${dimension} (${key}) — ${strength}.`;
}
