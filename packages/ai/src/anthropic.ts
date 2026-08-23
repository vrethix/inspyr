import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { GenerateOptions, LLMProvider, ModelTier, StructuredResult, Usage } from "./types";

/** BUILD_SPEC_v0.1 §18 — cheap model for extraction, strong model for reasoning. */
const MODELS: Record<ModelTier, string> = {
  cheap: process.env.INSPYR_MODEL_CHEAP ?? "claude-haiku-4-5",
  strong: process.env.INSPYR_MODEL_STRONG ?? "claude-opus-5",
};

export class ModelRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`model refused: ${category ?? "unknown"}`);
    this.name = "ModelRefusalError";
  }
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic | null;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get available(): boolean {
    return this.client !== null;
  }

  private model(tier: ModelTier = "cheap"): string {
    return MODELS[tier];
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    opts: GenerateOptions,
  ): Promise<StructuredResult<T>> {
    if (!this.client) throw new Error("AnthropicProvider: no ANTHROPIC_API_KEY configured");
    const model = this.model(opts.tier);
    const started = Date.now();

    const response = await this.client.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 8000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: zodOutputFormat(schema as z.ZodType<object>),
        // Extraction is mechanical; reasoning gets room to think.
        effort: opts.tier === "strong" ? "high" : "low",
      },
      ...(opts.tier === "strong" ? { thinking: { type: "adaptive" as const } } : {}),
    });

    // Safety classifiers can decline (HTTP 200). Check before reading content.
    if (response.stop_reason === "refusal") {
      throw new ModelRefusalError(response.stop_details?.category ?? null);
    }
    if (!response.parsed_output) {
      throw new Error(`AnthropicProvider: structured parse failed (${opts.promptVersion})`);
    }

    return {
      value: response.parsed_output as T,
      usage: this.usage(response, model, started),
      origin: "model",
    };
  }

  async generateText(prompt: string, opts: GenerateOptions) {
    if (!this.client) throw new Error("AnthropicProvider: no ANTHROPIC_API_KEY configured");
    const model = this.model(opts.tier);
    const started = Date.now();

    const response = await this.client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      throw new ModelRefusalError(response.stop_details?.category ?? null);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return { text, usage: this.usage(response, model, started) };
  }

  private usage(
    response: { usage: { input_tokens: number; output_tokens: number } },
    model: string,
    started: number,
  ): Usage {
    return {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
      latencyMs: Date.now() - started,
    };
  }
}
