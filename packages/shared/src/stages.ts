/**
 * The stage engine.
 *
 * An account at 200 followers and one at 200,000 have almost nothing in
 * common. The bottleneck is different, the levers are different, and advice
 * that helps one actively wastes the other's time. Most tools give the same
 * advice to both, which is why they get abandoned.
 *
 * Everything else in Inspyr reads from here: which actions are worth doing,
 * what to measure, what to hide, how often to post.
 */

export const STAGES = ["0_1k", "1k_10k", "10k_100k", "100k_1m", "1m_plus"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  "0_1k": "0 to 1,000",
  "1k_10k": "1,000 to 10,000",
  "10k_100k": "10,000 to 100,000",
  "100k_1m": "100,000 to 1 million",
  "1m_plus": "over 1 million",
};

export const STAGE_BANDS: Record<Stage, { min: number; max: number }> = {
  "0_1k": { min: 0, max: 1_000 },
  "1k_10k": { min: 1_000, max: 10_000 },
  "10k_100k": { min: 10_000, max: 100_000 },
  "100k_1m": { min: 100_000, max: 1_000_000 },
  "1m_plus": { min: 1_000_000, max: Infinity },
};

export function detectStage(followers: number): Stage {
  const n = Math.max(0, followers);
  for (const stage of STAGES) {
    if (n < STAGE_BANDS[stage].max) return stage;
  }
  return "1m_plus";
}

/** How far through the current band, 0..1. Drives "you're nearly there". */
export function stageProgress(followers: number): number {
  const stage = detectStage(followers);
  const { min, max } = STAGE_BANDS[stage];
  if (!Number.isFinite(max)) return 1;
  return Math.min(1, Math.max(0, (followers - min) / (max - min)));
}

/**
 * The single most important property of a platform.
 *
 * `algorithmic` — the platform tests every post on a small audience of
 *   strangers and expands it if early signals clear a bar. Your follower count
 *   does not gate the test. A zero-follower account gets the same first shot as
 *   anyone, which is why small accounts can break out.
 *
 * `follower_gated` — reach is roughly bounded by who already follows you.
 *   Posting to your own timeline at 9 followers reaches 9 people. That is
 *   arithmetic. The only early lever is borrowing someone else's audience.
 */
export type PlatformKind = "algorithmic" | "follower_gated";

export const PLATFORM_KIND: Record<string, PlatformKind> = {
  youtube: "algorithmic",
  tiktok: "algorithmic",
  instagram: "algorithmic",
  x: "follower_gated",
  linkedin: "follower_gated",
  threads: "follower_gated",
  farcaster: "follower_gated",
};

export function platformKind(platform: string): PlatformKind {
  return PLATFORM_KIND[platform] ?? "follower_gated";
}

export interface StagePolicy {
  stage: Stage;
  platform: string;
  kind: PlatformKind;
  /** What is actually stopping growth here. One sentence, plain. */
  bottleneck: string;
  /** What moves the needle at this stage on this kind of platform. */
  levers: string[];
  /** Common activity that feels productive and does nothing here. */
  antiPatterns: string[];
  /** The number to watch. Not followers — followers are the scoreboard. */
  primaryMetric: string;
  /** Posts per week Inspyr should push for. */
  cadence: { min: number; target: number; note: string };
  /** Can a post to your own timeline reach meaningful numbers of people? */
  timelineViable: boolean;
  /** Should Inspyr prioritise borrowed reach — replies, comments, collabs? */
  borrowedReachFirst: boolean;
  /** Is there enough of the account's own history to learn from? */
  ownDataUseful: boolean;
}

/**
 * The policy matrix: stage × platform kind.
 *
 * The two dimensions are not independent. "0 to 1,000 on TikTok" and "0 to
 * 1,000 on LinkedIn" are different problems with opposite answers — one wants
 * volume of distinct attempts, the other wants replies under other people's
 * posts, because on one the algorithm will carry you and on the other it will
 * not.
 */
export function stagePolicy(stage: Stage, platform: string): StagePolicy {
  const kind = platformKind(platform);
  const base = { stage, platform, kind };

  switch (stage) {
    case "0_1k":
      return kind === "algorithmic"
        ? {
            ...base,
            bottleneck: "Nobody knows you exist, and you have no history to learn from.",
            levers: [
              "Volume of genuinely different attempts — most posts die, a few break out, so take more shots",
              "Short and complete: finish rate is what triggers the algorithm to expand you",
              "Lock 2 or 3 topics so anyone who finds you can predict what they'd get next",
            ],
            antiPatterns: [
              "Polishing one post for a week",
              "Reposting the same clip everywhere — platforms now penalise verbatim duplicates",
              "Watching follower count daily; it moves too slowly to learn from",
            ],
            primaryMetric: "Did any post reach far beyond your follower count",
            cadence: { min: 4, target: 7, note: "The algorithm gives every post a fair test. More posts, more tests." },
            timelineViable: true,
            borrowedReachFirst: false,
            ownDataUseful: false,
          }
        : {
            ...base,
            bottleneck: "Your posts reach roughly the people who already follow you, and there are almost none.",
            levers: [
              "Replies and comments under other people's posts — this borrows their audience and works at zero",
              "Early, small-to-mid accounts, where your reply is actually visible",
              "Add something concrete each time: a fact, a correction, a design decision",
            ],
            antiPatterns: [
              "Posting to your own timeline — it is arithmetic, not strategy",
              "Replying to huge accounts where you are 600 replies deep",
              "Scheduling tools; there is nothing to schedule yet",
            ],
            primaryMetric: "Profile visits from replies",
            cadence: { min: 15, target: 25, note: "Replies, not posts. Volume of conversations entered." },
            timelineViable: false,
            borrowedReachFirst: true,
            ownDataUseful: false,
          };

    case "1k_10k":
      return {
        ...base,
        bottleneck: "Some things work and some don't, and you can't tell which in advance.",
        levers: [
          "Find the format that repeats — usually one shape is doing most of the work",
          "When something breaks out, make three more like it immediately",
          "Hold a steady cadence; inconsistency resets the audience you just gained",
        ],
        antiPatterns: [
          "Chasing every trend — it stops you being recognisable",
          "Changing topics because one post underperformed",
          kind === "follower_gated"
            ? "Abandoning replies now that posts finally work — they still carry you"
            : "Making everything longer because you can",
        ],
        primaryMetric: "Hit rate — what share of your posts break out",
        cadence: { min: 3, target: 5, note: "Enough volume to keep learning, sustainably." },
        timelineViable: true,
        borrowedReachFirst: kind === "follower_gated",
        ownDataUseful: true,
      };

    case "10k_100k":
      return {
        ...base,
        bottleneck: "Your existing audience already sees everything. Growth now has to come from new people.",
        levers: [
          "Series and recurring formats — they give people a reason to come back",
          "Search and evergreen: content that keeps being found months later",
          "Collaborations and appearances in other people's audiences",
          "A second platform, fed from the same work",
        ],
        antiPatterns: [
          "More volume — at this stage it burns you out without adding new viewers",
          "Optimising for your existing audience's taste, which is a slow way to plateau",
        ],
        primaryMetric: "Share of viewers who don't already follow you",
        cadence: { min: 2, target: 4, note: "Fewer, better, and reaching outward." },
        timelineViable: true,
        borrowedReachFirst: false,
        ownDataUseful: true,
      };

    case "100k_1m":
      return {
        ...base,
        bottleneck: "Production capacity. You are the constraint, not the audience.",
        levers: [
          "Systems: repeatable formats that don't need you to invent each time",
          "A portfolio of formats, judged together rather than post by post",
          "Delegation — templates, briefs, and review instead of making everything",
        ],
        antiPatterns: [
          "Judging single posts; variance is high and it will make you change things that work",
          "Adding platforms before the existing ones are systematised",
        ],
        primaryMetric: "Portfolio performance across formats, not individual posts",
        cadence: { min: 3, target: 6, note: "Sustained by systems rather than effort." },
        timelineViable: true,
        borrowedReachFirst: false,
        ownDataUseful: true,
      };

    case "1m_plus":
      return {
        ...base,
        bottleneck: "Sustaining relevance and turning attention into something durable.",
        levers: [
          "Format reinvention before decline, not after",
          "Owned channels — email, community — that don't depend on an algorithm",
        ],
        antiPatterns: ["Assuming what worked last year still works"],
        primaryMetric: "Retention and owned-audience share",
        cadence: { min: 2, target: 5, note: "Whatever the system sustains." },
        timelineViable: true,
        borrowedReachFirst: false,
        ownDataUseful: true,
      };
  }
}

/** Plain sentence for the top of the screen. */
export function describeStage(policy: StagePolicy, followers: number): string {
  return `${followers.toLocaleString()} on ${policy.platform} — ${STAGE_LABELS[policy.stage]}. ${policy.bottleneck}`;
}
