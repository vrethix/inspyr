# Implementation status

**Milestone 1 — Source → Opportunity → Today.** Complete and verified end to end.
**Milestone 2 step 1 — Create.** Complete and verified end to end.
**Conversation opportunities.** Complete and verified against a real failure.
**Next actions.** Inspyr now says what to do instead of only what not to do.
**Stage engine.** Behaviour changes with where the account actually is.
**Zernio adapter.** Metrics come back on their own, where the platform allows it.
Last updated: 2026-08-23.

Required by `BUILD_SPEC_v0.1.md` §28.2. This file states what is actually true, including
what does not work.

---

## Acceptance — BUILD_SPEC_v0.1 §29

| # | Requirement | Status |
|---|---|---|
| 1 | Auth works | ✅ scrypt + HMAC-signed session cookie, `sessions` table |
| 2 | User creates workspace | ✅ `/onboarding`, `/workspaces/new` |
| 3 | Voice / audience / topics captured | ✅ identity memory, `/memory` |
| 4 | RSS + URL + text-note sources | ✅ plus GitHub releases and YouTube channels |
| 5 | Worker ingests them | ✅ BullMQ workers + a no-Redis CLI path |
| 6 | Normalized and deduplicated | ✅ two dedupe keys, 7 tests |
| 7 | Candidate opportunities created | ✅ greedy single-link clustering |
| 8 | Scored per workspace, components persisted | ✅ all 8 components + adjustments stored |
| 9 | Today shows top opportunities | ✅ ranked queue behind a relevance floor |
| 10 | Detail: evidence, why, components, angles | ✅ `/opportunity/[id]` |
| 11 | Save / Skip / Reject emit feedback events | ✅ with topic attribution |
| 12 | AI responses validated with Zod | ✅ plus a fabricated-metric guard |
| 13 | Tests: dedupe, isolation, ranking, feedback | ✅ 45 tests, all passing |

### BUILD_SPEC_v0.1 §20, criterion 12 — the one that matters

> "If #12 does not work, Inspyr does not learn yet."

Verified against the real database by `scripts/verify-loop.ts`:

```
opportunity  Generalist releases physical prompting for robots
score before 65.97   (historical_topic_fit 50)
  → 3 rejections recorded for its topics
signals      4 derived, 4 active   effect -0.500, conf 0.38, n=3
score after  53.95   (historical_topic_fit 25)
adjustments  {"skip_affinity":-9,"topic_fatigue":-1.27}

PASS — ranking moved by 12.02 because of the decisions.
```

### ARCHITECTURE_v0.2 additions landed in M1

| Item | Status |
|---|---|
| §3.4 audience state / fatigue | ✅ computed, penalises ranking, surfaced on Today |
| §1.1 models predict, LLMs explain | ✅ no LLM writes any score |
| §1.2 evidence basis on every number | ✅ `evidence_tier` + `sample_size` persisted and shown |
| §5.5 degradation rules | ✅ below threshold the UI shows ordering and says so |
| §17.28 every agent step persisted | ✅ `agent_runs` / `agent_steps`, trace UI at `/runs/[id]` |
| §19.23 no fabricated metrics | ✅ runtime guard + 4 tests |
| §9 operator learning before outcome learning | ✅ this is the whole M1 learning story |

---

## Milestone 2 step 1 — Create (§5.4, §6.6, §6.7)

One opportunity becomes genuinely different native artefacts per channel. Not a reformat:
each channel decides its own action type, structure, hook and CTA from the source truth.

| Requirement | Status |
|---|---|
| §5.4 Create never starts from a blank composer | ✅ starts from an opportunity |
| §5.4 left source truth / centre editor / right review | ✅ `/create/[id]` |
| §5.4 changing platform is not a reformat | ✅ separate draft, schema and editor per channel |
| §5.4 every meaningful edit stored as a diff event | ✅ `draft_edits` with a computed change ratio |
| §6.6 Platform Writer, independent native variants | ✅ one runtime, four ChannelPolicies |
| §6.7 Quality Reviewer | ✅ verdicts from the model, numbers from code |
| §15 every draft traceable to its source items | ✅ `source_item_ids_json` |
| ARCHITECTURE_v0.2 §4 ActionSpec as the unit traded | ✅ `action_specs`, enumerated before anything is written |
| ARCHITECTURE_v0.2 §6 per-channel reward weights | ✅ `channel_policies.reward_weights_json` |
| ARCHITECTURE_v0.2 §6 `no_action` first-class | ✅ in every action space, with its own UI state |

Verified by `scripts/verify-create.ts`:

```
action specs enumerated: 12 — none written yet

x          thread           v1   constraints pass  repetition 0.177  sources 1
linkedin   post             v1   constraints pass  repetition 0.216  sources 1
instagram  carousel         v1   constraints pass  repetition 0.218  sources 1
youtube    explainer_video  v1   constraints pass  repetition 0.153  sources 1

distinct artefacts: 4/4
edit recorded: v1 → v2, state edited

PASS — every channel produced its own artefact, and the edit was measured.
```

### The reviewer emits no numbers

§6.7 lists "voice match, factual grounding, novelty, clarity, hook quality, repetition risk,
platform fit" — which reads like a list of scores. ARCHITECTURE_v0.2 §1.1 forbids a model
writing a number. Both hold: the reviewer returns **categorical verdicts and specific
findings** (`match` / `drift` / `off`, `native` / `translated` / `wrong_format`, per-claim
`supported` / `unsupported` / `contradicted`), and every figure beside them is computed in
code — constraint violations from the channel's own limits, repetition from lexical
similarity against published content, grounding coverage from the reviewer's claim verdicts.

This is strictly better than asking a model for `voice_match: 82`.

### Drafts are written only for a chosen ActionSpec

12 candidate actions are enumerated per opportunity; one is chosen per channel; only that
one is written. This is what keeps §14 and §18 true, and it is the seam the Growth Simulator
(ARCHITECTURE_v0.2 §5) drops into — it will score exactly these objects, and nothing else
about the flow changes.

---

## Conversation opportunities

Built out of order, ahead of the calendar, because a live account (Tako, 9 followers) exposed
a gap in the product thesis:

> Inspyr solved **"what should I say."** At 9 followers the binding constraint is
> **"who will see it."** Those are different problems, and below roughly 300 followers the
> second one dominates completely.

A post to a 9-follower timeline reaches nine people. That is arithmetic. The only distribution
available at that stage is a reply that borrows someone else's audience — so replies became a
first-class opportunity type with their own scoring function and their own hard gates.

### Gates, not weights

The five components (`reply_position` 0.30, `recency` 0.24, `author_reach` 0.20,
`contribution` 0.18, `topical_fit` 0.08) produce a score. But four conditions **disqualify**
regardless of score, and all four are derived from mechanism rather than from data:

| Gate | Why it is a gate, not a penalty |
|---|---|
| `reply_depth >= 50` | platforms rank replies and collapse the tail; past the fold a reply is not seen regardless of quality |
| `age > 6h` | reply reach rides the parent post's decay |
| `author < 200 followers` | no audience to borrow |
| no contributable fact | personality without information does not convert |

**None of these needed a training set.** They are properties of how the platforms work.

### The regression case

Tako's real failure — a reply 639 deep on a 2.4M-follower account, 102 impressions, zero
engagement, zero conversion — is a test:

```
SKIP   the reply that actually failed
  score 0.0  depth 639  mega  190m old
  gate: 639 replies already. Past roughly 50 the platform collapses the tail —
        your reply is not seen regardless of quality.
  gate: You have nothing concrete to add here.

ENTER  a smaller builder, early, on topic
  score 85.2  depth 3  mid  9m old
  add:  Tako scopes agent wallet permissions per session…

SKIP   on topic but far too late     gate: posted 9h ago
SKIP   right size, nothing to add    gate: no concrete contribution
```

Inspyr refuses the reply that failed, accepts the one worth making, and names the fact to
answer with.

### Learning without a training phase

An earlier draft of this proposed fitting a classifier on reply outcomes. That was wrong for
the same reason the Growth Library is a slow asset: it needs data that does not exist yet.

The implemented design is a three-tier hierarchy instead:

1. **Mechanism** — hard gates. Works at n=0, needs no data, ever.
2. **Prior updated online** — Beta-Bernoulli per reach band, shrunk toward a mechanism-derived
   prior. Moves on observation #1; one result can shift a score by at most ~2 points.
3. **Joint weights** — an optional batch fit much later, once hundreds of outcomes exist. Never
   a milestone: if features and outcomes are logged as they happen, fitting is an afternoon.

`reply_outcomes` stores the feature vector **frozen at decision time**. Recomputing features
later would leak outcome knowledge into the record and quietly corrupt every comparison after
it.

Impressions are explicitly not success. Tako's failure had 102 of them. Conversion is a
profile visit or a follow.

---

## Next actions — never refuse without an alternative

Conversation opportunities fixed *which reply to make*. It left a worse problem in place:
at 9 followers Inspyr's answer was "your timeline reaches 9 people, do not post" — and then
nothing. A correct answer that stops there is a wall.

Two changes.

### 1. Channels where follower count is irrelevant

Inspyr modelled X, LinkedIn, Instagram and YouTube. For a cold-start technical project those
are the *worst* channels available, because all four are bounded by an audience that does not
exist yet. Added GitHub, Show HN, Discord and Farcaster, where the artifact is the
distribution and nobody checks your follower count.

Reach is now typed by mechanism:

| Reach kind | Bounded by | Example |
|---|---|---|
| `own_audience` | your follower count — arithmetic | timeline post |
| `borrowed` | someone else's audience | a reply, an issue on a nearby repo |
| `artifact` | whether the thing is good | GitHub, Show HN, Discord |

### 2. Value includes what an action unblocks

Ranking on reach alone preferred a ten-minute reply (~300 people) over publishing the repo
(~200). That is wrong, and not by a little: publishing turns Show HN from blocked into
available, and Show HN is an order of magnitude larger. So an action's value is its own reach
plus a discounted sum of the reach it makes possible.

For Tako today — 9 followers, 15 passing tests, nothing public:

```
DO THIS TODAY
  1. Put the code on GitHub    reaches ~200, 180 min, unlocks 1135 more
  2. Write up what broke       reaches ~300, 90 min
  3. Open a useful issue       reaches ~50,  60 min
  4. Post to your own timeline reaches ~9,   30 min
  ...

NOT POSSIBLE YET
  Post it to Show HN   — needs: Code is public, Someone else can run it
  Share in a Discord   — needs: Code is public
  Reply to a conversation — needs: a conversation worth entering
```

The ordering reverses on its own once the account is large (asserted in tests) — this is a
consequence of arithmetic, not a rule someone typed in.

### Blocked is a dependency, not a verdict

Every blocked action names the one thing that unblocks it, in plain language, and Today has a
checklist where the operator ticks off what now exists. Ticking "Code is public" moves three
actions from blocked to available. The gate stops being a wall and becomes a to-do.

### One bug worth recording

`packages/shared`'s index re-exported `env.ts`, which reads the filesystem. A client component
imported the index, Turbopack tried to bundle `node:fs`, and the page 500'd. Fixed at the
root: `env.ts` is no longer reachable from the barrel, and Node entrypoints import
`@inspyr/shared/env` directly. A package imported by client code must not export Node-only
modules from its index.

---

## The stage engine

An account at 200 followers and one at 200,000 have almost nothing in common. Same
bottleneck? No. Same levers? No. Most tools give both the same advice, which is why they get
abandoned — and Inspyr was doing it too.

Everything now reads from `stagePolicy(stage, platform)`.

### Two dimensions, and they are not independent

**Stage:** 0–1k · 1k–10k · 10k–100k · 100k–1M · 1M+

**Platform kind** — the property that decides everything:

| Kind | Meaning | Platforms |
|---|---|---|
| `algorithmic` | every post gets tested on strangers regardless of your size | YouTube, TikTok, Instagram |
| `follower_gated` | reach is roughly bounded by who already follows you | X, LinkedIn, Threads |

Unknown platforms default to `follower_gated` — the safer error, because it stops Inspyr
promising reach it cannot deliver.

### The same stage produces opposite advice

```
0–1k on TikTok   [algorithmic]
  bottleneck  Nobody knows you exist, and you have no history to learn from
  do          Volume of genuinely different attempts
  don't       Reposting the same clip everywhere — platforms penalise verbatim duplicates
  cadence     7/week
  timeline    worth posting to

0–1k on LinkedIn [follower_gated]
  bottleneck  Your posts reach roughly the people who already follow you
  do          Replies under other people's posts — borrows their audience, works at zero
  don't       Posting to your own timeline — arithmetic, not strategy
  cadence     25/week (replies, not posts)
  timeline    NOT worth posting to
```

### And it changes as the account grows

```
youtube @       9   0_1k       7/wk   watch: did anything escape your follower count
youtube @   4,000   1k_10k     5/wk   watch: hit rate — share of posts that break out
youtube @  40,000   10k_100k   4/wk   watch: share of viewers who don't already follow you
youtube @ 400,000   100k_1m    6/wk   watch: portfolio performance, not single posts
```

Cadence goes **down** from 7 to 4 between 0–1k and 10k–100k, because volume stops being the
constraint and starts being the problem. A tool that pushes "post more" at every stage is
wrong at three of the four.

### It gates actions, not just ranks them

An action that cannot work at this stage is **blocked with a reason**, not ranked last:

```
Post to your own timeline — 9 followers on x — your timeline reaches about that
                            many people. Borrowed reach first.
```

And on follower-gated platforms early on, borrowed reach gets a 1.6× ranking boost — not a
preference, it is the only mechanism that reaches strangers there.

### Cold start is a stage, not an exception

`ownDataUseful` is false until the account has published at least 8 times on that platform.
Below that, Inspyr says so out loud rather than pretending its advice is personalised:

> Not enough of your own history yet, so this is based on how the platform works — not on
> what has worked for you. That changes as you publish.

### Never measures follower count

Asserted in tests. Followers are the scoreboard; they move too slowly and too noisily to
learn from. Every stage watches something faster and more precise.

---

## Zernio adapter — numbers without typing

Typing metrics in by hand does not survive contact with a real week. Zernio covers 16
platforms for $6 an account, two free, which is the difference between measuring one platform
and measuring all of them.

Behind `SocialProvider` (§11), so this is one file to replace, not a dependency.

### What it actually gives us

| | via Zernio |
|---|---|
| X, Instagram, TikTok | full — impressions, reach, likes, comments, shares, saves, clicks |
| YouTube | partial — demographics; retention still needs YouTube's own free API |
| LinkedIn | org pages only, video views only |

The mapping falls back **impressions → reach → views**, so a platform reporting only one of
them still normalises correctly against the baseline.

### The gap it does not close, and what we did about it

Zernio's documented analytics carry no `follows` and no `profile_visits` — the two numbers
that matter most for growth. Rather than show a silent zero, the adapter **reports what it
cannot provide**, and Inspyr keeps its own series instead: `account_snapshots` records the
follower count every sync, so growth is measurable by difference.

That series is honest about its limits — it cannot attribute a follow to a post, and the UI
says so:

> Measured by difference. Inspyr cannot say which post caused it, and does not pretend to.

It also feeds the stage engine: synced follower counts land in identity memory marked
`learned` rather than `user`, so measured and stated numbers stay distinguishable.

### Horizons

Metrics are bucketed by post age into 1h / 24h / 7d, so a fresh number never overwrites a
settled one. Posts under an hour old are skipped entirely.

### Without a key

Everything still works, manually, and the UI says which platforms could be automatic and
which never can. LinkedIn personal profiles are in the second group — no API exposes them, to
anyone.

---

## What was built

```
apps/web         Next.js 16 · React 19 · server actions · no client state library
apps/worker      BullMQ workers + a CLI cycle runner that needs no Redis
packages/shared  contracts (Zod), scoring math, fatigue math, text/dedupe utils
packages/db      Drizzle schema, tenant-scoping helpers, seed
packages/ai      LLMProvider interface, Anthropic provider, deterministic fallback
packages/ingestion  fetchers, normalization, dedupe, clustering
packages/ranking    the §7 ranker and the §8 operator learner
packages/channels   channel policies, the writer, the reviewer, ActionSpec generation
packages/pipeline   the cycle that wires them together, with tracing
```

**141 tests passing. Typecheck clean across all 9 projects. `next build` succeeds.**

---

## Decisions that departed from the spec, and why

### 1. `packages/pipeline` exists (not in the §11 layout)
The web app and the worker both need the pipeline. Apps importing apps is worse than one
more package.

### 2. No pgvector, no embeddings
`BUILD_SPEC_v0.1` §10 specifies pgvector. It is **not installed**: Homebrew ships pgvector
built only for PostgreSQL 17 and 18, the local server is 16, and building 0.8.6 from source
against 16 fails to compile on this toolchain.

It also is not needed yet. Milestone 1 dedupes and clusters with lexical cosine
(`packages/shared/src/text.ts`), which is appropriate at one workspace's daily volume, and
Anthropic has no embeddings endpoint — a real embedding provider (e.g. Voyage) would be a
new vendor decision. **Deferred to Milestone 2** with the `EmbeddingProvider` interface
already defined. The column was removed rather than left permanently null.

### 3. A relevance floor was added (`packages/ranking` → `RELEVANCE_FLOOR`)
Not in the spec. The first real run against Hacker News produced 30 opportunities scored
between 49.6 and 51.8 — ordering by noise while claiming to recommend. "I found 6 things
worth talking about today" is a promise; an opportunity matching no pillar, no audience term
and no stated priority is not proposed. It is still scored and still inspectable.

The consequence is honest and visible: with unrelated sources, Today says *"none of them
matched this workspace — today there is nothing here worth saying as AITorch"*.

### 4. Content enrichment was added to ingestion
Not in the spec, and required. Hacker News RSS delivers a title and the literal word
"Comments". Every component then computed against nothing. `enrichThinItems` fetches the
linked page when an item's body is under 240 characters. Bounded per cycle,
failure-tolerant — a paywall is not a cycle failure.

### 5. `prior_content` table added
§5.7-B content memory and §22's "import last 30–90 days". Without it, novelty and fatigue
have no baseline on day one and every recommendation looks equally new.

### 6. Model routing
`claude-haiku-4-5` for extraction, `claude-opus-5` for synthesis, per §18. Both overridable
via `INSPYR_MODEL_CHEAP` / `INSPYR_MODEL_STRONG`.

---

## Known limitations

**Heuristic topic extraction is weak, and it is the default.** With no `ANTHROPIC_API_KEY`,
understanding falls back to frequency and capitalisation heuristics. Consequence, observed
in a real run: an article titled *"Why your local LLM feels dumber than it is"* scored
`workspace_relevance = 7` against the pillar "inference engineering", because the literal
tokens did not overlap. It is genuinely relevant and Inspyr missed it. The LLM path fixes
this; the fallback exists so the loop runs, is testable, and stays cheap — not because it is
good. Opportunities produced this way are tagged `heuristic` in the UI.

**Nothing is published.** No calendar, no scheduler, no social adapters, no metrics. Per
§29, deliberately: none of it gets built until the operator says *"Inspyr found something I
genuinely want to publish."*

**Outcome learning does not exist yet.** All learning in M1 is operator learning
(skips / rejects / creates). This is the correct order — see ARCHITECTURE_v0.2 §9.

**No Growth Simulator.** ARCHITECTURE_v0.2 §5 is Milestone 2. `evidence_tier` and the
degradation rules are already wired so predictions have somewhere honest to land.

**No rate limiting, no CSRF beyond SameSite, no OAuth tokens yet.** §17 applies from
Milestone 2, when there is something to publish and a token to protect.

---

## Running it

```bash
# Postgres 16+ and Redis running locally
createdb inspyr && createdb inspyr_test
cp .env.example .env          # then edit SESSION_SECRET

npm install
npm run db:push               # schema → inspyr
npm run db:push:test          # schema → inspyr_test
npm run db:seed               # user + AITorch and Personal workspaces + sources

npm run dev                   # http://localhost:3111
npm run dev:worker            # optional; queue workers (needs Redis)

# one full cycle without Redis
npm run run-cycle --workspace=@inspyr/worker -- aitorch

npm test                      # 141 tests
npm run typecheck
npx tsx scripts/verify-loop.ts aitorch     # proves acceptance #12
npx tsx scripts/verify-create.ts aitorch   # proves per-channel drafting
npx tsx scripts/seed-tako.ts               # a real 9-follower account
npx tsx scripts/verify-conversations.ts    # replays a real failure through the gates
```

Seeded login: `you@inspyr.local` / `inspyr-dev-password`.

---

## Next — Milestone 2, continued

1. ~~Draft creation from an opportunity, native per platform (§5.4).~~ **Done.**
2. Publication state machine + calendar (§5.5) — manual-export mode first.
3. Metrics ingestion for whichever platform approves first.
4. Embeddings + pgvector, replacing lexical similarity.
5. ARCHITECTURE_v0.2 §5 Growth Simulator, shipping in the same PR as §10 calibration.

Step 2 is now unblocked: Create produces an approved draft, which is the thing a calendar
would schedule.

One caveat before building it. Everything above ran on the **heuristic** path — the drafts
in the verification output are scaffolds, not writing. Whether Create actually works is a
question about the model path, and answering it needs an `ANTHROPIC_API_KEY` and a session
of real dogfooding, not another feature.
