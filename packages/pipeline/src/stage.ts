import { and, desc, eq, gte } from "drizzle-orm";
import { db, workspaceMemory, publications, workspaces } from "@inspyr/db";
import {
  detectStage, stageProgress, stagePolicy, platformKind, describeStage,
  STAGE_BANDS, STAGE_LABELS,
  type Stage, type StagePolicy,
} from "@inspyr/shared";

/**
 * Works out where each of a workspace's accounts actually is, and therefore
 * how Inspyr should behave for it.
 *
 * Read by next-actions, Today, the conversation gates and the published view.
 * Nothing in the product should give advice without consulting this first —
 * that is the whole point of it existing.
 */

export interface PlatformStage {
  platform: string;
  followers: number;
  stage: Stage;
  stageLabel: string;
  progress: number;
  /** Followers still needed to leave this band. */
  toNextStage: number;
  policy: StagePolicy;
  summary: string;
  /** Posts recorded on this platform in the last 28 days. */
  recentPosts: number;
  /** Whether they are hitting the cadence this stage asks for. */
  cadence: { actualPerWeek: number; targetPerWeek: number; onTrack: boolean };
}

export interface WorkspaceStage {
  platforms: PlatformStage[];
  /** The platform the workspace is furthest along on. Drives the headline. */
  primary: PlatformStage | null;
  /** Platforms the operator selected but where nothing is recorded yet. */
  unstarted: string[];
  /** True when no platform has enough history to learn from. */
  coldStart: boolean;
}

const DAYS_28 = 28 * 864e5;

async function selectedPlatforms(workspaceId: string): Promise<string[]> {
  const [row] = await db.select().from(workspaceMemory)
    .where(and(
      eq(workspaceMemory.workspaceId, workspaceId),
      eq(workspaceMemory.memoryType, "identity"),
      eq(workspaceMemory.key, "platforms"),
    )).limit(1);
  const value = row?.valueJson;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function followerCounts(workspaceId: string): Promise<Record<string, number>> {
  const [row] = await db.select().from(workspaceMemory)
    .where(and(
      eq(workspaceMemory.workspaceId, workspaceId),
      eq(workspaceMemory.memoryType, "identity"),
      eq(workspaceMemory.key, "audience_size"),
    )).limit(1);
  const value = (row?.valueJson ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

export async function savePlatformSelection(workspaceId: string, platforms: string[]): Promise<void> {
  const row = {
    workspaceId, memoryType: "identity", key: "platforms",
    valueJson: platforms, source: "user", confidence: 1,
    lockedByUser: true, updatedAt: new Date(),
  };
  await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
    target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
    set: row,
  });
}

/** Minimum published posts on a platform before its own data is worth learning from. */
export const OWN_DATA_THRESHOLD = 8;

export async function workspaceStage(workspaceId: string): Promise<WorkspaceStage> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);

  const followers = await followerCounts(workspaceId);
  const selected = await selectedPlatforms(workspaceId);

  const recent = await db.select().from(publications)
    .where(and(
      eq(publications.workspaceId, workspaceId),
      gte(publications.publishedAt, new Date(Date.now() - DAYS_28)),
    ));

  const allPublished = await db.select({ channel: publications.channel })
    .from(publications).where(eq(publications.workspaceId, workspaceId));

  // A platform counts if the operator chose it, has followers there, or posted there.
  const platforms = [...new Set([
    ...selected,
    ...Object.keys(followers),
    ...allPublished.map((p) => p.channel),
  ])];

  const stages: PlatformStage[] = platforms.map((platform) => {
    const count = followers[platform] ?? 0;
    const stage = detectStage(count);
    const policy = stagePolicy(stage, platform);
    const recentPosts = recent.filter((p) => p.channel === platform).length;
    const actualPerWeek = Math.round((recentPosts / 4) * 10) / 10;

    return {
      platform,
      followers: count,
      stage,
      stageLabel: STAGE_LABELS[stage],
      progress: stageProgress(count),
      toNextStage: Number.isFinite(STAGE_BANDS[stage].max)
        ? Math.max(0, STAGE_BANDS[stage].max - count)
        : 0,
      policy: {
        ...policy,
        // The policy says whether own data is *usually* useful at this stage.
        // Whether it actually is depends on how much this account has posted.
        ownDataUseful: policy.ownDataUseful
          && allPublished.filter((p) => p.channel === platform).length >= OWN_DATA_THRESHOLD,
      },
      summary: describeStage(policy, count),
      recentPosts,
      cadence: {
        actualPerWeek,
        targetPerWeek: policy.cadence.target,
        onTrack: actualPerWeek >= policy.cadence.min,
      },
    };
  });

  // Primary = furthest along. Ties broken by follower count.
  const ordered = [...stages].sort((a, b) =>
    (b.followers - a.followers) || (b.recentPosts - a.recentPosts));

  return {
    platforms: stages,
    primary: ordered[0] ?? null,
    unstarted: selected.filter((p) =>
      !allPublished.some((x) => x.channel === p) && (followers[p] ?? 0) === 0),
    coldStart: stages.every((s) => !s.policy.ownDataUseful),
  };
}

/**
 * The one-line answer to "what should I be doing".
 *
 * Deliberately blunt, and different per platform: on a follower-gated platform
 * at zero, the correct instruction is to stop posting to your own timeline,
 * and no amount of content help changes that.
 */
export function stageInstruction(s: PlatformStage): string {
  const p = s.policy;
  if (!p.timelineViable) {
    return `Posting to your own ${s.platform} timeline reaches about ${s.followers} `
      + `${s.followers === 1 ? "person" : "people"}. Reply under other people's posts instead — `
      + `that is the only reach available to you here right now.`;
  }
  if (p.borrowedReachFirst) {
    return `Keep replying — it is still doing more for you than posting is.`;
  }
  if (!s.cadence.onTrack) {
    return `You are posting ${s.cadence.actualPerWeek}× a week. This stage wants `
      + `${p.cadence.target}. ${p.cadence.note}`;
  }
  return p.levers[0] ?? p.bottleneck;
}
