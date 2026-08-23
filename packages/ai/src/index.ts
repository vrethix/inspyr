export * from "./types";
export * from "./anthropic";
export * from "./heuristic";
export * from "./understand";

import { AnthropicProvider } from "./anthropic";
import type { LLMProvider } from "./types";

let cached: LLMProvider | null = null;

/** Single place that decides which provider the system runs on. */
export function getProvider(): LLMProvider {
  if (!cached) cached = new AnthropicProvider();
  return cached;
}
