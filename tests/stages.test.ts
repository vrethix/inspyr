import { describe, it, expect } from "vitest";
import {
  detectStage, stageProgress, stagePolicy, platformKind, describeStage,
  STAGES, STAGE_BANDS, STAGE_LABELS,
} from "@inspyr/shared";

describe("stage detection", () => {
  it("puts accounts in the right band", () => {
    expect(detectStage(0)).toBe("0_1k");
    expect(detectStage(9)).toBe("0_1k");
    expect(detectStage(999)).toBe("0_1k");
    expect(detectStage(1_000)).toBe("1k_10k");
    expect(detectStage(9_999)).toBe("1k_10k");
    expect(detectStage(10_000)).toBe("10k_100k");
    expect(detectStage(250_000)).toBe("100k_1m");
    expect(detectStage(4_000_000)).toBe("1m_plus");
  });

  it("has no gaps or overlaps between bands", () => {
    for (let i = 0; i < STAGES.length - 1; i++) {
      expect(STAGE_BANDS[STAGES[i]!].max).toBe(STAGE_BANDS[STAGES[i + 1]!].min);
    }
  });

  it("reports progress through the band", () => {
    expect(stageProgress(0)).toBe(0);
    expect(stageProgress(500)).toBeCloseTo(0.5, 2);
    expect(stageProgress(5_500)).toBeCloseTo(0.5, 2);
    expect(stageProgress(2_000_000)).toBe(1);
  });

  it("handles a negative or nonsense count", () => {
    expect(detectStage(-5)).toBe("0_1k");
    expect(stageProgress(-5)).toBe(0);
  });
});

describe("platform kind — the property that decides everything", () => {
  it("marks platforms that reach strangers at zero followers", () => {
    expect(platformKind("youtube")).toBe("algorithmic");
    expect(platformKind("tiktok")).toBe("algorithmic");
    expect(platformKind("instagram")).toBe("algorithmic");
  });

  it("marks platforms where reach is bounded by your following", () => {
    expect(platformKind("x")).toBe("follower_gated");
    expect(platformKind("linkedin")).toBe("follower_gated");
  });

  it("assumes follower-gated for anything unknown", () => {
    // Safer default: it stops Inspyr promising reach it cannot deliver.
    expect(platformKind("some-new-app")).toBe("follower_gated");
  });
});

describe("0 to 1k — the same stage, opposite advice", () => {
  const tiktok = stagePolicy("0_1k", "tiktok");
  const linkedin = stagePolicy("0_1k", "linkedin");

  it("lets you post on an algorithmic platform at zero", () => {
    expect(tiktok.timelineViable).toBe(true);
    expect(tiktok.borrowedReachFirst).toBe(false);
    expect(tiktok.levers.join(" ")).toMatch(/[Vv]olume/);
  });

  it("does not on a follower-gated one", () => {
    expect(linkedin.timelineViable).toBe(false);
    expect(linkedin.borrowedReachFirst).toBe(true);
    expect(linkedin.levers.join(" ")).toMatch(/[Rr]eplies|comments/);
    expect(linkedin.antiPatterns.join(" ")).toMatch(/own timeline/);
  });

  it("asks for very different cadence on each", () => {
    // 25 replies a week is not the same instruction as 7 posts a week.
    expect(linkedin.cadence.target).toBeGreaterThan(tiktok.cadence.target);
    expect(linkedin.cadence.note).toMatch(/[Rr]eplies/);
  });

  it("knows there is no useful history yet on either", () => {
    expect(tiktok.ownDataUseful).toBe(false);
    expect(linkedin.ownDataUseful).toBe(false);
  });

  it("warns against the thing the platforms now penalise", () => {
    expect(tiktok.antiPatterns.join(" ")).toMatch(/verbatim|duplicate/i);
  });
});

describe("the advice changes as the account grows", () => {
  const platform = "youtube";
  const early = stagePolicy("0_1k", platform);
  const mid = stagePolicy("1k_10k", platform);
  const plateau = stagePolicy("10k_100k", platform);
  const large = stagePolicy("100k_1m", platform);

  it("only starts using your own data once there is some", () => {
    expect(early.ownDataUseful).toBe(false);
    expect(mid.ownDataUseful).toBe(true);
  });

  it("stops asking for more volume once volume is not the constraint", () => {
    expect(early.cadence.target).toBeGreaterThan(plateau.cadence.target);
    expect(plateau.antiPatterns.join(" ")).toMatch(/[Mm]ore volume/);
  });

  it("moves the bottleneck from being unknown to being plateaued to capacity", () => {
    expect(early.bottleneck).toMatch(/[Nn]obody knows you exist/);
    expect(mid.bottleneck).toMatch(/can't tell which/);
    expect(plateau.bottleneck).toMatch(/new people/);
    expect(large.bottleneck).toMatch(/[Pp]roduction capacity/);
  });

  it("changes what it measures at every stage", () => {
    const metrics = [early, mid, plateau, large].map((p) => p.primaryMetric);
    expect(new Set(metrics).size).toBe(4);
  });

  it("never measures follower count directly", () => {
    // Followers are the scoreboard, not the feedback — too slow and too noisy.
    for (const stage of STAGES) {
      const p = stagePolicy(stage, "youtube");
      expect(p.primaryMetric.toLowerCase()).not.toMatch(/^follower count$/);
    }
  });

  it("gives every stage a bottleneck, levers and anti-patterns", () => {
    for (const stage of STAGES) {
      for (const platform of ["youtube", "x"]) {
        const p = stagePolicy(stage, platform);
        expect(p.bottleneck.length).toBeGreaterThan(20);
        expect(p.levers.length).toBeGreaterThan(0);
        expect(p.antiPatterns.length).toBeGreaterThan(0);
        expect(p.cadence.target).toBeGreaterThan(0);
      }
    }
  });
});

describe("describing it to a person", () => {
  it("says where you are and what is stopping you", () => {
    const text = describeStage(stagePolicy("0_1k", "x"), 9);
    expect(text).toContain("9 on x");
    expect(text).toContain(STAGE_LABELS["0_1k"]);
    expect(text).toMatch(/already follow you/);
  });
});
