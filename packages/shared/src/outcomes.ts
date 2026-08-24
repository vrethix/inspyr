/**
 * BUILD_SPEC_v0.1 §8.3 — raw numbers cannot be compared.
 *
 * 400 impressions is good for one account and a failure for another, and the
 * same account's numbers drift as it grows. So every metric is expressed as a
 * ratio against that workspace's own recent baseline on that channel. The unit
 * is "compared to your normal", which is the only unit that means anything.
 */

export const METRIC_KEYS = [
  "impressions", "engagements", "saves", "replies", "shares",
  "profile_visits", "follows", "clicks", "watch_seconds", "retention_pct",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  impressions: "Impressions",
  engagements: "Likes and reactions",
  saves: "Saves or bookmarks",
  replies: "Replies or comments",
  shares: "Shares or reposts",
  profile_visits: "Profile visits",
  follows: "New followers",
  clicks: "Link clicks",
  watch_seconds: "Watch time (seconds)",
  retention_pct: "Retention (%)",
};

/** Which numbers each channel can actually give you. */
export const CHANNEL_METRICS: Record<string, MetricKey[]> = {
  x: ["impressions", "engagements", "replies", "shares", "profile_visits", "follows", "clicks"],
  linkedin: ["impressions", "engagements", "replies", "shares", "profile_visits", "follows", "clicks"],
  instagram: ["impressions", "engagements", "saves", "shares", "profile_visits", "follows"],
  youtube: ["impressions", "engagements", "watch_seconds", "retention_pct", "follows", "clicks"],
};

export type Metrics = Partial<Record<MetricKey, number>>;

/**
 * Rate metrics normalise by reach; the rest do not.
 *
 * A post with 10,000 impressions and 50 saves did worse than one with 500
 * impressions and 20 saves. Comparing raw counts would say the opposite.
 */
export const RATE_METRICS: MetricKey[] = [
  "engagements", "saves", "replies", "shares", "profile_visits", "follows", "clicks",
];

export function toRates(metrics: Metrics): Metrics {
  const impressions = metrics.impressions ?? 0;
  if (impressions <= 0) return { ...metrics };
  const out: Metrics = { ...metrics };
  for (const key of RATE_METRICS) {
    if (typeof metrics[key] === "number") out[key] = metrics[key]! / impressions;
  }
  return out;
}

export interface Baseline {
  /** Median rate per metric across recent publications on this channel. */
  medians: Metrics;
  sampleSize: number;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median, not mean: one viral post should not redefine "normal". */
export function computeBaseline(history: Metrics[]): Baseline {
  const rated = history.map(toRates);
  const medians: Metrics = {};
  for (const key of METRIC_KEYS) {
    const values = rated
      .map((m) => m[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length) medians[key] = median(values);
  }
  return { medians, sampleSize: history.length };
}

/** Minimum history before a lift number means anything. */
export const BASELINE_MIN_SAMPLE = 4;

export type Lifts = Partial<Record<MetricKey, number>>;

/**
 * Lift is a ratio against your own normal. 1.0 is typical, 2.0 is twice as good.
 * Returns nothing at all below the minimum sample — a lift computed against two
 * prior posts is a number pretending to be evidence.
 */
export function computeLifts(metrics: Metrics, baseline: Baseline): Lifts | null {
  if (baseline.sampleSize < BASELINE_MIN_SAMPLE) return null;
  const rated = toRates(metrics);
  const lifts: Lifts = {};
  for (const key of METRIC_KEYS) {
    const value = rated[key];
    const base = baseline.medians[key];
    if (typeof value !== "number" || typeof base !== "number" || base <= 0) continue;
    lifts[key] = Math.round((value / base) * 1000) / 1000;
  }
  return lifts;
}

/**
 * One number, weighted by what the workspace is trying to do (§8.3).
 * Awareness weights reach; audience weights follows; the objective decides.
 */
export const OBJECTIVE_WEIGHTS: Record<string, Partial<Record<MetricKey, number>>> = {
  awareness:  { engagements: 0.30, saves: 0.25, shares: 0.20, follows: 0.15, impressions: 0.10 },
  audience:   { follows: 0.45, profile_visits: 0.25, saves: 0.20, engagements: 0.10 },
  authority:  { saves: 0.35, replies: 0.30, shares: 0.20, follows: 0.15 },
  watch_time: { watch_seconds: 0.40, retention_pct: 0.30, follows: 0.20, engagements: 0.10 },
};

export function outcomeScore(lifts: Lifts | null, objective = "audience"): number | null {
  if (!lifts) return null;
  const weights = OBJECTIVE_WEIGHTS[objective] ?? OBJECTIVE_WEIGHTS.audience!;
  let total = 0;
  let used = 0;
  for (const [key, weight] of Object.entries(weights) as [MetricKey, number][]) {
    const lift = lifts[key];
    if (typeof lift !== "number") continue;
    total += lift * weight;
    used += weight;
  }
  if (used === 0) return null;
  // Re-weight by what was actually available, so a missing metric does not
  // silently drag the score toward zero.
  return Math.round((total / used) * 1000) / 1000;
}

export function describeOutcome(score: number | null, sampleSize: number): string {
  if (score === null) {
    const need = BASELINE_MIN_SAMPLE - sampleSize;
    return need > 0
      ? `No comparison yet — ${need} more published post${need === 1 ? "" : "s"} on this channel and Inspyr can tell you whether this was good.`
      : "Not enough metrics recorded to compare.";
  }
  if (score >= 1.5) return `${score.toFixed(2)}× your normal. Clearly better than usual.`;
  if (score >= 1.15) return `${score.toFixed(2)}× your normal. Better than usual.`;
  if (score >= 0.85) return `${score.toFixed(2)}× your normal. About average for you.`;
  return `${score.toFixed(2)}× your normal. Worse than usual.`;
}
