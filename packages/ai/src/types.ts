import type { z } from "zod";

/**
 * BUILD_SPEC_v0.1 §10 — business logic never couples to one model vendor.
 * Everything above this interface is provider-agnostic.
 */
export type ModelTier = "cheap" | "strong";

export interface GenerateOptions {
  tier?: ModelTier;
  system?: string;
  maxTokens?: number;
  /** Prompt identity for cache keys and agent_steps.prompt_version. */
  promptVersion: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  latencyMs: number;
}

export interface StructuredResult<T> {
  value: T;
  usage: Usage;
  /** "model" when an LLM produced it, "heuristic" when the deterministic path did. */
  origin: "model" | "heuristic";
}

export interface LLMProvider {
  readonly name: string;
  readonly available: boolean;
  generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    opts: GenerateOptions,
  ): Promise<StructuredResult<T>>;
  generateText(prompt: string, opts: GenerateOptions): Promise<{ text: string; usage: Usage }>;
}

export interface EmbeddingProvider {
  readonly available: boolean;
  embed(texts: string[]): Promise<number[][]>;
}
