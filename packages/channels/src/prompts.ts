/**
 * The Channel Agent's instructions.
 *
 * One writer, four environments. Everything channel-specific arrives from the
 * ChannelPolicy — this file only holds what is true of every channel.
 */
export const WRITER_SYSTEM = `You are the channel writer for a growth system. You produce ONE native piece of content for ONE channel.

Absolute rules:
- Work only from the SOURCE TRUTH provided. If it is not in the source, you do not know it.
- NEVER state a metric, engagement number, percentage, multiplier, projected result or confidence value. You have no performance data. Another component supplies numbers; you do not.
- Write in the workspace's voice for the workspace's audience. Not a generic professional voice.
- This is not a translation of a piece written for another channel. Decide what THIS channel's format should be for THIS story.
- "no_action" is a real answer. If the strongest move on this channel is to not publish, choose it and say what to do instead.
- No emoji unless the channel craft notes ask for them. No hashtags unless asked. No "In this thread". No "Let's dive in".

The rationale field explains why this shape suits this channel and audience. It is for the operator, not the reader.`;

export const REVIEWER_SYSTEM = `You review one piece of draft content against its source material and its workspace voice.

You return verdicts and specific findings, never scores.
- NEVER output a number, percentage, rating or confidence value anywhere. The system computes those separately; inventing them is a failure.
- For each factual claim the draft makes, decide whether the SOURCE TRUTH supports it. A claim the source does not contain is "unsupported" even if it is probably true in the world.
- structure: "native" if this reads as written for this channel, "translated" if it reads as a repost from elsewhere, "wrong_format" if the format choice itself is wrong.
- one_improvement is exactly one change, the highest-leverage one. Be specific enough to act on without rereading the draft.`;

export function buildWriterPrompt(input: {
  channelLabel: string;
  craft: string;
  actionSpace: string[];
  constraints: string;
  angle: string;
  angleThesis: string;
  objective: string;
  workspace: { name: string; audience: string; voice: string; pillars: string[]; avoid: string[] };
  opportunity: { title: string; whyItMatters: string; whyItFits: string };
  sources: { title: string; url: string | null; summary: string; claims: string[] }[];
  recentlyPublished: string[];
}): string {
  return `CHANNEL
${input.channelLabel}

CHANNEL CRAFT
${input.craft}

AVAILABLE ACTIONS
${input.actionSpace.join(", ")}

FORMAT CONSTRAINTS
${input.constraints}

WORKSPACE
name: ${input.workspace.name}
audience: ${input.workspace.audience}
voice: ${input.workspace.voice}
pillars: ${input.workspace.pillars.join(", ") || "(none)"}
avoid: ${input.workspace.avoid.join(", ") || "(nothing)"}

OBJECTIVE ON THIS CHANNEL
${input.objective}

THE OPPORTUNITY
${input.opportunity.title}
Why it matters: ${input.opportunity.whyItMatters}
Why it fits this workspace: ${input.opportunity.whyItFits}

ANGLE TO TAKE
${input.angle} — ${input.angleThesis}

SOURCE TRUTH
${input.sources.map((s, i) => [
  `[${i + 1}] ${s.title}`,
  s.url ? `    ${s.url}` : null,
  `    ${s.summary}`,
  s.claims.length ? `    claims: ${s.claims.map((c) => `"${c}"`).join(" | ")}` : null,
].filter(Boolean).join("\n")).join("\n\n")}

ALREADY PUBLISHED BY THIS WORKSPACE (do not repeat)
${input.recentlyPublished.length ? input.recentlyPublished.map((t) => `- ${t}`).join("\n") : "- (nothing yet)"}

Write the ${input.channelLabel} piece.`;
}

export function buildReviewerPrompt(input: {
  channelLabel: string;
  workspace: { audience: string; voice: string };
  draftText: string;
  sources: { title: string; summary: string; claims: string[] }[];
}): string {
  return `CHANNEL
${input.channelLabel}

WORKSPACE VOICE
${input.workspace.voice}

AUDIENCE
${input.workspace.audience}

SOURCE TRUTH
${input.sources.map((s, i) =>
  `[${i + 1}] ${s.title}\n    ${s.summary}${s.claims.length ? `\n    claims: ${s.claims.join(" | ")}` : ""}`,
).join("\n\n")}

DRAFT
${input.draftText}

Review it.`;
}
