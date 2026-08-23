import {
  ReviewSchema, DEFAULT_CHANNEL_POLICIES, constraintViolations,
  draftSurface, draftText, lexicalSimilarity, assertNoFabricatedMetrics,
  type Platform, type DraftContent, type Review, type ComputedChecks,
  type ChannelPolicySpec,
} from "@inspyr/shared";
import { type LLMProvider, ModelRefusalError } from "@inspyr/ai";
import { REVIEWER_SYSTEM, buildReviewerPrompt } from "./prompts";

export const REVIEWER_PROMPT_VERSION = "channel-reviewer@v1";

export interface ReviewInput {
  channel: Platform;
  policy: ChannelPolicySpec;
  content: DraftContent;
  workspace: { audience: string; voice: string };
  sources: { title: string; summary: string; claims: string[] }[];
  priorContent: { title: string; topics: string[] }[];
}

export interface ReviewResult {
  review: Review | null;
  checks: ComputedChecks;
  origin: "model" | "checks_only";
}

/**
 * The deterministic half of §6.7.
 *
 * These are the numbers. They are computed, never asserted by a model, which is
 * what lets the review panel show figures at all (ARCHITECTURE_v0.2 §1.1).
 */
export function computeChecks(input: ReviewInput, review: Review | null): ComputedChecks {
  const policy = input.policy ?? DEFAULT_CHANNEL_POLICIES[input.channel];
  const surface = draftSurface(input.channel, input.content);
  const violations = constraintViolations(input.channel, surface, policy.constraints);

  const text = draftText(input.channel, input.content);
  let repetitionRisk = 0;
  let closestPriorTitle: string | null = null;
  for (const prior of input.priorContent) {
    const score = lexicalSimilarity(text, `${prior.title} ${prior.topics.join(" ")}`);
    if (score > repetitionRisk) { repetitionRisk = score; closestPriorTitle = prior.title; }
  }

  const groundingCoverage = review && review.claims.length
    ? review.claims.filter((c) => c.status === "supported").length / review.claims.length
    : null;

  return {
    constraintViolations: violations,
    repetitionRisk: Math.round(repetitionRisk * 1000) / 1000,
    closestPriorTitle,
    groundingCoverage: groundingCoverage === null ? null : Math.round(groundingCoverage * 1000) / 1000,
  };
}

export async function reviewDraft(
  provider: LLMProvider,
  input: ReviewInput,
): Promise<ReviewResult> {
  // Constraint, repetition and format checks never need a model, so a review
  // always returns something useful even with no key configured.
  if (!provider.available) {
    return { review: null, checks: computeChecks(input, null), origin: "checks_only" };
  }

  const prompt = buildReviewerPrompt({
    channelLabel: (input.policy ?? DEFAULT_CHANNEL_POLICIES[input.channel]).label,
    workspace: input.workspace,
    draftText: draftText(input.channel, input.content),
    sources: input.sources,
  });

  try {
    const result = await provider.generateStructured(prompt, ReviewSchema, {
      tier: "cheap",
      system: REVIEWER_SYSTEM,
      promptVersion: REVIEWER_PROMPT_VERSION,
      maxTokens: 4000,
    });
    // `claims` quote the draft, which may legitimately quote a number from the
    // source; the reviewer's own prose may not invent one.
    assertNoFabricatedMetrics(result.value, "reviewer", { skipKeys: ["claims"] });
    return {
      review: result.value,
      checks: computeChecks(input, result.value),
      origin: "model",
    };
  } catch (err) {
    if (err instanceof ModelRefusalError) {
      return { review: null, checks: computeChecks(input, null), origin: "checks_only" };
    }
    throw err;
  }
}

export const REPETITION_WARN_THRESHOLD = 0.55;

/** Plain-language summary of the computed checks. Deterministic. */
export function describeChecks(checks: ComputedChecks): string[] {
  const notes: string[] = [];
  for (const v of checks.constraintViolations) notes.push(v);
  if (checks.repetitionRisk >= REPETITION_WARN_THRESHOLD && checks.closestPriorTitle) {
    notes.push(`Close to something you already published: "${checks.closestPriorTitle.slice(0, 70)}".`);
  }
  if (checks.groundingCoverage !== null && checks.groundingCoverage < 1) {
    const pct = Math.round(checks.groundingCoverage * 100);
    notes.push(`${pct}% of claims are traceable to your sources — the rest are not in the material.`);
  }
  return notes;
}
