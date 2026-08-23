import { describe, it, expect } from "vitest";
import { dedupeBatch, normalizeItem, isNearDuplicate } from "@inspyr/ingestion";
import { contentHash, canonicalUrl } from "@inspyr/shared";

const item = (over: Partial<Parameters<typeof normalizeItem>[0]> = {}) => ({
  externalId: null, url: null, title: "Physical prompting released",
  text: "A new way to instruct robots by demonstration rather than language.",
  publishedAt: null, ...over,
});

describe("source deduplication", () => {
  it("collapses byte-identical items regardless of guid", () => {
    const out = dedupeBatch([
      item({ externalId: "guid-a" }),
      item({ externalId: "guid-b" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("collapses the same article syndicated with tracking params", () => {
    const a = normalizeItem(item({ url: "https://ex.com/post?utm_source=twitter&ref=x" }));
    const b = normalizeItem(item({ url: "https://www.ex.com/post/" }));
    expect(a.url).toBe(b.url);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("keeps genuinely different items", () => {
    const out = dedupeBatch([
      item(),
      item({ title: "Quarterly earnings", text: "Revenue rose across all segments this period." }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("dedupes on external id even when text differs slightly", () => {
    const out = dedupeBatch([
      item({ externalId: "same", text: "Version one of the body text goes here." }),
      item({ externalId: "same", text: "Version two of the body text goes here." }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("hashes stably across whitespace and entity noise", () => {
    expect(contentHash("Hello   world")).toBe(contentHash("Hello world"));
    expect(contentHash("Tom &amp; Jerry")).toBe(contentHash("Tom & Jerry"));
  });

  it("normalizes urls consistently", () => {
    expect(canonicalUrl("https://WWW.Example.com/a/?utm_campaign=x#top"))
      .toBe(canonicalUrl("https://example.com/a"));
  });

  it("detects near-duplicates that are not byte-identical", () => {
    const existing = [{
      title: "Physical prompting released",
      normalizedText: "A new way to instruct robots by demonstration rather than language.",
    }];
    expect(isNearDuplicate({
      title: "Physical prompting released today",
      normalizedText: "A new way to instruct robots by demonstration rather than language.",
    }, existing)).toBe(true);

    expect(isNearDuplicate({
      title: "Quarterly earnings report",
      normalizedText: "Revenue rose across all segments this period.",
    }, existing)).toBe(false);
  });
});
