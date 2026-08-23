export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export const COMPONENT_LABELS: Record<string, string> = {
  workspace_relevance: "Workspace relevance",
  audience_fit: "Audience fit",
  freshness: "Freshness",
  novelty: "Novelty",
  source_confidence: "Source confidence",
  historical_topic_fit: "Historical topic fit",
  strategic_priority: "Strategic priority",
  format_potential: "Format potential",
};

export const ADJUSTMENT_LABELS: Record<string, string> = {
  approval_affinity: "You keep acting on this topic",
  skip_affinity: "You keep passing on this topic",
  recently_covered: "Recently covered",
  duplicate_story: "Duplicate story",
  topic_fatigue: "Audience fatigue",
};

/**
 * ARCHITECTURE_v0.2 §16.2 — never render a number the evidence tier does not
 * permit. Below threshold the UI shows ordering and says why, rather than
 * inventing confidence it has not earned.
 */
export function evidenceLabel(tier: string, sampleSize: number): string {
  if (tier === "none" || sampleSize < 4) {
    return "Ranked by ordering only — not enough of your history yet to predict.";
  }
  if (sampleSize < 12) {
    return `Low confidence — based on ${sampleSize} prior signal${sampleSize === 1 ? "" : "s"}.`;
  }
  return `Based on ${sampleSize} prior signals from this workspace.`;
}
