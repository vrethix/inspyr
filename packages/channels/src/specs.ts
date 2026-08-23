import {
  DEFAULT_CHANNEL_POLICIES, type Platform, type ChannelPolicySpec,
} from "@inspyr/shared";

/**
 * ARCHITECTURE_v0.2 §4 — candidate ActionSpec generation.
 *
 * A decision, fully described, with no content written yet. Today these are
 * enumerated deterministically from the opportunity's angles and each channel's
 * action space. When the Growth Simulator (§5) lands, it scores exactly these
 * objects and the only change is which one gets chosen.
 */

export interface CandidateSpec {
  channel: Platform;
  actionType: string;
  angle: string;
  angleThesis: string;
  hookType: string;
  ctaType: string;
  objective: string;
  featureVector: Record<string, unknown>;
}

const CHANNEL_OBJECTIVE: Record<Platform, string> = {
  x: "follower conversion and saves",
  linkedin: "reach among peers and replies worth having",
  instagram: "saves and discovery",
  youtube: "click-through, watch time and subscriber conversion",
};

/** The action a channel should default to for a given kind of angle. */
function defaultAction(policy: ChannelPolicySpec, angleKind: string): string {
  const space = policy.actionSpace.filter((a) => a !== "no_action");
  if (policy.channel === "x") {
    if (angleKind === "explain" || angleKind === "teach") return "thread";
    if (angleKind === "contrarian" || angleKind === "argue") return "post";
    return space[0] ?? "post";
  }
  if (policy.channel === "instagram") {
    return angleKind === "visual_breakdown" ? "carousel" : (space[0] ?? "carousel");
  }
  return space[0] ?? "post";
}

function hookFor(angleKind: string): string {
  switch (angleKind) {
    case "contrarian": return "contrarian";
    case "argue": return "statement";
    case "teach": return "demonstration";
    case "founder_story": return "story";
    case "visual_breakdown": return "demonstration";
    default: return "question";
  }
}

const CTA: Record<Platform, string> = {
  x: "follow", linkedin: "reply", instagram: "save", youtube: "subscribe",
};

export function generateCandidateSpecs(input: {
  channels: Platform[];
  angles: { kind: string; thesis: string }[];
  policies?: Partial<Record<Platform, ChannelPolicySpec>>;
  topics: string[];
  contentType: string;
}): CandidateSpec[] {
  const out: CandidateSpec[] = [];

  for (const channel of input.channels) {
    const policy = input.policies?.[channel] ?? DEFAULT_CHANNEL_POLICIES[channel];
    for (const angle of input.angles) {
      const actionType = defaultAction(policy, angle.kind);
      out.push({
        channel,
        actionType,
        angle: angle.kind,
        angleThesis: angle.thesis,
        hookType: hookFor(angle.kind),
        ctaType: CTA[channel],
        objective: CHANNEL_OBJECTIVE[channel],
        // The feature vector the simulator will score (§8.2 / §5.2).
        featureVector: {
          channel, action_type: actionType, angle: angle.kind,
          hook_type: hookFor(angle.kind), cta_type: CTA[channel],
          content_type: input.contentType, topics: input.topics.slice(0, 8),
        },
      });
    }
  }

  return out;
}
