import {
  pgTable, text, timestamp, integer, real, boolean, jsonb, uuid,
  index, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";

/**
 * BUILD_SPEC_v0.1 §12 core data model, plus the ARCHITECTURE_v0.2 additions
 * needed for Milestone 1 (audience_state, agent_runs, agent_steps).
 *
 * Every workspace-owned table carries workspace_id and is queried through the
 * tenant-scoped helpers in ./tenant.ts — §28.13.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  /** Free text: what growth means for this identity. */
  objective: text("objective").notNull().default(""),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("workspaces_owner_slug_idx").on(t.ownerId, t.slug)]);

/**
 * §5.7 memory classes. `source` distinguishes what the user TOLD Inspyr from
 * what Inspyr LEARNED — the UI must never blur the two.
 */
export const workspaceMemory = pgTable("workspace_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  memoryType: text("memory_type").notNull(),          // identity | content | outcome | operator
  key: text("key").notNull(),
  valueJson: jsonb("value_json").notNull(),
  source: text("source").notNull().default("user"),   // user | learned
  confidence: real("confidence").notNull().default(1),
  lockedByUser: boolean("locked_by_user").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("workspace_memory_key_idx").on(t.workspaceId, t.memoryType, t.key),
  index("workspace_memory_ws_idx").on(t.workspaceId),
]);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type").notNull(),                        // rss | url | note | github | youtube
  label: text("label").notNull().default(""),
  configJson: jsonb("config_json").notNull(),
  status: text("status").notNull().default("active"),  // active | disabled | error
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  syncCursor: text("sync_cursor"),
  itemsIngested: integer("items_ingested").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sources_ws_idx").on(t.workspaceId)]);

export const sourceItems = pgTable("source_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  canonicalUrl: text("canonical_url"),
  title: text("title").notNull().default(""),
  rawText: text("raw_text").notNull().default(""),
  normalizedText: text("normalized_text").notNull().default(""),
  summary: text("summary"),
  topicsJson: jsonb("topics_json").$type<string[]>().notNull().default([]),
  entitiesJson: jsonb("entities_json").$type<string[]>().notNull().default([]),
  claimsJson: jsonb("claims_json").$type<{ text: string; supported: boolean }[]>().notNull().default([]),
  contentType: text("content_type"),
  sourceConfidence: real("source_confidence"),
  understoodAt: timestamp("understood_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  // NOTE: no embedding column yet. Milestone 1 dedupe and clustering use
  // lexical cosine (packages/shared/src/text.ts). pgvector + a real embedding
  // provider land in Milestone 2 — see docs/implementation-status.md.
  contentHash: text("content_hash").notNull(),
}, (t) => [
  // §12: unique on (source_id, external_id) where possible, plus content_hash dedupe.
  uniqueIndex("source_items_source_external_idx").on(t.sourceId, t.externalId),
  uniqueIndex("source_items_ws_hash_idx").on(t.workspaceId, t.contentHash),
  index("source_items_ws_observed_idx").on(t.workspaceId, t.observedAt),
]);

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  clusterKey: text("cluster_key").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  whyItMatters: text("why_it_matters").notNull().default(""),
  whyItFits: text("why_it_fits").notNull().default(""),
  whyNow: text("why_now").notNull().default(""),
  status: text("status").notNull().default("new"),
  score: real("score").notNull().default(0),
  /** §7: never store only score=94. Components and adjustments are the reasoning. */
  scoreComponentsJson: jsonb("score_components_json").$type<Record<string, number>>().notNull().default({}),
  adjustmentsJson: jsonb("adjustments_json").$type<Record<string, number>>().notNull().default({}),
  fatigueJson: jsonb("fatigue_json").$type<Record<string, unknown>>().notNull().default({}),
  recommendedAngle: text("recommended_angle"),
  anglesJson: jsonb("angles_json").$type<unknown[]>().notNull().default([]),
  recommendedOutputsJson: jsonb("recommended_outputs_json").$type<unknown[]>().notNull().default([]),
  /** Evidence tier + sample size behind any surfaced number. ARCHITECTURE_v0.2 §1.2 */
  evidenceTier: text("evidence_tier").notNull().default("none"),
  evidenceSampleSize: integer("evidence_sample_size").notNull().default(0),
  understandingSource: text("understanding_source").notNull().default("heuristic"), // heuristic | model
  /** Cleared the relevance floor — proposed in Today rather than merely ranked. */
  qualifies: boolean("qualifies").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("opportunities_ws_cluster_idx").on(t.workspaceId, t.clusterKey),
  index("opportunities_ws_score_idx").on(t.workspaceId, t.score),
  index("opportunities_ws_status_idx").on(t.workspaceId, t.status),
]);

export const opportunitySources = pgTable("opportunity_sources", {
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  sourceItemId: uuid("source_item_id").notNull().references(() => sourceItems.id, { onDelete: "cascade" }),
  relevance: real("relevance").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.opportunityId, t.sourceItemId] })]);

export const feedbackEvents = pgTable("feedback_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  actor: text("actor").notNull().default("user"),      // user | system
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  causalParentId: uuid("causal_parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("feedback_events_ws_idx").on(t.workspaceId, t.createdAt),
  index("feedback_events_entity_idx").on(t.entityType, t.entityId),
]);

/**
 * §8.4. In Milestone 1 these come from operator behaviour (skips/rejects), not
 * outcomes — ARCHITECTURE_v0.2 §9: operator learning is the week-3 story,
 * outcome learning is the week-8 one.
 */
export const strategySignals = pgTable("strategy_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),             // topic | operator_preference | format | hook
  key: text("key").notNull(),
  channel: text("channel"),
  contextJson: jsonb("context_json").$type<Record<string, unknown>>().notNull().default({}),
  effect: real("effect").notNull(),                   // -1..1
  confidence: real("confidence").notNull(),           // 0..1
  sampleSize: integer("sample_size").notNull().default(0),
  source: text("source").notNull(),                   // repeated_skips | repeated_approvals | outcome
  evidenceStart: timestamp("evidence_start", { withTimezone: true }),
  evidenceEnd: timestamp("evidence_end", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("strategy_signals_key_idx").on(t.workspaceId, t.dimension, t.key, t.channel),
  index("strategy_signals_ws_idx").on(t.workspaceId),
]);

/** ARCHITECTURE_v0.2 §3.4 / §13 — audience_state. Works at n=0. */
export const audienceState = pgTable("audience_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),             // topic | format | hook | cta
  key: text("key").notNull(),
  fatigueScore: real("fatigue_score").notNull().default(0),
  recentCount: integer("recent_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("audience_state_key_idx").on(t.workspaceId, t.dimension, t.key),
  index("audience_state_ws_idx").on(t.workspaceId),
]);

/**
 * ARCHITECTURE_v0.2 §17.28 — every agent step is persisted. This is the
 * observability story, the "why did you say this?" UI, and the eval substrate.
 */
export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),                 // daily_plan | manual | source_sync
  goal: text("goal").notNull().default(""),
  state: text("state").notNull().default("running"),  // running | succeeded | failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  tokenCost: integer("token_cost").notNull().default(0),
  errorJson: jsonb("error_json").$type<Record<string, unknown> | null>(),
}, (t) => [index("agent_runs_ws_idx").on(t.workspaceId, t.startedAt)]);

export const agentSteps = pgTable("agent_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  agentRole: text("agent_role").notNull(),
  toolName: text("tool_name").notNull(),
  inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull().default({}),
  outputJson: jsonb("output_json").$type<Record<string, unknown>>().notNull().default({}),
  model: text("model"),
  promptVersion: text("prompt_version"),
  latencyMs: integer("latency_ms").notNull().default(0),
  tokenCost: integer("token_cost").notNull().default(0),
  status: text("status").notNull().default("ok"),     // ok | error
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("agent_steps_run_idx").on(t.agentRunId, t.seq)]);

/**
 * Content this workspace has already put out.
 *
 * BUILD_SPEC_v0.1 §5.7-B (content memory) and §22 ("import last 30-90 days of
 * content"). Without it, novelty and fatigue have no baseline on day one — the
 * two components that make Inspyr's first recommendations non-obvious. Filled
 * by import now; by the publishing loop in Milestone 2.
 */
export const priorContent = pgTable("prior_content", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  platform: text("platform"),
  externalUrl: text("external_url"),
  title: text("title").notNull(),
  text: text("text").notNull().default(""),
  topicsJson: jsonb("topics_json").$type<string[]>().notNull().default([]),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  origin: text("origin").notNull().default("imported"),   // imported | published | opportunity
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("prior_content_ws_hash_idx").on(t.workspaceId, t.contentHash),
  index("prior_content_ws_published_idx").on(t.workspaceId, t.publishedAt),
]);

/**
 * ARCHITECTURE_v0.2 §6 — one Channel Agent runtime, many policies.
 *
 * Seeded from DEFAULT_CHANNEL_POLICIES per workspace so the operator can tune
 * craft and reward weights per identity without touching code.
 */
export const channelPolicies = pgTable("channel_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  actionSpaceJson: jsonb("action_space_json").$type<string[]>().notNull().default([]),
  constraintsJson: jsonb("constraints_json").$type<Record<string, number>>().notNull().default({}),
  craft: text("craft").notNull().default(""),
  /** The real differentiator between channels — per channel, not per workspace. */
  rewardWeightsJson: jsonb("reward_weights_json").$type<Record<string, number>>().notNull().default({}),
  /** suggest | approve | auto. Schema-supported from day one; UI exposes approve. */
  autonomyJson: jsonb("autonomy_json").$type<Record<string, unknown>>().notNull().default({ level: "approve" }),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("channel_policies_ws_channel_idx").on(t.workspaceId, t.channel)]);

/**
 * ARCHITECTURE_v0.2 §4 — the unit the whole system trades in.
 *
 * A decision, fully described, with no content written yet. The simulator will
 * score these (§5); today they are generated deterministically from the
 * opportunity and the channel policy. Drafts are only written for a spec that
 * has been chosen, which is what keeps generation cost bounded (§14, §18).
 */
export const actionSpecs = pgTable("action_specs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  actionType: text("action_type").notNull(),
  angle: text("angle").notNull(),
  hookType: text("hook_type"),
  formatKey: text("format_key"),
  ctaType: text("cta_type"),
  objective: text("objective").notNull().default(""),
  featureVectorJson: jsonb("feature_vector_json").$type<Record<string, unknown>>().notNull().default({}),
  evidenceIdsJson: jsonb("evidence_ids_json").$type<string[]>().notNull().default([]),
  /** candidate | chosen | declined | published */
  status: text("status").notNull().default("candidate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("action_specs_unique_idx").on(t.opportunityId, t.channel, t.actionType, t.angle),
  index("action_specs_ws_idx").on(t.workspaceId, t.status),
]);

/** §12 drafts. Versioned — every regeneration is a new version, not an overwrite. */
export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  actionSpecId: uuid("action_spec_id").references(() => actionSpecs.id, { onDelete: "set null" }),
  channel: text("channel").notNull(),
  actionType: text("action_type").notNull(),
  angle: text("angle").notNull(),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
  reviewJson: jsonb("review_json").$type<Record<string, unknown> | null>(),
  checksJson: jsonb("checks_json").$type<Record<string, unknown>>().notNull().default({}),
  /** §15 — every draft preserves the source items it was generated from. */
  sourceItemIdsJson: jsonb("source_item_ids_json").$type<string[]>().notNull().default([]),
  promptVersion: text("prompt_version"),
  model: text("model"),
  origin: text("origin").notNull().default("model"),   // model | heuristic | human
  version: integer("version").notNull().default(1),
  state: text("state").notNull().default("draft"),     // draft | edited | approved | discarded
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("drafts_ws_opportunity_idx").on(t.workspaceId, t.opportunityId),
  index("drafts_ws_channel_idx").on(t.workspaceId, t.channel),
]);

/**
 * §5.4 — "Store every meaningful edit as a diff/event."
 *
 * This is operator memory class D at its highest resolution: what the human
 * changed about what the machine wrote is the most direct signal available.
 */
export const draftEdits = pgTable("draft_edits", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
  fromVersion: integer("from_version").notNull(),
  toVersion: integer("to_version").notNull(),
  diffJson: jsonb("diff_json").$type<Record<string, unknown>>().notNull().default({}),
  /** Fraction of characters changed. Computed, not estimated. */
  changeRatio: real("change_ratio").notNull().default(0),
  actor: text("actor").notNull().default("user"),
  intent: text("intent"),      // sharper | more_technical | more_personal | shorten | add_evidence | manual
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("draft_edits_draft_idx").on(t.draftId, t.createdAt)]);

/**
 * A live conversation Inspyr could enter.
 *
 * Distinct from a source item: a source item is something to talk *about*, a
 * conversation target is somewhere to be *seen*. Below ~1,000 followers the
 * second is the only distribution that exists, so it gets its own table, its
 * own scoring function and its own hard gates.
 */
export const conversationTargets = pgTable("conversation_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("x"),
  url: text("url").notNull(),
  authorHandle: text("author_handle").notNull().default(""),
  authorFollowers: integer("author_followers").notNull().default(0),
  reachBand: text("reach_band"),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  replyDepth: integer("reply_depth").notNull().default(0),
  text: text("text").notNull().default(""),
  topicsJson: jsonb("topics_json").$type<string[]>().notNull().default([]),

  score: real("score").notNull().default(0),
  eligible: boolean("eligible").notNull().default(false),
  componentsJson: jsonb("components_json").$type<Record<string, number>>().notNull().default({}),
  gateFailuresJson: jsonb("gate_failures_json").$type<{ gate: string; reason: string }[]>().notNull().default([]),
  reasonsJson: jsonb("reasons_json").$type<unknown[]>().notNull().default([]),
  contribution: text("contribution"),

  status: text("status").notNull().default("new"),   // new | replied | skipped | expired
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("conversation_targets_ws_hash_idx").on(t.workspaceId, t.contentHash),
  index("conversation_targets_ws_score_idx").on(t.workspaceId, t.score),
]);

/**
 * What actually happened after a reply.
 *
 * Logged from the first reply onward — not because a model is waiting to be
 * trained on it, but because an online prior needs observations and because
 * "102 impressions, zero engagement" is only a lesson if it is written down.
 */
export const replyOutcomes = pgTable("reply_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  conversationTargetId: uuid("conversation_target_id").references(() => conversationTargets.id, { onDelete: "set null" }),
  replyUrl: text("reply_url"),
  text: text("text").notNull().default(""),
  /** The feature vector as it was at decision time — never recomputed later. */
  featuresJson: jsonb("features_json").$type<Record<string, unknown>>().notNull().default({}),
  impressions: integer("impressions"),
  engagements: integer("engagements"),
  profileVisits: integer("profile_visits"),
  followsGained: integer("follows_gained"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reply_outcomes_ws_idx").on(t.workspaceId, t.createdAt)]);

/**
 * Cloned voices, and the consent that permits them.
 *
 * `consent_confirmed_at` is the gate. A voice without it cannot be used —
 * enforced in code, not in documentation. The table exists before cloning does
 * so the feature cannot ship around it.
 */
export const voiceProfiles = pgTable("voice_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("fish-audio"),
  referenceId: text("reference_id").notNull(),
  label: text("label").notNull().default(""),
  consentConfirmedAt: timestamp("consent_confirmed_at", { withTimezone: true }),
  consentStatement: text("consent_statement"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("voice_profiles_ws_ref_idx").on(t.workspaceId, t.referenceId)]);

/**
 * Cached audio, keyed by what was said and in which voice.
 *
 * §18 — do not spend a call regenerating something unchanged. Clips are short
 * (about fifteen seconds), so base64 in a column beats standing up object
 * storage for a preview feature.
 */
export const voiceClips = pgTable("voice_clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(),
  format: text("format").notNull().default("mp3"),
  model: text("model").notNull(),
  referenceId: text("reference_id"),
  audioBase64: text("audio_base64").notNull(),
  characters: integer("characters").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("voice_clips_ws_hash_idx").on(t.workspaceId, t.contentHash)]);

/**
 * Something that actually went out.
 *
 * BUILD_SPEC_v0.1 §12. Until this exists, Inspyr can generate and it can learn
 * from operator behaviour, but it cannot answer "how did it do" — which is the
 * question the whole product is built around. Every content type lands here:
 * a thread, a carousel, a video, a reply. One row per published thing.
 */
export const publications = pgTable("publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id").references(() => drafts.id, { onDelete: "set null" }),
  channel: text("channel").notNull(),
  externalUrl: text("external_url"),
  title: text("title").notNull().default(""),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),

  // The feature vector, frozen at publish time (§8.2). Never recomputed —
  // recomputing after the fact leaks outcome knowledge into the record.
  actionType: text("action_type"),
  angle: text("angle"),
  hookType: text("hook_type"),
  formatKey: text("format_key"),
  topicsJson: jsonb("topics_json").$type<string[]>().notNull().default([]),
  lengthBucket: text("length_bucket"),
  timeBucket: text("time_bucket"),

  /** Normalized against this workspace's own recent baseline (§8.3). */
  outcomeJson: jsonb("outcome_json").$type<Record<string, number | null>>().notNull().default({}),
  outcomeScore: real("outcome_score"),
  baselineSampleSize: integer("baseline_sample_size").notNull().default(0),

  state: text("state").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("publications_ws_published_idx").on(t.workspaceId, t.publishedAt),
  index("publications_ws_channel_idx").on(t.workspaceId, t.channel),
]);

/** Raw numbers at a point in time. Kept raw; comparison happens on top. */
export const metricSnapshots = pgTable("metric_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  publicationId: uuid("publication_id").notNull().references(() => publications.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  /** Hours after publishing — 1h and 24h are not comparable. */
  horizonHours: integer("horizon_hours").notNull().default(24),
  source: text("source").notNull().default("manual"),   // manual | api | csv
  metricsJson: jsonb("metrics_json").$type<Record<string, number>>().notNull().default({}),
}, (t) => [
  uniqueIndex("metric_snapshots_pub_horizon_idx").on(t.publicationId, t.horizonHours),
  index("metric_snapshots_ws_idx").on(t.workspaceId, t.capturedAt),
]);
