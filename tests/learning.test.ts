import { describe, it, expect } from "vitest";
import { deriveOperatorSignals, describeSignal, LEARNING_CONFIG } from "@inspyr/ranking";
import { rankCandidate, type RankingInput } from "@inspyr/ranking";

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5);

describe("operator learning (§8)", () => {
  it("does not claim a preference from a single skip", () => {
    const [signal] = deriveOperatorSignals([
      { eventType: "opportunity_skipped", keys: ["funding"], createdAt: at(1) },
    ]);
    expect(signal!.sampleSize).toBe(1);
    expect(signal!.active).toBe(false);
  });

  it("activates once repeated behaviour clears the sample threshold", () => {
    const events = Array.from({ length: LEARNING_CONFIG.minSampleSize }, (_, i) => ({
      eventType: "opportunity_skipped" as const, keys: ["funding"], createdAt: at(5 - i),
    }));
    const [signal] = deriveOperatorSignals(events);
    expect(signal!.active).toBe(true);
    expect(signal!.effect).toBeLessThan(0);
    expect(signal!.source).toBe("repeated_skips");
  });

  it("shrinks the effect toward zero while evidence is thin", () => {
    const few = deriveOperatorSignals(Array.from({ length: 2 }, (_, i) => ({
      eventType: "opportunity_rejected" as const, keys: ["funding"], createdAt: at(3 - i),
    })))[0]!;
    const many = deriveOperatorSignals(Array.from({ length: 20 }, (_, i) => ({
      eventType: "opportunity_rejected" as const, keys: ["funding"], createdAt: at(30 - i),
    })))[0]!;
    expect(Math.abs(many.effect)).toBeGreaterThan(Math.abs(few.effect));
    expect(many.confidence).toBeGreaterThan(few.confidence);
  });

  it("separates approval from rejection", () => {
    const signals = deriveOperatorSignals([
      { eventType: "opportunity_created", keys: ["robotics"], createdAt: at(4) },
      { eventType: "opportunity_saved", keys: ["robotics"], createdAt: at(3) },
      { eventType: "opportunity_rejected", keys: ["funding"], createdAt: at(2) },
      { eventType: "opportunity_rejected", keys: ["funding"], createdAt: at(1) },
    ]);
    const robotics = signals.find((s) => s.key === "robotics")!;
    const funding = signals.find((s) => s.key === "funding")!;
    expect(robotics.effect).toBeGreaterThan(0);
    expect(funding.effect).toBeLessThan(0);
    expect(robotics.source).toBe("repeated_approvals");
  });

  it("does not let views alone create a signal", () => {
    // Viewing is ambient, not a decision: it produces no signal whatsoever,
    // rather than an inactive one that could later be mistaken for evidence.
    const signals = deriveOperatorSignals([
      { eventType: "opportunity_viewed", keys: ["robotics"], createdAt: at(2) },
      { eventType: "opportunity_viewed", keys: ["robotics"], createdAt: at(1) },
    ]);
    expect(signals).toHaveLength(0);
  });

  it("describes a signal without inventing a metric", () => {
    const [signal] = deriveOperatorSignals(Array.from({ length: 6 }, (_, i) => ({
      eventType: "opportunity_rejected" as const, keys: ["funding news"], createdAt: at(10 - i),
    })));
    const text = describeSignal(signal!);
    expect(text).toContain("funding news");
    expect(text).not.toMatch(/\d+(\.\d+)?\s*(%|x|×)/);
  });
});

describe("acceptance #12 — yesterday's decision changes today's ranking", () => {
  const candidate = (topics: string[]) => ({
    clusterKey: "k", title: "A funding round was announced today",
    summary: "A company raised money from investors.",
    topics, entities: [], contentType: "news", sourceConfidence: 70,
    sourceItemCount: 1, newestAt: new Date(), publishedAt: new Date(),
  });

  const input = (signals: RankingInput["operatorSignals"]): RankingInput => ({
    now: new Date(),
    candidate: candidate(["funding", "news"]),
    workspace: {
      id: "ws", name: "Personal", objective: "reputation",
      audience: "founders and builders", voice: "direct",
      pillars: ["AI infrastructure", "robotics"], avoid: [], strategicPriorities: [],
    },
    priorContent: [], operatorSignals: signals, fatigue: [],
  });

  it("down-ranks a topic the operator repeatedly passed on", () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      eventType: "opportunity_rejected" as const, keys: ["funding"], createdAt: at(6 - i),
    }));
    const learned = deriveOperatorSignals(events).filter((s) => s.active);
    expect(learned.length).toBeGreaterThan(0);

    const before = rankCandidate(input([]));
    const after = rankCandidate(input(learned.map((s) => ({
      dimension: s.dimension, key: s.key, effect: s.effect,
      confidence: s.confidence, sampleSize: s.sampleSize,
    }))));

    expect(after.score).toBeLessThan(before.score);
    expect(after.adjustments.skip_affinity).toBeLessThan(0);
    expect(after.components.historical_topic_fit).toBeLessThan(before.components.historical_topic_fit);
  });
});
