import type { ReadinessKey } from "./readiness";

/**
 * The catalogue of things a workspace can actually do today.
 *
 * This exists because "your timeline reaches 9 people, do not post" is a correct
 * answer and a useless one. Refusing without naming a better option is what
 * makes a growth tool feel like a wall. Every refusal here comes with a ranked
 * list of what to do instead.
 */

export const ACTION_CHANNELS = [
  "x", "linkedin", "instagram", "youtube",
  "github", "showhn", "discord", "farcaster",
] as const;
export type ActionChannel = (typeof ACTION_CHANNELS)[number];

export const CHANNEL_LABELS: Record<ActionChannel, string> = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  github: "GitHub",
  showhn: "Show HN",
  discord: "Discord",
  farcaster: "Farcaster",
};

/**
 * How far an action reaches, and what that reach depends on.
 *
 * `own_audience` — bounded by your follower count. At 9 followers this is 9.
 * `borrowed`     — rides someone else's audience. Independent of your size.
 * `artifact`     — the work itself is the distribution. Your follower count is
 *                  irrelevant; the question is whether the thing is good.
 */
export type ReachKind = "own_audience" | "borrowed" | "artifact";

export interface ActionDefinition {
  key: string;
  channel: ActionChannel;
  label: string;
  /** Plain description of the action. Written for a tired person at 1am. */
  what: string;
  reachKind: ReachKind;
  requires: ReadinessKey[];
  /** What doing this makes true, which is how it unblocks other actions. */
  produces: ReadinessKey[];
  /** Rough minutes of work. Used to break ties, not to rank. */
  effortMinutes: number;
  /** Typical reach when reach does not depend on your followers. */
  typicalReach: number;
}

export const ACTION_CATALOGUE: ActionDefinition[] = [
  // ---- artifact channels: your follower count does not matter here ----
  {
    key: "publish_repo",
    channel: "github",
    label: "Put the code on GitHub",
    what: "Make the repository public with a README that explains what it does and how to run it.",
    reachKind: "artifact",
    requires: ["test_evidence"],
    // A repo with run instructions is what makes Show HN and Discord possible.
    produces: ["public_repo", "runnable_artifact"],
    effortMinutes: 180,
    typicalReach: 200,
  },
  {
    key: "write_story",
    channel: "github",
    label: "Write up what broke and how you fixed it",
    what: "A short honest writeup of a real bug or failure, with the test that catches it now.",
    reachKind: "artifact",
    requires: ["test_evidence"],
    produces: ["written_story"],
    effortMinutes: 90,
    typicalReach: 300,
  },
  {
    key: "show_hn",
    channel: "showhn",
    label: "Post it to Show HN",
    what: "Hacker News does not care how many followers you have. It cares whether the thing works.",
    reachKind: "artifact",
    requires: ["public_repo", "runnable_artifact"],
    produces: [],
    effortMinutes: 30,
    typicalReach: 2000,
  },
  {
    key: "open_issue",
    channel: "github",
    label: "Open a useful issue on a related project",
    what: "Find a project near yours. Report something real you found, or add a missing test. Not promotion.",
    reachKind: "borrowed",
    requires: [],
    produces: [],
    effortMinutes: 60,
    typicalReach: 50,
  },
  {
    key: "share_discord",
    channel: "discord",
    label: "Share it in a builder Discord",
    what: "Post the repo in a group where people build the same kind of thing.",
    reachKind: "artifact",
    requires: ["public_repo"],
    produces: [],
    effortMinutes: 20,
    typicalReach: 150,
  },
  {
    key: "farcaster_dev",
    channel: "farcaster",
    label: "Post in a Farcaster dev channel",
    what: "Small, technical, and people actually read it.",
    reachKind: "artifact",
    requires: ["public_repo"],
    produces: [],
    effortMinutes: 15,
    typicalReach: 120,
  },

  // ---- social channels ----
  {
    key: "reply_conversation",
    channel: "x",
    label: "Reply to a conversation",
    what: "Borrow someone else's audience. Only where you have something concrete to add.",
    reachKind: "borrowed",
    requires: [],
    produces: [],
    effortMinutes: 10,
    typicalReach: 300,
  },
  {
    key: "timeline_post",
    channel: "x",
    label: "Post to your own timeline",
    what: "Reaches the people who already follow you. Nobody else.",
    reachKind: "own_audience",
    requires: [],
    produces: [],
    effortMinutes: 30,
    typicalReach: 0,
  },
  {
    key: "proof_post",
    channel: "x",
    label: "Post the proof",
    what: "Show the real thing — the failing test, the fix, the output. Not a claim about it.",
    reachKind: "own_audience",
    requires: ["test_evidence"],
    produces: [],
    effortMinutes: 40,
    typicalReach: 0,
  },
  {
    key: "linkedin_post",
    channel: "linkedin",
    label: "Write a LinkedIn post",
    what: "Reaches your connections and a little beyond.",
    reachKind: "own_audience",
    requires: [],
    produces: [],
    effortMinutes: 30,
    typicalReach: 0,
  },
];

/**
 * Expected reach, from mechanism.
 *
 * No data needed. A timeline post cannot reach more people than follow you —
 * that is arithmetic. An artifact channel does not consult your follower count
 * at all. This is the whole reason "publish the repo" outranks "post about it"
 * at 9 followers, and stops outranking it later.
 */
export function expectedReach(action: ActionDefinition, audienceSize: number): number {
  switch (action.reachKind) {
    case "own_audience":
      return audienceSize;
    case "borrowed":
      return action.typicalReach;
    case "artifact":
      return action.typicalReach;
  }
}

/**
 * How much *future* reach an action makes possible.
 *
 * Publishing the repo reaches a couple of hundred people by itself. It also
 * turns Show HN from blocked into available, and Show HN is an order of
 * magnitude larger. An action's value has to include what it unlocks, or the
 * ranking will always prefer a ten-minute reply over the thing that changes
 * what is possible tomorrow.
 *
 * Discounted, because unlocked is not the same as done.
 */
export const UNLOCK_DISCOUNT = 0.5;

export function unlockValue(
  action: ActionDefinition,
  readiness: Record<string, boolean | undefined>,
  audienceSize: number,
): number {
  if (!action.produces.length) return 0;

  const after = { ...readiness };
  for (const key of action.produces) after[key] = true;

  let unlocked = 0;
  for (const other of ACTION_CATALOGUE) {
    if (other.key === action.key) continue;
    const wasBlocked = other.requires.some((k) => readiness[k] !== true);
    const nowOpen = other.requires.every((k) => after[k] === true);
    if (wasBlocked && nowOpen) unlocked += expectedReach(other, audienceSize);
  }
  return Math.round(unlocked * UNLOCK_DISCOUNT);
}

/** Total value: what it reaches now, plus what it makes possible. */
export function actionValue(
  action: ActionDefinition,
  readiness: Record<string, boolean | undefined>,
  audienceSize: number,
): number {
  return expectedReach(action, audienceSize) + unlockValue(action, readiness, audienceSize);
}
