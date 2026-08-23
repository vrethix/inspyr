import type { z } from "zod";
import {
  DRAFT_SCHEMAS, DEFAULT_CHANNEL_POLICIES, assertNoFabricatedMetrics,
  type Platform, type DraftContent, type ChannelPolicySpec,
} from "@inspyr/shared";
import { type LLMProvider, ModelRefusalError } from "@inspyr/ai";
import { WRITER_SYSTEM, buildWriterPrompt } from "./prompts";
import { heuristicDraft } from "./heuristic";

export const WRITER_PROMPT_VERSION = "channel-writer@v1";

export interface WriteInput {
  channel: Platform;
  policy: ChannelPolicySpec;
  angle: string;
  angleThesis: string;
  objective: string;
  workspace: { name: string; audience: string; voice: string; pillars: string[]; avoid: string[] };
  opportunity: { title: string; whyItMatters: string; whyItFits: string };
  sources: { id: string; title: string; url: string | null; summary: string; claims: string[] }[];
  recentlyPublished: string[];
}

export interface WriteResult {
  content: DraftContent;
  origin: "model" | "heuristic";
  model: string | null;
  promptVersion: string;
}

function describeConstraints(policy: ChannelPolicySpec): string {
  const c = policy.constraints;
  const parts: string[] = [];
  if (c.maxChars) parts.push(`each unit at most ${c.maxChars} characters`);
  if (c.minItems) parts.push(`at least ${c.minItems} items`);
  if (c.maxItems) parts.push(`at most ${c.maxItems} items`);
  if (c.maxTitleChars) parts.push(`title at most ${c.maxTitleChars} characters`);
  if (c.maxCaptionChars) parts.push(`caption at most ${c.maxCaptionChars} characters`);
  return parts.length ? parts.join("; ") : "no hard constraints";
}

/**
 * BUILD_SPEC_v0.1 §6.6 — the Platform Writer produces independent native
 * variants. One runtime; the ChannelPolicy is what differs.
 */
export async function writeDraft(
  provider: LLMProvider,
  input: WriteInput,
): Promise<WriteResult> {
  const policy = input.policy ?? DEFAULT_CHANNEL_POLICIES[input.channel];

  const fallback = (): WriteResult => ({
    content: heuristicDraft(input.channel, {
      title: input.opportunity.title,
      whyItMatters: input.opportunity.whyItMatters,
      angle: input.angle,
      angleThesis: input.angleThesis,
      audience: input.workspace.audience,
      sources: input.sources,
    }),
    origin: "heuristic",
    model: null,
    promptVersion: WRITER_PROMPT_VERSION,
  });

  if (!provider.available) return fallback();

  const prompt = buildWriterPrompt({
    channelLabel: policy.label,
    craft: policy.craft,
    actionSpace: policy.actionSpace,
    constraints: describeConstraints(policy),
    angle: input.angle,
    angleThesis: input.angleThesis,
    objective: input.objective,
    workspace: input.workspace,
    opportunity: input.opportunity,
    sources: input.sources,
    recentlyPublished: input.recentlyPublished,
  });

  try {
    // DRAFT_SCHEMAS is a union keyed by channel; TypeScript cannot narrow the
    // generic through the index, so the union is asserted to its common output.
    const schema = DRAFT_SCHEMAS[input.channel] as unknown as z.ZodType<DraftContent>;

    const result = await provider.generateStructured(
      prompt,
      schema,
      {
        tier: "strong",
        system: WRITER_SYSTEM,
        promptVersion: WRITER_PROMPT_VERSION,
        maxTokens: 8000,
      },
    );
    // Everything a writer produces is model-written prose. Nothing is exempt.
    assertNoFabricatedMetrics(result.value, `writer:${input.channel}`);
    return {
      content: result.value,
      origin: "model",
      model: result.usage.model,
      promptVersion: WRITER_PROMPT_VERSION,
    };
  } catch (err) {
    if (err instanceof ModelRefusalError) return fallback();
    throw err;
  }
}
