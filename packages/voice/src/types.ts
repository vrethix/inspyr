/**
 * BUILD_SPEC_v0.1 §10 — business logic never couples to one vendor.
 *
 * Fish Audio is free until 30 November 2026. That is a good reason to use it
 * and a bad reason to depend on it, so everything above this interface is
 * provider-agnostic and swapping vendors touches one file.
 */

export type AudioFormat = "mp3" | "wav" | "opus";

export interface SpeakOptions {
  /** A cloned voice. Requires recorded consent — see consent.ts. */
  referenceId?: string;
  format?: AudioFormat;
  /** Fish exposes low | normal | balanced. Previews want low. */
  latency?: "low" | "normal" | "balanced";
}

export interface SpeakResult {
  audio: Buffer;
  format: AudioFormat;
  model: string;
  latencyMs: number;
  characters: number;
}

export interface VoiceProvider {
  readonly name: string;
  readonly available: boolean;
  speak(text: string, opts?: SpeakOptions): Promise<SpeakResult>;
}

export class VoiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceUnavailableError";
  }
}
