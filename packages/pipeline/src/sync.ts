import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  db, connectedAccounts, accountSnapshots, publications, workspaceMemory,
} from "@inspyr/db";
import { getSocialProvider, SocialUnavailableError } from "@inspyr/social";
import { recordMetrics } from "./publications";

/**
 * Pulling reality back in.
 *
 * Everything Inspyr learns depends on knowing what actually happened, and
 * typing numbers in by hand does not survive contact with a real week. This is
 * the layer that removes that — where the provider supports it. Where it does
 * not, manual entry stays, and Inspyr says which is which rather than showing
 * a gap and letting the operator assume it is a zero.
 */

export interface MetricsSyncResult {
  accountsFound: number;
  followerSnapshots: number;
  postsUpdated: number;
  skipped: number;
  errors: string[];
  /** Metrics no connected platform can provide. Manual entry stays for these. */
  unavailable: string[];
}

export function socialAvailable(): boolean {
  return getSocialProvider().available;
}

/** Discovers connected accounts and records where each one currently stands. */
export async function syncAccounts(workspaceId: string): Promise<{
  accounts: number; snapshots: number; errors: string[];
}> {
  const provider = getSocialProvider();
  const errors: string[] = [];
  if (!provider.available) return { accounts: 0, snapshots: 0, errors: ["no provider configured"] };

  let accounts;
  try {
    accounts = await provider.listAccounts();
  } catch (err) {
    return {
      accounts: 0, snapshots: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  let snapshots = 0;
  const followerCounts: Record<string, number> = {};

  for (const account of accounts) {
    const row = {
      workspaceId,
      provider: provider.name,
      externalAccountId: account.id,
      platform: account.platform,
      username: account.username,
      connected: account.connected,
      lastSyncedAt: new Date(),
    };
    await db.insert(connectedAccounts).values(row).onConflictDoUpdate({
      target: [connectedAccounts.workspaceId, connectedAccounts.provider, connectedAccounts.externalAccountId],
      set: row,
    });

    if (typeof account.followers === "number") {
      await db.insert(accountSnapshots).values({
        workspaceId,
        platform: account.platform,
        externalAccountId: account.id,
        username: account.username,
        followers: account.followers,
        source: provider.name,
      });
      snapshots += 1;
      // Highest count wins when several accounts share a platform.
      followerCounts[account.platform] = Math.max(
        followerCounts[account.platform] ?? 0,
        account.followers,
      );
    }
  }

  // Feed the stage engine, which reads follower counts from identity memory.
  if (Object.keys(followerCounts).length) {
    const [existing] = await db.select().from(workspaceMemory)
      .where(and(
        eq(workspaceMemory.workspaceId, workspaceId),
        eq(workspaceMemory.memoryType, "identity"),
        eq(workspaceMemory.key, "audience_size"),
      )).limit(1);

    const merged = { ...((existing?.valueJson ?? {}) as Record<string, number>), ...followerCounts };
    const row = {
      workspaceId, memoryType: "identity", key: "audience_size",
      valueJson: merged,
      // Measured, not stated. The UI distinguishes the two.
      source: "learned", confidence: 1, lockedByUser: false, updatedAt: new Date(),
    };
    await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
      target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
      set: row,
    });
  }

  return { accounts: accounts.length, snapshots, errors };
}

/** Only fetch for posts old enough to have settled. */
export const METRICS_MIN_AGE_HOURS = 1;

export async function syncMetrics(workspaceId: string, limit = 25): Promise<MetricsSyncResult> {
  const provider = getSocialProvider();
  const result: MetricsSyncResult = {
    accountsFound: 0, followerSnapshots: 0, postsUpdated: 0,
    skipped: 0, errors: [], unavailable: [],
  };

  if (!provider.available) {
    result.errors.push(
      "No social provider connected. Numbers stay manual until then — two accounts are free at zernio.com.",
    );
    return result;
  }

  const accounts = await syncAccounts(workspaceId);
  result.accountsFound = accounts.accounts;
  result.followerSnapshots = accounts.snapshots;
  result.errors.push(...accounts.errors);

  const posts = await db.select().from(publications)
    .where(and(
      eq(publications.workspaceId, workspaceId),
      isNotNull(publications.providerPostId),
    ))
    .orderBy(desc(publications.publishedAt))
    .limit(limit);

  const cutoff = Date.now() - METRICS_MIN_AGE_HOURS * 3600_000;
  const unavailable = new Set<string>();

  for (const post of posts) {
    if (post.publishedAt.getTime() > cutoff) { result.skipped += 1; continue; }

    try {
      const fetched = await provider.fetchPostMetrics(post.providerPostId!);
      if (Object.keys(fetched.metrics).length === 0) { result.skipped += 1; continue; }

      fetched.unavailable.forEach((u) => unavailable.add(u));

      // Bucket by age so 1h and 24h numbers never overwrite each other.
      const ageHours = (Date.now() - post.publishedAt.getTime()) / 3600_000;
      const horizon = ageHours >= 168 ? 168 : ageHours >= 24 ? 24 : 1;

      await recordMetrics({
        workspaceId,
        publicationId: post.id,
        metrics: fetched.metrics,
        horizonHours: horizon,
        source: "api",
      });
      result.postsUpdated += 1;
    } catch (err) {
      if (err instanceof SocialUnavailableError) {
        result.errors.push(`${post.title.slice(0, 40)}: ${err.message}`);
        continue;
      }
      throw err;
    }
  }

  result.unavailable = [...unavailable];
  return result;
}

/**
 * Follower growth from the series Inspyr keeps itself.
 *
 * The provider does not attribute follows to posts, so this is the honest
 * substitute: the difference between two counts over a window. It cannot say
 * which post caused it, and does not pretend to.
 */
export async function followerGrowth(
  workspaceId: string,
  platform: string,
  days = 28,
): Promise<{ from: number; to: number; gained: number; days: number } | null> {
  const since = new Date(Date.now() - days * 864e5);
  const snaps = await db.select().from(accountSnapshots)
    .where(and(
      eq(accountSnapshots.workspaceId, workspaceId),
      eq(accountSnapshots.platform, platform),
    ))
    .orderBy(desc(accountSnapshots.capturedAt));

  if (snaps.length < 2) return null;

  const latest = snaps[0]!;
  const earliest = snaps.filter((s) => s.capturedAt >= since).at(-1) ?? snaps.at(-1)!;
  if (latest.id === earliest.id) return null;

  const spanDays = Math.max(
    1,
    Math.round((latest.capturedAt.getTime() - earliest.capturedAt.getTime()) / 864e5),
  );

  return {
    from: earliest.followers,
    to: latest.followers,
    gained: latest.followers - earliest.followers,
    days: spanDays,
  };
}
