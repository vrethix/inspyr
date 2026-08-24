export * from "./types";
export * from "./fish";
export * from "./consent";
export * from "./hook";

import { FishAudioProvider } from "./fish";
import type { VoiceProvider } from "./types";

let cached: VoiceProvider | null = null;

/** Single place that decides which voice provider the system runs on. */
export function getVoiceProvider(): VoiceProvider {
  if (!cached) cached = new FishAudioProvider();
  return cached;
}
