import { contentHash, canonicalUrl, lexicalSimilarity } from "@inspyr/shared";
import type { RawItem } from "./types";

export interface NormalizedItem extends RawItem {
  normalizedText: string;
  contentHash: string;
}

/**
 * BUILD_SPEC_v0.1 §12 — dedupe on (source_id, external_id) AND content_hash.
 *
 * The hash covers title + body so the same article syndicated to two feeds with
 * different guids still collapses to one item.
 */
export function normalizeItem(item: RawItem): NormalizedItem {
  const normalizedText = item.text.trim();
  return {
    ...item,
    url: item.url ? canonicalUrl(item.url) : null,
    normalizedText,
    contentHash: contentHash(`${item.title}\n${normalizedText}`),
  };
}

/** Removes exact repeats inside a single fetch before anything touches the DB. */
export function dedupeBatch(items: RawItem[]): NormalizedItem[] {
  const seenHash = new Set<string>();
  const seenExternal = new Set<string>();
  const out: NormalizedItem[] = [];

  for (const raw of items) {
    const item = normalizeItem(raw);
    if (seenHash.has(item.contentHash)) continue;
    if (item.externalId && seenExternal.has(item.externalId)) continue;
    seenHash.add(item.contentHash);
    if (item.externalId) seenExternal.add(item.externalId);
    out.push(item);
  }
  return out;
}

export const NEAR_DUPLICATE_THRESHOLD = 0.82;

/**
 * Near-duplicate detection for items that are not byte-identical — the same
 * story reported by two outlets. Lexical for now; swaps to embeddings when an
 * embedding provider is configured (see docs/implementation-status.md).
 */
export function isNearDuplicate(
  candidate: { title: string; normalizedText: string },
  existing: { title: string; normalizedText: string }[],
  threshold = NEAR_DUPLICATE_THRESHOLD,
): boolean {
  const a = `${candidate.title} ${candidate.normalizedText}`;
  return existing.some((e) => lexicalSimilarity(a, `${e.title} ${e.normalizedText}`) >= threshold);
}
