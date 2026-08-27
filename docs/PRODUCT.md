# Inspyr — product decisions

Everything settled so far, and why. Written down because it was spread across a long
conversation and kept getting re-litigated.

Where a decision reversed an earlier one, the earlier one is stated too. Knowing what was
rejected is most of the value.

---

## What it is

> **A growth engine that takes an account from 0 to 1,000 to 10,000 to 100,000, on the
> platforms the creator chooses, in one place, and gets better because it remembers.**

Customer-facing promise: **Know what to make next.**

## What it is not

| Not | Why |
|---|---|
| An analytics dashboard | *"I don't need to pay a tool to tell me it's not working."* Every platform shows you your own numbers free. Diagnosis is not a product. |
| A content generator | Generation is commodity. Your own spec §2 said so before the market proved it. |
| A video editor | Cardboard, CapCut, Opus. Different product, needs storage and a timeline UI. |
| A scheduler alone | That's the door in, not the thing. |
| An agency | Considered seriously — three separate sources argued for it. Declined. |

---

## Who it's for

**A creator who teaches something, roughly 500 to 50,000 followers**, on the platforms they
pick — one is fine, several is fine.

Brands later. A company is a creator whose objective is signups instead of subscribers, and
the reward weights already model that.

**Ruled out and why:**

| Audience | Verdict |
|---|---|
| Big creators (10M+) | That's Grocalo. Needs a service org, relationships, team. |
| B2B / LinkedIn marketers | **No API exposes personal LinkedIn analytics, to anyone.** Inspyr would be blind. |
| Founders at 0 followers | Real problem, but usually blocked on having something worth following — which software cannot fix. |

---

## The business

$1M a month. Not a unicorn.

| Price | Customers needed |
|---|---|
| $29 | 34,000 |
| **$79–99** | **~12,000** |
| $149 | 6,700 |

12,000 is reachable by one person. 34,000 is not.

---

## How growth actually works

Two terms, and they are different problems:

```
new followers = (strangers who see you) × (how many of them follow)
```

**Reach** is a threshold system. Every algorithmic platform tests a post on a small audience,
measures early signals, and expands if it clears a bar. You do not get reach proportional to
quality — you clear the bar or you get nothing.

**Conversion** is whether a stranger can predict what they'd get next. That's topic
consistency, not post quality.

And the diagnosis is available from numbers you already have:

| What you see | What's broken |
|---|---|
| 300 impressions, 0 follows | reach |
| 50,000 impressions, 2 follows | conversion |
| 300 impressions, 4 follows | neither — just small |

### Filter, don't forecast

Salganik and Watts's music-lab experiments: once quality clears a threshold, success is
driven by social influence and path dependence. Experts filter out failures reliably. Nobody
picks winners reliably.

> **Inspyr eliminates what won't work. It does not predict what will.**

This corrects `ARCHITECTURE_v0.2` §5: the simulator should predict the **floor**, not the
ceiling. *"This will fail because it's 639 replies deep"* — not *"this will get 1.6× saves."*

Same machinery, defensible claim.

---

## Stage is the organising principle

An account at 200 followers and one at 200,000 share no problems. Two dimensions, and they
interact:

**Stage:** 0–1k · 1k–10k · 10k–100k · 100k–1M · 1M+

**Platform kind:**
- `algorithmic` (YouTube, TikTok, Instagram) — tested on strangers regardless of your size
- `follower_gated` (X, LinkedIn) — reach bounded by who already follows you

Same stage, opposite advice:

```
0–1k TikTok     volume of distinct attempts · 7/week · post to your timeline
0–1k LinkedIn   replies under other people's posts · 25/week · do NOT post
```

Cadence falls from 7 to 4 between the first and third stage, because volume stops being the
constraint and becomes the problem. Any tool that says "post more" at every stage is wrong at
three stages out of four.

Built. See `packages/shared/src/stages.ts`.

---

## Cold start is the normal case

Not an edge case — every user starts here, and it is where tools get abandoned.

**In order:**

1. **Import their history.** Most people have posted before and nobody has ever analysed it.
   60 seconds, and it produces things they don't know about themselves. This solves most of
   the problem and needs no waiting.
2. **Read their work if there are no posts.** Repo, site, docs, notes. Produces "things only
   you can say" — which is also where the non-commodity content is (see Brokerage below).
3. **Mechanism.** Reach arithmetic, reply depth, fatigue. Works at n=0, needs no data ever.
4. **Accounts like theirs.** Free from public YouTube data. The only prior available at zero.
5. **Their own outcomes.** Takes over as it accumulates; prior weight shrinks to zero.

**What was rejected:** waiting for 20 posts before being useful. Nobody stays that long.

---

## Onboarding

**Paste a URL. That's it.**

Inspyr reads the last 50 posts, infers the pillars, and shows what it found. Configuration is
something you correct later, not something you fill in first.

Current onboarding — workspace, audience, voice, pillars, avoid-list, sources, run a cycle,
wait — is a wall of homework before any value. That's the first churn point.

---

## Layers: what we own and what we rent

| Layer | Decision |
|---|---|
| **Plumbing** — posting, metrics, comments | **Rent.** Zernio: 16 platforms, $6/account, two free. |
| **Production** — drafts, voice, captions | **Thin.** Commodity, and the platforms now penalise generic output. |
| **Intelligence** — what to make, what's broken, what's next | **Own.** This is the product. |

Priced by the market: plumbing $6, generation $29, intelligence $199.

---

## Acquisition

**Enter through the job people already search for. Keep them with the thing nobody else has.**

Nobody searches "know what to say next." They search "schedule posts", "buffer alternative",
"hootsuite alternative" — and Hootsuite costs $99–739/month.

- **Acquisition:** be a credible Buffer alternative. Zernio makes that possible in weeks.
- **Retention:** stage engine and memory. Why nobody leaves.

**Rejected:** audience-first. It works (Levels, Marc Lou) but takes 1–2 years and there is no
audience yet. BoloSign got 10,000 customers with no audience, no VC and no network by
capturing existing demand instead.

---

## Principles that have survived every revision

**Models predict. LLMs reason and explain.** No language model ever emits a metric, lift,
percentage or confidence value. Asserted in tests.

**Nothing writes a number unless it can name its evidence.** Below threshold, show ordering
and say why. A confident number at n=0 is a synthetic persona in a lab coat.

**Mechanism before statistics.** Reply depth past ~50 is invisible because platforms collapse
the tail. That needs zero training examples. Prefer mechanism wherever it exists.

**Learning has no training phase.** Priors updated online from observation one, not a batch
fit waiting for a dataset. *(This corrected an earlier design that proposed a classifier.)*

**Operator learning before outcome learning.** Skips and edits arrive daily; outcomes take
weeks. Build in that order.

**Never refuse without an alternative.** "Your timeline reaches 9 people" is correct and
useless on its own. Always name the best available action.

**Evidence is about groups, never about a person.**

---

## What "AI brain" means here

Not a chatbot. Four things:

1. **Remembers** — the top complaint about every AI content tool is *"the model doesn't
   remember the reference that worked."* That is the gap, and it's the whole thesis.
2. **Knows the stage** — advice changes as the account grows, automatically.
3. **Knows the market** — what's rising, what's saturated, what's untouched.
4. **Explains itself** — every score, every gate, traceable to evidence.

### Brokerage

Burt's research: what looks like taste is often structural position — living in worlds that
haven't been written down. An LLM already has every documented network.

So *"here's what's trending"* is commodity. **The valuable half is mining what the creator
knows and nobody has published.** That is what the work-reader is for.

---

## Open questions

- **Service or software.** Four independent sources argued for AI-native services. Declined
  for now. The maths stays true if it's revisited: 10 clients at $1,500 = $15k/month.
- **Which platform first.** Decided against YouTube-only. Data depth still differs sharply by
  platform and the product must be honest about that.
- **Taxonomy.** Flat token topics are the known weak point. Enterpret's adaptive taxonomy is
  the fix. Not built.

---

## Built so far

Stage engine · opportunity ranking with persisted components · conversation gates ·
per-channel drafts · voice · publications and outcome normalisation · operator learning ·
Zernio adapter · full agent traces.

141 tests. `docs/implementation-status.md` has the honest version, including what doesn't
work.

## Not built

Calendar and publishing · taxonomy · YouTube retention · work-reader · captions and cut list
· paste-a-URL onboarding.
