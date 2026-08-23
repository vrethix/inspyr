# inspyr.social — Product + Engineering Build Spec
### Version 0.1 — August 2026
### Build target: production-capable alpha, dogfooded daily, public launch in 30 days

---

# 0. The rule that governs the entire build

**Do not build an AI social-media dashboard.**

Build this loop:

> **WATCH → FIND → SHAPE → PUBLISH → LEARN → REPEAT**

A traditional scheduler starts with:
> "What would you like to post?"

Inspyr must start with:
> **"I found 6 things worth talking about today. Here is the one I would publish first — and why."**

If a feature does not strengthen this loop, it is not V0.

---

# 1. Product definition

## Product name
**Inspyr**

## Public brand
**inspyr.social**

## Category
**Self-learning growth engine** initially focused on organic social/content.

Long-term category:
**Adaptive GTM**

## Positioning
### Primary
**Know what to say next.**

### Supporting line
Inspyr watches your work and your market, finds the moments worth sharing, turns them into native content for every channel, publishes them, and learns what grows your audience.

## User promise
The user should not need to open Inspyr with a content idea.

They should open Inspyr and find a ranked set of opportunities generated from:
- their own work;
- their content history;
- research/news/sources they care about;
- audience behavior;
- previous wins/failures;
- explicit workspace strategy.

---

# 2. Product thesis

Content generation is commoditized.

The hard questions are:

1. What is worth saying?
2. Why does it matter to this specific audience?
3. What point of view should this specific brand take?
4. What format should this become on each platform?
5. When should it go out?
6. What happened after publishing?
7. What should that outcome change next?

Inspyr owns this decision loop.

---

# 3. Non-goals for V0

Do NOT spend the first month building:

- agency approval hierarchies;
- 20 social networks;
- social listening across the entire internet;
- ad buying;
- CRM;
- cold outbound;
- full Canva replacement;
- complex video editor;
- unlimited autonomous replies;
- enterprise SSO;
- white-label;
- custom reporting dashboards;
- huge agent framework;
- fine-tuned proprietary model;
- fancy multi-agent visualizations;
- generic chatbot as the product home;
- dozens of vanity charts.

The product must feel intelligent because of its **decisions**, not because the UI says "AI."

---

# 4. Core user model: workspaces

One user may operate multiple identities.

Example:

### Workspace A — Personal
- audience: founders / builders / investors;
- voice: direct, technical, opinionated;
- content pillars: founder lessons, AI infra, robotics, product;
- preferred outputs: X, LinkedIn;
- objective: reputation + network + inbound opportunities.

### Workspace B — AITorch
- audience: AI builders / learners / technical professionals;
- voice: explanatory, visual, evidence-driven;
- content pillars: AI explainers, tools, robotics, tutorials;
- outputs: X, YouTube, Instagram;
- objective: audience + subscribers + eventually revenue.

The **same source item must be allowed to produce different opportunity scores and different content for each workspace.**

Never share learned voice or strategic memory across workspaces unless the user explicitly copies it.

---

# 5. Primary product surfaces

Navigation:

1. **Today**
2. **Sources**
3. **Discover**
4. **Create**
5. **Calendar**
6. **Growth**
7. **Memory**
8. **Engage**
9. Settings

## 5.1 Today — the product's real home

This is NOT an analytics dashboard.

Header:
> **I found 6 things worth talking about today.**

Show a ranked opportunity queue.

Each item shows:
- title / discovered event;
- origin/source;
- age/freshness;
- fit score;
- one short explanation;
- workspace;
- optional "trending" signal.

Selecting an opportunity opens the **Inspyr reasoning panel**:

- Why it matters.
- Why it matters to THIS workspace.
- Why now.
- Recommended angle.
- Suggested platforms/formats.
- Supporting source evidence.
- Confidence.
- Actions:
  - Create
  - Save
  - Skip
  - Not relevant
  - Already covered

A skip is a learning event.

A creation is a learning event.

An edit is a learning event.

Do not hide reasoning behind an "AI Insights" modal.

---

## 5.2 Sources

Purpose:
Define what Inspyr is allowed to watch.

V0 source types:

### Must-have
- manual URL;
- RSS feed;
- website URL;
- GitHub repo/releases;
- YouTube channel/video;
- text note;
- voice note/audio upload;
- document upload;
- user's own published content imported from connected social accounts.

### Soon after
- X lists/accounts/bookmarks where API terms permit;
- newsletters/email forwards;
- Google Drive/Notion;
- podcast feeds.

For every source show:
- status;
- last sync;
- items ingested;
- errors;
- what topic rules apply;
- enabled/disabled.

Each ingestion produces canonical `SourceItem` records.

---

## 5.3 Discover

This is the full candidate-opportunity view.

Filters:
- workspace;
- topic;
- source;
- age;
- score;
- novelty;
- platform fit;
- saved/skipped/unreviewed.

Opportunity detail must contain:

### Evidence
What source(s) caused this opportunity to exist?

### Why it matters
Short synthesis.

### Why it fits
Which workspace memories and historical outcomes support it?

### Angles
At least 3 meaningfully different approaches:
- explain;
- argue;
- teach;
- founder story;
- contrarian;
- practical playbook;
- visual breakdown.

### Output recommendation
Example:
- X: 6-post thread
- YouTube: 8-minute explainer
- Instagram: 7-slide carousel
- LinkedIn: opinion + framework

---

## 5.4 Create

**Do not start with a blank chat.**

Create starts from one of:
- opportunity;
- source item;
- pasted idea;
- URL;
- video;
- audio;
- previous post;
- manual brief.

Layout:

### Left: source truth / brief
- source evidence;
- extracted facts;
- audience;
- goal;
- workspace voice;
- constraints;
- reference links.

### Center: native editor
Tabs:
- X
- LinkedIn
- YouTube
- Instagram

Changing platform does NOT simply reformat the same draft.

Each platform receives:
- angle;
- hook;
- structure;
- length;
- CTA;
- medium-specific elements.

### Right: Inspyr review
- voice match;
- factual grounding;
- novelty;
- clarity;
- hook quality;
- repetition risk;
- expected platform fit;
- one recommended improvement.

Actions:
- regenerate;
- make sharper;
- more technical;
- more personal;
- shorten;
- add evidence;
- schedule;
- publish;
- save.

Store every meaningful edit as a diff/event.

---

## 5.5 Calendar / publishing engine

This is the Buffer-like infrastructure we own.

Minimum functionality:
- scheduled posts;
- drafts;
- queued;
- publishing;
- published;
- failed;
- retrying;
- per-platform native preview;
- drag/change schedule;
- timezone-aware scheduling;
- idempotent publishing;
- delivery logs;
- retry with exponential backoff;
- dead-letter queue.

Do not build complex team approvals initially.

### Platform priority

Because external API approvals can become the bottleneck:

**Phase A**
- X publishing if approved/available;
- YouTube metadata/video workflow where available;
- manual-export mode for platforms where publishing permission is pending.

**Phase B**
- Instagram Graph API;
- LinkedIn;
- Threads.

The UI must clearly distinguish:
- `auto_publish`
- `manual_publish`
- `integration_pending`

Never pretend a platform is automatically published if it is not.

---

## 5.6 Growth

Do not lead with charts.

Lead with:

> **What Inspyr learned.**

Examples:
- "Robotics explainers generate 1.8× more saves than generic AI news."
- "Strong founder interpretations convert profile visits to follows 42% better than neutral summaries."
- "You consistently reject funding-news opportunities; I have down-ranked that topic."
- "8–12 minute YouTube explainers currently outperform Shorts for subscriber conversion."

Then show supporting metrics.

Primary metrics by platform:
- impressions / reach;
- engagement;
- saves;
- replies/comments;
- shares;
- profile visits;
- follows/subscribers;
- clicks;
- watch time / retention;
- conversion events where measurable.

Growth must produce **actionable policy changes**, not reports.

---

## 5.7 Memory

Memory is the moat candidate.

Four memory classes:

### A. Identity memory — user controlled
Stable.
- voice;
- audience;
- beliefs;
- positioning;
- content pillars;
- goals;
- forbidden phrases;
- topics to avoid;
- competitors;
- preferred style.

### B. Content memory
- everything published;
- topics already covered;
- prior angles;
- semantic embeddings;
- duplicate/repetition detection;
- source provenance.

### C. Outcome memory
- performance;
- platform;
- format;
- topic;
- hook type;
- post length;
- publish time;
- CTA;
- audience response.

### D. Operator memory
What the human teaches Inspyr through behavior:
- approved;
- rejected;
- skipped;
- heavily edited;
- changed hook;
- changed tone;
- changed platform;
- changed schedule.

The UI must distinguish:
**You told Inspyr** vs **Inspyr learned**.

Users must be able to remove or correct learned memory.

---

## 5.8 Engage

V0 should be conservative.

Pull comments/replies where APIs permit.

Prioritize:
- questions;
- high-intent responses;
- repeat commenters;
- possible leads;
- content ideas;
- objections;
- high-reach accounts.

Generate suggested replies.

Require approval by default.

Every conversation can produce:
**"Turn this into an opportunity."**

That closes audience feedback back into content creation.

---

# 6. The Inspyr engine

Avoid uncontrolled "multi-agent" complexity.

Build a deterministic pipeline with explicit AI steps.

## 6.1 Components

### 1. Ingestion Worker
Fetches source data.

Input:
`Source`

Output:
`SourceItem`

### 2. Understanding Worker
Extracts:
- canonical text;
- title;
- summary;
- entities;
- topics;
- claims;
- dates;
- source reliability hints;
- embedding;
- media metadata.

### 3. Opportunity Scout
Groups one or more SourceItems into a candidate story/opportunity.

Output:
`OpportunityCandidate`

### 4. Opportunity Ranker
Scores candidate per workspace.

Output:
`Opportunity`

### 5. Content Planner
Selects:
- thesis;
- angle;
- target audience;
- target platforms;
- format;
- evidence;
- CTA.

### 6. Platform Writer
Creates independent native variants.

### 7. Quality Reviewer
Checks:
- factual grounding;
- unsupported claims;
- voice;
- repetition;
- structural fit;
- platform constraints.

### 8. Publisher
Queues and sends content.

### 9. Metrics Collector
Captures outcome snapshots.

### 10. Learner
Turns:
- user behavior;
- content outcome;
- experiment results

into updated `StrategySignal` records.

---

# 7. Opportunity ranking — V0 algorithm

Do not ask an LLM for a single magical score.

Calculate interpretable components.

Each component normalized 0–100:

- `workspace_relevance`
- `audience_fit`
- `freshness`
- `novelty`
- `source_confidence`
- `historical_topic_fit`
- `strategic_priority`
- `format_potential`

Suggested V0:

```
score =
  0.22 * workspace_relevance +
  0.18 * audience_fit +
  0.14 * freshness +
  0.13 * novelty +
  0.08 * source_confidence +
  0.12 * historical_topic_fit +
  0.08 * strategic_priority +
  0.05 * format_potential
```

Then apply bounded adjustments:

```
+ repeated-user-approval affinity
- repeated-skip affinity
- recently-covered penalty
- duplicate-story penalty
```

Persist every component.

UI reasoning is generated FROM these components + evidence.

Never save only `score=94`.

---

# 8. Learning system — V0

This is critical.

Do not pretend that storing analytics equals learning.

## 8.1 Event stream

Record events:

```
opportunity_viewed
opportunity_saved
opportunity_skipped
opportunity_rejected
opportunity_created
draft_generated
draft_regenerated
draft_edited
draft_approved
publication_scheduled
publication_published
publication_failed
comment_received
reply_sent
metric_snapshot_received
goal_conversion_received
memory_corrected
```

Every event:
- workspace_id;
- actor;
- timestamp;
- object IDs;
- metadata;
- causal parent where relevant.

---

## 8.2 Feature vector for a publication

For every post, store:

- topic IDs;
- source type;
- angle type;
- hook type;
- format;
- platform;
- length bucket;
- time/day bucket;
- CTA type;
- media type;
- generated vs edited ratio;
- workspace;
- goal.

---

## 8.3 Normalize outcomes

Raw impressions cannot be compared across platforms or account sizes.

Compute platform-relative outcome scores using recent workspace baselines.

Examples:

```
engagement_lift = post_engagement_rate / rolling_30d_platform_engagement_rate
save_lift       = post_save_rate / rolling_30d_platform_save_rate
follow_lift     = post_follow_conversion / rolling_baseline
watch_lift      = post_watch_retention / rolling_baseline
```

Create one goal-weighted `OutcomeScore`.

Example awareness objective:

```
0.30 engagement_lift
0.25 save_lift
0.20 share_lift
0.15 follow_lift
0.10 reach_lift
```

Weights vary by workspace objective.

---

## 8.4 Strategy signals

The learner creates statements such as:

```
signal:
  dimension: topic
  key: robotics
  platform: x
  effect: +0.41
  confidence: 0.78
  sample_size: 17
  evidence_window: 45d
```

Or:

```
dimension: operator_preference
key: funding_news
effect: -0.65
confidence: 0.91
source: repeated_skips
```

Use these signals in ranking and planning.

V0 can use:
- EWMA;
- minimum sample thresholds;
- confidence intervals;
- conservative shrinkage toward zero.

Do NOT jump immediately to reinforcement learning.

---

# 9. Experiments

After enough volume, enable lightweight tests.

Examples:
- question hook vs statement hook;
- short vs long X post;
- carousel 6 vs 10 slides;
- YouTube 5 vs 9 minutes;
- morning vs evening;
- opinion vs explainer.

Entity:

`Experiment`
- hypothesis;
- workspace;
- platform;
- variable;
- variants;
- sample target;
- metric;
- state;
- result;
- confidence.

Inspyr should eventually be able to say:
> "I am testing this because I am uncertain whether X or Y works better."

Uncertainty is a product feature.

---

# 10. Technical architecture

Optimize for a strong solo/small-team build.

## Frontend
- Next.js 16 App Router
- React 19
- TypeScript strict
- CSS variables + custom design system
- Radix primitives only where useful
- avoid default shadcn look
- TanStack Query or server actions for data fetching
- Zod for shared validation

## Backend
Option A — fastest:
- Next.js route handlers / server actions for CRUD
- separate worker service for ingestion/publishing

Option B — cleaner scale:
- NestJS API
- Next.js frontend

Recommended for initial solo build:
**Next.js app + separate TypeScript worker package in one monorepo.**

## Database
- PostgreSQL
- Prisma or Drizzle
- pgvector for semantic retrieval

## Queue
- Redis
- BullMQ

## Storage
- S3-compatible object storage
- local MinIO in dev

## AI provider abstraction
Implement interface:

```
LLMProvider.generateStructured()
LLMProvider.generateText()
EmbeddingProvider.embed()
TranscriptionProvider.transcribe()
```

Do not couple business logic directly to one model vendor.

## Observability
- structured logs;
- OpenTelemetry;
- Sentry;
- job tracing;
- LLM request tracing;
- prompt/version IDs;
- cost + latency per AI call.

---

# 11. Suggested monorepo

```
inspyr/
  apps/
    web/
    worker/
  packages/
    db/
    ai/
    social/
    ingestion/
    ranking/
    learning/
    shared/
    ui/
  prisma/             # if Prisma chosen
  docs/
  infra/
  scripts/
```

Inside `packages/social`:

```
adapter.ts

providers/
  x.ts
  youtube.ts
  instagram.ts
  linkedin.ts
```

Adapter contract:

```
connect()
refreshToken()
validatePermissions()
publish()
deletePublication()
fetchPublication()
fetchMetrics()
fetchEngagement()
```

---

# 12. Core data model

## users
- id
- email
- name
- created_at

## workspaces
- id
- owner_id
- name
- slug
- objective
- timezone
- created_at

## workspace_memory
- id
- workspace_id
- memory_type
- key
- value_json
- source
- confidence
- locked_by_user
- created_at
- updated_at

## channels
- id
- workspace_id
- provider
- provider_account_id
- handle
- status
- scopes_json
- encrypted_access_token
- encrypted_refresh_token
- token_expires_at

## sources
- id
- workspace_id
- type
- config_json
- status
- last_synced_at
- sync_cursor
- created_at

## source_items
- id
- source_id
- external_id
- canonical_url
- title
- raw_text
- normalized_text
- summary
- topics_json
- entities_json
- claims_json
- published_at
- observed_at
- embedding
- content_hash

Unique:
`(source_id, external_id)` where possible.
Also dedupe on `content_hash`.

## opportunities
- id
- workspace_id
- title
- summary
- status
- score
- score_components_json
- recommended_angle
- recommended_outputs_json
- confidence
- created_at

## opportunity_sources
- opportunity_id
- source_item_id
- relevance

## drafts
- id
- workspace_id
- opportunity_id
- platform
- format
- angle
- title
- body
- content_json
- prompt_version
- model
- version
- state
- created_at

## draft_edits
- id
- draft_id
- from_version
- to_version
- diff_json
- actor
- created_at

## publications
- id
- workspace_id
- draft_id
- channel_id
- scheduled_for
- published_at
- provider_post_id
- state
- attempt_count
- error_code
- error_message
- idempotency_key

## metric_snapshots
- id
- publication_id
- captured_at
- metrics_json

## strategy_signals
- id
- workspace_id
- dimension
- key
- context_json
- effect
- confidence
- sample_size
- evidence_start
- evidence_end
- active

## feedback_events
- id
- workspace_id
- event_type
- entity_type
- entity_id
- metadata_json
- created_at

## experiments
- id
- workspace_id
- hypothesis
- platform
- variable
- config_json
- target_metric
- state
- result_json

## engagement_threads
- id
- workspace_id
- channel_id
- provider_thread_id
- participant_json
- priority
- status
- last_message_at

---

# 13. Background jobs

Queues:

```
source-sync
source-understand
opportunity-scout
opportunity-rank
draft-generate
draft-review
publish
publication-retry
metrics-sync
engagement-sync
learning
daily-plan
memory-maintenance
```

Every job must:
- be idempotent;
- have structured logs;
- carry workspace_id;
- have max retries;
- send permanent failures to DLQ;
- expose status to UI when user-visible.

---

# 14. Daily plan generation

At a configurable time per workspace:

1. Sync priority sources.
2. Understand new source items.
3. Cluster related items.
4. Generate candidates.
5. Remove duplicates/recently-covered stories.
6. Rank against workspace.
7. Return top N.
8. Generate concise reasoning.
9. Do NOT generate all drafts yet.
10. Show the ranked queue in Today.

Only generate content when:
- user clicks Create;
- automation rule explicitly permits creation;
- future autonomous mode is enabled.

This controls AI cost.

---

# 15. Retrieval and grounding

Every generated draft should be traceable to:
- one or more source items;
- workspace memories;
- optional prior-content examples.

Generation prompt receives:

```
SOURCE TRUTH
WORKSPACE IDENTITY
AUDIENCE
OBJECTIVE
RELEVANT PRIOR CONTENT
RELEVANT STRATEGY SIGNALS
PLATFORM RULES
ANGLE
OUTPUT SCHEMA
```

Store source IDs used for each draft.

Add a factual reviewer that marks unsupported claims.

User should be able to click:
**Why did you say this?**

---

# 16. API surface — V0

Suggested endpoints:

```
POST   /api/workspaces
GET    /api/workspaces/:id

GET    /api/sources
POST   /api/sources
POST   /api/sources/:id/sync
DELETE /api/sources/:id

GET    /api/opportunities
GET    /api/opportunities/:id
POST   /api/opportunities/:id/save
POST   /api/opportunities/:id/skip
POST   /api/opportunities/:id/reject

POST   /api/drafts/generate
GET    /api/drafts/:id
PATCH  /api/drafts/:id
POST   /api/drafts/:id/review

POST   /api/publications
PATCH  /api/publications/:id/schedule
POST   /api/publications/:id/publish
POST   /api/publications/:id/retry

GET    /api/growth/summary
GET    /api/growth/signals
GET    /api/memory
PATCH  /api/memory/:id

GET    /api/engagement
POST   /api/engagement/:id/reply

GET    /api/jobs/:id
```

---

# 17. Security requirements

Before real users:

- tenant isolation by workspace on every query;
- encrypted OAuth tokens at rest;
- never send raw credentials to LLMs;
- signed/encrypted OAuth state;
- CSRF protection;
- rate limiting;
- webhook signature verification;
- secret rotation strategy;
- audit log for publishing actions;
- user-configurable deletion;
- data export;
- platform API ToS compliance;
- do not scrape private/user-authenticated content in prohibited ways.

---

# 18. AI cost controls

V0 must be cheap enough to dogfood heavily.

Rules:

- cheap model for extraction/classification;
- stronger model only for reasoning/writing where useful;
- embeddings cached by content hash;
- do not regenerate unchanged source analysis;
- rank candidates algorithmically before expensive synthesis;
- generate drafts on demand;
- summarize long source items once;
- cache prompt outputs by prompt version + relevant hash;
- token/cost logs per job.

Show internal admin metrics:
- AI cost/user/day;
- AI cost/opportunity;
- AI cost/published post;
- source processing cost;
- gross margin estimate.

---

# 19. Product analytics

Track funnel:

```
source_connected
→ opportunity_seen
→ opportunity_accepted
→ draft_created
→ draft_approved
→ published
→ result_received
→ strategy_signal_created
```

Critical product metrics:

### Activation
User connects >=2 sources and accepts first opportunity within 24h.

### "Aha"
User says/behaves:
> "I would not have thought to post this."

Proxy:
accepted opportunity discovered autonomously by Inspyr.

### Weekly value
- opportunities accepted;
- content published;
- percentage of posts originating from Inspyr discovery;
- time saved;
- outcome lift vs workspace baseline.

### Retention thesis
Users return because Inspyr knows:
- what they are building;
- what their audience wants;
- what they have already said;
- what works.

---

# 20. MVP acceptance criteria

The alpha is launchable when one real user can:

1. Create two workspaces with different voices/audiences.
2. Connect at least 3 source types.
3. Run ingestion.
4. Receive >=5 distinct ranked opportunities.
5. Open any opportunity and see grounded reasoning.
6. Reject/skip an opportunity and have that stored as feedback.
7. Create distinct X / YouTube / Instagram variants from one source.
8. Edit a draft.
9. Schedule or export/publish it.
10. Ingest performance metrics for supported networks.
11. See at least one generated strategy learning.
12. Have that strategy learning affect the next opportunity ranking.
13. Inspect and correct memory.
14. See a complete event trail for the loop.

If #12 does not work, **Inspyr does not learn yet.**

---

# 21. Build order

## Week 1 — The brain before the scheduler

Day 1:
- monorepo;
- auth;
- Postgres;
- workspace model;
- design tokens;
- Today shell.

Day 2:
- sources CRUD;
- URL/RSS/manual note ingestion;
- source-item model;
- background worker.

Day 3:
- source understanding;
- embeddings;
- opportunity candidate generation;
- ranker.

Day 4:
- Today ranked queue;
- opportunity detail;
- Save / Skip / Reject feedback.

Day 5:
- workspace memory;
- identity/audience/topics;
- retrieval into reasoning.

Day 6:
- Create flow;
- X + YouTube + Instagram native variants;
- draft versioning.

Day 7:
- dogfood every day;
- fix ranking and reasoning quality;
- remove anything that feels like generic AI copy.

**Milestone:** Inspyr should autonomously find something you genuinely want to publish.

---

## Week 2 — Close the first half of the loop

- calendar;
- scheduler;
- publication state machine;
- X integration where practical;
- manual publish/export fallback;
- metrics ingestion;
- published-content import;
- content memory;
- duplicate detection;
- first `StrategySignal` generation.

**Milestone:** A real post can travel from source → opportunity → content → publish → metrics.

---

## Week 3 — Make "learn" real

- normalized baselines;
- strategy signals;
- operator-preference learning;
- ranking influenced by signals;
- Growth page centered on learnings;
- memory correction UX;
- experiment entity;
- engagement ingest for one platform;
- "turn reply into opportunity."

**Milestone:** Yesterday's result visibly changes today's ranking.

---

## Week 4 — Public alpha

- onboarding;
- product tour;
- billing;
- usage limits;
- source health;
- job/error UI;
- privacy/delete/export;
- analytics;
- bug fixes;
- landing site;
- waitlist/invite codes;
- 10–25 external users.

**Milestone:** people who did not build Inspyr can activate without help.

---

# 22. 30-day launch plan

Do NOT hide for 30 days and then launch.

Build the product and the audience at the same time.

## Days 1–3 — Declare the problem

Post:
1. "The next social product should not start with a blank composer."
2. Screenshot/video of the proposed Today screen:
   **I found 6 things worth talking about today.**
3. Explain the difference:
   scheduler → asks what to post;
   Inspyr → finds what is worth saying.

CTA:
"Building this in public. If you run social for yourself or a brand, tell me what your current workflow is."

Goal:
20 conversations, not signups.

---

## Days 4–7 — Dogfood visibly

Every day publish:
- one thing Inspyr discovered;
- one short build artifact;
- one learning/failure.

Example:
> "Inspyr found this paper from my sources, ranked it 94 for AITorch, and generated two completely different angles for my personal account vs AITorch."

Show:
- ranking components;
- source provenance;
- before/after edits;
- why you rejected a suggestion.

Important:
**Show when Inspyr is wrong.**
That makes the learning thesis believable.

Goal:
first 5 design partners.

---

## Days 8–14 — Closed-loop proof

Publish a recurring series:

### "What Inspyr learned this week"

Examples:
- topic performance;
- hook performance;
- manual rejects;
- new ranking adjustment.

The product's own account should be powered by Inspyr.

Show:
`source → recommendation → post → result → changed recommendation`

This is the artifact that differentiates the product.

Goal:
10–15 active testers.

---

## Days 15–21 — Invite alpha users

Landing CTA:
**Connect your work. See what Inspyr thinks is worth saying.**

Avoid:
"Generate 100 posts with AI."

Offer:
- free alpha;
- founder onboarding;
- import last 30–90 days of content;
- set up workspace brain personally.

Interview every active tester after 3 days.

Ask:
1. Did Inspyr find anything you would have missed?
2. Which recommendations did you reject?
3. Did drafts sound like you?
4. Did you publish something because Inspyr surfaced it?
5. Would you be annoyed if the product disappeared?

Goal:
25 activated users, 10 weekly active.

---

## Days 22–27 — Tighten the wedge

Use evidence to decide the sharpest ICP.

Likely initial candidates:
- technical founders building in public;
- AI founders;
- creator-educators;
- one-person marketing teams.

Do NOT broaden prematurely.

Remove weak source integrations and features.

Double down on whichever behavior produces:
> "I would have missed this story."

Goal:
activation >40% among invited users.

---

## Days 28–30 — Public launch

Launch assets:

1. 45–60 second product demo.
2. One diagram:
   **Watch → Find → Shape → Publish → Learn**
3. Real case study from one workspace.
4. Before/after ranking or strategy change.
5. Product website.
6. Free tier / invite.
7. Founder thread explaining why this is not another AI writer.

Launch line:

> **I built Inspyr because I was tired of opening a social tool and still having to decide what to say.**

Then show:
> **I found 6 things worth talking about today.**

Launch to:
- X;
- LinkedIn;
- relevant Reddit communities carefully/no spam;
- Product Hunt only if useful;
- Hacker News Show HN if technical story is strong;
- AI/creator communities;
- direct founder outreach.

---

# 23. Build-in-public content system

Do not make the build-in-public feed a changelog.

Use 5 repeating content types:

### 1. Product thesis
"What is wrong with current social software?"

### 2. Artifact
Real screen, ranking logic, code architecture, learning event.

### 3. Dogfood
"What Inspyr told me to publish today."

### 4. Failure
"Why I rejected Inspyr's top recommendation."

### 5. Learning
"After 17 posts, Inspyr changed X because Y."

A strong cadence:
- 1 major post/day;
- 1–2 lighter artifacts/updates/day;
- meaningful replies to people in the target ICP.

Do not optimize for follower count alone.
Optimize for conversations with users who have this problem.

---

# 24. Grocalo comparison — be precise

As of August 2026, Grocalo publicly positions itself as:

> an AI second brain that runs a creator business.

Its public site says it:
- remembers videos/posts/captions;
- knows audience and performance;
- cross-posts;
- replies to common comments/DMs;
- reposts best work;
- handles distribution, engagement and growth.

Therefore:

**Inspyr is NOT automatically differentiated just because it has memory, publishing, engagement, analytics or says it learns. Grocalo already occupies much of that language.**

The product must create a stronger wedge.

## Grocalo's apparent center of gravity
**Creator second brain + execution of creator busywork.**

Mental model:
> You create. Grocalo remembers, distributes, engages and operates around the content.

## Inspyr's intended center of gravity
**Decision engine + adaptive growth loop.**

Mental model:
> Your work is happening continuously. Inspyr detects the stories, decides what deserves attention, creates the native expression, distributes it, measures the outcome and changes future decisions.

The key difference must be visible **before the composer**.

### Grocalo
Existing content → remember → distribute → engage → track.

### Inspyr
Work + market + memory → discover opportunity → rank/decide → create → distribute → outcome → policy update.

This distinction is only valuable if it is built into the product.

---

# 25. What would make Inspyr truly different

These must become real capabilities:

### 1. Autonomous opportunity discovery
The user does not need to bring the idea.

### 2. Explicit ranking with explainable evidence
Not "here are 20 content ideas."
Inspyr says which one should happen first and why.

### 3. Per-workspace strategic brains
Same source, different identity/audience/strategy.

### 4. Outcome-driven policy updates
Metrics change future ranking, format choice and recommendations.

### 5. Operator-feedback learning
Skips, edits and rejects teach the system.

### 6. Uncertainty + experiments
Inspyr recognizes when it does not know and tests alternatives.

### 7. Source-of-truth provenance
Every opportunity and factual claim can point back to evidence.

If these disappear, Inspyr collapses back into the crowded category.

---

# 26. Product moat hypothesis

Do not claim a moat on day one.

The potential moat develops from a private, workspace-specific decision graph:

```
source/event
    ↓
opportunity
    ↓
workspace/audience
    ↓
chosen angle
    ↓
platform expression
    ↓
human edits / approval
    ↓
distribution
    ↓
audience response
    ↓
business outcome
    ↓
future strategy
```

Over time Inspyr can know:
- what this brand notices;
- what it ignores;
- what it believes;
- how it expresses ideas;
- what audience responds;
- which actions produce which outcomes.

That dataset is much more useful than a library of generated captions.

---

# 27. Future path: Adaptive GTM

Do not build this yet.

Once the social/content loop works, the same architecture can expand:

```
content
→ community
→ newsletter
→ SEO
→ website
→ lead capture
→ CRM signal
→ campaigns
→ outreach
→ conversion
→ revenue attribution
→ learn
```

Then the decision becomes:

> **What should this company do next to grow, given everything we know?**

That is the larger vision.

But social/content is the proving ground.

---

# 28. Claude Code / Codex execution rules

Paste the following into the coding agent before implementation:

## Engineering operating instructions

1. Read this complete spec before writing code.
2. Maintain a `/docs/implementation-status.md`.
3. Work milestone by milestone.
4. Do not invent major features not present here.
5. Before every milestone:
   - propose file changes;
   - list migrations;
   - list API changes;
   - list tests.
6. After every milestone:
   - run typecheck;
   - run lint;
   - run unit tests;
   - run integration tests;
   - run the app;
   - update implementation status.
7. All AI outputs that enter product state must use typed schemas and validation.
8. All background jobs must be idempotent.
9. All external-provider calls must be behind adapters.
10. Every stored opportunity must include score components and evidence.
11. Every generated draft must preserve source provenance.
12. Every publish operation must use an idempotency key.
13. Every workspace query must enforce tenant scope.
14. Never put OAuth tokens into logs or model prompts.
15. Prefer a small deterministic pipeline over an agent framework.
16. Do not introduce a new dependency without explaining why.
17. Do not use placeholder fake analytics in production paths.
18. Do not mark "learning" complete until a previous outcome measurably changes a future ranking or recommendation.
19. Keep UI visually restrained:
   - custom typography hierarchy;
   - no generic card wall;
   - no gradients by default;
   - one accent;
   - no "AI Insights" marketing labels;
   - Today must be a workstream, not a dashboard.
20. Optimize for shipping one complete closed loop before feature breadth.

---

# 29. First coding task

Implement **Milestone 1: Source → Opportunity → Today**

Required result:

- auth works;
- user creates workspace;
- user enters workspace voice/audience/topics;
- user adds RSS + URL + text-note sources;
- worker ingests them;
- records are normalized and deduplicated;
- candidate opportunities are created;
- opportunities are scored per workspace with persisted component scores;
- Today page displays top opportunities;
- clicking opportunity displays:
  - source evidence;
  - why it matters;
  - why it fits;
  - component scores;
  - suggested angles;
- Save / Skip / Reject emits feedback events;
- all AI responses validated with Zod;
- tests cover:
  - source deduplication;
  - workspace isolation;
  - ranking;
  - feedback event creation.

Do **not** implement calendar or social publishing before this milestone is working well enough that the operator says:

> **"Inspyr found something I genuinely want to publish."**

That sentence is the first product milestone.
