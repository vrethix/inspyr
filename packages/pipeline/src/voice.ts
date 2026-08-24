import { and, eq } from "drizzle-orm";
import { db, voiceClips, voiceProfiles, drafts, feedbackEvents, draftEdits, strategySignals } from "@inspyr/db";
import { contentHash, type DraftContent } from "@inspyr/shared";
import {
  getVoiceProvider, hookPreview, fullScript, scriptDurationEstimate,
  assertConsent, CONSENT_STATEMENT, FULL_SCRIPT_CHAR_LIMIT,
  VoiceUnavailableError, type HookPreview,
} from "@inspyr/voice";

/**
 * "Hear it" — generate the opening of a draft as audio.
 *
 * Scoped to a preview on purpose. Inspyr's argument is that deciding is the
 * product and making is commodity; the justification for touching audio at all
 * is that a script nobody turns into a video produces no outcome, and no
 * outcome means nothing to learn from. Hearing the hook is the cheapest thing
 * that moves a draft toward actually existing.
 */

export interface VoicePreviewResult {
  audio: Buffer;
  format: string;
  preview: HookPreview;
  cached: boolean;
}

async function activeVoice(workspaceId: string) {
  const [profile] = await db.select().from(voiceProfiles)
    .where(eq(voiceProfiles.workspaceId, workspaceId))
    .limit(1);
  if (!profile) return null;

  // A cloned voice without recorded consent is not usable. This throws rather
  // than silently falling back, so the failure is visible.
  assertConsent(
    {
      workspaceId: profile.workspaceId,
      referenceId: profile.referenceId,
      confirmedAt: profile.consentConfirmedAt,
      statement: profile.consentStatement ?? CONSENT_STATEMENT,
    },
    profile.referenceId,
  );
  return profile;
}

export async function previewDraftVoice(
  workspaceId: string,
  draftId: string,
): Promise<VoicePreviewResult> {
  const [draft] = await db.select().from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.workspaceId, workspaceId)))
    .limit(1);
  if (!draft) throw new Error(`draft ${draftId} not in workspace ${workspaceId}`);

  const preview = hookPreview(draft.channel, draft.contentJson as unknown as DraftContent);
  if (!preview) {
    throw new VoiceUnavailableError("This draft has no opening to read — it recommends no action.");
  }

  const profile = await activeVoice(workspaceId);
  const referenceId = profile?.referenceId ?? null;
  const hash = contentHash(`${preview.text}::${referenceId ?? "default"}`);

  const [cachedClip] = await db.select().from(voiceClips)
    .where(and(eq(voiceClips.workspaceId, workspaceId), eq(voiceClips.contentHash, hash)))
    .limit(1);

  if (cachedClip) {
    return {
      audio: Buffer.from(cachedClip.audioBase64, "base64"),
      format: cachedClip.format,
      preview,
      cached: true,
    };
  }

  const provider = getVoiceProvider();
  const result = await provider.speak(preview.text, {
    ...(referenceId ? { referenceId } : {}),
    format: "mp3",
    latency: "low",
  });

  await db.insert(voiceClips).values({
    workspaceId,
    contentHash: hash,
    format: result.format,
    model: result.model,
    referenceId,
    audioBase64: result.audio.toString("base64"),
    characters: result.characters,
    latencyMs: result.latencyMs,
  }).onConflictDoNothing();

  return { audio: result.audio, format: result.format, preview, cached: false };
}

export function voiceAvailable(): boolean {
  return getVoiceProvider().available;
}


// -------------------------------------------------------------------- create

export interface FullVoiceResult {
  audio: Buffer;
  format: string;
  seconds: number;
  characters: number;
  cached: boolean;
}

/**
 * The whole script as one audio file.
 *
 * This is the point of the feature. A preview tells you whether the hook works;
 * this is the thing a creator actually puts under a video, which is what turns
 * a script that would never be filmed into something publishable tonight.
 */
export async function fullDraftVoice(
  workspaceId: string,
  draftId: string,
): Promise<FullVoiceResult> {
  const [draft] = await db.select().from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.workspaceId, workspaceId)))
    .limit(1);
  if (!draft) throw new Error(`draft ${draftId} not in workspace ${workspaceId}`);

  const script = fullScript(draft.channel, draft.contentJson as unknown as DraftContent);
  if (!script) {
    throw new VoiceUnavailableError("This draft has nothing to read — it recommends no action.");
  }
  if (script.length > FULL_SCRIPT_CHAR_LIMIT) {
    throw new VoiceUnavailableError(
      `That script is ${script.length} characters. Split it before making audio.`,
    );
  }

  const profile = await activeVoice(workspaceId);
  const referenceId = profile?.referenceId ?? null;
  const hash = contentHash(`full::${script}::${referenceId ?? "default"}`);

  const [cachedClip] = await db.select().from(voiceClips)
    .where(and(eq(voiceClips.workspaceId, workspaceId), eq(voiceClips.contentHash, hash)))
    .limit(1);

  if (cachedClip) {
    return {
      audio: Buffer.from(cachedClip.audioBase64, "base64"),
      format: cachedClip.format,
      seconds: scriptDurationEstimate(script),
      characters: cachedClip.characters,
      cached: true,
    };
  }

  const result = await getVoiceProvider().speak(script, {
    ...(referenceId ? { referenceId } : {}),
    format: "mp3",
    latency: "normal",
  });

  await db.insert(voiceClips).values({
    workspaceId, contentHash: hash, format: result.format, model: result.model,
    referenceId, audioBase64: result.audio.toString("base64"),
    characters: result.characters, latencyMs: result.latencyMs,
  }).onConflictDoNothing();

  return {
    audio: result.audio,
    format: result.format,
    seconds: scriptDurationEstimate(script),
    characters: result.characters,
    cached: false,
  };
}

// ---------------------------------------------------------------------- edit

/**
 * Records that someone listened.
 *
 * On its own this is just telemetry. Paired with what happens next it is the
 * cheapest evaluator Inspyr has — see `hearThenRewriteSignals`.
 */
export async function recordVoicePlay(input: {
  workspaceId: string;
  draftId: string;
  kind: "preview" | "full";
}): Promise<void> {
  const [draft] = await db.select().from(drafts)
    .where(and(eq(drafts.id, input.draftId), eq(drafts.workspaceId, input.workspaceId)))
    .limit(1);
  if (!draft) return;

  const content = draft.contentJson as unknown as Record<string, unknown>;
  await db.insert(feedbackEvents).values({
    workspaceId: input.workspaceId,
    eventType: "voice_previewed",
    entityType: "draft",
    entityId: draft.id,
    actor: "user",
    metadataJson: {
      kind: input.kind,
      channel: draft.channel,
      hook_type: typeof content.hook_type === "string" ? content.hook_type : null,
      angle: draft.angle,
      version: draft.version,
    },
  });
}

// --------------------------------------------------------------------- learn

/** How long after listening an edit still counts as caused by listening. */
export const HEAR_THEN_REWRITE_WINDOW_MINUTES = 45;
/** Below this, an edit is a typo fix rather than a rewrite. */
export const REWRITE_THRESHOLD = 0.25;

export interface HearThenRewrite {
  hookType: string;
  listened: number;
  rewritten: number;
  rate: number;
}

/**
 * What hearing a draft teaches Inspyr about the writing.
 *
 * If someone plays a hook and then substantially rewrites it, the hook was
 * wrong — and they only found out by hearing it. That is a label, produced for
 * free, about the thing Inspyr wrote. It is a much more direct signal than
 * engagement, because it arrives in minutes rather than weeks and it is
 * unambiguous: no algorithm, no audience, no timing. The writing did not
 * survive being read aloud.
 */
export async function hearThenRewriteSignals(workspaceId: string): Promise<HearThenRewrite[]> {
  const plays = await db.select().from(feedbackEvents)
    .where(and(
      eq(feedbackEvents.workspaceId, workspaceId),
      eq(feedbackEvents.eventType, "voice_previewed"),
    ));
  if (!plays.length) return [];

  const edits = await db.select().from(draftEdits)
    .where(eq(draftEdits.workspaceId, workspaceId));

  const byHook = new Map<string, { listened: number; rewritten: number }>();
  const windowMs = HEAR_THEN_REWRITE_WINDOW_MINUTES * 60_000;

  for (const play of plays) {
    const hookType = String(play.metadataJson.hook_type ?? "unknown");
    const bucket = byHook.get(hookType) ?? { listened: 0, rewritten: 0 };
    bucket.listened += 1;

    const rewritten = edits.some((e) =>
      e.draftId === play.entityId &&
      e.changeRatio >= REWRITE_THRESHOLD &&
      e.createdAt.getTime() > play.createdAt.getTime() &&
      e.createdAt.getTime() - play.createdAt.getTime() <= windowMs);

    if (rewritten) bucket.rewritten += 1;
    byHook.set(hookType, bucket);
  }

  return [...byHook.entries()]
    .map(([hookType, b]) => ({
      hookType,
      listened: b.listened,
      rewritten: b.rewritten,
      rate: Math.round((b.rewritten / b.listened) * 1000) / 1000,
    }))
    .sort((a, b) => b.rate - a.rate || b.listened - a.listened);
}

/** Writes the hear-then-rewrite rates into ranking policy. */
export async function updateVoiceSignals(workspaceId: string): Promise<number> {
  const signals = await hearThenRewriteSignals(workspaceId);
  let written = 0;

  for (const s of signals) {
    if (s.hookType === "unknown" || s.listened < 2) continue;
    // A hook rewritten after every listen is a hook that does not work spoken.
    // Shrunk, so two bad experiences do not ban a whole hook type.
    const effect = -s.rate * (s.listened / (s.listened + 3));
    const values = {
      workspaceId,
      dimension: "hook_after_listen",
      key: s.hookType,
      channel: null,
      contextJson: { listened: s.listened, rewritten: s.rewritten, rate: s.rate },
      effect: Math.round(Math.max(-1, Math.min(1, effect)) * 1000) / 1000,
      confidence: Math.round((s.listened / (s.listened + 5)) * 1000) / 1000,
      sampleSize: s.listened,
      source: "outcome",
      evidenceStart: null,
      evidenceEnd: new Date(),
      active: s.listened >= 2,
      updatedAt: new Date(),
    };
    await db.insert(strategySignals).values(values).onConflictDoUpdate({
      target: [strategySignals.workspaceId, strategySignals.dimension, strategySignals.key, strategySignals.channel],
      set: values,
    });
    written += 1;
  }
  return written;
}

/** Plain sentence for the Growth page. Deterministic — no model involved. */
export function describeHearThenRewrite(s: HearThenRewrite): string {
  const pct = Math.round(s.rate * 100);
  if (s.rewritten === 0) {
    return `${s.hookType} hooks survived being read aloud all ${s.listened} times.`;
  }
  return `You rewrote ${s.hookType} hooks after hearing them ${s.rewritten} of ${s.listened} times (${pct}%).`;
}
