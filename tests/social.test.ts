import { describe, it, expect } from "vitest";
import { ZernioProvider, __mapMetricsForTests as mapMetrics, SocialUnavailableError } from "@inspyr/social";
import { computeBaseline, computeLifts, toRates } from "@inspyr/shared";

describe("Zernio metric mapping", () => {
  it("maps their vocabulary onto ours", () => {
    const { metrics } = mapMetrics({
      likes: 40, comments: 7, shares: 3, saves: 12,
      impressions: 5_000, clicks: 22,
    });
    expect(metrics.engagements).toBe(40);
    expect(metrics.replies).toBe(7);
    expect(metrics.shares).toBe(3);
    expect(metrics.saves).toBe(12);
    expect(metrics.impressions).toBe(5_000);
    expect(metrics.clicks).toBe(22);
  });

  it("falls back through impressions → reach → views", () => {
    expect(mapMetrics({ reach: 900 }).metrics.impressions).toBe(900);
    expect(mapMetrics({ views: 400 }).metrics.impressions).toBe(400);
    // Impressions wins when several are present.
    expect(mapMetrics({ impressions: 1, reach: 2, views: 3 }).metrics.impressions).toBe(1);
  });

  it("reports what it cannot give us", () => {
    const { unavailable } = mapMetrics({ likes: 10, impressions: 100 });
    // follows and profile_visits are the two that matter most for growth, and
    // the provider does not carry them. Saying so beats showing a silent zero.
    expect(unavailable).toEqual(expect.arrayContaining(["follows", "profile_visits"]));
  });

  it("ignores nonsense values rather than storing them", () => {
    const { metrics } = mapMetrics({ likes: Number.NaN, impressions: Infinity, saves: 5 });
    expect(metrics.engagements).toBeUndefined();
    expect(metrics.impressions).toBeUndefined();
    expect(metrics.saves).toBe(5);
  });

  it("produces metrics the outcome layer can normalise", () => {
    const history = [
      mapMetrics({ impressions: 1000, likes: 20, saves: 5 }).metrics,
      mapMetrics({ impressions: 2000, likes: 30, saves: 8 }).metrics,
      mapMetrics({ impressions: 1500, likes: 25, saves: 6 }).metrics,
      mapMetrics({ impressions: 1200, likes: 22, saves: 5 }).metrics,
    ];
    const baseline = computeBaseline(history);
    const good = mapMetrics({ impressions: 1000, likes: 60, saves: 20 }).metrics;
    const lifts = computeLifts(good, baseline);
    expect(lifts).not.toBeNull();
    expect(lifts!.saves).toBeGreaterThan(2);
  });

  it("normalises by reach, so raw counts don't mislead", () => {
    const wide = toRates(mapMetrics({ impressions: 10_000, saves: 50 }).metrics);
    const narrow = toRates(mapMetrics({ impressions: 500, saves: 20 }).metrics);
    // 50 saves on 10k is worse than 20 on 500. Counts alone say the opposite.
    expect(narrow.saves!).toBeGreaterThan(wide.saves!);
  });
});

describe("provider without a key", () => {
  const provider = new ZernioProvider(undefined, undefined);

  it("reports itself unavailable rather than failing later", () => {
    expect(provider.available).toBe(false);
  });

  it("explains what to do, and that manual entry still works", async () => {
    await expect(provider.listAccounts()).rejects.toThrow(SocialUnavailableError);
    await expect(provider.listAccounts()).rejects.toThrow(/free at zernio\.com/);
  });

  it("is available once a key exists", () => {
    expect(new ZernioProvider("test-key").available).toBe(true);
  });
});
