import { describe, it, expect } from "vitest";
import {
  UnderstandingSchema, OpportunitySynthesisSchema,
  findFabricatedMetrics, assertNoFabricatedMetrics,
} from "@inspyr/shared";
import { heuristicUnderstanding, heuristicSynthesis } from "@inspyr/ai";

/**
 * ARCHITECTURE_v0.2 §19.23 — "No LLM output anywhere in the product contains a
 * fabricated metric" is written as a test, not a hope.
 */
describe("fabricated metric guard", () => {
  it("catches invented engagement numbers", () => {
    expect(findFabricatedMetrics("This will get 83,000 impressions").length).toBeGreaterThan(0);
    expect(findFabricatedMetrics("Expect 1.8x more saves").length).toBeGreaterThan(0);
    expect(findFabricatedMetrics("42% follow conversion").length).toBeGreaterThan(0);
    expect(findFabricatedMetrics("confidence: 78").length).toBeGreaterThan(0);
  });

  it("leaves ordinary prose alone", () => {
    expect(findFabricatedMetrics("Explain why cross-embodiment transfer matters.")).toEqual([]);
    expect(findFabricatedMetrics("A 7-slide carousel for technical builders.")).toEqual([]);
  });

  it("throws when a model writes a metric into synthesis", () => {
    expect(() => assertNoFabricatedMetrics(
      { why_it_matters: "This should drive 2.4x more saves than usual." }, "synthesis",
    )).toThrow(/fabricated metrics/);
  });

  it("exempts numbers quoted verbatim from a source", () => {
    const value = {
      summary: "A neutral summary.",
      claims: [{ text: "The paper reports a 42% improvement in success rate.", supported: true }],
    };
    expect(() => assertNoFabricatedMetrics(value, "understanding", { skipKeys: ["claims"] })).not.toThrow();
    // ...but the same number in model-written prose is still a failure.
    expect(() => assertNoFabricatedMetrics(value, "understanding")).toThrow();
  });
});

describe("heuristic path stays inside the contracts", () => {
  const source = {
    title: "Generalist releases physical prompting",
    text: "Generalist has released a method called physical prompting. It lets operators instruct "
      + "robots by demonstration rather than by writing language instructions. The approach transfers "
      + "across different robot bodies, which the team calls cross-embodiment transfer. Early results "
      + "show the policy generalises to unseen manipulators.",
    url: "https://example.com/physical-prompting",
    publishedAt: new Date("2026-08-23T08:00:00Z"),
  };

  it("produces schema-valid understanding with no API key", () => {
    const parsed = UnderstandingSchema.safeParse(heuristicUnderstanding(source));
    expect(parsed.success).toBe(true);
  });

  it("extracts topics and entities from real text", () => {
    const u = heuristicUnderstanding(source);
    expect(u.topics.length).toBeGreaterThan(0);
    expect(u.entities).toContain("Generalist");
    expect(u.content_type).toBe("announcement");
  });

  it("produces schema-valid synthesis with distinct angles", () => {
    const s = heuristicSynthesis({
      title: source.title, summary: "A method for instructing robots by demonstration.",
      topics: ["robotics", "prompting"], contentType: "announcement",
      audience: "AI engineers", pillars: ["robotics"], sourceCount: 2,
    });
    expect(OpportunitySynthesisSchema.safeParse(s).success).toBe(true);
    expect(new Set(s.angles.map((a) => a.kind)).size).toBe(s.angles.length);
  });

  it("never emits a metric from the heuristic path either", () => {
    const s = heuristicSynthesis({
      title: source.title, summary: source.text, topics: ["robotics"],
      contentType: "announcement", audience: "AI engineers", pillars: ["robotics"], sourceCount: 3,
    });
    expect(() => assertNoFabricatedMetrics(s, "heuristic-synthesis")).not.toThrow();
  });
});
