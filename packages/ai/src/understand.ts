import {
  UnderstandingSchema, OpportunitySynthesisSchema, assertNoFabricatedMetrics,
  type Understanding, type OpportunitySynthesis,
} from "@inspyr/shared";
import type { LLMProvider, StructuredResult } from "./types";
import { heuristicUnderstanding, heuristicSynthesis } from "./heuristic";
import { ModelRefusalError } from "./anthropic";

export const PROMPT_VERSIONS = {
  understanding: "understanding@v1",
  synthesis: "synthesis@v1",
} as const;

const UNDERSTANDING_SYSTEM = `You extract structure from a source document for a content system.

Rules:
- Work only from the provided text. Do not add outside knowledge.
- claims must be statements the text itself makes, quoted or closely paraphrased.
- Mark supported=false for any claim the text asserts without evidence.
- Never invent metrics, percentages, or engagement numbers.
- topics are lowercase single words or short compounds, most specific first.`;

const SYNTHESIS_SYSTEM = `You turn a cluster of source items into a content opportunity for one specific workspace.

Rules:
- Ground every statement in the supplied source material and workspace profile.
- Write for the workspace's stated audience, not a general one.
- Angles must be genuinely different approaches, not rewordings.
- NEVER state a metric, lift, percentage, confidence value or projected result.
  You do not have performance data and are not the component that predicts.
  Explain WHY something is worth saying; the ranking layer supplies numbers.`;

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n[truncated]` : s);

export async function understandSourceItem(
  provider: LLMProvider,
  input: { title: string; text: string; url?: string | null; publishedAt?: Date | null },
): Promise<StructuredResult<Understanding>> {
  const fallback = (): StructuredResult<Understanding> => ({
    value: heuristicUnderstanding(input),
    usage: { inputTokens: 0, outputTokens: 0, model: "heuristic", latencyMs: 0 },
    origin: "heuristic",
  });

  if (!provider.available) return fallback();

  const prompt = [
    input.url ? `URL: ${input.url}` : null,
    input.publishedAt ? `Published: ${input.publishedAt.toISOString()}` : null,
    `TITLE: ${input.title}`,
    "",
    "TEXT:",
    trim(input.text, 12000),
  ].filter(Boolean).join("\n");

  try {
    const result = await provider.generateStructured(prompt, UnderstandingSchema, {
      tier: "cheap",
      system: UNDERSTANDING_SYSTEM,
      promptVersion: PROMPT_VERSIONS.understanding,
    });
    // `claims` are verbatim from the source — numbers there are evidence, not fabrication.
    assertNoFabricatedMetrics(result.value, "understanding", { skipKeys: ["claims"] });
    return result;
  } catch (err) {
    if (err instanceof ModelRefusalError) return fallback();
    throw err;
  }
}

export interface SynthesisInput {
  clusterTitle: string;
  items: { title: string; summary: string; url?: string | null; topics: string[] }[];
  workspace: {
    name: string;
    objective: string;
    audience: string;
    voice: string;
    pillars: string[];
    avoid: string[];
  };
  recentlyCovered: string[];
}

export async function synthesizeOpportunity(
  provider: LLMProvider,
  input: SynthesisInput,
): Promise<StructuredResult<OpportunitySynthesis>> {
  const allTopics = [...new Set(input.items.flatMap((i) => i.topics))];

  const fallback = (): StructuredResult<OpportunitySynthesis> => ({
    value: heuristicSynthesis({
      title: input.clusterTitle,
      summary: input.items[0]?.summary ?? "",
      topics: allTopics,
      contentType: "other",
      audience: input.workspace.audience,
      pillars: input.workspace.pillars,
      sourceCount: input.items.length,
    }),
    usage: { inputTokens: 0, outputTokens: 0, model: "heuristic", latencyMs: 0 },
    origin: "heuristic",
  });

  if (!provider.available) return fallback();

  const prompt = `WORKSPACE
name: ${input.workspace.name}
objective: ${input.workspace.objective}
audience: ${input.workspace.audience}
voice: ${input.workspace.voice}
content pillars: ${input.workspace.pillars.join(", ") || "(none set)"}
avoid: ${input.workspace.avoid.join(", ") || "(nothing set)"}

RECENTLY COVERED BY THIS WORKSPACE
${input.recentlyCovered.length ? input.recentlyCovered.map((t) => `- ${t}`).join("\n") : "- (nothing yet)"}

SOURCE TRUTH (${input.items.length} item${input.items.length === 1 ? "" : "s"})
${input.items.map((i, n) => `[${n + 1}] ${i.title}\n${i.url ? `    ${i.url}\n` : ""}    ${trim(i.summary, 1200)}`).join("\n\n")}

Produce the opportunity for THIS workspace specifically.`;

  try {
    const result = await provider.generateStructured(prompt, OpportunitySynthesisSchema, {
      tier: "strong",
      system: SYNTHESIS_SYSTEM,
      promptVersion: PROMPT_VERSIONS.synthesis,
      maxTokens: 8000,
    });
    // Everything here is model-written prose. Nothing is exempt.
    assertNoFabricatedMetrics(result.value, "synthesis");
    return result;
  } catch (err) {
    if (err instanceof ModelRefusalError) return fallback();
    throw err;
  }
}
