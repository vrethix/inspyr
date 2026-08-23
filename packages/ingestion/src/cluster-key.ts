import { createHash } from "node:crypto";
export { lexicalSimilarity } from "@inspyr/shared";

/**
 * Stable identity for a cluster across re-runs, so re-scouting updates the same
 * opportunity rather than creating a duplicate every cycle.
 */
export function createClusterKey(itemIds: string[]): string {
  const sorted = [...itemIds].sort();
  return createHash("sha1").update(sorted.join("|")).digest("hex").slice(0, 24);
}
