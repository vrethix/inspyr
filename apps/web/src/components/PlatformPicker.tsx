"use client";

import { useActionState } from "react";
import { updatePlatforms } from "@/lib/actions";
import { CHANNEL_LABELS, platformKind, type ActionChannel } from "@inspyr/shared";

const CHOICES: ActionChannel[] = ["youtube", "instagram", "x", "linkedin"];

/**
 * The creator picks. One platform is a perfectly good answer — and usually a
 * better one than five, because effort splits and nothing compounds.
 */
export function PlatformPicker({ selected, followers }: {
  selected: string[];
  followers: Record<string, number>;
}) {
  const [state, action, pending] = useActionState(updatePlatforms, null as { ok?: boolean } | null);

  return (
    <form action={action} className="form-narrow">
      {state?.ok && <div className="note" style={{ color: "var(--ok)", marginBottom: 10 }}>Saved.</div>}
      <p className="note" style={{ marginBottom: 12 }}>
        Pick the ones you actually want to grow. One is fine. Five means each gets a fifth of
        your time and none of them compound.
      </p>

      {CHOICES.map((channel) => (
        <div key={channel} style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 9 }}>
          <input type="checkbox" name={`platform_${channel}`} defaultChecked={selected.includes(channel)}
            style={{ width: "auto" }} id={`p_${channel}`} />
          <label htmlFor={`p_${channel}`} style={{ marginBottom: 0, flex: 1, fontSize: 13.5 }}>
            {CHANNEL_LABELS[channel]}
            <span className="note" style={{ marginLeft: 7 }}>
              {platformKind(channel) === "algorithmic"
                ? "reaches strangers at any size"
                : "reach limited by followers"}
            </span>
          </label>
          <input name={`followers_${channel}`} inputMode="numeric" placeholder="followers"
            defaultValue={followers[channel] ?? ""} style={{ width: 110 }} />
        </div>
      ))}

      <button type="submit" disabled={pending} style={{ marginTop: 8 }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
