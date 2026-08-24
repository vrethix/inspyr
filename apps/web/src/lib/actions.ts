"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import {
  db, users, workspaces, workspaceMemory, sources, opportunities,
  opportunitySources, sourceItems, feedbackEvents, strategySignals, drafts,
  conversationTargets, publications, opportunitySources as oppSources,
} from "@inspyr/db";
import {
  runCycle, syncSource, importPriorContent, recomputeStrategySignals, rankOpportunities,
  generateDraft, recordDraftEdit, approveDraft, generateActionSpecs,
  addConversationTarget, recordReplyOutcome, saveReadiness,
  markPublished, recordMetrics,
} from "@inspyr/pipeline";
import { READINESS_KEYS, METRIC_KEYS, type Metrics, type MetricKey, type FeedbackEventType, type OpportunityStatus, type Platform, type DraftContent, type Readiness } from "@inspyr/shared";
import { hashPassword, verifyPassword, createSession, destroySession, requireUser } from "./auth";
import { requireWorkspace, setActiveWorkspace } from "./workspace";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const lines = (fd: FormData, k: string) =>
  str(fd, k).split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------- auth

export async function signUp(_prev: unknown, fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email.includes("@")) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "That email is already registered." };

  const [user] = await db.insert(users)
    .values({ email, name: str(fd, "name") || null, passwordHash: await hashPassword(password) })
    .returning({ id: users.id });
  await createSession(user!.id);
  redirect("/onboarding");
}

export async function signIn(_prev: unknown, fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(str(fd, "password"), user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  await createSession(user.id);
  redirect("/today");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

// -------------------------------------------------------------- workspaces

export async function createWorkspace(_prev: unknown, fd: FormData) {
  const user = await requireUser();
  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };
  const slug = (str(fd, "slug") || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const [ws] = await db.insert(workspaces).values({
    ownerId: user.id, name, slug,
    objective: str(fd, "objective"),
    timezone: str(fd, "timezone") || "UTC",
  }).returning({ id: workspaces.id });

  await saveIdentityMemory(ws!.id, {
    audience: str(fd, "audience"),
    voice: str(fd, "voice"),
    pillars: lines(fd, "pillars"),
    avoid: lines(fd, "avoid"),
    strategic_priorities: lines(fd, "priorities"),
  });

  await setActiveWorkspace(ws!.id);
  redirect("/sources");
}

export async function switchWorkspace(fd: FormData) {
  await setActiveWorkspace(str(fd, "workspaceId"));
  redirect("/today");
}

async function saveIdentityMemory(workspaceId: string, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    const row = {
      workspaceId, memoryType: "identity", key, valueJson: value,
      source: "user", confidence: 1, lockedByUser: true, updatedAt: new Date(),
    };
    await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
      target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
      set: row,
    });
  }
}

export async function updateMemory(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  await saveIdentityMemory(ws.id, {
    audience: str(fd, "audience"),
    voice: str(fd, "voice"),
    pillars: lines(fd, "pillars"),
    avoid: lines(fd, "avoid"),
    strategic_priorities: lines(fd, "priorities"),
  });
  await db.update(workspaces).set({ objective: str(fd, "objective") }).where(eq(workspaces.id, ws.id));
  await recordEvent(ws.id, "memory_corrected", "workspace", ws.id, { keys: ["identity"] });
  revalidatePath("/memory");
  return { ok: true };
}

/**
 * §5.7 — users must be able to remove or correct learned memory.
 *
 * Forgetting a signal deletes it AND records the correction, so the learner
 * does not simply re-derive it from the same events on the next cycle. The
 * suppression is itself evidence about the operator.
 */
export async function forgetSignal(fd: FormData) {
  const ws = await requireWorkspace();
  const id = str(fd, "signalId");
  const [signal] = await db.select().from(strategySignals)
    .where(and(eq(strategySignals.id, id), eq(strategySignals.workspaceId, ws.id))).limit(1);
  if (!signal) return;

  await db.delete(strategySignals).where(eq(strategySignals.id, id));
  await db.insert(workspaceMemory).values({
    workspaceId: ws.id, memoryType: "operator", key: `suppressed:${signal.dimension}:${signal.key}`,
    valueJson: { suppressedAt: new Date().toISOString(), effect: signal.effect },
    source: "user", lockedByUser: true, updatedAt: new Date(),
  }).onConflictDoNothing();

  await recordEvent(ws.id, "memory_corrected", "strategy_signal", id, {
    action: "forgotten", key: signal.key,
  });
  await rankOpportunities(ws.id);
  revalidatePath("/memory");
  revalidatePath("/today");
}

/** Removes a learned workspace-memory row. */
export async function deleteLearnedMemory(fd: FormData) {
  const ws = await requireWorkspace();
  const id = str(fd, "memoryId");
  await db.delete(workspaceMemory)
    .where(and(eq(workspaceMemory.id, id), eq(workspaceMemory.workspaceId, ws.id), eq(workspaceMemory.source, "learned")));
  await recordEvent(ws.id, "memory_corrected", "workspace_memory", id, { action: "deleted" });
  revalidatePath("/memory");
}

// ----------------------------------------------------------------- sources

export async function addSource(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const type = str(fd, "type");
  const config: Record<string, string> = {};

  if (type === "note") {
    config.text = str(fd, "text");
    config.title = str(fd, "label");
    if (!config.text) return { error: "A note needs some text." };
  } else if (type === "github") {
    config.repo = str(fd, "url").replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    if (!config.repo.includes("/")) return { error: "Use owner/name for a GitHub repo." };
  } else {
    config.url = str(fd, "url");
    if (!/^https?:\/\//.test(config.url)) return { error: "Enter a full URL including https://" };
  }

  const [source] = await db.insert(sources).values({
    workspaceId: ws.id, type, label: str(fd, "label") || config.url || "Note", configJson: config,
  }).returning({ id: sources.id });

  await syncSource(ws.id, source!.id);
  revalidatePath("/sources");
  return { ok: true };
}

export async function removeSource(fd: FormData) {
  const ws = await requireWorkspace();
  await db.delete(sources)
    .where(and(eq(sources.id, str(fd, "sourceId")), eq(sources.workspaceId, ws.id)));
  revalidatePath("/sources");
}

export async function resyncSource(fd: FormData) {
  const ws = await requireWorkspace();
  await syncSource(ws.id, str(fd, "sourceId"));
  revalidatePath("/sources");
}

export async function importContent(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const raw = str(fd, "content");
  if (!raw) return { error: "Paste something first." };

  // One post per line: `YYYY-MM-DD | title/text`, or just text (dated today).
  const entries = raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/);
    return m
      ? { title: m[2]!.slice(0, 200), text: m[2]!, publishedAt: new Date(m[1]!) }
      : { title: line.slice(0, 200), text: line, publishedAt: new Date() };
  });

  const count = await importPriorContent(ws.id, entries);
  revalidatePath("/sources");
  revalidatePath("/today");
  return { ok: true, count };
}

// ----------------------------------------------------------------- the loop

export async function runCycleNow() {
  const ws = await requireWorkspace();
  await runCycle(ws.id, "manual");
  revalidatePath("/today");
  revalidatePath("/growth");
}

// -------------------------------------------------------------- feedback

async function recordEvent(
  workspaceId: string, eventType: FeedbackEventType,
  entityType: string, entityId: string, metadata: Record<string, unknown> = {},
) {
  await db.insert(feedbackEvents).values({
    workspaceId, eventType, entityType, entityId, actor: "user", metadataJson: metadata,
  });
}

/**
 * Every decision is a learning event (§5.1). The topics travel with the event
 * so the learner can attribute the decision without re-reading the opportunity.
 */
export async function decideOpportunity(fd: FormData) {
  const ws = await requireWorkspace();
  const id = str(fd, "opportunityId");
  const decision = str(fd, "decision") as OpportunityStatus;

  const [opp] = await db.select().from(opportunities)
    .where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, ws.id))).limit(1);
  if (!opp) throw new Error("opportunity not found in this workspace");

  const links = await db.select({ id: opportunitySources.sourceItemId })
    .from(opportunitySources).where(eq(opportunitySources.opportunityId, id));
  const items = links.length
    ? await db.select({ topics: sourceItems.topicsJson }).from(sourceItems)
        .where(and(
          eq(sourceItems.workspaceId, ws.id),
          inArray(sourceItems.id, links.map((l) => l.id)),
        ))
    : [];
  const topics = [...new Set(items.flatMap((i) => i.topics))].slice(0, 12);

  const eventByDecision: Record<string, FeedbackEventType> = {
    saved: "opportunity_saved",
    skipped: "opportunity_skipped",
    rejected: "opportunity_rejected",
    created: "opportunity_created",
    already_covered: "opportunity_skipped",
    viewed: "opportunity_viewed",
  };

  await db.update(opportunities).set({ status: decision, updatedAt: new Date() })
    .where(eq(opportunities.id, id));
  await recordEvent(ws.id, eventByDecision[decision] ?? "opportunity_viewed", "opportunity", id, {
    topics, decision, title: opp.title,
  });

  // This is acceptance criterion #12: a decision now changes the next ranking.
  await recomputeStrategySignals(ws.id);
  await rankOpportunities(ws.id);

  revalidatePath("/today");
  revalidatePath("/growth");
}


// -------------------------------------------------------------------- create

/**
 * §5.4 — Create never starts from a blank composer. It starts from an
 * opportunity, and each channel gets its own native piece, not a reformat.
 */
export async function createDraft(fd: FormData) {
  const ws = await requireWorkspace();
  const opportunityId = str(fd, "opportunityId");
  const channel = str(fd, "channel") as Platform;

  await generateDraft({ workspaceId: ws.id, opportunityId, channel });

  // Choosing to create is a learning event, and a strong one.
  const [opp] = await db.select().from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, ws.id))).limit(1);
  if (opp && opp.status !== "created") {
    await db.update(opportunities).set({ status: "created", updatedAt: new Date() })
      .where(eq(opportunities.id, opportunityId));

    const links = await db.select({ id: opportunitySources.sourceItemId })
      .from(opportunitySources).where(eq(opportunitySources.opportunityId, opportunityId));
    const items = links.length
      ? await db.select({ topics: sourceItems.topicsJson }).from(sourceItems)
          .where(and(eq(sourceItems.workspaceId, ws.id), inArray(sourceItems.id, links.map((l) => l.id))))
      : [];

    await recordEvent(ws.id, "opportunity_created", "opportunity", opportunityId, {
      topics: [...new Set(items.flatMap((i) => i.topics))].slice(0, 12),
      decision: "created", title: opp.title,
    });
    await recomputeStrategySignals(ws.id);
    await rankOpportunities(ws.id);
  }

  revalidatePath(`/create/${opportunityId}`);
  revalidatePath("/today");
}

export async function planChannels(fd: FormData) {
  const ws = await requireWorkspace();
  const opportunityId = str(fd, "opportunityId");
  await generateActionSpecs(ws.id, opportunityId);
  revalidatePath(`/create/${opportunityId}`);
}

export async function saveDraft(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const draftId = str(fd, "draftId");
  const raw = str(fd, "content");

  let content: DraftContent;
  try {
    content = JSON.parse(raw) as DraftContent;
  } catch {
    return { error: "Could not read the edited draft." };
  }

  await recordDraftEdit({
    workspaceId: ws.id, draftId, content, intent: str(fd, "intent") || "manual",
  });
  revalidatePath(`/create/${str(fd, "opportunityId")}`);
  return { ok: true };
}

export async function approveDraftAction(fd: FormData) {
  const ws = await requireWorkspace();
  await approveDraft(ws.id, str(fd, "draftId"));
  revalidatePath(`/create/${str(fd, "opportunityId")}`);
}

export async function discardDraft(fd: FormData) {
  const ws = await requireWorkspace();
  await db.update(drafts).set({ state: "discarded", updatedAt: new Date() })
    .where(and(eq(drafts.id, str(fd, "draftId")), eq(drafts.workspaceId, ws.id)));
  revalidatePath(`/create/${str(fd, "opportunityId")}`);
}


// ------------------------------------------------------------- conversations

/**
 * Discovery is manual — X's API is priced out of reach and scraping breaches
 * its terms. The operator finds candidates; Inspyr decides which are worth
 * entering. That is the half that is actually hard.
 */
export async function addConversation(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const url = str(fd, "url");
  if (!/^https?:\/\//.test(url)) return { error: "Paste the full URL of the post." };

  const followers = Number.parseInt(str(fd, "authorFollowers").replace(/[,\s]/g, ""), 10);
  const depth = Number.parseInt(str(fd, "replyDepth"), 10);
  const ageMinutes = Number.parseInt(str(fd, "ageMinutes"), 10);
  if (!Number.isFinite(followers) || !Number.isFinite(depth) || !Number.isFinite(ageMinutes)) {
    return { error: "Followers, reply count and age are all needed to judge this." };
  }

  const { result } = await addConversationTarget(ws.id, {
    url,
    authorHandle: str(fd, "authorHandle"),
    authorFollowers: followers,
    replyDepth: depth,
    postedAt: new Date(Date.now() - ageMinutes * 60_000),
    text: str(fd, "text"),
  });

  revalidatePath("/conversations");
  return { ok: true, eligible: result.eligible, score: result.score };
}

export async function skipConversation(fd: FormData) {
  const ws = await requireWorkspace();
  await db.update(conversationTargets).set({ status: "skipped" })
    .where(and(
      eq(conversationTargets.id, str(fd, "targetId")),
      eq(conversationTargets.workspaceId, ws.id),
    ));
  revalidatePath("/conversations");
}

/**
 * The outcome half. Impressions are not success — Tako's failed reply had 102
 * of them. Conversion is a profile visit or a follow.
 */
export async function logReplyOutcome(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const num = (k: string) => {
    const v = Number.parseInt(str(fd, k), 10);
    return Number.isFinite(v) ? v : undefined;
  };

  await recordReplyOutcome({
    workspaceId: ws.id,
    conversationTargetId: str(fd, "targetId"),
    replyUrl: str(fd, "replyUrl") || undefined,
    text: str(fd, "text") || undefined,
    impressions: num("impressions"),
    engagements: num("engagements"),
    profileVisits: num("profileVisits"),
    followsGained: num("followsGained"),
  });

  revalidatePath("/conversations");
  revalidatePath("/growth");
  return { ok: true };
}

/** Follower counts per platform — the input that decides timeline viability. */
export async function updateAudienceSize(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const sizes: Record<string, number> = {};
  for (const p of ["x", "linkedin", "instagram", "youtube"]) {
    const v = Number.parseInt(str(fd, p).replace(/[,\s]/g, ""), 10);
    if (Number.isFinite(v)) sizes[p] = v;
  }
  const row = {
    workspaceId: ws.id, memoryType: "identity", key: "audience_size",
    valueJson: sizes, source: "user", confidence: 1, lockedByUser: true, updatedAt: new Date(),
  };
  await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
    target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
    set: row,
  });
  revalidatePath("/conversations");
  revalidatePath("/today");
  return { ok: true };
}

/** What this workspace can concretely contribute to a conversation. */
export async function updateFacts(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const row = {
    workspaceId: ws.id, memoryType: "identity", key: "facts",
    valueJson: lines(fd, "facts"), source: "user", confidence: 1,
    lockedByUser: true, updatedAt: new Date(),
  };
  await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
    target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
    set: row,
  });
  revalidatePath("/conversations");
  return { ok: true };
}


/** What exists today. This is what turns a blocked action into an available one. */
export async function updateReadiness(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const readiness: Readiness = {};
  for (const key of READINESS_KEYS) readiness[key] = fd.get(key) === "on";
  await saveReadiness(ws.id, readiness);
  revalidatePath("/today");
  revalidatePath("/conversations");
  return { ok: true };
}


// --------------------------------------------------------------- publications

/** Marks a draft as actually published. This is what starts the outcome loop. */
export async function publishDraft(fd: FormData) {
  const ws = await requireWorkspace();
  const draftId = str(fd, "draftId");

  const [draft] = await db.select().from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.workspaceId, ws.id))).limit(1);
  if (!draft) throw new Error("draft not found in this workspace");

  const links = await db.select({ id: oppSources.sourceItemId })
    .from(oppSources).where(eq(oppSources.opportunityId, draft.opportunityId));
  const items = links.length
    ? await db.select({ topics: sourceItems.topicsJson }).from(sourceItems)
        .where(and(eq(sourceItems.workspaceId, ws.id), inArray(sourceItems.id, links.map((l) => l.id))))
    : [];

  await markPublished({
    workspaceId: ws.id,
    draftId,
    channel: draft.channel,
    externalUrl: str(fd, "externalUrl") || undefined,
    topics: [...new Set(items.flatMap((i) => i.topics))].slice(0, 10),
  });

  revalidatePath("/published");
  revalidatePath(`/create/${draft.opportunityId}`);
}

/** Records something published outside Inspyr, so the loop still closes. */
export async function addPublication(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const title = str(fd, "title");
  if (!title) return { error: "What was it?" };

  const daysAgo = Number.parseInt(str(fd, "daysAgo"), 10);
  const publishedAt = Number.isFinite(daysAgo)
    ? new Date(Date.now() - daysAgo * 864e5)
    : new Date();

  await markPublished({
    workspaceId: ws.id,
    channel: str(fd, "channel") || "x",
    title,
    externalUrl: str(fd, "externalUrl") || undefined,
    publishedAt,
    topics: lines(fd, "topics"),
  });

  revalidatePath("/published");
  return { ok: true };
}

/**
 * The numbers. Inspyr compares them to your own recent posts, not to an
 * absolute — 400 impressions means nothing until it is next to your normal.
 */
export async function logMetrics(_prev: unknown, fd: FormData) {
  const ws = await requireWorkspace();
  const publicationId = str(fd, "publicationId");

  const metrics: Metrics = {};
  for (const key of METRIC_KEYS) {
    const raw = str(fd, key).replace(/[,\s]/g, "");
    if (!raw) continue;
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value)) metrics[key as MetricKey] = value;
  }
  if (Object.keys(metrics).length === 0) {
    return { error: "Enter at least one number." };
  }

  const horizon = Number.parseInt(str(fd, "horizonHours"), 10);
  const result = await recordMetrics({
    workspaceId: ws.id,
    publicationId,
    metrics,
    horizonHours: Number.isFinite(horizon) ? horizon : 24,
  });

  revalidatePath("/published");
  revalidatePath("/growth");
  revalidatePath("/today");
  return { ok: true, explanation: result.explanation, score: result.score };
}
