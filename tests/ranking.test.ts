import { describe, it, expect } from "vitest";
import { rankCandidate, type RankingInput } from "@inspyr/ranking";
import { COMPONENT_WEIGHTS, SCORE_COMPONENTS, weightedBase, ADJUSTMENT_BOUNDS } from "@inspyr/shared";

const NOW = new Date("2026-08-23T12:00:00Z");

const base = (over: Partial<RankingInput> = {}): RankingInput => ({
  now: NOW,
  candidate: {
    clusterKey: "k1",
    title: "Physical prompting for cross-embodiment robot control",
    summary: "A method for instructing robots by demonstration that transfers across robot bodies.",
    topics: ["robotics", "prompting", "transfer"],
    entities: ["Generalist"],
    contentType: "research",
    sourceConfidence: 80,
    sourceItemCount: 2,
    newestAt: new Date("2026-08-23T09:00:00Z"),
    publishedAt: new Date("2026-08-23T08:00:00Z"),
  },
  workspace: {
    id: "ws1", name: "AITorch",
    objective: "Grow subscribers among technical AI builders",
    audience: "AI engineers and technical founders",
    voice: "Explanatory, evidence-driven",
    pillars: ["robotics", "AI infrastructure", "inference engineering"],
    avoid: ["funding news"],
    strategicPriorities: [],
  },
  priorContent: [],
  operatorSignals: [],
  fatigue: [],
  ...over,
});

describe("opportunity ranking (§7)", () => {
  it("weights sum to 1.0", () => {
    const sum = SCORE_COMPONENTS.reduce((s, k) => s + COMPONENT_WEIGHTS[k], 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("persists every component, never just a score", () => {
    const r = rankCandidate(base());
    for (const k of SCORE_COMPONENTS) {
      expect(r.components[k]).toBeGreaterThanOrEqual(0);
      expect(r.components[k]).toBeLessThanOrEqual(100);
    }
    expect(r.reasons).toHaveLength(SCORE_COMPONENTS.length);
    expect(r.reasons.every((x) => x.explanation.length > 0)).toBe(true);
  });

  it("scores a pillar-aligned story above an unrelated one", () => {
    const aligned = rankCandidate(base());
    const unrelated = rankCandidate(base({
      candidate: { ...base().candidate, title: "Celebrity gossip roundup",
        summary: "Who wore what at the awards.", topics: ["celebrity", "fashion"] },
    }));
    expect(aligned.score).toBeGreaterThan(unrelated.score);
  });

  it("penalises topics on the avoid list", () => {
    const normal = rankCandidate(base());
    const avoided = rankCandidate(base({
      candidate: { ...base().candidate, topics: ["funding", "news"],
        title: "Startup raises funding round", summary: "A funding news item." },
    }));
    expect(avoided.components.audience_fit).toBeLessThan(normal.components.audience_fit);
  });

  it("decays freshness with age", () => {
    const fresh = rankCandidate(base());
    const old = rankCandidate(base({
      candidate: { ...base().candidate,
        publishedAt: new Date("2026-08-15T08:00:00Z"),
        newestAt: new Date("2026-08-15T09:00:00Z") },
    }));
    expect(old.components.freshness).toBeLessThan(fresh.components.freshness);
  });

  it("lowers novelty when something close was already published", () => {
    const covered = rankCandidate(base({
      priorContent: [{
        title: "Physical prompting for cross-embodiment robot control",
        topics: ["robotics", "prompting", "transfer"],
        publishedAt: new Date("2026-08-20T08:00:00Z"),
      }],
    }));
    expect(covered.components.novelty).toBeLessThan(50);
    expect(covered.adjustments.recently_covered).toBeLessThan(0);
  });

  it("keeps every adjustment inside its declared bound", () => {
    const extreme = rankCandidate(base({
      operatorSignals: Array.from({ length: 20 }, () => ({
        dimension: "topic", key: "robotics", effect: -1, confidence: 1, sampleSize: 50,
      })),
      fatigue: [{ dimension: "topic", key: "robotics", score: 99, recentCount: 40 }],
      priorContent: [{
        title: "Physical prompting for cross-embodiment robot control",
        topics: ["robotics"], publishedAt: new Date("2026-08-22T08:00:00Z"),
      }],
    }));
    for (const [key, value] of Object.entries(extreme.adjustments)) {
      const bound = ADJUSTMENT_BOUNDS[key as keyof typeof ADJUSTMENT_BOUNDS];
      expect(value).toBeGreaterThanOrEqual(bound.min);
      expect(value).toBeLessThanOrEqual(bound.max);
    }
  });

  it("clamps the final score to 0..100", () => {
    const r = rankCandidate(base({
      fatigue: [{ dimension: "topic", key: "robotics", score: 99, recentCount: 40 }],
    }));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("reports an evidence tier of none when there is no history", () => {
    const r = rankCandidate(base());
    expect(r.evidenceTier).toBe("none");
    expect(r.evidenceSampleSize).toBe(0);
  });

  it("computes the base as the documented weighted sum", () => {
    const r = rankCandidate(base());
    const expected = weightedBase(r.components);
    const adjustmentTotal = Object.values(r.adjustments).reduce((s, v) => s + v, 0);
    expect(r.score).toBeCloseTo(Math.min(100, Math.max(0, expected + adjustmentTotal)), 1);
  });
});

describe("audience fatigue (ARCHITECTURE_v0.2 §3.4)", () => {
  it("suppresses a strong topic that was just published repeatedly", () => {
    const rested = rankCandidate(base());
    const tired = rankCandidate(base({
      fatigue: [{ dimension: "topic", key: "robotics", score: 2.4, recentCount: 5 }],
    }));
    expect(tired.score).toBeLessThan(rested.score);
    expect(tired.adjustments.topic_fatigue).toBeLessThan(0);
    expect(tired.fatigueNotes.join(" ")).toMatch(/robotics/);
  });

  it("says the non-obvious thing: best topic, wrong day", () => {
    const tired = rankCandidate(base({
      fatigue: [{ dimension: "topic", key: "robotics", score: 2.0, recentCount: 4 }],
    }));
    // Relevance stays high — the penalty is about timing, not fit.
    expect(tired.components.workspace_relevance).toBeGreaterThan(50);
    expect(tired.adjustments.topic_fatigue).toBeLessThan(0);
  });

  it("does not penalise an unfatigued topic", () => {
    const r = rankCandidate(base({
      fatigue: [{ dimension: "topic", key: "cooking", score: 3, recentCount: 9 }],
    }));
    expect(r.adjustments.topic_fatigue).toBeUndefined();
  });
});
