import type { AudioFormat, SpeakOptions, SpeakResult, VoiceProvider } from "./types";
import { VoiceUnavailableError } from "./types";

const ENDPOINT = "https://api.fish.audio/v1/tts";

/** The free tier is a model header, not a different endpoint. */
const FREE_MODEL = "s2.1-pro-free";

/** Previews are short. A long request here means something is wrong. */
const TIMEOUT_MS = 30_000;

export class FishAudioProvider implements VoiceProvider {
  readonly name = "fish-audio";
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(apiKey = process.env.FISH_AUDIO_API_KEY) {
    this.apiKey = apiKey;
    this.model = process.env.INSPYR_VOICE_MODEL ?? FREE_MODEL;
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  async speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
    if (!this.apiKey) {
      throw new VoiceUnavailableError(
        "No FISH_AUDIO_API_KEY set. Get a free key at fish.audio and add it to .env.",
      );
    }
    const trimmed = text.trim();
    if (!trimmed) throw new VoiceUnavailableError("Nothing to read out.");

    const format: AudioFormat = opts.format ?? "mp3";
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          model: this.model,
        },
        body: JSON.stringify({
          text: trimmed,
          ...(opts.referenceId ? { reference_id: opts.referenceId } : {}),
          format,
          latency: opts.latency ?? "low",
          normalize: true,
          mp3_bitrate: 128,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // 401 bad key, 402 out of quota, 503 busy — all worth saying plainly.
        const detail = await res.text().catch(() => "");
        throw new VoiceUnavailableError(
          `Fish Audio returned ${res.status}. ${detail.slice(0, 200)}`,
        );
      }

      const audio = Buffer.from(await res.arrayBuffer());
      return {
        audio,
        format,
        model: this.model,
        latencyMs: Date.now() - started,
        characters: trimmed.length,
      };
    } catch (err) {
      if (err instanceof VoiceUnavailableError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new VoiceUnavailableError("Fish Audio timed out.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
