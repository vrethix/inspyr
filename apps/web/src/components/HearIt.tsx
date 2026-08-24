"use client";

import { useState, useRef } from "react";

/**
 * Reading a hook and hearing it are different. A line that scans fine on the
 * page often lands flat out loud. This is the cheapest check available before
 * anyone films anything.
 */
export function HearIt({ draftId, enabled }: { draftId: string; enabled: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!enabled) {
    return (
      <p className="note" style={{ marginTop: 10 }}>
        Add <span className="mono">FISH_AUDIO_API_KEY</span> to <span className="mono">.env</span>{" "}
        to hear this read out loud. Free at fish.audio until 30 November.
      </p>
    );
  }

  async function play() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setState("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setState("error");
        setMessage(body.error ?? "Could not make the audio.");
        return;
      }

      setLabel(res.headers.get("x-inspyr-preview-label"));
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
      setMessage("Could not reach the voice service.");
    }
  }

  async function downloadFull() {
    setDownloading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/voice/full", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(body.error ?? "Could not make the voiceover.");
        return;
      }
      const seconds = res.headers.get("x-inspyr-seconds");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspyr-${draftId.slice(0, 8)}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(seconds ? `Saved. About ${seconds}s of audio.` : "Saved.");
    } catch {
      setMessage("Could not reach the voice service.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={play} disabled={state === "loading"}>
        {state === "loading" ? "Making audio…" : state === "playing" ? "Playing…" : "Hear it"}
      </button>
      <button type="button" onClick={downloadFull} disabled={downloading} style={{ marginLeft: 7 }}>
        {downloading ? "Making voiceover…" : "Download voiceover"}
      </button>
      {label && state !== "error" && (
        <span className="note" style={{ marginLeft: 9 }}>{label}</span>
      )}
      {message && <div className="note" data-tone="warn" style={{ marginTop: 5 }}>{message}</div>}
      {state === "idle" && !message && (
        <p className="note" style={{ marginTop: 5 }}>
          Hear the opening before you commit to making anything. The full voiceover goes
          under a screen recording — no microphone needed.
        </p>
      )}
    </div>
  );
}
