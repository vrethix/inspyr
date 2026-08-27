# Inspyr — Architecture v0.2
### The Intelligence Layer, the GTM Agent, and the Growth Simulator
**Status:** design-locked, not yet implemented
**Date:** August 2026
**Relationship to v0.1:** this document **replaces §6, §7, §8 and §9** of `BUILD_SPEC_v0.1.md` and **amends §5, §12, §13, §16, §21, §28**. Every other section of v0.1 stands unchanged.

---

# 0. What changed and why

v0.1 specified a deterministic pipeline:

```
ingest → understand → scout → rank → plan → write → review → publish → collect → learn
```

That pipeline is correct. It was mislabelled. It is not the product's reasoning — it is the product's **harness**. v0.2 keeps every worker in it and adds three things v0.1 did not have:

1. An **Intelligence Layer** underneath everything, so the system reasons about a *modelled environment* rather than a stream of source items.
2. A **Growth Simulator** between *decide* and *act*, so Inspyr predicts before it publishes.
3. A **calibration loop**, so prediction-versus-reality — not engagement — becomes the measure of whether Inspyr is actually learning.

The customer-facing promise does not change:

> ## Know what to say next.

The system underneath becomes:

> ## Listen → Model → Simulate → Act → Evaluate → Learn

---

# 1. Core principles

These five rules govern every design decision below. If an implementation violates one, the implementation is wrong.

### 1. Models predict. LLMs reason and explain.
An LLM must never emit a KPI, a lift multiple, a percentage or a confidence value. Numbers come from the prediction layer; the LLM receives them and explains *why*. A generated draft containing a fabricated metric is a build failure.

### 2. Nothing writes a number unless it can name its evidence.
Every `Prediction` carries an `evidence_basis` — sample size and tier (`workspace` / `channel_baseline` / `category_prior` / `none`). Below threshold, Inspyr shows **ranked ordering with no point estimate** and says so plainly. A confident-looking number with n=0 is a synthetic persona wearing a lab coat.

### 3. Evidence is about groups, never about a person.
Audience modelling produces **behavioral cohorts** with aggregate response patterns. Inspyr never claims "this named follower will like this." It says "technical builders in your audience historically respond to architecture explainers." This is both more defensible and more accurate.

### 4. Agents decide. Tools execute. The harness controls. Learning improves.
Nothing is an agent by default. Publishing, OAuth, metric ingestion, scheduling, ranking math and storage are deterministic services. Agents are thin policy layers above them.

### 5. Publishing is never an unsupervised model decision.
Autonomy is a per-channel, per-workspace setting with explicit confidence floors and rate caps. Default is `approve`.

---

# 2. Layer map

```text
                              INSPYR

  ┌──────────────────────────────────────────────────────────────┐
  │                     INTELLIGENCE LAYER                       │
  │                                                              │
  │   MARKET INTELLIGENCE          FIRST-PARTY INTELLIGENCE      │
  │   public conversation          your posts / analytics        │
  │   topic velocity               edits / rejects / skips       │
  │   saturation & whitespace      product releases / GitHub     │
  │   reference-account activity   website / notes / feedback    │
  │   emerging formats & hooks     conversions (later)           │
  │                                                              │
  │              ▼                            ▼                  │
  │                    AUDIENCE MODEL                            │
  │            behavioral cohorts + current state                │
  └──────────────────────────────┬───────────────────────────────┘
                                 ▼
                            GTM AGENT
                   "What should we do next?"
             generates candidate ActionSpecs per workspace
                                 ▼
                        GROWTH SIMULATOR
                   "What happens if we do X?"
          expected reward + uncertainty + evidence basis
                                 ▼
                      DECISION  (exploit | explore | decline)
                                 ▼
        ┌────────────────┬───────┴────────┬────────────────┐
        ▼                ▼                ▼                ▼
    X AGENT       LINKEDIN AGENT    INSTAGRAM AGENT   YOUTUBE AGENT
        │                │                │                │
        └────────────────┴───────┬────────┴────────────────┘
                                 ▼
                        EXECUTION HARNESS
              permissions · approval · idempotency · retry
                                 ▼
                           REAL OUTCOME
                                 ▼
                         EVALUATOR AGENT
              what happened · why · prediction vs reality
                                 ▼
                         LEARNING ENGINE
        strategy signals · cohort updates · model calibration
                                 ↺
```

---

# 3. Layer 1 — Intelligence Layer

The Intelligence Layer is **not an agent**. It is a continuously-maintained model of the environment, built by deterministic workers with bounded LLM steps. Everything above it reads from it; nothing above it queries the raw internet directly.

Its job is to answer three questions at any moment, without being asked:

1. **What is happening?** (market)
2. **What do we know and own?** (first-party)
3. **Who is actually listening, and what do they respond to?** (audience)

## 3.1 Market Intelligence

**Inputs (V0):** user-configured sources from v0.1 §5.2 — RSS, websites, GitHub releases, YouTube channels, research feeds, reference/competitor accounts where API terms permit, manual URLs and notes.

**Derived, per topic, on a rolling window:**

| Signal | Definition | Method |
|---|---|---|
| `velocity` | rate of change in mention volume across watched sources | deterministic count over windows (7d vs 28d) |
| `saturation` | how many watched reference accounts have already covered it | dedupe by story cluster, count distinct sources |
| `angle_coverage` | which angles are taken vs untaken for a story | cluster item embeddings, label angles with a cheap model |
| `whitespace` | high audience relevance × low saturation | computed, not generated |
| `novelty_window` | estimated hours before saturation | decay curve fit on historical clusters |
| `format_signal` | which formats are performing for this topic class | from own + baseline data only |

**Rule:** velocity, saturation and whitespace are **computed from counted evidence**. An LLM may label and cluster; it may not assert that something is trending.

**Output record:** `market_signals` (see §13).

## 3.2 First-party Intelligence

Everything Inspyr knows because it belongs to the workspace:

- published content + full text + features (v0.1 §8.2 feature vector)
- normalized performance per publication
- operator behaviour: approvals, skips, rejects, edits, hook changes, tone changes, reschedules
- product surface: GitHub releases, changelog, website diffs, notes, transcripts
- audience size and trajectory per channel
- conversions where measurable

This is the eventual moat and the slowest-filling asset. It is also the only tier of evidence that never needs a caveat.

## 3.3 Audience Model — behavioral cohorts

Instead of "AITorch has 12k followers," Inspyr maintains something like:

```text
AITorch — engaged audience composition

AI learners                34%
working AI engineers       26%
technical founders         18%
students                   12%
research-heavy             10%
```

**Cohorts are behavioral, not demographic.** A cohort is defined by observed interaction patterns and public professional signal, never by inferred personal attributes.

### How cohorts are actually observed

This is the part that must be built before any cohort prediction is allowed:

| Mechanism | Gives you | Availability |
|---|---|---|
| comment/reply author classification | cohort of people who engaged in text | X, LinkedIn, YouTube, IG |
| repeat-engager tracking | high-signal core audience | all |
| follower-sample classification | composition of who follows | where API permits |
| YouTube traffic source + subscriber delta | intent and conversion by entry path | YouTube |
| link-click destination behaviour | downstream intent | where instrumented |

### The honest caveat, which must appear in the UI

> **The cohort model describes your *engaged* audience, not your reach.** Silent impressions are unattributable on every major platform.

Inspyr must never present cohort percentages as audience-wide truth. Reach-level claims stay aggregate.

### What is learned per cohort

- topics of interest
- tolerable technical depth
- formats responded to
- conversion behaviour (follow / save / subscribe / click)
- response latency

### Cohort gating rule

**A cohort may not be used in prediction until it has been observed.** Concretely: no cohort-conditioned prediction until that cohort has ≥ N classified interactions (starting parameter: N = 50) across ≥ M publications (starting: M = 8). Before that, cohorts are display-only context, clearly marked *provisional*.

Rationale: a per-cohort prediction that can never be verified against observation violates Principle 2. Unfalsifiable prediction is the persona trap in a suit.

## 3.4 Audience state — the one thing that works at n=0

Audience response is **not stationary**. Five robotics posts in a row degrades the sixth even when robotics is the workspace's strongest topic.

Inspyr therefore models *state*, not historical averages. This requires no ML and works from day one:

```
fatigue(topic)  = Σ over recent publications of  w(topic_similarity) · decay(age)
fatigue(format) = same, over format
fatigue(hook)   = same, over hook type
```

Applied as a bounded penalty in both ranking and simulation. This is the earliest source of genuinely non-obvious recommendations:

> "Robotics is your best-performing topic **and** you should not post robotics today."

**Build this in week 1.** It is cheap, deterministic, demoable, and it is the first thing that makes Inspyr look like it is thinking.

## 3.5 Intelligence Layer outputs

The layer publishes typed records only. Nothing above it parses prose.

```
market_signals        topic velocity / saturation / whitespace / novelty window
audience_cohorts      composition + learned response profile + observation counts
audience_state        current fatigue vectors per workspace
workspace_baselines   rolling platform-relative baselines (v0.1 §8.3)
strategy_signals      learned effects (v0.1 §8.4)
```

---

# 4. Layer 2 — GTM Agent

One agent. Not twelve. Its job is **strategy and orchestration**, never writing.

### Responsibilities

1. Read goal + workspace state + intelligence layer.
2. Decide whether today warrants action at all. *(Declining to publish is a valid, and sometimes correct, output.)*
3. Generate **candidate ActionSpecs** — not drafts.
4. Submit them to the Growth Simulator.
5. Choose: exploit, explore, or decline.
6. Sequence and delegate to channel agents.
7. Request approval for consequential actions.

### ActionSpec — the unit the whole system trades in

An ActionSpec is a **decision, fully described, with no content written yet**:

```yaml
action_spec:
  workspace_id:      ws_aitorch
  opportunity_id:    opp_8812
  channel:           youtube
  action_type:       explainer_video      # post | thread | quote | reply | carousel | reel | explainer_video | ...
  angle:             cross_embodiment_implication
  hook_type:         question
  format:            long_form
  length_bucket:     8_12_min
  cta_type:          subscribe
  target_cohorts:    [ai_engineers, technical_founders]
  timing:            2026-08-24T09:10:00-07:00
  objective:         subscriber_conversion
  evidence_ids:      [si_441, si_447]
```

This matters enormously for cost: **the simulator scores ActionSpecs, not drafts.** No generation happens before the decision. See §12.

### Tool registry

```
Intelligence      get_market_signals, get_audience_model, get_audience_state,
                  get_workspace_memory, get_prior_content, get_strategy_signals
Decision          rank_opportunities, simulate_actions, create_experiment
Creation          delegate_to_channel_agent, evaluate_content
Execution         schedule_publication, publish_content        [permission-gated]
Observation       fetch_metrics, fetch_engagement, get_calibration
```

Every tool call is persisted to `agent_steps`. That trace is simultaneously the observability story, the "Why did you say this?" UI, and the eval substrate.

---

# 5. Layer 3 — Growth Simulator / Counterfactual Engine

> **AMENDED — see `PRODUCT.md`, "Filter, don't forecast."**
>
> This section as originally written has the simulator predicting expected reward, i.e. which
> action will do *best*. Salganik and Watts's music-lab experiments say that is not reliably
> possible: once quality clears a threshold, success is driven by social influence and path
> dependence. Experts filter out failures reliably; nobody picks winners reliably.
>
> So the simulator predicts the **floor, not the ceiling**. *"This will fail because it is 639
> replies deep"* is defensible. *"This will get 1.6× saves"* is not.
>
> Everything below stands — the ActionSpec unit, the evidence tiers, the degradation rules,
> the explore/exploit budget, the calibration loop. Only the claim changes. In practice that
> means the high-confidence output is **elimination**, and ranking among survivors stays
> deliberately low-confidence, which is what the degradation rules in §5.5 already enforce.

## 5.1 What it actually is

At V0 this is a **contextual bandit over ActionSpecs**, not a simulation of people. Naming it accurately matters: it gives you Thompson sampling / UCB off the shelf instead of hand-rolled scoring, and it forces explicit explore/exploit budgeting.

```
ActionSpec[]  →  Simulator  →  Prediction[]  →  GTM Agent decision
```

## 5.2 Input

The v0.1 §8.2 feature vector, plus intelligence-layer context:

```
topic · angle · hook_type · format · channel · length_bucket · cta_type
· media_type · time_bucket · objective
+ workspace baselines
+ strategy signals
+ audience state (fatigue)
+ market saturation / novelty window
+ cohort response profile   [only when unlocked per §3.3]
```

## 5.3 Output

```yaml
prediction:
  action_spec_id:   as_5521
  metric:           follow_lift
  point_estimate:   1.42          # null when evidence tier is insufficient
  interval:         [1.10, 1.73]
  confidence:       0.71
  evidence_basis:
    tier:           workspace     # workspace | channel_baseline | category_prior | none
    sample_size:    23
    window:         45d
    contributors:   [sig_topic_robotics, sig_hook_question, baseline_x_30d]
  rank:             1
  rationale_inputs: { ... }        # structured; the LLM renders prose FROM this
```

## 5.4 Evidence tiers and shrinkage

Predictions blend four tiers, weighted by evidence. As workspace evidence accumulates, prior weight decays to zero — empirical Bayes, cheap to implement, honest by construction.

| Tier | Source | Weight behaviour |
|---|---|---|
| `workspace` | this workspace's own outcomes | grows with n |
| `channel_baseline` | this workspace's rolling platform baseline | moderate, stable |
| `category_prior` | hand-authored heuristics for the account category | **decays to 0 as workspace n grows** |
| `none` | nothing | forces degraded output, see §5.5 |

**`category_prior` must declare its source.** At n=1 user, Inspyr has no cross-account network effect. These are hand-authored, labelled heuristics — not "data." They are never presented as learned. Scraped third-party performance data is out of scope for V0 (v0.1 §17 compliance).

## 5.5 Degradation rules — non-negotiable

| Evidence state | What Inspyr may show |
|---|---|
| `sample_size ≥ 12` in-tier | point estimate + interval + confidence |
| `4 ≤ sample_size < 12` | interval only, marked *low confidence* |
| `sample_size < 4` or tier = `none` | **ranked ordering only, no numbers**, plus explicit "not enough evidence yet — this is an experiment" |

*(Thresholds are starting parameters, to be tuned against calibration data, not constants of nature.)*

The third row is what you will ship in week one. Design the UI for that row first; the other two are the graceful upgrade.

## 5.6 Explore vs exploit

Greedy exploitation on a cold model permanently encodes week-one noise. Exploration is therefore budgeted, not incidental:

```
if  best_prediction.confidence ≥ exploit_floor
    and  margin_over_second ≥ margin_floor:
        EXPLOIT  → choose highest expected reward
else:
        EXPLORE  → emit Experiment (v0.1 §9), choose to LEARN not to WIN
```

Starting parameters: exploration share ≈ 30% of publications in weeks 1–6, decaying toward ≈ 10% as calibration improves. Exploration selection uses Thompson sampling over the candidate set.

**Uncertainty routes to experiment.** This is the elegant consequence of Principle 2: when the simulator cannot rank confidently, the correct output is not a guess — it is a designed test. Inspyr should be able to say, in the UI:

> "I am publishing this because I don't know whether question hooks or statement hooks work for your engineer cohort. This is a test, not a recommendation."

Uncertainty is a product feature, stated out loud.

## 5.7 Counterfactual queries (V1)

Once base prediction is calibrated, the same engine answers user-initiated what-ifs:

```
What if we change the hook to a statement?
What if we publish this on LinkedIn instead?
What if we wait six hours?
What if this were a video?
```

Implementation: mutate one field of the ActionSpec, re-score, present the delta. No new machinery — this is why the ActionSpec abstraction is worth the discipline.

## 5.8 Explicitly deferred

- **Synthetic audience populations.** Not V0, not V1. Entry condition: base prediction is calibrated (Brier improvement over baseline sustained ≥ 4 weeks) **and** cohort observation is live per §3.3. Until then it is impressive-looking and unvalidatable.
- **Cross-workspace / cross-account priors.** Requires a user base that does not exist yet.

---

# 6. Layer 4 — Channel agents

X, LinkedIn, Instagram and YouTube are genuinely different environments — different action spaces, different native formats, different reward functions. They are **not** different codebases.

One Channel Agent runtime loads a `ChannelPolicy` record:

```yaml
channel_policy:
  channel:        x
  action_space:   [post, thread, quote_post, reply_sequence, no_action]
  constraints:    { max_len: 280, thread_max: 25, media: [image, video, gif] }
  system_prompt:  <channel-native craft instructions>
  reward_weights:                       # ← the real differentiator
    follow_lift:      0.35
    save_lift:        0.25
    reply_lift:       0.20
    reach_lift:       0.20
  learned_signals:  <strategy_signals scoped to this channel>
```

### Amendment to v0.1 §8.3

v0.1 defines one goal-weighted `OutcomeScore` per workspace objective. **That is now per channel × objective.** YouTube's reward is CTR × retention × subscriber conversion. X's is follow conversion + saves + replies. Instagram's is saves + completion + discovery. This single schema change is what makes them meaningfully distinct agents; an org chart would not have.

### `no_action` is a first-class action

Every channel's action space includes it. "The best X action for this opportunity is to reply to three existing discussions and not post" is a legitimate, valuable output.

---

# 7. Layer 5 — Execution harness

Unchanged from v0.1 §5.5 and §13, plus:

### Autonomy levels — per workspace × channel

```yaml
autonomy:
  level:               approve        # suggest | approve | auto
  confidence_floor:    0.90           # auto only
  max_per_day:         2
  blocked_when:        [unsupported_claim, novelty_low, fatigue_high]
```

Default `approve` everywhere. `auto` is schema-supported from day one but UI-hidden until calibration justifies it. Never ship `auto` before §10 shows the predictions are trustworthy.

### Approval surface

```
Recommended: X thread, 9:10 AM
Expected:    follow_lift 1.42× [1.10–1.73], 71% confidence
Basis:       23 comparable posts, 45d window
Why:         <LLM explanation generated FROM the structured prediction>
[ Approve ]  [ Modify ]  [ Decline ]  [ Why did you say this? ]
```

Retries, idempotency keys, DLQ, delivery logs and the `auto_publish` / `manual_publish` / `integration_pending` distinction all carry over from v0.1 unchanged.

---

# 8. Layer 6 — Evaluator

Runs at fixed horizons after publication (starting: 1h, 24h, 7d; YouTube also 28d).

Produces, per publication:

- normalized outcome scores vs baseline (v0.1 §8.3)
- **prediction error** — the important one
- attribution hypothesis: which feature plausibly drove the result
- operator signal: was it edited, and how much

The evaluator's output is not "this was a good post." It is closer to:

> Topic was strong. Hook outperformed workspace baseline materially. Instagram visual structure underperformed. YouTube title worked; retention dropped in section two.

Both deterministic metrics and a bounded LLM-as-judge step, with the judge receiving computed numbers and never producing them.

---

# 9. Layer 7 — Learning engine

Two loops, running at different speeds:

### Fast loop — operator learning (days)
Skips, rejects, edits, hook changes, tone changes, reschedules. At 1–3 publications/day you will generate dozens of these events daily.

### Slow loop — outcome learning (weeks)
Performance-derived `strategy_signals` with EWMA, minimum sample thresholds, confidence intervals and shrinkage toward zero (v0.1 §8.4, unchanged).

### Ordering consequence — important

**Operator memory is the week-3 learning story. Outcome memory is the week-8 one.**

v0.1 acceptance criterion #12 ("yesterday's result visibly changes today's ranking") will be satisfied by *rejection affinity* long before engagement lift has the sample size to fire. Build in that order, and say so publicly. "I skipped funding news six times and Inspyr down-ranked the topic" is a genuine closed loop, demoable on day ten.

### Third update target — the model itself
Beyond ranking policy and cohort profiles, the learning engine updates **prediction model parameters** using observed error. This is what makes §10 possible.

---

# 10. Calibration — the actual product artifact

The most important number in Inspyr is not engagement. It is:

> **How often is Inspyr right about what will work?**

## 10.1 Recorded per prediction

```
prediction_records
  action_spec_id, metric, predicted_value, predicted_interval, confidence,
  evidence_tier, sample_size,
  observed_value, error, in_interval (bool), horizon, evaluated_at
```

## 10.2 Computed continuously

- **Directional accuracy** — did the chosen action beat the alternatives, as predicted?
- **Interval coverage** — do 70%-confidence intervals contain truth ~70% of the time?
- **Brier / log score** vs. two baselines: (a) always-predict-baseline, (b) random ordering.
- **Calibration curve** per evidence tier, per channel.

## 10.3 Why this is V0 and not V2

Three reasons:

1. **It is the only honest proof the loop works.** Everything else is vanity.
2. **It is the content engine.** v0.1 §23 asks for a repeating "what Inspyr learned" series. "Inspyr's predicted ranking matched reality 58% of the time in week 2 and 79% in week 7" is the strongest thing this product will ever publish about itself — and showing the 58% is what makes the 79% believable.
3. **It gates autonomy.** `auto` publishing is indefensible without it.

**Rule:** if calibration is not being recorded, the simulator is not shipped. They are one feature.

---

# 11. Cold-start ladder — what is actually real, and when

| Week | Intelligence | Simulator | Learning |
|---|---|---|---|
| 1 | sources → items → topics; **audience state / fatigue live** | ranked ordering only, no numbers | — |
| 2 | market velocity + saturation counts | ordering + explicit uncertainty; experiments emitted | operator events recorded |
| 3 | whitespace detection; Pulse v1 | prediction records written for every decision | **operator learning changes ranking** |
| 4–6 | cohort *observation* begins (classification of engagers) | intervals appear where n permits | first outcome-derived strategy signals |
| 7–10 | cohort profiles unlock per §3.3 gate | point estimates; first calibration curve published | model parameters updated from error |
| 10+ | cross-channel cohort view | cohort-conditioned prediction; counterfactuals | autonomy considered, gated on calibration |

Nothing in weeks 1–3 requires a trained model. Everything in weeks 1–3 is demoable.

---

# 12. Cost model

v0.1 §18 stands. Two additions that make this architecture affordable:

### 1. Simulate specs, not drafts
Scoring an ActionSpec is a feature-vector lookup plus arithmetic. **Zero LLM calls.** Generating four candidate drafts across two workspaces to compare them would be ~8 expensive generations per opportunity per day; scoring their specs is effectively free. Drafts are generated only *after* the decision, for the chosen action.

This preserves v0.1 §14's "do NOT generate all drafts yet" and is what makes running the simulator on every opportunity, every day, viable.

### 2. Where LLM calls actually occur

| Step | Model tier | Frequency |
|---|---|---|
| source understanding / extraction | cheap | per new item, cached by content hash |
| clustering + angle labelling | cheap | per cluster |
| GTM agent planning | strong | once per workspace per cycle |
| explanation of predictions | cheap–mid | per surfaced decision |
| draft generation | strong | **only on chosen action** |
| quality review | mid | per draft |
| evaluator judgement | mid | per publication × horizon |

Velocity, saturation, fatigue, ranking, prediction and calibration are all **arithmetic**. Do not spend tokens computing what SQL can compute.

---

# 13. Schema additions

Additive to v0.1 §12. Every table carries `workspace_id` and is tenant-scoped.

```sql
market_signals
  id, workspace_id, topic_key, cluster_id,
  velocity, saturation_count, saturating_sources_json,
  angle_coverage_json, whitespace_score, novelty_window_hours,
  window_start, window_end, computed_at

audience_cohorts
  id, workspace_id, key, label, share_estimate,
  observation_count, publication_count, unlocked (bool),
  interests_json, depth_tolerance, format_response_json,
  conversion_profile_json, provisional (bool), updated_at

cohort_observations
  id, workspace_id, cohort_key, publication_id, channel_id,
  interaction_type, signal_source, confidence, observed_at

audience_state
  id, workspace_id, dimension,        -- topic | format | hook | cta
  key, fatigue_score, last_used_at, decay_params_json, computed_at

action_specs
  id, workspace_id, opportunity_id, channel, action_type, angle,
  hook_type, format, length_bucket, cta_type, target_cohorts_json,
  timing, objective, evidence_ids_json, feature_vector_json,
  status,                             -- candidate | chosen | declined | published
  created_at

predictions
  id, action_spec_id, metric, point_estimate, interval_low, interval_high,
  confidence, evidence_tier, sample_size, evidence_window,
  contributors_json, rank, model_version, created_at

prediction_records
  id, prediction_id, publication_id, horizon,
  observed_value, error, in_interval, evaluated_at

calibration_snapshots
  id, workspace_id, channel, evidence_tier, window_start, window_end,
  directional_accuracy, interval_coverage, brier_score,
  baseline_brier, sample_size, computed_at

channel_policies
  id, workspace_id, channel, action_space_json, constraints_json,
  system_prompt, reward_weights_json, autonomy_json,
  version, active, updated_at

agent_runs
  id, workspace_id, trigger, goal, state, started_at, ended_at,
  token_cost, error_json

agent_steps
  id, agent_run_id, seq, agent_role, tool_name,
  input_json, output_json, model, prompt_version,
  latency_ms, token_cost, status, created_at
```

### Amendments to existing v0.1 tables

- `strategy_signals` — add `channel` (nullable) so signals can be channel-scoped.
- `publications` — add `action_spec_id`.
- `experiments` — add `origin` (`agent_uncertainty` | `user_defined`) and `triggering_prediction_id`.
- `opportunities` — add `market_signal_id`.

---

# 14. Background jobs

Added to v0.1 §13:

```
market-signal-compute       velocity / saturation / whitespace, windowed
audience-state-compute      fatigue decay, cheap, frequent
cohort-observe              classify engagers from comments/replies/subscribers
cohort-profile-update       recompute cohort response profiles, gated
simulate-actions            score candidate ActionSpecs
prediction-evaluate         join predictions to observed outcomes at each horizon
calibration-compute         rolling calibration snapshots
policy-update               apply learning to ranking + channel policies + model params
```

All idempotent, workspace-scoped, DLQ on permanent failure — v0.1 §13 rules unchanged.

---

# 15. API additions

Added to v0.1 §16:

```
GET   /api/pulse                        market + audience + whitespace, per workspace
GET   /api/pulse/topics/:key            drill-down: velocity, saturation, coverage
GET   /api/audience/cohorts
GET   /api/audience/state

POST  /api/actions/candidates           generate ActionSpecs for an opportunity
POST  /api/actions/simulate             score candidates → predictions
POST  /api/actions/:id/counterfactual   mutate one field, re-score        [V1]
POST  /api/actions/:id/choose

GET   /api/calibration                  accuracy over time, by tier and channel
GET   /api/agent-runs/:id               full trace: steps, tools, costs
```

---

# 16. UI — Pulse, and the honesty rules

## 16.1 Pulse — "What Inspyr is hearing"

A new primary surface, inserted in v0.1 §5 navigation between **Today** and **Sources**. It is not a trends dashboard; it is the *evidence behind today's queue*.

```
RISING
  Physical prompting                    +184% conversation velocity
                                        12 of 40 watched sources, 7 days

SATURATED
  GPT-5 benchmarks                      47 reference accounts covered it
                                        announcement angle: fully taken

WHITESPACE
  Cross-embodiment implication          high relevance · low saturation
                                        novelty window ≈ 14h remaining

YOUR AUDIENCE
  AI engineers are interacting disproportionately with robotics
  content this week (engaged audience; not reach)

FATIGUE
  Robotics posted 4 of last 5 days — expect diminished response

RECOMMENDATION
  Don't cover the model announcement.
  Explain the cross-embodiment implication.
```

Every number on this page must be clickable through to its counted evidence. Pulse is where "why did Inspyr find this?" gets answered before the user has to ask.

## 16.2 Honesty rules for every prediction surface

1. Never render a point estimate the evidence tier does not permit (§5.5).
2. Always show sample size next to a prediction.
3. Distinguish visually: **You told Inspyr** / **Inspyr learned** / **Inspyr is guessing from a prior**.
4. Label experiments as experiments, in the user's line of sight.
5. Cohort figures always carry the *engaged audience, not reach* qualifier.
6. Show calibration history where predictions are shown — including the bad weeks.

## 16.3 Growth page — amended

v0.1 §5.6 leads with "what Inspyr learned." v0.2 adds, above it:

> **How often Inspyr was right.** Directional accuracy this week vs. last, with the misses listed.

---

# 17. Revised engineering rules

Replaces v0.1 §28 rules 15, and adds 21–29.

15. **Agents decide. Tools execute. The harness controls. Learning improves.** Publishing is never an unsupervised model decision. Prefer one orchestrator with a clean tool surface over a tree of agents; split only when action space *and* reward function genuinely differ.
21. An LLM may never emit a KPI, lift, percentage or confidence value. Structured prediction in, prose out.
22. Every prediction persists its `evidence_basis`. No basis, no number.
23. The simulator scores ActionSpecs. Draft generation happens only after a decision.
24. Calibration recording ships with the simulator, in the same PR. Neither is complete alone.
25. Cohort-conditioned prediction is blocked until the cohort's observation gate (§3.3) passes.
26. `category_prior` values are hand-authored, labelled as such in the UI, and shrink to zero as workspace evidence grows.
27. Exploration is budgeted explicitly. A purely greedy policy is a bug.
28. Every agent step — tool, input, output, model, prompt version, cost, latency — is persisted to `agent_steps`.
29. Any surface that shows a prediction must be able to show the sample size behind it in one click.

---

# 18. Revised build order

Replaces v0.1 §21 weeks 1–3. Week 4 (public alpha) unchanged.

### Week 1 — the environment model
monorepo, auth, Postgres, workspaces, design tokens
sources CRUD + ingestion + understanding + embeddings
opportunity candidates + component ranker (v0.1 §7 weights)
**audience state / fatigue**
Today queue + opportunity detail + save/skip/reject

*Milestone:* Inspyr autonomously surfaces something you genuinely want to publish, and correctly tells you not to post your best topic today.

### Week 2 — listen, then decide
market signals: velocity, saturation, angle coverage, whitespace
**Pulse v1**
ActionSpec model + candidate generation
simulator v0 — ranked ordering, no numbers, uncertainty stated
prediction records written for every decision from day one
Create flow + native channel variants + draft versioning

*Milestone:* Inspyr proposes a ranked set of *decisions*, explains the evidence, and records what it expected.

### Week 3 — close the loop
calendar, publication state machine, X integration or manual fallback
metrics ingestion + normalized baselines
evaluator + prediction-vs-reality join
operator learning changes ranking
first calibration snapshot
memory correction UX

*Milestone:* Yesterday's result visibly changes today's ranking, **and** Inspyr can state how often it was right.

---

# 19. Acceptance criteria — v0.2

v0.1 §20 criteria 1–14 stand. Added:

15. Inspyr declines to recommend a topic due to audience fatigue, and explains why.
16. Pulse shows a rising, a saturated and a whitespace topic, each traceable to counted source evidence.
17. For one opportunity, Inspyr generates ≥ 3 distinct ActionSpecs and ranks them.
18. Every decision writes a `prediction` with a populated `evidence_basis`.
19. With insufficient evidence, Inspyr shows ordering **without** a point estimate and says why.
20. At least one decision is made as an explicit **experiment** driven by simulator uncertainty.
21. After ≥ 10 publications, a calibration snapshot exists and is visible in the UI.
22. A full `agent_run` trace is inspectable from the UI: every tool call, input, output, model, cost.
23. No LLM output anywhere in the product contains a fabricated metric. *(Assert in tests.)*

**Criterion 23 is a test, not a hope.** Schema-validate every generated draft and explanation for numeric claims not present in the structured input.

---

# 20. Deferred, with entry conditions

| Deferred | Unlocks when |
|---|---|
| synthetic audience populations | base prediction calibrated ≥ 4 weeks **and** cohort observation live |
| cross-account / network priors | a real multi-user base exists |
| cohort-conditioned prediction | §3.3 observation gate passes |
| `auto` publishing | calibration demonstrates trustworthy confidence at that channel |
| multi-agent split beyond channel policies | a channel's reasoning demonstrably cannot be expressed as a ChannelPolicy |
| newsletter / SEO / CRM / outbound agents | the social loop is closed and calibrated (v0.1 §27) |

---

# 21. Unresolved — decide before writing code

Carried from a conflict between `BUILD_SPEC_v0.1.md` and `Inspyr_Social_Dogfooding_GTM_Spec.docx`:

1. **Positioning.** The docx says *"AI growth memory for creators."* v0.1 §24 says memory is explicitly **not** the differentiator, because Grocalo already owns that language. → **Resolution: keep "Know what to say next." Drop the memory positioning.**
2. **Scope.** The docx MVP is one identity. v0.1 makes multi-workspace core (same source, different scores per workspace). → **Resolution: keep multi-workspace. One paper producing two genuinely different angles for Personal vs AITorch is the sharpest available demo.**
3. **Input.** The docx flywheel starts at *"Create — one strong source idea"* — the user brings the idea. v0.1's entire thesis is the opposite. → **Resolution: the docx is a GTM operating rhythm, not a product model. Do not let its input assumption leak into the schema.**

---

*Architecture v0.2 · supersedes §6–§9 of BUILD_SPEC_v0.1.md*
