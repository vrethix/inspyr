import type { Platform } from "./events";

/**
 * ARCHITECTURE_v0.2 §6 — channel agents.
 *
 * X, LinkedIn, Instagram and YouTube are genuinely different environments:
 * different action spaces, different native formats, different reward
 * functions. They are NOT different codebases. One runtime loads a
 * ChannelPolicy, and the policy is what makes them distinct.
 */

export const ACTION_TYPES = [
  "post", "thread", "quote_post", "reply_sequence",
  "carousel", "reel", "explainer_video", "article",
  "no_action",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const HOOK_TYPES = [
  "question", "statement", "contrarian", "number", "story", "demonstration",
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const CTA_TYPES = [
  "follow", "subscribe", "save", "reply", "read_more", "watch", "none",
] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export interface ChannelConstraints {
  maxChars?: number;
  maxItems?: number;
  minItems?: number;
  maxTitleChars?: number;
  maxCaptionChars?: number;
}

/**
 * The reward function. This is the real differentiator between channels —
 * amending §8.3, OutcomeScore weights are per channel × objective, not per
 * workspace alone. YouTube optimises watch time and subscriber conversion;
 * X optimises follow conversion and saves. Same story, different objective.
 */
export type RewardWeights = Partial<Record<
  "follow_lift" | "save_lift" | "reply_lift" | "reach_lift" |
  "share_lift" | "watch_lift" | "ctr_lift" | "completion_lift",
  number
>>;

export interface ChannelPolicySpec {
  channel: Platform;
  label: string;
  actionSpace: ActionType[];
  constraints: ChannelConstraints;
  rewardWeights: RewardWeights;
  /** Channel-native craft instructions handed to the writer. */
  craft: string;
}

export const DEFAULT_CHANNEL_POLICIES: Record<Platform, ChannelPolicySpec> = {
  x: {
    channel: "x",
    label: "X",
    // no_action is first-class: "reply to three discussions and don't post" is
    // a legitimate, sometimes correct, output.
    actionSpace: ["post", "thread", "quote_post", "reply_sequence", "no_action"],
    constraints: { maxChars: 280, maxItems: 18, minItems: 1 },
    rewardWeights: { follow_lift: 0.35, save_lift: 0.25, reply_lift: 0.2, reach_lift: 0.2 },
    craft: `X rewards a first line that can stand alone. No throat-clearing, no "In this thread I will".
Each post must survive being read out of context. Threads earn their length or should be one post.
Concrete detail beats adjectives. Never number posts ("1/7") — the reader can see the thread.
A quote-post with two sentences of interpretation often outperforms an original thread on the same story.`,
  },
  linkedin: {
    channel: "linkedin",
    label: "LinkedIn",
    actionSpace: ["post", "article", "no_action"],
    constraints: { maxChars: 3000 },
    rewardWeights: { reach_lift: 0.3, reply_lift: 0.3, follow_lift: 0.25, share_lift: 0.15 },
    craft: `LinkedIn rewards an observation that leads to a transferable idea, not a technical walkthrough.
Shape: observation → why it matters commercially → a framework or principle → a concrete example → a question.
Short paragraphs, one idea each. First two lines appear before "see more" and decide everything.
No hashtag spam, no "Agree?", no engagement bait.`,
  },
  instagram: {
    channel: "instagram",
    label: "Instagram",
    actionSpace: ["carousel", "reel", "no_action"],
    constraints: { minItems: 5, maxItems: 10, maxCaptionChars: 2200 },
    rewardWeights: { save_lift: 0.4, completion_lift: 0.25, reach_lift: 0.2, follow_lift: 0.15 },
    craft: `Instagram is visual-first. Do not turn a thread into slides.
Ask what visual story explains this best, then sequence it: hook → problem → demonstration → what changed → implication → takeaway.
Slide one must work as a standalone image with under ten words.
Optimise for saves: the reader should want this back later. Caption carries context the slides cannot.`,
  },
  youtube: {
    channel: "youtube",
    label: "YouTube",
    actionSpace: ["explainer_video", "no_action"],
    constraints: { maxTitleChars: 70 },
    rewardWeights: { ctr_lift: 0.3, watch_lift: 0.3, follow_lift: 0.25, completion_lift: 0.15 },
    craft: `YouTube is a title-and-thumbnail decision followed by a retention problem.
The title must promise a specific answer, not a topic. The first 30 seconds must pay off the title immediately — no channel intro.
Structure in sections that each open a small loop and close it. Name the drop-off risk in each section.
Reward is CTR × watch time × subscriber conversion, not likes.`,
  },
};

export function constraintViolations(
  channel: Platform,
  content: { items?: string[]; text?: string; title?: string; caption?: string },
  constraints: ChannelConstraints = DEFAULT_CHANNEL_POLICIES[channel].constraints,
): string[] {
  const problems: string[] = [];
  const items = content.items ?? [];

  if (constraints.maxChars !== undefined) {
    items.forEach((item, i) => {
      if (item.length > constraints.maxChars!) {
        problems.push(`Post ${i + 1} is ${item.length} characters (limit ${constraints.maxChars}).`);
      }
    });
    if (content.text && content.text.length > constraints.maxChars) {
      problems.push(`Body is ${content.text.length} characters (limit ${constraints.maxChars}).`);
    }
  }
  if (constraints.minItems !== undefined && items.length && items.length < constraints.minItems) {
    problems.push(`${items.length} items; this format wants at least ${constraints.minItems}.`);
  }
  if (constraints.maxItems !== undefined && items.length > constraints.maxItems) {
    problems.push(`${items.length} items; this format allows at most ${constraints.maxItems}.`);
  }
  if (constraints.maxTitleChars !== undefined && content.title && content.title.length > constraints.maxTitleChars) {
    problems.push(`Title is ${content.title.length} characters (limit ${constraints.maxTitleChars}).`);
  }
  if (constraints.maxCaptionChars !== undefined && content.caption && content.caption.length > constraints.maxCaptionChars) {
    problems.push(`Caption is ${content.caption.length} characters (limit ${constraints.maxCaptionChars}).`);
  }
  return problems;
}
