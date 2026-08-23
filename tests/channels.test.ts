import { describe, it, expect } from "vitest";
import {
  DEFAULT_CHANNEL_POLICIES, PLATFORMS, DRAFT_SCHEMAS, constraintViolations,
  draftText, draftSurface, assertNoFabricatedMetrics,
  type Platform, type XDraft, type InstagramDraft, type YouTubeDraft,
} from "@inspyr/shared";
import {
  heuristicDraft, generateCandidateSpecs, computeChecks, describeChecks,
} from "@inspyr/channels";
import { changeRatio } from "@inspyr/pipeline";

const input = {
  title: "Generalist releases physical prompting for robots",
  whyItMatters: "A way to instruct robots by demonstration rather than by writing language instructions.",
  angle: "explain",
  angleThesis: "Demonstration replaces language as the interface to a robot policy.",
  audience: "AI engineers",
  sources: [{ title: "Physical prompting", url: "https://example.com/pp", summary: "Method summary." }],
};

describe("channel policies (ARCHITECTURE_v0.2 §6)", () => {
  it("gives every channel a distinct reward function", () => {
    const serialized = PLATFORMS.map((p) => JSON.stringify(DEFAULT_CHANNEL_POLICIES[p].rewardWeights));
    expect(new Set(serialized).size).toBe(PLATFORMS.length);
  });

  it("weights each channel's rewards to 1.0", () => {
    for (const p of PLATFORMS) {
      const sum = Object.values(DEFAULT_CHANNEL_POLICIES[p].rewardWeights)
        .reduce((s, v) => s + (v ?? 0), 0);
      expect(sum).toBeCloseTo(1.0, 6);
    }
  });

  it("optimises YouTube for watch and CTR, X for follows and saves", () => {
    expect(DEFAULT_CHANNEL_POLICIES.youtube.rewardWeights.watch_lift).toBeGreaterThan(0);
    expect(DEFAULT_CHANNEL_POLICIES.youtube.rewardWeights.ctr_lift).toBeGreaterThan(0);
    expect(DEFAULT_CHANNEL_POLICIES.x.rewardWeights.follow_lift).toBeGreaterThan(0);
    expect(DEFAULT_CHANNEL_POLICIES.x.rewardWeights.watch_lift).toBeUndefined();
  });

  it("includes no_action in every action space", () => {
    for (const p of PLATFORMS) {
      expect(DEFAULT_CHANNEL_POLICIES[p].actionSpace).toContain("no_action");
    }
  });
});

describe("constraint checking", () => {
  it("flags an over-length X post", () => {
    const problems = constraintViolations("x", { items: ["a".repeat(281)] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/281 characters/);
  });

  it("passes a compliant X post", () => {
    expect(constraintViolations("x", { items: ["a".repeat(280)] })).toHaveLength(0);
  });

  it("flags a carousel with too few slides", () => {
    const problems = constraintViolations("instagram", { items: ["a", "b"] });
    expect(problems.join(" ")).toMatch(/at least 5/);
  });

  it("flags an over-length YouTube title", () => {
    expect(constraintViolations("youtube", { title: "x".repeat(71) })).toHaveLength(1);
  });
});

describe("heuristic drafts", () => {
  it("produces a schema-valid draft for every channel", () => {
    for (const p of PLATFORMS) {
      const draft = heuristicDraft(p, input);
      const parsed = DRAFT_SCHEMAS[p].safeParse(draft);
      expect(parsed.success, `${p}: ${JSON.stringify(parsed.error?.issues?.slice(0, 2))}`).toBe(true);
    }
  });

  it("respects each channel's own constraints", () => {
    for (const p of PLATFORMS) {
      const draft = heuristicDraft(p, input);
      const problems = constraintViolations(p, draftSurface(p, draft));
      expect(problems, `${p}: ${problems.join("; ")}`).toHaveLength(0);
    }
  });

  it("never emits a fabricated metric", () => {
    for (const p of PLATFORMS) {
      expect(() => assertNoFabricatedMetrics(heuristicDraft(p, input), `heuristic:${p}`)).not.toThrow();
    }
  });

  it("does not produce the same artefact for two channels", () => {
    const x = draftText("x", heuristicDraft("x", input));
    const ig = draftText("instagram", heuristicDraft("instagram", input));
    const yt = draftText("youtube", heuristicDraft("youtube", input));
    expect(x).not.toBe(ig);
    expect(ig).not.toBe(yt);
    // Instagram is slide-structured; X is a sequence of posts.
    expect((heuristicDraft("instagram", input) as InstagramDraft).slides.length).toBeGreaterThan(4);
    expect((heuristicDraft("x", input) as XDraft).posts.length).toBeGreaterThan(1);
    expect((heuristicDraft("youtube", input) as YouTubeDraft).sections.length).toBeGreaterThan(1);
  });
});

describe("action spec generation (§4)", () => {
  const angles = [
    { kind: "explain", thesis: "How it works." },
    { kind: "contrarian", thesis: "What nobody is saying." },
  ];

  it("enumerates one spec per channel per angle", () => {
    const specs = generateCandidateSpecs({
      channels: [...PLATFORMS], angles, topics: ["robotics"], contentType: "announcement",
    });
    expect(specs).toHaveLength(PLATFORMS.length * angles.length);
  });

  it("chooses channel-appropriate action types", () => {
    const specs = generateCandidateSpecs({
      channels: [...PLATFORMS], angles, topics: ["robotics"], contentType: "announcement",
    });
    expect(specs.find((s) => s.channel === "x" && s.angle === "explain")!.actionType).toBe("thread");
    expect(specs.find((s) => s.channel === "instagram")!.actionType).toBe("carousel");
    expect(specs.find((s) => s.channel === "youtube")!.actionType).toBe("explainer_video");
  });

  it("never proposes no_action as a candidate to write", () => {
    const specs = generateCandidateSpecs({
      channels: [...PLATFORMS], angles, topics: ["robotics"], contentType: "announcement",
    });
    expect(specs.every((s) => s.actionType !== "no_action")).toBe(true);
  });

  it("carries a feature vector for the simulator to score later", () => {
    const [spec] = generateCandidateSpecs({
      channels: ["x"], angles, topics: ["robotics"], contentType: "research",
    });
    expect(spec!.featureVector).toMatchObject({
      channel: "x", angle: "explain", content_type: "research",
    });
  });

  it("gives each channel its own objective", () => {
    const specs = generateCandidateSpecs({
      channels: [...PLATFORMS], angles: [angles[0]!], topics: [], contentType: "other",
    });
    expect(new Set(specs.map((s) => s.objective)).size).toBe(PLATFORMS.length);
  });
});

describe("computed checks (§6.7 deterministic half)", () => {
  const base = (channel: Platform, content: ReturnType<typeof heuristicDraft>) => ({
    channel,
    policy: DEFAULT_CHANNEL_POLICIES[channel],
    content,
    workspace: { audience: "AI engineers", voice: "direct" },
    sources: [],
    priorContent: [] as { title: string; topics: string[] }[],
  });

  it("reports no repetition against an empty history", () => {
    const checks = computeChecks(base("x", heuristicDraft("x", input)), null);
    expect(checks.repetitionRisk).toBe(0);
    expect(checks.closestPriorTitle).toBeNull();
  });

  it("detects repetition against published content", () => {
    const draft = heuristicDraft("x", input);
    const checks = computeChecks({
      ...base("x", draft),
      priorContent: [{
        title: "Demonstration replaces language as the interface to a robot policy",
        topics: ["robotics", "prompting", "demonstration"],
      }],
    }, null);
    expect(checks.repetitionRisk).toBeGreaterThan(0.2);
    expect(checks.closestPriorTitle).toContain("Demonstration");
  });

  it("computes grounding coverage from the reviewer's claims, not from a model number", () => {
    const checks = computeChecks(base("x", heuristicDraft("x", input)), {
      voice: { verdict: "match", note: "" },
      clarity: { verdict: "clear", note: "" },
      hook: { verdict: "strong", note: "" },
      structure: { verdict: "native", note: "" },
      claims: [
        { text: "a", status: "supported", note: "" },
        { text: "b", status: "supported", note: "" },
        { text: "c", status: "unsupported", note: "" },
        { text: "d", status: "supported", note: "" },
      ],
      one_improvement: "Tighten the first line.",
    });
    expect(checks.groundingCoverage).toBeCloseTo(0.75, 3);
  });

  it("describes ungrounded claims in plain language", () => {
    const notes = describeChecks({
      constraintViolations: [], repetitionRisk: 0,
      closestPriorTitle: null, groundingCoverage: 0.5,
    });
    expect(notes.join(" ")).toMatch(/50% of claims are traceable/);
  });
});

describe("edit measurement", () => {
  it("reports zero for an unchanged draft", () => {
    expect(changeRatio("hello world", "hello world")).toBe(0);
  });

  it("reports a small ratio for a small edit", () => {
    const r = changeRatio("The quick brown fox jumps over the lazy dog", "The quick brown cat jumps over the lazy dog");
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.2);
  });

  it("reports a large ratio for a rewrite", () => {
    expect(changeRatio("aaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbb")).toBe(1);
  });

  it("handles an empty starting point", () => {
    expect(changeRatio("", "something new")).toBe(1);
    expect(changeRatio("", "")).toBe(0);
  });
});
