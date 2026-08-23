import { describe, it, expect } from "vitest";
import {
  rankConversation, timelineViability, TIMELINE_REACH_FLOOR,
  CONVERSATION_WEIGHTS, type ConversationRankingInput,
} from "@inspyr/ranking";
import {
  CONVERSATION_GATES, reachBand, depthScore, replyRecencyScore, REACH_BAND_VALUE,
} from "@inspyr/shared";

const NOW = new Date("2026-08-24T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const workspace = {
  id: "ws", name: "Tako", objective: "builders who care about agent safety",
  audience: "Base builders, agent developers, wallet engineers",
  voice: "concrete, technical",
  pillars: ["agent wallets", "onchain agents", "privacy", "Base"],
  avoid: [], strategicPriorities: [],
};

const FACTS = [
  "Tako scopes agent wallet permissions per-session so a compromised agent cannot drain the wallet.",
  "Paper trading mode runs the same execution path as live, with a stubbed settlement layer.",
];

const base = (over: Partial<ConversationRankingInput["candidate"]> = {}): ConversationRankingInput => ({
  now: NOW,
  workspace,
  contributableFacts: FACTS,
  operatorSignals: [],
  candidate: {
    id: "c1",
    url: "https://x.com/builder/status/1",
    authorHandle: "builder",
    authorFollowers: 8_400,
    postedAt: minutesAgo(12),
    replyDepth: 4,
    text: "How are people handling agent wallet permissions on Base? Worried about an agent draining funds.",
    topics: ["agent", "wallet", "permissions", "base"],
    ...over,
  },
});

describe("mechanism gates — no training data required", () => {
  it("rejects Tako's actual failure: 639 replies deep", () => {
    // The real case: 102 impressions, zero engagement, zero conversion.
    const r = rankConversation(base({ replyDepth: 639, authorFollowers: 240_000 }));
    expect(r.eligible).toBe(false);
    expect(r.score).toBe(0);
    expect(r.gateFailures.map((g) => g.gate)).toContain("reply_depth");
    expect(r.gateFailures.find((g) => g.gate === "reply_depth")!.reason).toMatch(/collapses the tail/);
  });

  it("gates on depth regardless of how good everything else is", () => {
    const r = rankConversation(base({ replyDepth: CONVERSATION_GATES.maxReplyDepth, postedAt: minutesAgo(1) }));
    expect(r.eligible).toBe(false);
    expect(r.score).toBe(0);
  });

  it("admits an early reply on the same conversation", () => {
    const r = rankConversation(base({ replyDepth: 3 }));
    expect(r.eligible).toBe(true);
    expect(r.score).toBeGreaterThan(50);
  });

  it("gates a stale conversation", () => {
    const r = rankConversation(base({ postedAt: minutesAgo(CONVERSATION_GATES.maxAgeMinutes + 1) }));
    expect(r.gateFailures.map((g) => g.gate)).toContain("stale");
  });

  it("gates an author with no audience to borrow", () => {
    const r = rankConversation(base({ authorFollowers: 30 }));
    expect(r.gateFailures.map((g) => g.gate)).toContain("author_too_small");
  });

  it("gates when the workspace has nothing concrete to add", () => {
    const r = rankConversation({
      ...base({ text: "Anyone watching the basketball game tonight? What a finish.", topics: ["basketball", "game"] }),
      contributableFacts: FACTS,
    });
    expect(r.eligible).toBe(false);
    expect(r.gateFailures.map((g) => g.gate)).toEqual(
      expect.arrayContaining(["no_contribution"]),
    );
  });

  it("gates a workspace with no facts configured at all", () => {
    const r = rankConversation({ ...base(), contributableFacts: [] });
    expect(r.eligible).toBe(false);
    expect(r.reasons.find((x) => x.component === "contribution")!.explanation)
      .toMatch(/No contributable facts/);
  });
});

describe("reach bands", () => {
  it("bands by follower count", () => {
    expect(reachBand(9)).toBe("micro");
    expect(reachBand(3_000)).toBe("small");
    expect(reachBand(8_400)).toBe("mid");
    expect(reachBand(240_000)).toBe("large");
    expect(reachBand(2_000_000)).toBe("mega");
  });

  it("values mid and small above mega", () => {
    expect(REACH_BAND_VALUE.mid).toBeGreaterThan(REACH_BAND_VALUE.mega);
    expect(REACH_BAND_VALUE.small).toBeGreaterThan(REACH_BAND_VALUE.large);
    expect(REACH_BAND_VALUE.mid).toBeGreaterThan(REACH_BAND_VALUE.micro);
  });

  it("prefers a mid-size author over a mega one, all else equal", () => {
    const mid = rankConversation(base({ authorFollowers: 8_400 }));
    const mega = rankConversation(base({ authorFollowers: 3_000_000 }));
    expect(mid.score).toBeGreaterThan(mega.score);
  });
});

describe("decay curves", () => {
  it("collapses position value steeply", () => {
    expect(depthScore(0)).toBe(100);
    expect(depthScore(5)).toBeGreaterThan(depthScore(20));
    expect(depthScore(20)).toBeGreaterThan(depthScore(45));
    expect(depthScore(CONVERSATION_GATES.maxReplyDepth)).toBe(0);
  });

  it("decays reply recency faster than a day", () => {
    expect(replyRecencyScore(0)).toBe(100);
    expect(replyRecencyScore(45)).toBeCloseTo(50, 0);
    expect(replyRecencyScore(180)).toBeLessThan(15);
  });

  it("weights position and recency above everything else", () => {
    const sorted = Object.entries(CONVERSATION_WEIGHTS).sort((a, b) => b[1] - a[1]);
    expect(sorted[0]![0]).toBe("reply_position");
    expect(sorted[1]![0]).toBe("recency");
  });

  it("sums the conversation weights to 1.0", () => {
    const sum = Object.values(CONVERSATION_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });
});

describe("contribution", () => {
  it("names the fact you would answer with", () => {
    const r = rankConversation(base());
    expect(r.contribution).toMatch(/scopes agent wallet permissions/);
    expect(r.reasons.find((x) => x.component === "contribution")!.explanation)
      .toMatch(/You can answer this from/);
  });

  it("rejects personality with no information — Tako's actual reply", () => {
    // "no octopus yet. we'll have to build our way into the next one"
    const r = rankConversation({
      ...base({
        text: "Base is going to have an amazing year, so much building happening across the ecosystem",
        topics: ["base", "ecosystem", "year"],
      }),
      contributableFacts: ["Tako scopes agent wallet permissions per-session."],
    });
    expect(r.eligible).toBe(false);
  });
});

describe("timeline viability — arithmetic, not judgement", () => {
  it("tells a 9-follower account the truth", () => {
    const v = timelineViability(9);
    expect(v.viable).toBe(false);
    expect(v.message).toMatch(/reaches about 9 accounts/);
    expect(v.message).toMatch(/arithmetic, not a judgement/);
  });

  it("clears an account above the floor", () => {
    expect(timelineViability(TIMELINE_REACH_FLOOR).viable).toBe(true);
  });
});

describe("online learning — moves from the first observation", () => {
  it("shifts scores from a single learned signal, with no training set", () => {
    const cold = rankConversation(base());
    const warm = rankConversation({
      ...base(),
      operatorSignals: [{
        dimension: "reply_context", key: "mid", effect: 0.6, confidence: 0.17, sampleSize: 1,
      }],
    });
    expect(warm.score).toBeGreaterThan(cold.score);
  });

  it("weights a single observation weakly", () => {
    const cold = rankConversation(base());
    const warm = rankConversation({
      ...base(),
      operatorSignals: [{
        dimension: "reply_context", key: "mid", effect: 1, confidence: 0.17, sampleSize: 1,
      }],
    });
    // One result must not swing the policy: bounded by effect x confidence x 10.
    expect(warm.score - cold.score).toBeLessThan(2);
  });

  it("never rescues a gated conversation", () => {
    const r = rankConversation({
      ...base({ replyDepth: 639 }),
      operatorSignals: [{
        dimension: "reply_context", key: "large", effect: 1, confidence: 1, sampleSize: 500,
      }],
    });
    expect(r.score).toBe(0);
    expect(r.eligible).toBe(false);
  });
});
