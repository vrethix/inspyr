import { describe, it, expect } from "vitest";
import {
  ACTION_CATALOGUE, expectedReach, missing, READINESS_KEYS, READINESS_LABELS,
  CHANNEL_LABELS, ACTION_CHANNELS, actionValue, unlockValue, UNLOCK_DISCOUNT,
  type Readiness,
} from "@inspyr/shared";

const byKey = (k: string) => ACTION_CATALOGUE.find((a) => a.key === k)!;

describe("action catalogue", () => {
  it("labels every channel", () => {
    for (const c of ACTION_CHANNELS) expect(CHANNEL_LABELS[c]).toBeTruthy();
  });

  it("labels every readiness key in plain language", () => {
    for (const k of READINESS_KEYS) {
      expect(READINESS_LABELS[k]).toBeTruthy();
      // No jargon: the label should read as a sentence a tired person understands.
      expect(READINESS_LABELS[k]).not.toMatch(/_/);
    }
  });

  it("includes channels where follower count is irrelevant", () => {
    const artifactChannels = new Set(
      ACTION_CATALOGUE.filter((a) => a.reachKind === "artifact").map((a) => a.channel),
    );
    expect(artifactChannels.has("github")).toBe(true);
    expect(artifactChannels.has("showhn")).toBe(true);
    expect(artifactChannels.has("discord")).toBe(true);
  });

  it("gives every action a plain description", () => {
    for (const a of ACTION_CATALOGUE) {
      expect(a.what.length).toBeGreaterThan(20);
      expect(a.label.length).toBeGreaterThan(3);
    }
  });
});

describe("expected reach comes from mechanism, not data", () => {
  it("bounds a timeline post by follower count", () => {
    expect(expectedReach(byKey("timeline_post"), 9)).toBe(9);
    expect(expectedReach(byKey("timeline_post"), 5000)).toBe(5000);
  });

  it("ignores follower count for artifact channels", () => {
    const repo = byKey("publish_repo");
    expect(expectedReach(repo, 9)).toBe(expectedReach(repo, 900_000));
  });

  it("ranks publishing the repo above posting about it at 9 followers", () => {
    expect(expectedReach(byKey("publish_repo"), 9))
      .toBeGreaterThan(expectedReach(byKey("timeline_post"), 9));
    expect(expectedReach(byKey("write_story"), 9))
      .toBeGreaterThan(expectedReach(byKey("proof_post"), 9));
  });

  it("stops preferring the repo once the audience is large", () => {
    // The advice must change as the account grows — it is not a permanent rule.
    expect(expectedReach(byKey("timeline_post"), 50_000))
      .toBeGreaterThan(expectedReach(byKey("publish_repo"), 50_000));
  });

  it("puts Show HN above everything else it can reach", () => {
    const reaches = ACTION_CATALOGUE.map((a) => expectedReach(a, 9));
    expect(Math.max(...reaches)).toBe(expectedReach(byKey("show_hn"), 9));
  });
});

describe("readiness gates", () => {
  const nothing: Readiness = {};
  const takoToday: Readiness = { test_evidence: true };
  const shipped: Readiness = { test_evidence: true, public_repo: true, runnable_artifact: true };

  it("blocks Show HN until the code is public and runnable", () => {
    expect(missing(nothing, byKey("show_hn").requires)).toEqual(
      expect.arrayContaining(["public_repo", "runnable_artifact"]),
    );
    expect(missing(shipped, byKey("show_hn").requires)).toEqual([]);
  });

  it("lets Tako publish its repo today — it already has the tests", () => {
    expect(missing(takoToday, byKey("publish_repo").requires)).toEqual([]);
    expect(missing(takoToday, byKey("write_story").requires)).toEqual([]);
  });

  it("never blocks replying or opening an issue", () => {
    expect(byKey("reply_conversation").requires).toEqual([]);
    expect(byKey("open_issue").requires).toEqual([]);
  });

  it("always leaves something available, even with nothing built", () => {
    const available = ACTION_CATALOGUE.filter((a) => missing(nothing, a.requires).length === 0);
    expect(available.length).toBeGreaterThan(0);
    // Refusing without an alternative is the failure mode this prevents.
    expect(available.map((a) => a.key)).toEqual(
      expect.arrayContaining(["open_issue", "reply_conversation"]),
    );
  });
});

describe("unlock value", () => {
  const readiness: Readiness = { test_evidence: true };

  it("counts what an action makes possible, not only what it reaches", () => {
    const repo = ACTION_CATALOGUE.find((a) => a.key === "publish_repo")!;
    expect(unlockValue(repo, readiness, 9)).toBeGreaterThan(expectedReach(repo, 9));
  });

  it("gives nothing for an action that unblocks nothing", () => {
    const reply = ACTION_CATALOGUE.find((a) => a.key === "reply_conversation")!;
    expect(unlockValue(reply, readiness, 9)).toBe(0);
  });

  it("stops counting an unlock once it is already unlocked", () => {
    const repo = ACTION_CATALOGUE.find((a) => a.key === "publish_repo")!;
    const shipped: Readiness = { test_evidence: true, public_repo: true, runnable_artifact: true };
    expect(unlockValue(repo, shipped, 9)).toBe(0);
  });

  it("discounts future reach", () => {
    expect(UNLOCK_DISCOUNT).toBeGreaterThan(0);
    expect(UNLOCK_DISCOUNT).toBeLessThan(1);
  });
});

describe("Tako at 9 followers", () => {
  const readiness: Readiness = { test_evidence: true };
  const audience = 9;

  const available = ACTION_CATALOGUE
    .filter((a) => missing(readiness, a.requires).length === 0)
    .map((a) => ({
      key: a.key,
      reach: expectedReach(a, audience),
      value: actionValue(a, readiness, audience),
      effort: a.effortMinutes,
    }))
    .sort((a, b) => b.value - a.value || a.effort - b.effort);

  it("recommends publishing the repo first, because of what it unblocks", () => {
    expect(available[0]!.key).toBe("publish_repo");
    // It wins on what it makes possible, not on its own reach.
    expect(available[0]!.value).toBeGreaterThan(available[0]!.reach * 3);
  });

  it("prefers a ten-minute reply over a ninety-minute writeup at equal reach", () => {
    const keys = available.map((a) => a.key);
    expect(keys.indexOf("reply_conversation")).toBeLessThan(keys.indexOf("write_story"));
  });

  it("ranks both timeline posts last", () => {
    const keys = available.map((a) => a.key);
    expect(keys.indexOf("timeline_post")).toBeGreaterThan(keys.indexOf("publish_repo"));
    expect(keys.indexOf("proof_post")).toBeGreaterThan(keys.indexOf("open_issue"));
  });

  it("reverses once the account is big — this is not a permanent rule", () => {
    const big = ACTION_CATALOGUE
      .filter((a) => missing(readiness, a.requires).length === 0)
      .map((a) => ({ key: a.key, value: actionValue(a, readiness, 200_000) }))
      .sort((a, b) => b.value - a.value);
    expect(big[0]!.key).toBe("timeline_post");
  });

  it("blocks Show HN and names exactly what unblocks it", () => {
    const blockedBy = missing(readiness, byKey("show_hn").requires)
      .map((k) => READINESS_LABELS[k]);
    expect(blockedBy).toEqual(["Code is public", "Someone else can run it"]);
  });
});
