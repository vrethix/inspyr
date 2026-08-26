import { and, desc, eq, inArray, lt } from "drizzle-orm";
import {
  db, publications, metricSnapshots, drafts, workspaces, strategySignals, feedbackEvents,
} from "@inspyr/db";
import {
  computeBaseline, computeLifts, outcomeScore, describeOutcome,
  BASELINE_MIN_SAMPLE, type Metrics, type MetricKey,
} from "@inspyr/shared";

/**
 * How Inspyr finds out what happened.
 *
 * Every published thing — a thread, a carousel, a video, a reply — lands in one
 * table with the feature vector frozen at publish time. Numbers arrive later,
 * by hand for now, and get compared against this workspace's own recent
 * baseline rather than an absolute. Then the comparison feeds ranking.
 *
 * Until this existed, Inspyr could decide and create and learn from operator
 * behaviour, but "how did it do" had no answer at all.
 */

export interface PublishInput {
  workspaceId: string;
  draftId?: string;
  channel: string;
  externalUrl?: string;
  title?: string;
  publishedAt?: Date;
  topics?: string[];
  /** The provider's id, so metrics can be fetched back without asking. */
  providerPostId?: string;
}

function timeBucket(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

/** Records that something went out, capturing its features as they were. */
export async function markPublished(input: PublishInput) {
  const publishedAt = input.publishedAt ?? new Date();

  let features: {
    actionType: string | null; angle: string | null;
    hookType: string | null; formatKey: string | null; title: string;
  } = { actionType: null, angle: null, hookType: null, formatKey: null, title: input.title ?? "" };

  if (input.draftId) {
    const [draft] = await db.select().from(drafts)
      .where(and(eq(drafts.id, input.draftId), eq(drafts.workspaceId, input.workspaceId)))
      .limit(1);
    if (draft) {
      const content = draft.contentJson as Record<string, unknown>;
      features = {
        actionType: draft.actionType,
        angle: draft.angle,
        hookType: typeof content.hook_type === "string" ? content.hook_type : null,
        formatKey: draft.actionType,
        title: input.title || String(content.title ?? "") || draft.angle,
      };
    }
  }

  const [row] = await db.insert(publications).values({
    workspaceId: input.workspaceId,
    draftId: input.draftId ?? null,
    channel: input.channel,
    externalUrl: input.externalUrl ?? null,
    providerPostId: input.providerPostId ?? null,
    title: features.title,
    publishedAt,
    actionType: features.actionType,
    angle: features.angle,
    hookType: features.hookType,
    formatKey: features.formatKey,
    topicsJson: input.topics ?? [],
    timeBucket: timeBucket(publishedAt),
  }).returning();

  if (input.draftId) {
    await db.update(drafts).set({ state: "approved", updatedAt: new Date() })
      .where(eq(drafts.id, input.draftId));
  }

  await db.insert(feedbackEvents).values({
    workspaceId: input.workspaceId,
    eventType: "publication_published",
    entityType: "publication",
    entityId: row!.id,
    metadataJson: {
      channel: input.channel, angle: features.angle,
      hook_type: features.hookType, topics: input.topics ?? [],
    },
  });

  return row!;
}

/**
 * The baseline is this workspace's own recent history on this channel,
 * excluding the post being judged. Comparing a post to a baseline it is part of
 * flattens exactly the signal you are looking for.
 */
export async function channelBaseline(
  workspaceId: string,
  channel: string,
  before: Date,
  limit = 20,
) {
  const prior = await db.select().from(publications)
    .where(and(
      eq(publications.workspaceId, workspaceId),
      eq(publications.channel, channel),
      lt(publications.publishedAt, before),
    ))
    .orderBy(desc(publications.publishedAt))
    .limit(limit);

  if (!prior.length) return computeBaseline([]);

  const snapshots = await db.select().from(metricSnapshots)
    .where(inArray(metricSnapshots.publicationId, prior.map((p) => p.id)));

  // One snapshot per publication, at the longest horizon recorded for it.
  const best = new Map<string, Metrics>();
  for (const s of snapshots) {
    const existing = best.get(s.publicationId);
    if (!existing) best.set(s.publicationId, s.metricsJson as Metrics);
  }
  return computeBaseline([...best.values()]);
}

export interface RecordMetricsInput {
  workspaceId: string;
  publicationId: string;
  metrics: Metrics;
  horizonHours?: number;
  source?: "manual" | "api" | "csv";
}

/** Numbers in, comparison out, policy updated. */
export async function recordMetrics(input: RecordMetricsInput) {
  const [pub] = await db.select().from(publications)
    .where(and(
      eq(publications.id, input.publicationId),
      eq(publications.workspaceId, input.workspaceId),
    )).limit(1);
  if (!pub) throw new Error(`publication not in workspace ${input.workspaceId}`);

  const horizonHours = input.horizonHours ?? 24;
  const values = {
    workspaceId: input.workspaceId,
    publicationId: pub.id,
    horizonHours,
    source: input.source ?? "manual",
    metricsJson: input.metrics as Record<string, number>,
    capturedAt: new Date(),
  };
  await db.insert(metricSnapshots).values(values).onConflictDoUpdate({
    target: [metricSnapshots.publicationId, metricSnapshots.horizonHours],
    set: values,
  });

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  const baseline = await channelBaseline(input.workspaceId, pub.channel, pub.publishedAt);
  const lifts = computeLifts(input.metrics, baseline);
  const score = outcomeScore(lifts, objectiveKey(ws?.objective ?? ""));

  const [updated] = await db.update(publications).set({
    outcomeJson: (lifts ?? {}) as Record<string, number | null>,
    outcomeScore: score,
    baselineSampleSize: baseline.sampleSize,
  }).where(eq(publications.id, pub.id)).returning();

  await db.insert(feedbackEvents).values({
    workspaceId: input.workspaceId,
    eventType: "metric_snapshot_received",
    entityType: "publication",
    entityId: pub.id,
    actor: "user",
    metadataJson: {
      horizon_hours: horizonHours, outcome_score: score,
      baseline_n: baseline.sampleSize, channel: pub.channel,
    },
  });

  await updateOutcomeSignals(input.workspaceId);

  return {
    publication: updated!,
    lifts,
    score,
    baselineSampleSize: baseline.sampleSize,
    explanation: describeOutcome(score, baseline.sampleSize),
  };
}

/** Maps a free-text workspace objective onto a weighting profile. */
function objectiveKey(objective: string): string {
  const text = objective.toLowerCase();
  if (/watch|video|subscriber|youtube/.test(text)) return "watch_time";
  if (/credib|authority|reputation|trust/.test(text)) return "authority";
  if (/aware|reach|impress/.test(text)) return "awareness";
  return "audience";
}

/**
 * Turns measured outcomes into ranking policy.
 *
 * Same conservatism as everywhere else: shrunk toward neutral, inactive below a
 * minimum sample. A topic that did well twice is not yet a strategy.
 */
export const OUTCOME_MIN_SAMPLE = 3;

export async function updateOutcomeSignals(workspaceId: string): Promise<number> {
  const scored = await db.select().from(publications)
    .where(eq(publications.workspaceId, workspaceId));
  const withScores = scored.filter((p) => typeof p.outcomeScore === "number");
  if (!withScores.length) return 0;

  const buckets = new Map<string, { dimension: string; key: string; scores: number[] }>();
  const push = (dimension: string, key: string | null, score: number) => {
    if (!key) return;
    const id = `${dimension}::${key.toLowerCase()}`;
    const bucket = buckets.get(id) ?? { dimension, key: key.toLowerCase(), scores: [] };
    bucket.scores.push(score);
    buckets.set(id, bucket);
  };

  for (const p of withScores) {
    const score = p.outcomeScore!;
    for (const topic of p.topicsJson) push("topic", topic, score);
    push("hook", p.hookType, score);
    push("format", p.formatKey, score);
    push("angle", p.angle, score);
  }

  let written = 0;
  for (const bucket of buckets.values()) {
    const n = bucket.scores.length;
    const mean = bucket.scores.reduce((s, v) => s + v, 0) / n;
    // Lift of 1.0 is neutral. Map to -1..1, then shrink by sample size.
    const raw = Math.max(-1, Math.min(1, mean - 1));
    const effect = raw * (n / (n + 3));

    const values = {
      workspaceId,
      dimension: bucket.dimension,
      key: bucket.key,
      channel: null,
      contextJson: { mean_lift: Math.round(mean * 1000) / 1000, n },
      effect: Math.round(effect * 1000) / 1000,
      confidence: Math.round((n / (n + 5)) * 1000) / 1000,
      sampleSize: n,
      source: "outcome",
      evidenceStart: null,
      evidenceEnd: new Date(),
      active: n >= OUTCOME_MIN_SAMPLE,
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

export async function listPublications(workspaceId: string, limit = 40) {
  const rows = await db.select().from(publications)
    .where(eq(publications.workspaceId, workspaceId))
    .orderBy(desc(publications.publishedAt))
    .limit(limit);

  const snapshots = rows.length
    ? await db.select().from(metricSnapshots)
        .where(inArray(metricSnapshots.publicationId, rows.map((r) => r.id)))
    : [];

  return rows.map((row) => ({
    ...row,
    hasMetrics: snapshots.some((s) => s.publicationId === row.id),
    explanation: describeOutcome(row.outcomeScore, row.baselineSampleSize),
  }));
}

export async function baselineProgress(workspaceId: string, channel: string) {
  const count = (await db.select({ id: publications.id }).from(publications)
    .where(and(eq(publications.workspaceId, workspaceId), eq(publications.channel, channel)))).length;
  return { count, needed: Math.max(0, BASELINE_MIN_SAMPLE - count), ready: count >= BASELINE_MIN_SAMPLE };
}

export type { MetricKey };
