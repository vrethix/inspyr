/**
 * Conversation opportunities — the unit of action below ~1,000 followers.
 *
 * At 9 followers a post to your own timeline reaches nine people. That is
 * arithmetic, not strategy. The only distribution available is a reply that
 * borrows someone else's audience, which makes "which conversation to enter"
 * a completely different decision from "which story to cover".
 *
 * Everything in this file is derived from mechanism, not from data. None of
 * these thresholds require a training set, and none of them should wait for
 * one.
 */

export const REACH_BANDS = ["micro", "small", "mid", "large", "mega"] as const;
export type ReachBand = (typeof REACH_BANDS)[number];

export function reachBand(followers: number): ReachBand {
  if (followers < 500) return "micro";
  if (followers < 5_000) return "small";
  if (followers < 50_000) return "mid";
  if (followers < 500_000) return "large";
  return "mega";
}

/**
 * Why mid-size wins, mechanically:
 *
 * - `mega` / `large`: reply volume is high, ranking collapses the tail, and the
 *   author never sees you. Your reply competes with hundreds for a slot.
 * - `micro`: the author sees you, but there is no audience behind them to
 *   borrow. High engagement, no distribution.
 * - `small` / `mid`: few enough replies that yours is visible, large enough
 *   that visibility is worth something.
 */
export const REACH_BAND_VALUE: Record<ReachBand, number> = {
  micro: 25,
  small: 85,
  mid: 100,
  large: 45,
  mega: 15,
};

/**
 * Hard gates. A gate is not a score — it disqualifies.
 *
 * DEPTH: platforms rank replies and collapse the tail behind "show more".
 * A reply arriving past the fold, with no early engagement to lift it, is not
 * seen by anyone. This is a visibility mechanism, not a tendency, so it is a
 * gate rather than a penalty. Tako's failed reply landed at 639: 102
 * impressions, zero engagement, zero conversion. One observation was enough,
 * because the mechanism was already known.
 *
 * AGE: reply distribution rides the parent post's own decay. A reply to a
 * six-hour-old post inherits an audience that has already moved on.
 */
export const CONVERSATION_GATES = {
  maxReplyDepth: 50,
  maxAgeMinutes: 360,
  /** Below this the author has no audience worth borrowing. */
  minAuthorFollowers: 200,
} as const;

export type GateFailure =
  | "reply_depth"
  | "stale"
  | "author_too_small"
  | "no_contribution"
  | "off_topic";

export const GATE_EXPLANATIONS: Record<GateFailure, (v: string) => string> = {
  reply_depth: (v) =>
    `${v} replies already. Past roughly ${CONVERSATION_GATES.maxReplyDepth} the platform collapses the tail — your reply is not seen regardless of quality.`,
  stale: (v) =>
    `Posted ${v} ago. Reply reach rides the parent post's decay; this audience has moved on.`,
  author_too_small: (v) =>
    `Author has ${v} followers. There is no audience here to borrow.`,
  no_contribution: () =>
    `You have nothing concrete to add here — no fact, no design lesson, no correction. Personality without information does not convert.`,
  off_topic: () =>
    `Outside this workspace's pillars. A reply here reaches the wrong people.`,
};

/** Reply visibility decays fast; this curve is steeper than story freshness. */
export function replyRecencyScore(ageMinutes: number): number {
  if (ageMinutes <= 0) return 100;
  // Half-life of 45 minutes: a reply at 3h is worth about an eighth of one at 0.
  return Math.round(100 * Math.pow(0.5, ageMinutes / 45) * 100) / 100;
}

/** Position value collapses well before the hard gate does. */
export function depthScore(replyDepth: number): number {
  if (replyDepth <= 0) return 100;
  if (replyDepth >= CONVERSATION_GATES.maxReplyDepth) return 0;
  // Steep: being 5th is much better than 20th, which is much better than 45th.
  return Math.round(100 * Math.pow(0.92, replyDepth) * 100) / 100;
}

export function formatAge(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}
