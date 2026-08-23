# Inspyr

> **Know what to say next.**

Inspyr is a self-learning growth engine. It watches what you build and what your market is talking about, works out what is actually worth saying, creates the right content for each channel, publishes it, and learns from what really happened.

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

## Repo

```
docs/
  ARCHITECTURE_v0.2.md    current architecture — Intelligence Layer, GTM Agent, Growth Simulator
  BUILD_SPEC_v0.1.md      product + engineering spec (§6–§9 superseded by v0.2)
  POSITIONING.md          positioning and category
```

Start with `docs/ARCHITECTURE_v0.2.md`. It states what it replaces.

---

## Status

Design-locked. Implementation not started.

First milestone: **source → opportunity → Today**, plus audience-fatigue modelling — enough that the operator says *"Inspyr found something I genuinely want to publish."*

That sentence is the first real milestone. Nothing about calendars or publishing gets built before it.

---

## Long term

Social is the proving ground because it gives many decision → outcome cycles per day. The same architecture extends to newsletter, SEO, community and outbound.

Today: **what should we say next?**
Eventually: **what should this company do next to grow?**

Category: **Adaptive GTM**.
