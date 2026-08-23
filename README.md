# Inspyr

> **Know what to say next.**

Inspyr is a self-learning growth engine. It watches your work and your market, works out what is actually worth saying, creates the right content for each channel, publishes it, and learns from what really happened.

A scheduler asks *"what would you like to post?"*

Inspyr opens with:

> **"I found 6 things worth talking about today. Here is the one I'd publish first — and why."**

---

## The loop

Customer-facing:

```
Watch → Decide → Create → Publish → Measure → Learn → Repeat
```

Underneath:

```
Listen → Model → Simulate → Act → Evaluate → Learn
```

**Learning means something specific here:** a previous action and its real outcome must change a future recommendation. Analytics tells you what happened. Inspyr changes what it does next.

---

## How it's built

```
INTELLIGENCE LAYER     public market signals + your own data + audience cohorts
        ↓
GTM AGENT              what should we do next?
        ↓
GROWTH SIMULATOR       what happens if we do X?
        ↓
CHANNEL AGENTS         X · LinkedIn · Instagram · YouTube
        ↓
EXECUTION HARNESS      permissions · approval · retries
        ↓
EVALUATOR              what actually happened, and was the prediction right?
        ↓
LEARNING ENGINE        update policy, cohorts, and the model itself
```

Three rules govern the whole thing:

1. **Models predict. LLMs reason and explain.** No language model ever writes a metric.
2. **Nothing writes a number unless it can name its evidence.** Below threshold, Inspyr ranks without predicting, and says so.
3. **Evidence is about groups, never about a person.**

---

## Running it

Needs PostgreSQL 16+ and (optionally) Redis running locally.

```bash
createdb inspyr && createdb inspyr_test
cp .env.example .env          # then edit SESSION_SECRET

npm install
npm run db:push               # schema
npm run db:push:test
npm run db:seed               # user + two workspaces with different strategies

npm run dev                   # http://localhost:3111
```

Sign in as `you@inspyr.local` / `inspyr-dev-password`, then run one cycle:

```bash
npm run run-cycle --workspace=@inspyr/worker -- aitorch
```

`ANTHROPIC_API_KEY` is optional. Without it Inspyr falls back to deterministic heuristics so
the whole loop still runs — lower quality, clearly labelled in the UI, never silently.

```bash
npm test                                  # 91 tests
npm run typecheck
npx tsx scripts/verify-loop.ts aitorch    # proves a decision changes the next ranking
npx tsx scripts/verify-create.ts aitorch  # proves each channel gets its own artefact
```

---

## Repo

```
apps/web            Next.js 16 · React 19 · server actions
apps/worker         BullMQ workers + a CLI cycle runner that needs no Redis
packages/shared     contracts (Zod), scoring math, fatigue math, text utils
packages/db         Drizzle schema, tenant scoping, seed
packages/ai         provider interface, Anthropic provider, deterministic fallback
packages/ingestion  fetchers, normalization, dedupe, clustering
packages/ranking    the ranker and the operator learner
packages/channels   channel policies, writer, reviewer, action specs
packages/pipeline   the cycle that wires them together, with tracing

docs/
  ARCHITECTURE_v0.2.md      Intelligence Layer, GTM Agent, Growth Simulator
  BUILD_SPEC_v0.1.md        product + engineering spec (§6-§9 superseded by v0.2)
  implementation-status.md  what is actually built, and what is not
  POSITIONING.md
```

---

## Status

**Milestone 1 is done:** source → opportunity → ranked Today queue, with audience-fatigue
modelling and operator learning. A decision made today measurably changes tomorrow's
ranking — verified against the real database, not only in a unit test.

**Conversations are done:** below ~300 followers, posting to your own timeline is not
distribution — it is arithmetic. Inspyr says so plainly, and instead judges which live
conversations are worth entering, with hard gates on reply depth, staleness, author reach and
whether you have anything concrete to add. Gates come from how the platforms work, not from a
training set.

**Create is done:** one opportunity becomes four genuinely different native artefacts — an X
thread, a LinkedIn post, an Instagram carousel, a YouTube explainer — each with its own
action space, constraints and reward function. Switching channel is not a reformat. Every
edit you make is measured and stored, because how much you rewrite is the sharpest signal
the system gets.

**Nothing is published yet.** No calendar, no scheduler, no social adapters. Deliberately:
none of that gets built until the operator says *"Inspyr found something I genuinely want
to publish."*

See `docs/implementation-status.md` for the honest version, including what does not work.

---

## Long term

Social is the proving ground because it gives many decision → outcome cycles per day. The same architecture extends to newsletter, SEO, community and outbound.

Today: **what should we say next?**
Eventually: **what should this company do next to grow?**

Category: **Adaptive GTM**.
