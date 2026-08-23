import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db, opportunities, opportunitySources, sourceItems, priorContent,
  channelPolicies, actionSpecs, drafts, draftEdits, feedbackEvents,
} from "@inspyr/db";
import {
  DEFAULT_CHANNEL_POLICIES, PLATFORMS, draftText,
  type Platform, type ChannelPolicySpec, type DraftContent,
} from "@inspyr/shared";
import { getProvider } from "@inspyr/ai";
import { generateCandidateSpecs, writeDraft, reviewDraft, computeChecks } from "@inspyr/channels";
import { Trace } from "./trace";
import { loadWorkspaceProfile } from "./workspace-profile";

/**
 * BUILD_SPEC_v0.1 §5.4 / §6.6 / §6.7 — Create.
 *
 * Drafts are generated on demand for one chosen ActionSpec, never for every
 * candidate. That is what keeps §18's cost rules true while still letting the
 * system reason about every option it could have taken.
 */

// ------------------------------------------------------------ channel policy

export async function ensureChannelPolicies(workspaceId: string): Promise<void> {
  for (const channel of PLATFORMS) {
    const spec = DEFAULT_CHANNEL_POLICIES[channel];
    await db.insert(channelPolicies).values({
      workspaceId,
      channel,
      actionSpaceJson: [...spec.actionSpace],
      constraintsJson: spec.constraints as Record<string, number>,
      craft: spec.craft,
      rewardWeightsJson: spec.rewardWeights as Record<string, number>,
    }).onConflictDoNothing();
  }
}

export async function loadChannelPolicy(
  workspaceId: string,
  channel: Platform,
): Promise<ChannelPolicySpec> {
  const [row] = await db.select().from(channelPolicies)
    .where(and(eq(channelPolicies.workspaceId, workspaceId), eq(channelPolicies.channel, channel)))
    .limit(1);

  const base = DEFAULT_CHANNEL_POLICIES[channel];
  if (!row) return base;

  return {
    channel,
    label: base.label,
    actionSpace: (row.actionSpaceJson.length ? row.actionSpaceJson : base.actionSpace) as ChannelPolicySpec["actionSpace"],
    constraints: Object.keys(row.constraintsJson).length ? row.constraintsJson : base.constraints,
    rewardWeights: Object.keys(row.rewardWeightsJson).length ? row.rewardWeightsJson : base.rewardWeights,
    craft: row.craft || base.craft,
  };
}

// ------------------------------------------------------------- action specs

interface OpportunityContext {
  opportunity: typeof opportunities.$inferSelect;
  items: (typeof sourceItems.$inferSelect)[];
  topics: string[];
  angles: { kind: string; thesis: string }[];
}

async function loadOpportunityContext(
  workspaceId: string,
  opportunityId: string,
): Promise<OpportunityContext> {
  const [opportunity] = await db.select().from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, workspaceId)))
    .limit(1);
  if (!opportunity) throw new Error(`opportunity ${opportunityId} not in workspace ${workspaceId}`);

  const links = await db.select({ id: opportunitySources.sourceItemId })
    .from(opportunitySources).where(eq(opportunitySources.opportunityId, opportunityId));
  const items = links.length
    ? await db.select().from(sourceItems).where(and(
        eq(sourceItems.workspaceId, workspaceId),
        inArray(sourceItems.id, links.map((l) => l.id)),
      ))
    : [];

  const raw = (opportunity.anglesJson ?? []) as { kind?: string; thesis?: string }[];
  const angles = raw
    .filter((a): a is { kind: string; thesis: string } => Boolean(a?.kind && a?.thesis))
    .slice(0, 4);

  return {
    opportunity,
    items,
    topics: [...new Set(items.flatMap((i) => i.topicsJson))],
    angles: angles.length ? angles : [{
      kind: opportunity.recommendedAngle ?? "explain",
      thesis: opportunity.whyItMatters,
    }],
  };
}

/**
 * Enumerates every action this opportunity could become, across channels.
 * Nothing is written yet — these are decisions, not content.
 */
export async function generateActionSpecs(
  workspaceId: string,
  opportunityId: string,
  channels: Platform[] = [...PLATFORMS],
): Promise<number> {
  const ctx = await loadOpportunityContext(workspaceId, opportunityId);
  await ensureChannelPolicies(workspaceId);

  const policies: Partial<Record<Platform, ChannelPolicySpec>> = {};
  for (const channel of channels) policies[channel] = await loadChannelPolicy(workspaceId, channel);

  const candidates = generateCandidateSpecs({
    channels,
    angles: ctx.angles,
    policies,
    topics: ctx.topics,
    contentType: ctx.items[0]?.contentType ?? "other",
  });

  let written = 0;
  for (const c of candidates) {
    const rows = await db.insert(actionSpecs).values({
      workspaceId,
      opportunityId,
      channel: c.channel,
      actionType: c.actionType,
      angle: c.angle,
      hookType: c.hookType,
      ctaType: c.ctaType,
      formatKey: c.actionType,
      objective: c.objective,
      featureVectorJson: c.featureVector,
      evidenceIdsJson: ctx.items.map((i) => i.id),
    }).onConflictDoNothing().returning({ id: actionSpecs.id });
    written += rows.length;
  }

  return written;
}

// ------------------------------------------------------------------ drafting

export interface GenerateDraftInput {
  workspaceId: string;
  opportunityId: string;
  channel: Platform;
  /** Optional: pick a specific candidate. Defaults to the recommended angle. */
  actionSpecId?: string;
}

export async function generateDraft(input: GenerateDraftInput) {
  const { workspaceId, opportunityId, channel } = input;
  const ctx = await loadOpportunityContext(workspaceId, opportunityId);
  const profile = await loadWorkspaceProfile(workspaceId);
  const policy = await loadChannelPolicy(workspaceId, channel);
  const provider = getProvider();

  const trace = await Trace.start(workspaceId, "create", `Draft for ${channel}`);

  try {
    // Make sure candidates exist, then choose one.
    await trace.step({ role: "gtm", tool: "generate_action_specs" },
      () => generateActionSpecs(workspaceId, opportunityId, [channel]));

    const specs = await db.select().from(actionSpecs)
      .where(and(
        eq(actionSpecs.workspaceId, workspaceId),
        eq(actionSpecs.opportunityId, opportunityId),
        eq(actionSpecs.channel, channel),
      ));

    const chosen =
      (input.actionSpecId ? specs.find((s) => s.id === input.actionSpecId) : undefined)
      ?? specs.find((s) => s.angle === ctx.opportunity.recommendedAngle)
      ?? specs[0];
    if (!chosen) throw new Error(`no action spec available for ${channel}`);

    await db.update(actionSpecs).set({ status: "chosen" }).where(eq(actionSpecs.id, chosen.id));

    const prior = await db.select({ title: priorContent.title, topics: priorContent.topicsJson })
      .from(priorContent).where(eq(priorContent.workspaceId, workspaceId))
      .orderBy(desc(priorContent.publishedAt)).limit(40);

    const sources = ctx.items.map((i) => ({
      id: i.id,
      title: i.title,
      url: i.canonicalUrl,
      summary: i.summary ?? i.normalizedText.slice(0, 1200),
      claims: i.claimsJson.map((c) => c.text),
    }));

    const written = await trace.step(
      { role: `channel:${channel}`, tool: "write_draft", promptVersion: "channel-writer@v1" },
      () => writeDraft(provider, {
        channel,
        policy,
        angle: chosen.angle,
        angleThesis: ctx.angles.find((a) => a.kind === chosen.angle)?.thesis ?? ctx.opportunity.whyItMatters,
        objective: chosen.objective,
        workspace: {
          name: profile.name, audience: profile.audience, voice: profile.voice,
          pillars: profile.pillars, avoid: profile.avoid,
        },
        opportunity: {
          title: ctx.opportunity.title,
          whyItMatters: ctx.opportunity.whyItMatters,
          whyItFits: ctx.opportunity.whyItFits,
        },
        sources,
        recentlyPublished: prior.map((p) => p.title),
      }),
    );

    const reviewed = await trace.step(
      { role: "reviewer", tool: "review_draft", promptVersion: "channel-reviewer@v1" },
      () => reviewDraft(provider, {
        channel, policy,
        content: written.content,
        workspace: { audience: profile.audience, voice: profile.voice },
        sources: sources.map(({ title, summary, claims }) => ({ title, summary, claims })),
        priorContent: prior,
      }),
    );

    // Versioned: regenerating creates a new row, it does not overwrite.
    const existing = await db.select({ version: drafts.version }).from(drafts)
      .where(and(
        eq(drafts.workspaceId, workspaceId),
        eq(drafts.opportunityId, opportunityId),
        eq(drafts.channel, channel),
      ))
      .orderBy(desc(drafts.version)).limit(1);
    const version = (existing[0]?.version ?? 0) + 1;

    const [row] = await db.insert(drafts).values({
      workspaceId,
      opportunityId,
      actionSpecId: chosen.id,
      channel,
      actionType: (written.content as { action_type: string }).action_type,
      angle: chosen.angle,
      contentJson: written.content as unknown as Record<string, unknown>,
      reviewJson: reviewed.review as unknown as Record<string, unknown> | null,
      checksJson: reviewed.checks as unknown as Record<string, unknown>,
      sourceItemIdsJson: ctx.items.map((i) => i.id),
      promptVersion: written.promptVersion,
      model: written.model,
      origin: written.origin,
      version,
    }).returning();

    await db.insert(feedbackEvents).values({
      workspaceId,
      eventType: version === 1 ? "draft_generated" : "draft_regenerated",
      entityType: "draft",
      entityId: row!.id,
      actor: "system",
      metadataJson: {
        channel, angle: chosen.angle, topics: ctx.topics.slice(0, 8),
        origin: written.origin, version,
      },
    });

    await trace.finish("succeeded");
    return row!;
  } catch (err) {
    await trace.finish("failed", err);
    throw err;
  }
}

// ------------------------------------------------------------------- editing

/** Character-level change ratio. Computed, not estimated. */
export function changeRatio(before: string, after: string): number {
  if (!before && !after) return 0;
  if (!before || !after) return 1;
  // Longest common prefix/suffix is enough to size an edit without a diff lib.
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;
  const changed = Math.max(before.length, after.length) - prefix - suffix;
  return Math.min(1, Math.round((changed / Math.max(before.length, after.length)) * 1000) / 1000);
}

/**
 * §5.4 — every meaningful edit is stored as a diff event.
 *
 * How much the operator rewrote is the sharpest operator-memory signal there
 * is: it is feedback on the machine's output specifically, not on the topic.
 */
export async function recordDraftEdit(input: {
  workspaceId: string;
  draftId: string;
  content: DraftContent;
  intent?: string;
}) {
  const [existing] = await db.select().from(drafts)
    .where(and(eq(drafts.id, input.draftId), eq(drafts.workspaceId, input.workspaceId)))
    .limit(1);
  if (!existing) throw new Error(`draft ${input.draftId} not in workspace ${input.workspaceId}`);

  const before = draftText(existing.channel, existing.contentJson as unknown as DraftContent);
  const after = draftText(existing.channel, input.content);
  const ratio = changeRatio(before, after);
  if (ratio === 0) return existing;

  const nextVersion = existing.version + 1;

  await db.insert(draftEdits).values({
    workspaceId: input.workspaceId,
    draftId: existing.id,
    fromVersion: existing.version,
    toVersion: nextVersion,
    diffJson: { beforeLength: before.length, afterLength: after.length },
    changeRatio: ratio,
    actor: "user",
    intent: input.intent ?? "manual",
  });

  const policy = await loadChannelPolicy(input.workspaceId, existing.channel as Platform);
  const prior = await db.select({ title: priorContent.title, topics: priorContent.topicsJson })
    .from(priorContent).where(eq(priorContent.workspaceId, input.workspaceId))
    .orderBy(desc(priorContent.publishedAt)).limit(40);

  // Re-run the deterministic checks; constraint breaches are usually introduced
  // by hand, not by the model.
  const checks = computeChecks({
    channel: existing.channel as Platform,
    policy,
    content: input.content,
    workspace: { audience: "", voice: "" },
    sources: [],
    priorContent: prior,
  }, null);

  const [updated] = await db.update(drafts).set({
    contentJson: input.content as unknown as Record<string, unknown>,
    checksJson: checks as unknown as Record<string, unknown>,
    version: nextVersion,
    state: "edited",
    origin: "human",
    updatedAt: new Date(),
  }).where(eq(drafts.id, existing.id)).returning();

  await db.insert(feedbackEvents).values({
    workspaceId: input.workspaceId,
    eventType: "draft_edited",
    entityType: "draft",
    entityId: existing.id,
    metadataJson: {
      channel: existing.channel, angle: existing.angle,
      changeRatio: ratio, intent: input.intent ?? "manual",
    },
  });

  return updated!;
}

export async function approveDraft(workspaceId: string, draftId: string) {
  const [row] = await db.update(drafts).set({ state: "approved", updatedAt: new Date() })
    .where(and(eq(drafts.id, draftId), eq(drafts.workspaceId, workspaceId)))
    .returning();
  if (!row) throw new Error(`draft ${draftId} not in workspace ${workspaceId}`);

  await db.insert(feedbackEvents).values({
    workspaceId, eventType: "draft_approved", entityType: "draft", entityId: draftId,
    metadataJson: { channel: row.channel, angle: row.angle, version: row.version },
  });
  return row;
}
