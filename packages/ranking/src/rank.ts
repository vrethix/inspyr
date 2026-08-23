import {
  SCORE_COMPONENTS, COMPONENT_WEIGHTS, finalScore, clampAdjustment,
  fatiguePenalty, explainFatigue, lexicalSimilarity, tokenize,
  type ScoreComponents, type Adjustments, type EvidenceTier,
} from "@inspyr/shared";
import type { RankingInput, RankingResult, RankingReason } from "./types";

/**
 * BUILD_SPEC_v0.1 §7 — the ranker.
 *
 * Every component is computed, bounded and persisted. No LLM produces a score,
 * and no score exists without the components that made it: the reasoning panel
 * in the UI is rendered FROM this output, never from a model's opinion of it.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Starting parameters. Tune against what the operator actually publishes. */
export const RELEVANCE_FLOOR = { relevance: 25, audience: 60 } as const;

/** Overlap of candidate topics with the workspace's declared pillars. */
function workspaceRelevance(input: RankingInput): { value: number; detail: string } {
  const { candidate, workspace } = input;
  if (!workspace.pillars.length) {
    return { value: 50, detail: "No content pillars set — scored neutral." };
  }
  const haystack = `${candidate.title} ${candidate.topics.join(" ")} ${candidate.summary}`.toLowerCase();

  // A declared pillar named outright is the strongest relevance signal there is.
  const phraseHits = workspace.pillars
    .map((p) => p.toLowerCase().trim())
    .filter((p) => p.length > 2 && haystack.includes(p));

  // Token overlap catches pillars expressed in different words.
  const pillarTokens = new Set(workspace.pillars.flatMap((p) => tokenize(p)));
  const distinct = new Set(tokenize(haystack).filter((t) => pillarTokens.has(t)));

  // Compare against title + topics only. Cosine against a 12k-character body is
  // driven toward zero by length normalization and tells us nothing.
  const textual = lexicalSimilarity(
    `${candidate.title} ${candidate.topics.join(" ")}`,
    workspace.pillars.join(" "),
  );

  // Coverage, not a flat per-hit bonus: matching 2 of 3 pillar terms is a far
  // stronger signal than matching 2 of 12, and a per-hit constant cannot say so.
  const coverage = pillarTokens.size ? distinct.size / pillarTokens.size : 0;

  const value = clamp(
    (phraseHits.length ? 58 : 0) +
    coverage * 42 +
    textual * 30,
  );

  const matched = phraseHits.length ? phraseHits : [...distinct];
  return {
    value,
    detail: matched.length
      ? `Matches pillars on: ${matched.slice(0, 4).join(", ")}.`
      : "No pillar term matched; scored on topical proximity only.",
  };
}

/** How well the story suits the declared audience, including avoid-list penalties. */
function audienceFit(input: RankingInput): { value: number; detail: string } {
  const { candidate, workspace } = input;
  const audienceTokens = new Set(tokenize(`${workspace.audience} ${workspace.objective}`));
  const candidateTokens = tokenize(`${candidate.title} ${candidate.summary} ${candidate.topics.join(" ")}`);
  const overlap = new Set(candidateTokens.filter((t) => audienceTokens.has(t)));

  const avoidTokens = new Set(workspace.avoid.flatMap((a) => tokenize(a)));
  const avoidHits = [...new Set(candidateTokens.filter((t) => avoidTokens.has(t)))];

  let value = clamp(40 + overlap.size * 15);
  if (avoidHits.length) value = clamp(value - avoidHits.length * 30);

  return {
    value,
    detail: avoidHits.length
      ? `Touches avoided topics: ${avoidHits.join(", ")}.`
      : overlap.size
        ? `Aligned with stated audience on: ${[...overlap].slice(0, 4).join(", ")}.`
        : "No explicit audience-term overlap.",
  };
}

/** Decays over three days. A story is worth most while it is still live. */
function freshness(input: RankingInput): { value: number; detail: string } {
  const reference = input.candidate.publishedAt ?? input.candidate.newestAt;
  const ageHours = Math.max(0, (input.now.getTime() - reference.getTime()) / 3_600_000);
  const value = clamp(100 * Math.pow(0.5, ageHours / 36));
  const label =
    ageHours < 6 ? "Published in the last few hours."
    : ageHours < 24 ? `About ${Math.round(ageHours)}h old.`
    : `${Math.round(ageHours / 24)} day(s) old.`;
  return { value, detail: label };
}

/** How unlike everything this workspace has already published it is. */
function novelty(input: RankingInput): { value: number; detail: string } {
  const { candidate, priorContent } = input;
  if (!priorContent.length) {
    return { value: 80, detail: "Nothing published yet — treated as novel." };
  }
  const text = `${candidate.title} ${candidate.topics.join(" ")}`;
  let closest = 0;
  let closestTitle = "";
  for (const prior of priorContent) {
    const sim = lexicalSimilarity(text, `${prior.title} ${prior.topics.join(" ")}`);
    if (sim > closest) { closest = sim; closestTitle = prior.title; }
  }
  const value = clamp((1 - closest) * 100);
  return {
    value,
    detail: closest > 0.5
      ? `Close to something you already published: "${closestTitle.slice(0, 60)}".`
      : "No close match in your published content.",
  };
}

function sourceConfidence(input: RankingInput): { value: number; detail: string } {
  const base = clamp(input.candidate.sourceConfidence);
  const corroboration = Math.min(20, (input.candidate.sourceItemCount - 1) * 10);
  return {
    value: clamp(base + corroboration),
    detail: input.candidate.sourceItemCount > 1
      ? `Corroborated by ${input.candidate.sourceItemCount} of your sources.`
      : "Single source.",
  };
}

/** Learned topic affinity from operator behaviour. §8.4 strategy signals. */
function historicalTopicFit(input: RankingInput): { value: number; detail: string } {
  const relevant = input.operatorSignals.filter(
    (s) => s.dimension === "topic" &&
      input.candidate.topics.some((t) => t.toLowerCase() === s.key.toLowerCase()),
  );
  if (!relevant.length) {
    return { value: 50, detail: "No learned history for these topics yet." };
  }
  // Confidence-weighted mean effect, shrunk toward neutral.
  const weight = relevant.reduce((s, r) => s + r.confidence, 0);
  const effect = relevant.reduce((s, r) => s + r.effect * r.confidence, 0) / (weight || 1);
  const value = clamp(50 + effect * 50);
  const top = relevant.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0]!;
  return {
    value,
    detail: `${top.effect >= 0 ? "You engage with" : "You consistently pass on"} "${top.key}" (${top.sampleSize} prior decisions).`,
  };
}

function strategicPriority(input: RankingInput): { value: number; detail: string } {
  const priorities = input.workspace.strategicPriorities.map((p) => p.toLowerCase());
  if (!priorities.length) return { value: 50, detail: "No strategic priorities set." };
  const hit = input.candidate.topics.find((t) => priorities.includes(t.toLowerCase()));
  return hit
    ? { value: 95, detail: `"${hit}" is a stated priority this cycle.` }
    : { value: 35, detail: "Outside this cycle's stated priorities." };
}

/** Whether the material can carry a real format, not just a link-share. */
function formatPotential(input: RankingInput): { value: number; detail: string } {
  const { candidate } = input;
  const byType: Record<string, number> = {
    research: 90, tutorial: 85, release: 70, announcement: 55,
    opinion: 70, discussion: 60, news: 45, reference: 50, other: 50,
  };
  const base = byType[candidate.contentType] ?? 50;
  const depth = Math.min(20, Math.floor(candidate.summary.length / 100) * 4);
  return {
    value: clamp(base + depth),
    detail: `Content type "${candidate.contentType}" supports a substantive format.`,
  };
}

export function rankCandidate(input: RankingInput): RankingResult {
  const computed = {
    workspace_relevance: workspaceRelevance(input),
    audience_fit: audienceFit(input),
    freshness: freshness(input),
    novelty: novelty(input),
    source_confidence: sourceConfidence(input),
    historical_topic_fit: historicalTopicFit(input),
    strategic_priority: strategicPriority(input),
    format_potential: formatPotential(input),
  };

  const components = Object.fromEntries(
    SCORE_COMPONENTS.map((k) => [k, Math.round(computed[k].value * 100) / 100]),
  ) as ScoreComponents;

  const reasons: RankingReason[] = SCORE_COMPONENTS.map((k) => ({
    component: k,
    value: components[k],
    explanation: computed[k].detail,
  })).sort((a, b) => COMPONENT_WEIGHTS[b.component as never] * b.value - COMPONENT_WEIGHTS[a.component as never] * a.value);

  // ---- bounded adjustments (§7) + audience fatigue (ARCHITECTURE_v0.2 §3.4) ----
  const adjustments: Adjustments = {};
  const fatigueNotes: string[] = [];

  const approvals = input.operatorSignals.filter(
    (s) => s.effect > 0 && input.candidate.topics.some((t) => t.toLowerCase() === s.key.toLowerCase()),
  );
  if (approvals.length) {
    const strength = approvals.reduce((s, a) => s + a.effect * a.confidence, 0);
    adjustments.approval_affinity = clampAdjustment("approval_affinity", strength * 8);
  }

  const skips = input.operatorSignals.filter(
    (s) => s.effect < 0 && input.candidate.topics.some((t) => t.toLowerCase() === s.key.toLowerCase()),
  );
  if (skips.length) {
    const strength = skips.reduce((s, a) => s + a.effect * a.confidence, 0);
    adjustments.skip_affinity = clampAdjustment("skip_affinity", strength * 12);
  }

  const recentWindowMs = 1000 * 60 * 60 * 24 * 10;
  const recentlyCovered = input.priorContent.filter(
    (p) => input.now.getTime() - p.publishedAt.getTime() < recentWindowMs,
  );
  const coveredMatch = recentlyCovered.find(
    (p) => lexicalSimilarity(
      `${input.candidate.title} ${input.candidate.topics.join(" ")}`,
      `${p.title} ${p.topics.join(" ")}`,
    ) > 0.55,
  );
  if (coveredMatch) {
    adjustments.recently_covered = clampAdjustment("recently_covered", -14);
    fatigueNotes.push(`You covered something very close to this recently: "${coveredMatch.title.slice(0, 60)}".`);
  }

  const relevantFatigue = input.fatigue.filter(
    (f) => f.dimension === "topic" && input.candidate.topics.some((t) => t.toLowerCase() === f.key.toLowerCase()),
  );
  if (relevantFatigue.length) {
    const worst = relevantFatigue.reduce((a, b) => (b.score > a.score ? b : a));
    adjustments.topic_fatigue = fatiguePenalty(worst.score);
    const note = explainFatigue("topic", worst.key, worst.score, worst.recentCount);
    if (note) fatigueNotes.push(note);
  }

  // Evidence basis for anything numeric we surface. ARCHITECTURE_v0.2 §1.2.
  const sampleSize = input.operatorSignals.reduce((s, o) => s + o.sampleSize, 0) + input.priorContent.length;
  const evidenceTier: EvidenceTier =
    sampleSize >= 4 ? "workspace"
    : input.priorContent.length > 0 ? "channel_baseline"
    : "none";

  /**
   * The relevance floor.
   *
   * "I found 6 things worth talking about today" is a promise. Without a floor,
   * a queue of 30 mutually irrelevant items with near-identical scores is
   * ordering by noise and calling it a recommendation. Anything matching no
   * pillar, no audience term and no stated priority is still scored and still
   * inspectable — it is simply not proposed.
   */
  const qualifies =
    components.workspace_relevance >= RELEVANCE_FLOOR.relevance ||
    components.audience_fit >= RELEVANCE_FLOOR.audience ||
    components.strategic_priority >= 90;

  return {
    score: finalScore(components, adjustments),
    components,
    adjustments,
    reasons,
    fatigueNotes,
    evidenceTier,
    evidenceSampleSize: sampleSize,
    qualifies,
  };
}
