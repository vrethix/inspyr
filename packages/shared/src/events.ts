/** BUILD_SPEC_v0.1 §8.1 — the event stream. Every one is a learning event. */
export const FEEDBACK_EVENTS = [
  "opportunity_viewed",
  "opportunity_saved",
  "opportunity_skipped",
  "opportunity_rejected",
  "opportunity_created",
  "draft_generated",
  "draft_regenerated",
  "draft_edited",
  "draft_approved",
  "publication_scheduled",
  "publication_published",
  "publication_failed",
  "comment_received",
  "reply_sent",
  "metric_snapshot_received",
  "goal_conversion_received",
  "memory_corrected",
] as const;

export type FeedbackEventType = (typeof FEEDBACK_EVENTS)[number];

export const OPPORTUNITY_STATUSES = [
  "new", "viewed", "saved", "skipped", "rejected", "created", "already_covered",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const SOURCE_TYPES = ["rss", "url", "note", "github", "youtube"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const MEMORY_TYPES = ["identity", "content", "outcome", "operator"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const PLATFORMS = ["x", "linkedin", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];
