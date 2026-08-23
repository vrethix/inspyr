import { and, desc, eq } from "drizzle-orm";
import {
  db, conversationTargets, replyOutcomes, workspaceMemory, strategySignals, feedbackEvents,
} from "@inspyr/db";
import { contentHash, canonicalUrl, tokenize, reachBand, type Platform } from "@inspyr/shared";
import {
  rankConversation, timelineViability,
  type ConversationCandidate, type OperatorSignal,
} from "@inspyr/ranking";
import { loadWorkspaceProfile } from "./workspace-profile";

/**
 * Conversation opportunities.
 *
 * Discovery is manual for now: X's API is priced out of reach and automated
 * collection breaches its terms, so the operator supplies candidate URLs and
 * Inspyr supplies the judgement. That division is the useful half anyway —
 * finding conversations is easy, deciding which ones are worth entering is not.
 */

export interface ConversationInput {
  url: string;
  authorHandle: string;
  authorFollowers: number;
  postedAt: Date;
  replyDepth: number;
  text: string;
  platform?: Platform;
}

/** Facts this workspace can actually contribute. Identity memory, user-set. */
async function loadContributableFacts(workspaceId: string): Promise<string[]> {
  const [row] = await db.select().from(workspaceMemory)
    .where(and(
      eq(workspaceMemory.workspaceId, workspaceId),
      eq(workspaceMemory.memoryType, "identity"),
      eq(workspaceMemory.key, "facts"),
    )).limit(1);
  const value = row?.valueJson;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function audienceSize(workspaceId: string, platform: Platform): Promise<number> {
  const [row] = await db.select().from(workspaceMemory)
    .where(and(
      eq(workspaceMemory.workspaceId, workspaceId),
      eq(workspaceMemory.memoryType, "identity"),
      eq(workspaceMemory.key, "audience_size"),
    )).limit(1);
  const value = row?.valueJson as Record<string, number> | undefined;
  return typeof value?.[platform] === "number" ? value[platform]! : 0;
}

async function loadReplySignals(workspaceId: string): Promise<OperatorSignal[]> {
  const rows = await db.select().from(strategySignals)
    .where(and(
      eq(strategySignals.workspaceId, workspaceId),
      eq(strategySignals.dimension, "reply_context"),
      eq(strategySignals.active, true),
    ));
  return rows.map((r) => ({
    dimension: r.dimension, key: r.key, effect: r.effect,
    confidence: r.confidence, sampleSize: r.sampleSize,
  }));
}

export async function addConversationTarget(
  workspaceId: string,
  input: ConversationInput,
) {
  const profile = await loadWorkspaceProfile(workspaceId);
  const facts = await loadContributableFacts(workspaceId);
  const signals = await loadReplySignals(workspaceId);

  const candidate: ConversationCandidate = {
    id: "pending",
    url: canonicalUrl(input.url),
    authorHandle: input.authorHandle.replace(/^@/, ""),
    authorFollowers: input.authorFollowers,
    postedAt: input.postedAt,
    replyDepth: input.replyDepth,
    text: input.text,
    topics: tokenize(input.text).slice(0, 8),
  };

  const result = rankConversation({
    candidate,
    workspace: profile,
    contributableFacts: facts,
    operatorSignals: signals,
    now: new Date(),
  });

  const values = {
    workspaceId,
    platform: input.platform ?? "x",
    url: candidate.url,
    authorHandle: candidate.authorHandle,
    authorFollowers: candidate.authorFollowers,
    reachBand: result.reachBand,
    postedAt: input.postedAt,
    replyDepth: input.replyDepth,
    text: input.text,
    topicsJson: candidate.topics,
    score: result.score,
    eligible: result.eligible,
    componentsJson: result.components as unknown as Record<string, number>,
    gateFailuresJson: result.gateFailures,
    reasonsJson: result.reasons,
    contribution: result.contribution,
    contentHash: contentHash(candidate.url),
  };

  const [row] = await db.insert(conversationTargets).values(values)
    .onConflictDoUpdate({
      target: [conversationTargets.workspaceId, conversationTargets.contentHash],
      set: values,
    })
    .returning();

  return { row: row!, result };
}

export async function listConversationTargets(workspaceId: string) {
  return db.select().from(conversationTargets)
    .where(and(eq(conversationTargets.workspaceId, workspaceId), eq(conversationTargets.status, "new")))
    .orderBy(desc(conversationTargets.eligible), desc(conversationTargets.score))
    .limit(30);
}

/**
 * Records what a reply actually produced, and updates the prior immediately.
 *
 * No training set, no batch fit: one observation moves the posterior for that
 * reach band. At n=0 the system uses the mechanism-derived prior; at n=1 it has
 * already learned something.
 */
export async function recordReplyOutcome(input: {
  workspaceId: string;
  conversationTargetId: string;
  replyUrl?: string;
  text?: string;
  impressions?: number;
  engagements?: number;
  profileVisits?: number;
  followsGained?: number;
}) {
  const [target] = await db.select().from(conversationTargets)
    .where(and(
      eq(conversationTargets.id, input.conversationTargetId),
      eq(conversationTargets.workspaceId, input.workspaceId),
    )).limit(1);
  if (!target) throw new Error(`conversation target not in workspace ${input.workspaceId}`);

  // Features frozen at decision time — recomputing them later would leak outcome
  // knowledge into the record and quietly corrupt every future comparison.
  await db.insert(replyOutcomes).values({
    workspaceId: input.workspaceId,
    conversationTargetId: target.id,
    replyUrl: input.replyUrl ?? null,
    text: input.text ?? "",
    featuresJson: {
      reply_depth: target.replyDepth,
      reach_band: target.reachBand,
      author_followers: target.authorFollowers,
      age_minutes_at_reply: Math.round(
        (Date.now() - target.postedAt.getTime()) / 60_000,
      ),
      components: target.componentsJson,
      score: target.score,
    },
    impressions: input.impressions ?? null,
    engagements: input.engagements ?? null,
    profileVisits: input.profileVisits ?? null,
    followsGained: input.followsGained ?? null,
    recordedAt: new Date(),
  });

  await db.update(conversationTargets).set({ status: "replied" })
    .where(eq(conversationTargets.id, target.id));

  await db.insert(feedbackEvents).values({
    workspaceId: input.workspaceId,
    eventType: "reply_sent",
    entityType: "conversation_target",
    entityId: target.id,
    metadataJson: {
      reach_band: target.reachBand, reply_depth: target.replyDepth,
      impressions: input.impressions ?? null, follows: input.followsGained ?? null,
    },
  });

  await updateReplyPriors(input.workspaceId);
  return target;
}

/**
 * Online update over reply outcomes, grouped by reach band.
 *
 * Beta-Bernoulli in spirit: successes and failures per band, shrunk toward the
 * mechanism-derived prior so a single result never swings the policy. This runs
 * from the first observation and has no training phase.
 */
export const REPLY_PRIOR = { alpha: 1, beta: 3, shrinkage: 4 } as const;

export async function updateReplyPriors(workspaceId: string): Promise<number> {
  const outcomes = await db.select().from(replyOutcomes)
    .where(eq(replyOutcomes.workspaceId, workspaceId));
  if (!outcomes.length) return 0;

  const byBand = new Map<string, { converted: number; total: number }>();
  for (const o of outcomes) {
    const band = String((o.featuresJson as Record<string, unknown>).reach_band ?? "unknown");
    const bucket = byBand.get(band) ?? { converted: 0, total: 0 };
    bucket.total += 1;
    // A reply "worked" if it produced a profile visit or a follow. Impressions
    // are not success — Tako's failure had 102 of them.
    if ((o.followsGained ?? 0) > 0 || (o.profileVisits ?? 0) > 0) bucket.converted += 1;
    byBand.set(band, bucket);
  }

  let written = 0;
  for (const [band, { converted, total }] of byBand) {
    const posterior = (REPLY_PRIOR.alpha + converted) / (REPLY_PRIOR.alpha + REPLY_PRIOR.beta + total);
    const priorMean = REPLY_PRIOR.alpha / (REPLY_PRIOR.alpha + REPLY_PRIOR.beta);
    // Effect is the shift away from the prior, shrunk by how little we know.
    const raw = (posterior - priorMean) / (1 - priorMean);
    const effect = raw * (total / (total + REPLY_PRIOR.shrinkage));

    const values = {
      workspaceId,
      dimension: "reply_context",
      key: band,
      channel: null,
      contextJson: { converted, total, posterior: Math.round(posterior * 1000) / 1000 },
      effect: Math.round(Math.max(-1, Math.min(1, effect)) * 1000) / 1000,
      confidence: Math.round((total / (total + 5)) * 1000) / 1000,
      sampleSize: total,
      source: "outcome",
      evidenceStart: null,
      evidenceEnd: new Date(),
      active: true,
      updatedAt: new Date(),
    };
    await db.insert(strategySignals).values(values).onConflictDoUpdate({
      target: [strategySignals.workspaceId, strategySignals.dimension, strategySignals.key, strategySignals.channel],
      set: values,
    });
    written += 1;
  }
  return written;
}

/** The plain answer at low follower counts. */
export async function timelineAdvice(workspaceId: string, platform: Platform = "x") {
  const followers = await audienceSize(workspaceId, platform);
  return { followers, band: reachBand(followers), ...timelineViability(followers) };
}
