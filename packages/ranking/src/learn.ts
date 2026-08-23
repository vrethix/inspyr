import type { FeedbackEventType } from "@inspyr/shared";

/**
 * BUILD_SPEC_v0.1 §8 + ARCHITECTURE_v0.2 §9 — the fast loop.
 *
 * At 1-3 publications a day, outcome learning needs weeks before a signal has
 * the sample size to fire. Operator behaviour produces dozens of events a day
 * from the first session. So skips, rejects and saves are what make acceptance
 * criterion #12 ("yesterday's decision changes today's ranking") true in week
 * one — outcome learning layers on later without changing this interface.
 */

/** How strongly each operator action speaks. Rejection is louder than a skip. */
export const EVENT_VALENCE: Partial<Record<FeedbackEventType, number>> = {
  opportunity_created: 1.0,
  opportunity_saved: 0.8,
  opportunity_viewed: 0.05,
  opportunity_skipped: -0.5,
  opportunity_rejected: -1.0,
};

export const LEARNING_CONFIG = {
  /** EWMA weight for the most recent event. Recent behaviour dominates. */
  alpha: 0.35,
  /** Shrinkage constant: effect is pulled toward zero until evidence accrues. */
  shrinkage: 3,
  /** Below this, a signal exists but stays inactive — it must not move ranking. */
  minSampleSize: 2,
  /** Confidence saturation. */
  confidenceK: 5,
} as const;

export interface LearningEvent {
  eventType: FeedbackEventType;
  keys: string[];      // topics touched by the decision
  createdAt: Date;
}

export interface DerivedSignal {
  dimension: "topic";
  key: string;
  effect: number;       // -1..1, shrunk
  confidence: number;   // 0..1
  sampleSize: number;
  active: boolean;
  source: "repeated_skips" | "repeated_approvals" | "mixed";
  evidenceStart: Date;
  evidenceEnd: Date;
}

/**
 * Folds an event stream into per-topic signals.
 *
 * Deliberately conservative: shrinkage toward zero plus a minimum sample size
 * means a single skip never suppresses a topic. §8.4 — do not jump to RL.
 */
export function deriveOperatorSignals(events: LearningEvent[]): DerivedSignal[] {
  const byKey = new Map<string, LearningEvent[]>();

  for (const event of events) {
    if (EVENT_VALENCE[event.eventType] === undefined) continue;
    for (const key of event.keys) {
      const k = key.toLowerCase().trim();
      if (!k) continue;
      const list = byKey.get(k) ?? [];
      list.push(event);
      byKey.set(k, list);
    }
  }

  const signals: DerivedSignal[] = [];

  for (const [key, list] of byKey) {
    const ordered = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    // `viewed` is ambient — it shouldn't inflate the sample size that gates a signal.
    const decisive = ordered.filter((e) => e.eventType !== "opportunity_viewed");
    if (!decisive.length) continue;

    let ewma = 0;
    let initialised = false;
    for (const event of ordered) {
      const v = EVENT_VALENCE[event.eventType]!;
      ewma = initialised ? LEARNING_CONFIG.alpha * v + (1 - LEARNING_CONFIG.alpha) * ewma : v;
      initialised = true;
    }

    const n = decisive.length;
    const shrunk = ewma * (n / (n + LEARNING_CONFIG.shrinkage));
    const confidence = n / (n + LEARNING_CONFIG.confidenceK);

    const positives = decisive.filter((e) => EVENT_VALENCE[e.eventType]! > 0).length;
    const negatives = decisive.length - positives;

    signals.push({
      dimension: "topic",
      key,
      effect: Math.round(Math.max(-1, Math.min(1, shrunk)) * 1000) / 1000,
      confidence: Math.round(confidence * 1000) / 1000,
      sampleSize: n,
      active: n >= LEARNING_CONFIG.minSampleSize,
      source: negatives && !positives ? "repeated_skips"
        : positives && !negatives ? "repeated_approvals"
        : "mixed",
      evidenceStart: ordered[0]!.createdAt,
      evidenceEnd: ordered[ordered.length - 1]!.createdAt,
    });
  }

  return signals.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}

/** Human-readable form for the Growth page — "what Inspyr learned", not a chart. */
export function describeSignal(signal: DerivedSignal): string {
  const strength = Math.abs(signal.effect);
  const adverb = strength > 0.6 ? "consistently" : strength > 0.3 ? "usually" : "slightly";
  const n = `${signal.sampleSize} decision${signal.sampleSize === 1 ? "" : "s"}`;
  return signal.effect < 0
    ? `You ${adverb} pass on "${signal.key}" — down-ranked based on ${n}.`
    : `You ${adverb} act on "${signal.key}" — up-ranked based on ${n}.`;
}
