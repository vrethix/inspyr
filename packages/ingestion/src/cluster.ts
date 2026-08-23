import { lexicalSimilarity, createClusterKey } from "./cluster-key";

export interface ClusterableItem {
  id: string;
  title: string;
  normalizedText: string;
  topics: string[];
  observedAt: Date;
}

export interface Cluster {
  key: string;
  title: string;
  itemIds: string[];
  topics: string[];
  newestAt: Date;
}

export const CLUSTER_THRESHOLD = 0.42;

/**
 * BUILD_SPEC_v0.1 §6.3 — the Opportunity Scout groups one or more SourceItems
 * into a candidate story. Greedy single-link clustering: cheap, order-stable,
 * and adequate at the volume one workspace actually produces per day.
 */
export function clusterItems(items: ClusterableItem[], threshold = CLUSTER_THRESHOLD): Cluster[] {
  const ordered = [...items].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  const clusters: { members: ClusterableItem[] }[] = [];

  for (const item of ordered) {
    const text = `${item.title} ${item.topics.join(" ")} ${item.normalizedText.slice(0, 2000)}`;
    let best: { cluster: { members: ClusterableItem[] }; score: number } | null = null;

    for (const cluster of clusters) {
      for (const member of cluster.members) {
        const other = `${member.title} ${member.topics.join(" ")} ${member.normalizedText.slice(0, 2000)}`;
        const score = lexicalSimilarity(text, other);
        if (score >= threshold && (!best || score > best.score)) best = { cluster, score };
      }
    }

    if (best) best.cluster.members.push(item);
    else clusters.push({ members: [item] });
  }

  return clusters.map((c) => {
    const members = c.members;
    const topics = [...new Set(members.flatMap((m) => m.topics))].slice(0, 10);
    return {
      key: createClusterKey(members.map((m) => m.id)),
      // The earliest-observed member titles the story; later ones are coverage of it.
      title: members[members.length - 1]!.title,
      itemIds: members.map((m) => m.id),
      topics,
      newestAt: members.reduce((a, m) => (m.observedAt > a ? m.observedAt : a), members[0]!.observedAt),
    };
  });
}
