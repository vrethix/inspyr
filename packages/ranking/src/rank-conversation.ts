import {
  CONVERSATION_GATES, GATE_EXPLANATIONS, REACH_BAND_VALUE,
  reachBand, replyRecencyScore, depthScore, formatAge, tokenize, lexicalSimilarity,
  type GateFailure, type ReachBand,
} from "@inspyr/shared";
import type { WorkspaceProfile, OperatorSignal } from "./types";

/**
 * Ranking a conversation is not ranking a story.
 *
 * A story is scored on whether it is worth saying. A conversation is scored on
 * whether you will be *seen* saying it — and at low follower counts that is the
 * only question that matters. So the components are different, and two of them
 * are hard gates rather than weights.
 */

export interface ConversationCandidate {
  id: string;
  url: string;
  authorHandle: string;
  authorFollowers: number;
  postedAt: Date;
  replyDepth: number;
  text: string;
  topics: string[];
}

export interface ConversationRankingInput {
  candidate: ConversationCandidate;
  workspace: WorkspaceProfile;
  /** Facts this workspace can contribute — pillars, docs, shipped things. */
  contributableFacts: string[];
  operatorSignals: OperatorSignal[];
  now: Date;
}

export const CONVERSATION_WEIGHTS = {
  reply_position: 0.30,
  recency: 0.24,
  author_reach: 0.20,
  contribution: 0.18,
  topical_fit: 0.08,
} as const;

export type ConversationComponent = keyof typeof CONVERSATION_WEIGHTS;

export interface ConversationRankingResult {
  score: number;
  /** Failed gates. Non-empty means do not reply, whatever the score says. */
  gateFailures: { gate: GateFailure; reason: string }[];
  eligible: boolean;
  components: Record<ConversationComponent, number>;
  reasons: { component: string; value: number; explanation: string }[];
  reachBand: ReachBand;
  ageMinutes: number;
  /** What you would actually add. Empty means you have nothing to say here. */
  contribution: string | null;
}

/**
 * Do we have something concrete to add?
 *
 * Tako's failed reply is the canonical negative: "no octopus yet, we'll have to
 * build our way into the next one" — personality, zero information. Their own
 * rule said *a concrete fact or design lesson*, and nothing enforced it.
 */
function findContribution(
  candidate: ConversationCandidate,
  facts: string[],
): { score: number; text: string | null; detail: string } {
  if (!facts.length) {
    return { score: 0, text: null, detail: "No contributable facts configured for this workspace." };
  }

  let best: { fact: string; similarity: number } | null = null;
  for (const fact of facts) {
    const similarity = lexicalSimilarity(
      `${candidate.text} ${candidate.topics.join(" ")}`,
      fact,
    );
    if (!best || similarity > best.similarity) best = { fact, similarity };
  }

  if (!best || best.similarity < 0.08) {
    return {
      score: 0,
      text: null,
      detail: "Nothing in this workspace speaks to what is being discussed.",
    };
  }

  return {
    score: Math.round(Math.min(100, best.similarity * 260) * 100) / 100,
    text: best.fact,
    detail: `You can answer this from: "${best.fact.slice(0, 80)}".`,
  };
}

export function rankConversation(input: ConversationRankingInput): ConversationRankingResult {
  const { candidate, workspace, now } = input;
  const ageMinutes = Math.max(0, (now.getTime() - candidate.postedAt.getTime()) / 60_000);
  const band = reachBand(candidate.authorFollowers);

  // ---- gates: mechanism, not statistics. These disqualify. ----
  const gateFailures: { gate: GateFailure; reason: string }[] = [];

  if (candidate.replyDepth >= CONVERSATION_GATES.maxReplyDepth) {
    gateFailures.push({
      gate: "reply_depth",
      reason: GATE_EXPLANATIONS.reply_depth(String(candidate.replyDepth)),
    });
  }
  if (ageMinutes > CONVERSATION_GATES.maxAgeMinutes) {
    gateFailures.push({ gate: "stale", reason: GATE_EXPLANATIONS.stale(formatAge(ageMinutes)) });
  }
  if (candidate.authorFollowers < CONVERSATION_GATES.minAuthorFollowers) {
    gateFailures.push({
      gate: "author_too_small",
      reason: GATE_EXPLANATIONS.author_too_small(String(candidate.authorFollowers)),
    });
  }

  const contribution = findContribution(candidate, input.contributableFacts);
  if (contribution.score === 0) {
    gateFailures.push({ gate: "no_contribution", reason: GATE_EXPLANATIONS.no_contribution("") });
  }

  const pillarTokens = new Set(workspace.pillars.flatMap((p) => tokenize(p)));
  const candidateTokens = tokenize(`${candidate.text} ${candidate.topics.join(" ")}`);
  const overlap = new Set(candidateTokens.filter((t) => pillarTokens.has(t)));
  const topicalFit = pillarTokens.size
    ? Math.min(100, (overlap.size / pillarTokens.size) * 130)
    : 50;

  if (topicalFit < 8) {
    gateFailures.push({ gate: "off_topic", reason: GATE_EXPLANATIONS.off_topic("") });
  }

  // ---- components ----
  const components: Record<ConversationComponent, number> = {
    reply_position: depthScore(candidate.replyDepth),
    recency: replyRecencyScore(ageMinutes),
    author_reach: REACH_BAND_VALUE[band],
    contribution: contribution.score,
    topical_fit: Math.round(topicalFit * 100) / 100,
  };

  const explanations: Record<ConversationComponent, string> = {
    reply_position: candidate.replyDepth === 0
      ? "First reply — maximum visibility."
      : `${candidate.replyDepth} replies ahead of you.`,
    recency: `Posted ${formatAge(ageMinutes)} ago.`,
    author_reach: band === "mid" || band === "small"
      ? `${candidate.authorFollowers.toLocaleString()} followers — large enough to borrow, small enough to be seen.`
      : band === "micro"
        ? `${candidate.authorFollowers.toLocaleString()} followers — little audience to borrow.`
        : `${candidate.authorFollowers.toLocaleString()} followers — your reply competes with many others.`,
    contribution: contribution.detail,
    topical_fit: overlap.size
      ? `Matches your pillars on: ${[...overlap].slice(0, 4).join(", ")}.`
      : "No pillar overlap.",
  };

  let base = 0;
  for (const key of Object.keys(CONVERSATION_WEIGHTS) as ConversationComponent[]) {
    base += CONVERSATION_WEIGHTS[key] * components[key];
  }

  // Learned adjustment, applied online — no training set, no batch fit.
  const signal = input.operatorSignals.find(
    (s) => s.dimension === "reply_context" && s.key === band,
  );
  if (signal) base += signal.effect * signal.confidence * 10;

  const eligible = gateFailures.length === 0;

  return {
    // A gated conversation scores zero. Not "low" — zero. It is not a candidate.
    score: eligible ? Math.round(Math.min(100, Math.max(0, base)) * 100) / 100 : 0,
    gateFailures,
    eligible,
    components,
    reasons: (Object.keys(CONVERSATION_WEIGHTS) as ConversationComponent[])
      .map((k) => ({ component: k, value: components[k], explanation: explanations[k] }))
      .sort((a, b) => CONVERSATION_WEIGHTS[b.component as ConversationComponent] * b.value
                    - CONVERSATION_WEIGHTS[a.component as ConversationComponent] * a.value),
    reachBand: band,
    ageMinutes: Math.round(ageMinutes),
    contribution: contribution.text,
  };
}

/**
 * The answer that matters most at low follower counts.
 *
 * A timeline post reaches, at most, the people who follow you. Below a floor
 * that is not a distribution strategy and Inspyr should say so plainly rather
 * than proposing content.
 */
export const TIMELINE_REACH_FLOOR = 300;

export function timelineViability(followerCount: number): {
  viable: boolean;
  message: string;
} {
  if (followerCount >= TIMELINE_REACH_FLOOR) {
    return { viable: true, message: "" };
  }
  return {
    viable: false,
    message:
      `Your timeline reaches about ${followerCount} account${followerCount === 1 ? "" : "s"}. `
      + `Posting here is not distribution — replies into other people's audiences are. `
      + `This is arithmetic, not a judgement about the content.`,
  };
}
