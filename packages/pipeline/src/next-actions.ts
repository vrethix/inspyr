import { and, eq } from "drizzle-orm";
import { db, workspaceMemory, conversationTargets } from "@inspyr/db";
import {
  ACTION_CATALOGUE, CHANNEL_LABELS, READINESS_LABELS, READINESS_KEYS,
  expectedReach, missing, actionValue, unlockValue,
  type ActionDefinition, type Readiness, type ReadinessKey, type Platform,
} from "@inspyr/shared";
import { audienceSize } from "./conversations";
import { workspaceStage, stageInstruction, type PlatformStage } from "./stage";

/**
 * "What should I do today?"
 *
 * Inspyr's answer used to stop at "do not post to your timeline". That is true
 * and useless. This returns the ranked list of what to do *instead*, plus the
 * blocked list with the one thing that unblocks each item.
 */

export interface AvailableAction {
  key: string;
  channel: string;
  channelLabel: string;
  label: string;
  what: string;
  reachKind: string;
  expectedReach: number;
  /** Reach it makes possible by unblocking other actions. */
  unlockValue: number;
  value: number;
  effortMinutes: number;
  /** Populated for actions that point at a specific thing, e.g. a conversation. */
  detail: string | null;
  href: string | null;
}

export interface BlockedAction {
  key: string;
  channelLabel: string;
  label: string;
  what: string;
  /** What has to exist first. Plain language. */
  blockedBy: string[];
}

export interface NextActions {
  audienceSize: number;
  /** Where each account actually is. Everything below is shaped by this. */
  stage: Awaited<ReturnType<typeof workspaceStage>>;
  /** The blunt one-liner for the top of the screen. */
  instruction: string | null;
  available: AvailableAction[];
  blocked: BlockedAction[];
  readiness: Readiness;
  /** The single highest-reach thing available. */
  best: AvailableAction | null;
}

export async function loadReadiness(workspaceId: string): Promise<Readiness> {
  const [row] = await db.select().from(workspaceMemory)
    .where(and(
      eq(workspaceMemory.workspaceId, workspaceId),
      eq(workspaceMemory.memoryType, "identity"),
      eq(workspaceMemory.key, "readiness"),
    )).limit(1);
  const value = (row?.valueJson ?? {}) as Record<string, unknown>;
  const out: Readiness = {};
  for (const key of READINESS_KEYS) out[key] = value[key] === true;
  return out;
}

export async function saveReadiness(workspaceId: string, readiness: Readiness): Promise<void> {
  const row = {
    workspaceId, memoryType: "identity", key: "readiness",
    valueJson: readiness as Record<string, boolean>,
    source: "user", confidence: 1, lockedByUser: true, updatedAt: new Date(),
  };
  await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
    target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
    set: row,
  });
}

function describe(action: ActionDefinition, reach: number, audience: number): string | null {
  if (action.reachKind === "own_audience") {
    return `Reaches about ${audience} ${audience === 1 ? "person" : "people"} — everyone who follows you.`;
  }
  if (action.reachKind === "artifact") {
    return `Your follower count does not matter here.`;
  }
  return null;
}

export async function nextActions(workspaceId: string): Promise<NextActions> {
  const readiness = await loadReadiness(workspaceId);
  const audience = await audienceSize(workspaceId, "x" as Platform);
  const stage = await workspaceStage(workspaceId);

  // Stage decides which platforms are even worth acting on, so build a lookup
  // before ranking anything.
  const byPlatform = new Map<string, PlatformStage>(
    stage.platforms.map((p) => [p.platform, p]),
  );

  // Live conversations worth entering — a reply is only real if there is one.
  const openConversations = await db.select().from(conversationTargets)
    .where(and(
      eq(conversationTargets.workspaceId, workspaceId),
      eq(conversationTargets.status, "new"),
      eq(conversationTargets.eligible, true),
    ));

  const available: AvailableAction[] = [];
  const blocked: BlockedAction[] = [];

  for (const action of ACTION_CATALOGUE) {
    const unmet = missing(readiness, action.requires);

    if (unmet.length > 0) {
      blocked.push({
        key: action.key,
        channelLabel: CHANNEL_LABELS[action.channel],
        label: action.label,
        what: action.what,
        blockedBy: unmet.map((k: ReadinessKey) => READINESS_LABELS[k]),
      });
      continue;
    }

    const platformStage = byPlatform.get(action.channel);
    const policy = platformStage?.policy;

    /**
     * The stage engine's main job: stop recommending things that cannot work
     * at this stage on this platform. Posting to a timeline that reaches nine
     * people is not a low-value action, it is a blocked one, and saying so is
     * more useful than ranking it last.
     */
    if (policy && action.reachKind === "own_audience" && !policy.timelineViable) {
      blocked.push({
        key: action.key,
        channelLabel: CHANNEL_LABELS[action.channel],
        label: action.label,
        what: action.what,
        blockedBy: [
          `${platformStage!.followers} followers on ${action.channel} — your timeline `
          + `reaches about that many people. Borrowed reach first.`,
        ],
      });
      continue;
    }

    const reach = expectedReach(action, audience);
    const unlocks = unlockValue(action, readiness as Record<string, boolean | undefined>, audience);

    /**
     * Borrowed reach outranks everything on a follower-gated platform early on.
     * Not a preference — it is the only mechanism that reaches strangers there.
     */
    const stageBoost = policy?.borrowedReachFirst && action.reachKind === "borrowed" ? 1.6 : 1;

    // A reply with nothing to reply to is not an available action.
    if (action.key === "reply_conversation" && openConversations.length === 0) {
      blocked.push({
        key: action.key,
        channelLabel: CHANNEL_LABELS[action.channel],
        label: action.label,
        what: action.what,
        blockedBy: ["A conversation worth entering — add some on the Conversations page"],
      });
      continue;
    }

    available.push({
      key: action.key,
      channel: action.channel,
      channelLabel: CHANNEL_LABELS[action.channel],
      label: action.label,
      what: action.what,
      reachKind: action.reachKind,
      expectedReach: action.key === "reply_conversation"
        ? Math.round(reach * Math.min(3, openConversations.length))
        : reach,
      unlockValue: unlocks,
      value: Math.round(
        actionValue(action, readiness as Record<string, boolean | undefined>, audience) * stageBoost,
      ),
      effortMinutes: action.effortMinutes,
      detail: action.key === "reply_conversation"
        ? `${openConversations.length} conversation${openConversations.length === 1 ? "" : "s"} ready.`
        : describe(action, reach, audience),
      href: action.key === "reply_conversation" ? "/conversations" : null,
    });
  }

  // Rank by reach plus what it unblocks. Effort only breaks ties.
  available.sort((a, b) => b.value - a.value || a.effortMinutes - b.effortMinutes);

  return {
    audienceSize: audience,
    stage,
    instruction: stage.primary ? stageInstruction(stage.primary) : null,
    available,
    blocked,
    readiness,
    best: available[0] ?? null,
  };
}
