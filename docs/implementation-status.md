# Implementation status

**Milestone 1 — Source → Opportunity → Today.** Complete and verified end to end.
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

## What was built

```
apps/web         Next.js 16 · React 19 · server actions · no client state library
apps/worker      BullMQ workers + a CLI cycle runner that needs no Redis
packages/shared  contracts (Zod), scoring math, fatigue math, text/dedupe utils
packages/db      Drizzle schema, tenant-scoping helpers, seed
packages/ai      LLMProvider interface, Anthropic provider, deterministic fallback
packages/ingestion  fetchers, normalization, dedupe, clustering
packages/ranking    the §7 ranker and the §8 operator learner
packages/pipeline   the cycle that wires them together, with tracing
```

**45 tests passing. Typecheck clean across all 8 projects. `next build` succeeds.**

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

npm test                      # 45 tests
npm run typecheck
npx tsx scripts/verify-loop.ts aitorch    # proves acceptance #12
```

Seeded login: `you@inspyr.local` / `inspyr-dev-password`.

---

## Next — Milestone 2

In the order the spec argues for:

1. Draft creation from an opportunity, native per platform (§5.4).
2. Publication state machine + calendar (§5.5) — manual-export mode first.
3. Metrics ingestion for whichever platform approves first.
4. Embeddings + pgvector, replacing lexical similarity.
5. ARCHITECTURE_v0.2 §5 Growth Simulator, shipping in the same PR as §10 calibration.

Nothing in step 2 starts before step 1 produces something worth publishing.
