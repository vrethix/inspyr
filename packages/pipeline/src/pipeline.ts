import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  db, sources, sourceItems, opportunities, opportunitySources,
  feedbackEvents, strategySignals, audienceState, priorContent,
} from "@inspyr/db";
import {
  fetchSource, dedupeBatch, clusterItems, fetchArticleBody, MIN_USEFUL_TEXT,
  type ClusterableItem,
} from "@inspyr/ingestion";
import { getProvider, understandSourceItem, synthesizeOpportunity } from "@inspyr/ai";
import { rankCandidate, deriveOperatorSignals, type OperatorSignal, type PriorContent } from "@inspyr/ranking";
import {
  fatigueScore, lexicalSimilarity, contentHash, tokenize,
  type FeedbackEventType,
} from "@inspyr/shared";
import { Trace } from "./trace";
import { loadWorkspaceProfile } from "./workspace-profile";

/**
 * The Milestone 1 pipeline: source -> item -> understanding -> cluster ->
 * opportunity -> ranked Today queue.
 *
 * Every stage is idempotent (§28.8): re-running a cycle updates rather than
 * duplicates, so a retry after a partial failure is always safe.
 */

// ---------------------------------------------------------------- ingestion

export interface SyncResult {
  sourceId: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  error?: string;
}

export async function syncSource(workspaceId: string, sourceId: string): Promise<SyncResult> {
  const [source] = await db.select().from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.workspaceId, workspaceId)))
    .limit(1);
  if (!source) throw new Error(`source ${sourceId} not in workspace ${workspaceId}`);

  const result: SyncResult = { sourceId, fetched: 0, inserted: 0, duplicates: 0 };

  try {
    const fetched = await fetchSource(source.type, source.configJson as Record<string, string>);
    const items = dedupeBatch(fetched.items);
    result.fetched = items.length;

    for (const item of items) {
      // Two dedupe keys, per §12: provider identity and content identity.
      const inserted = await db.insert(sourceItems).values({
        workspaceId,
        sourceId,
        externalId: item.externalId,
        canonicalUrl: item.url,
        title: item.title,
        rawText: item.text,
        normalizedText: item.normalizedText,
        contentHash: item.contentHash,
        publishedAt: item.publishedAt,
      }).onConflictDoNothing().returning({ id: sourceItems.id });

      if (inserted.length) result.inserted += 1;
      else result.duplicates += 1;
    }

    await db.update(sources).set({
      lastSyncedAt: new Date(),
      lastError: null,
      status: "active",
      itemsIngested: sql`${sources.itemsIngested} + ${result.inserted}`,
    }).where(eq(sources.id, sourceId));
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    await db.update(sources).set({
      lastSyncedAt: new Date(),
      lastError: result.error,
      status: "error",
    }).where(eq(sources.id, sourceId));
  }

  return result;
}

export async function syncAllSources(workspaceId: string): Promise<SyncResult[]> {
  const rows = await db.select({ id: sources.id }).from(sources)
    .where(and(eq(sources.workspaceId, workspaceId), eq(sources.status, "active")));
  const out: SyncResult[] = [];
  for (const row of rows) out.push(await syncSource(workspaceId, row.id));
  return out;
}

// ------------------------------------------------------------- enrichment

export interface EnrichResult { attempted: number; enriched: number }

/**
 * Fills in body text for items whose feed gave us only a headline.
 *
 * This is not optional polish. A Hacker News item arrives as a title plus the
 * word "Comments"; every relevance and novelty component then computes against
 * nothing, every score lands near the neutral midpoint, and the queue ends up
 * ordered by noise. Enrichment is what makes the ranker able to discriminate.
 *
 * Bounded per cycle and failure-tolerant: a paywall is not a cycle failure.
 */
export async function enrichThinItems(workspaceId: string, limit = 25): Promise<EnrichResult> {
  const thin = await db.select().from(sourceItems)
    .where(and(
      eq(sourceItems.workspaceId, workspaceId),
      isNull(sourceItems.understoodAt),
      isNotNull(sourceItems.canonicalUrl),
      lt(sql`length(${sourceItems.normalizedText})`, MIN_USEFUL_TEXT),
    ))
    .orderBy(desc(sourceItems.observedAt))
    .limit(limit);

  let enriched = 0;
  for (const item of thin) {
    const body = await fetchArticleBody(item.canonicalUrl!);
    if (!body) continue;
    await db.update(sourceItems).set({
      rawText: body.text,
      normalizedText: body.text,
      title: item.title || body.title || item.title,
    }).where(eq(sourceItems.id, item.id));
    enriched += 1;
  }

  return { attempted: thin.length, enriched };
}

// ------------------------------------------------------------ understanding

export async function understandPending(workspaceId: string, limit = 40): Promise<number> {
  const pending = await db.select().from(sourceItems)
    .where(and(eq(sourceItems.workspaceId, workspaceId), isNull(sourceItems.understoodAt)))
    .orderBy(desc(sourceItems.observedAt))
    .limit(limit);

  const provider = getProvider();
  let processed = 0;

  for (const item of pending) {
    const result = await understandSourceItem(provider, {
      title: item.title,
      text: item.normalizedText || item.rawText,
      url: item.canonicalUrl,
      publishedAt: item.publishedAt,
    });
    const u = result.value;

    await db.update(sourceItems).set({
      title: item.title || u.title,
      summary: u.summary,
      topicsJson: u.topics,
      entitiesJson: u.entities,
      claimsJson: u.claims,
      contentType: u.content_type,
      sourceConfidence: u.source_confidence,
      understoodAt: new Date(),
    }).where(eq(sourceItems.id, item.id));

    processed += 1;
  }

  return processed;
}

// ------------------------------------------------------------------ scouting

const SCOUT_WINDOW_DAYS = 14;

export async function scoutOpportunities(workspaceId: string): Promise<number> {
  const since = new Date(Date.now() - SCOUT_WINDOW_DAYS * 864e5);
  const items = await db.select().from(sourceItems)
    .where(and(
      eq(sourceItems.workspaceId, workspaceId),
      isNotNull(sourceItems.understoodAt),
      gte(sourceItems.observedAt, since),
    ))
    .orderBy(desc(sourceItems.observedAt))
    .limit(200);

  if (!items.length) return 0;

  const clusterable: ClusterableItem[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    normalizedText: i.normalizedText,
    topics: i.topicsJson,
    observedAt: i.observedAt,
  }));

  const clusters = clusterItems(clusterable);
  const profile = await loadWorkspaceProfile(workspaceId);
  const provider = getProvider();

  const recentTitles = (await db.select({ title: priorContent.title }).from(priorContent)
    .where(eq(priorContent.workspaceId, workspaceId))
    .orderBy(desc(priorContent.publishedAt)).limit(15)).map((r) => r.title);

  let created = 0;

  for (const cluster of clusters) {
    // Idempotent: a cluster seen before updates in place (§28.8).
    const [existing] = await db.select({ id: opportunities.id, status: opportunities.status })
      .from(opportunities)
      .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.clusterKey, cluster.key)))
      .limit(1);

    // Never re-synthesise something the operator has already judged.
    if (existing && existing.status !== "new") continue;

    const members = items.filter((i) => cluster.itemIds.includes(i.id));
    const synthesis = await synthesizeOpportunity(provider, {
      clusterTitle: cluster.title,
      items: members.map((m) => ({
        title: m.title,
        summary: m.summary ?? m.normalizedText.slice(0, 800),
        url: m.canonicalUrl,
        topics: m.topicsJson,
      })),
      workspace: {
        name: profile.name,
        objective: profile.objective,
        audience: profile.audience,
        voice: profile.voice,
        pillars: profile.pillars,
        avoid: profile.avoid,
      },
      recentlyCovered: recentTitles,
    });
    const s = synthesis.value;

    const values = {
      workspaceId,
      clusterKey: cluster.key,
      title: s.title,
      summary: members[0]?.summary ?? "",
      whyItMatters: s.why_it_matters,
      whyItFits: s.why_it_fits,
      whyNow: s.why_now,
      recommendedAngle: s.recommended_angle,
      anglesJson: s.angles,
      recommendedOutputsJson: s.recommended_outputs,
      understandingSource: synthesis.origin,
      updatedAt: new Date(),
    };

    const [row] = await db.insert(opportunities).values(values)
      .onConflictDoUpdate({
        target: [opportunities.workspaceId, opportunities.clusterKey],
        set: values,
      })
      .returning({ id: opportunities.id });

    if (row) {
      await db.delete(opportunitySources).where(eq(opportunitySources.opportunityId, row.id));
      await db.insert(opportunitySources).values(
        cluster.itemIds.map((sourceItemId) => ({ opportunityId: row.id, sourceItemId, relevance: 1 })),
      ).onConflictDoNothing();
      created += 1;
    }
  }

  return created;
}

// ------------------------------------------------------------------- ranking

async function loadPriorContent(workspaceId: string): Promise<PriorContent[]> {
  const rows = await db.select().from(priorContent)
    .where(eq(priorContent.workspaceId, workspaceId))
    .orderBy(desc(priorContent.publishedAt))
    .limit(120);
  return rows.map((r) => ({ title: r.title, topics: r.topicsJson, publishedAt: r.publishedAt }));
}

async function loadOperatorSignals(workspaceId: string): Promise<OperatorSignal[]> {
  const rows = await db.select().from(strategySignals)
    .where(and(eq(strategySignals.workspaceId, workspaceId), eq(strategySignals.active, true)));
  return rows.map((r) => ({
    dimension: r.dimension,
    key: r.key,
    effect: r.effect,
    confidence: r.confidence,
    sampleSize: r.sampleSize,
  }));
}

export async function rankOpportunities(workspaceId: string): Promise<number> {
  const profile = await loadWorkspaceProfile(workspaceId);
  const prior = await loadPriorContent(workspaceId);
  const signals = await loadOperatorSignals(workspaceId);
  const fatigue = (await db.select().from(audienceState)
    .where(eq(audienceState.workspaceId, workspaceId)))
    .map((f) => ({ dimension: f.dimension, key: f.key, score: f.fatigueScore, recentCount: f.recentCount }));

  const open = await db.select().from(opportunities)
    .where(and(eq(opportunities.workspaceId, workspaceId), inArray(opportunities.status, ["new", "viewed"])));

  const now = new Date();
  let ranked = 0;

  for (const opp of open) {
    const links = await db.select({ id: opportunitySources.sourceItemId })
      .from(opportunitySources).where(eq(opportunitySources.opportunityId, opp.id));
    const members = links.length
      ? await db.select().from(sourceItems).where(inArray(sourceItems.id, links.map((l) => l.id)))
      : [];

    const topics = [...new Set(members.flatMap((m) => m.topicsJson))];
    const confidences = members.map((m) => m.sourceConfidence ?? 50);
    const published = members.map((m) => m.publishedAt).filter((d): d is Date => d !== null);

    const result = rankCandidate({
      candidate: {
        clusterKey: opp.clusterKey,
        title: opp.title,
        summary: opp.summary || opp.whyItMatters,
        topics,
        entities: [...new Set(members.flatMap((m) => m.entitiesJson))],
        contentType: members[0]?.contentType ?? "other",
        sourceConfidence: confidences.length ? Math.max(...confidences) : 50,
        sourceItemCount: members.length,
        newestAt: members.reduce<Date>((a, m) => (m.observedAt > a ? m.observedAt : a), opp.createdAt),
        publishedAt: published.length ? new Date(Math.min(...published.map((d) => d.getTime()))) : null,
      },
      workspace: profile,
      priorContent: prior,
      operatorSignals: signals,
      fatigue,
      now,
    });

    await db.update(opportunities).set({
      score: result.score,
      scoreComponentsJson: result.components,
      adjustmentsJson: result.adjustments as Record<string, number>,
      fatigueJson: { notes: result.fatigueNotes, reasons: result.reasons },
      evidenceTier: result.evidenceTier,
      evidenceSampleSize: result.evidenceSampleSize,
      qualifies: result.qualifies,
      updatedAt: now,
    }).where(eq(opportunities.id, opp.id));

    ranked += 1;
  }

  return ranked;
}

// ------------------------------------------------------- audience state (§3.4)

export async function computeAudienceState(workspaceId: string): Promise<number> {
  const prior = await db.select().from(priorContent)
    .where(eq(priorContent.workspaceId, workspaceId))
    .orderBy(desc(priorContent.publishedAt))
    .limit(120);

  if (!prior.length) {
    await db.delete(audienceState).where(eq(audienceState.workspaceId, workspaceId));
    return 0;
  }

  const now = Date.now();
  const topics = [...new Set(prior.flatMap((p) => p.topicsJson.map((t) => t.toLowerCase())))];
  let written = 0;

  for (const topic of topics) {
    const matches = prior.filter((p) =>
      p.topicsJson.some((t) => t.toLowerCase() === topic) ||
      lexicalSimilarity(topic, `${p.title} ${p.topicsJson.join(" ")}`) > 0.5,
    );
    if (!matches.length) continue;

    const score = fatigueScore(matches.map((m) => ({
      similarity: m.topicsJson.some((t) => t.toLowerCase() === topic) ? 1 : 0.6,
      ageHours: (now - m.publishedAt.getTime()) / 3_600_000,
    })));

    const lastUsedAt = matches.reduce<Date>((a, m) => (m.publishedAt > a ? m.publishedAt : a), matches[0]!.publishedAt);

    const values = {
      workspaceId, dimension: "topic", key: topic,
      fatigueScore: score, recentCount: matches.length,
      lastUsedAt, computedAt: new Date(),
    };
    await db.insert(audienceState).values(values).onConflictDoUpdate({
      target: [audienceState.workspaceId, audienceState.dimension, audienceState.key],
      set: values,
    });
    written += 1;
  }

  return written;
}

// ---------------------------------------------------------- operator learning

const LEARNING_EVENTS: FeedbackEventType[] = [
  "opportunity_saved", "opportunity_skipped", "opportunity_rejected",
  "opportunity_created", "opportunity_viewed",
];

export async function recomputeStrategySignals(workspaceId: string): Promise<number> {
  const events = await db.select().from(feedbackEvents)
    .where(and(
      eq(feedbackEvents.workspaceId, workspaceId),
      inArray(feedbackEvents.eventType, LEARNING_EVENTS),
    ))
    .orderBy(desc(feedbackEvents.createdAt))
    .limit(1000);

  const derived = deriveOperatorSignals(events.map((e) => ({
    eventType: e.eventType as FeedbackEventType,
    keys: Array.isArray(e.metadataJson.topics) ? (e.metadataJson.topics as string[]) : [],
    createdAt: e.createdAt,
  })));

  // Deactivate everything first: a signal that lost its evidence must stop acting.
  await db.update(strategySignals)
    .set({ active: false })
    .where(and(eq(strategySignals.workspaceId, workspaceId), eq(strategySignals.source, "repeated_skips")));

  for (const s of derived) {
    const values = {
      workspaceId,
      dimension: s.dimension,
      key: s.key,
      channel: null,
      contextJson: {},
      effect: s.effect,
      confidence: s.confidence,
      sampleSize: s.sampleSize,
      source: s.source === "mixed" ? "repeated_skips" : s.source,
      evidenceStart: s.evidenceStart,
      evidenceEnd: s.evidenceEnd,
      active: s.active,
      updatedAt: new Date(),
    };
    await db.insert(strategySignals).values(values).onConflictDoUpdate({
      target: [strategySignals.workspaceId, strategySignals.dimension, strategySignals.key, strategySignals.channel],
      set: values,
    });
  }

  return derived.length;
}

// -------------------------------------------------------------- prior content

export async function importPriorContent(
  workspaceId: string,
  entries: { title: string; text?: string; platform?: string; url?: string; publishedAt: Date }[],
): Promise<number> {
  let inserted = 0;
  for (const e of entries) {
    const text = e.text ?? "";
    const rows = await db.insert(priorContent).values({
      workspaceId,
      platform: e.platform ?? null,
      externalUrl: e.url ?? null,
      title: e.title,
      text,
      topicsJson: tokenize(`${e.title} ${text}`).slice(0, 8),
      publishedAt: e.publishedAt,
      origin: "imported",
      contentHash: contentHash(`${e.title}\n${text}`),
    }).onConflictDoNothing().returning({ id: priorContent.id });
    inserted += rows.length;
  }
  return inserted;
}

// ------------------------------------------------------------------ the cycle

export interface CycleResult {
  runId: string;
  sync: SyncResult[];
  enriched: EnrichResult;
  understood: number;
  opportunities: number;
  ranked: number;
  fatigueKeys: number;
  signals: number;
}

/**
 * §14 — the daily plan. Note what it does NOT do: generate drafts. Content is
 * created on demand only, which is what keeps AI cost bounded (§18).
 */
export async function runCycle(workspaceId: string, trigger = "manual"): Promise<CycleResult> {
  const trace = await Trace.start(workspaceId, trigger, "Find what is worth saying today");
  try {
    const sync = await trace.step({ role: "ingestion", tool: "sync_all_sources" },
      () => syncAllSources(workspaceId));
    const enriched = await trace.step({ role: "ingestion", tool: "enrich_thin_items" },
      () => enrichThinItems(workspaceId));
    const understood = await trace.step({ role: "understanding", tool: "understand_pending" },
      () => understandPending(workspaceId));
    const signals = await trace.step({ role: "learning", tool: "recompute_strategy_signals" },
      () => recomputeStrategySignals(workspaceId));
    const fatigueKeys = await trace.step({ role: "intelligence", tool: "compute_audience_state" },
      () => computeAudienceState(workspaceId));
    const opportunityCount = await trace.step({ role: "scout", tool: "scout_opportunities" },
      () => scoutOpportunities(workspaceId));
    const ranked = await trace.step({ role: "ranker", tool: "rank_opportunities" },
      () => rankOpportunities(workspaceId));

    await trace.finish("succeeded");
    return {
      runId: trace.runId, sync, enriched, understood,
      opportunities: opportunityCount, ranked, fatigueKeys, signals,
    };
  } catch (err) {
    await trace.finish("failed", err);
    throw err;
  }
}
