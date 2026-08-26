import type { NextActions } from "@inspyr/pipeline";
import { CHANNEL_LABELS, type ActionChannel } from "@inspyr/shared";

/**
 * Where you actually are, and the one thing to do about it.
 *
 * Sits above everything because advice that ignores stage is worse than no
 * advice — it sends a 200-follower account off to do things that only work at
 * 200,000.
 */
export function StageBanner({ data }: { data: NextActions }) {
  const { stage, instruction } = data;
  if (!stage.primary) return null;

  const p = stage.primary;
  const label = CHANNEL_LABELS[p.platform as ActionChannel] ?? p.platform;

  return (
    <section className="panel" style={{ marginBottom: 22 }}>
      <div className="panel-title">Where you are</div>

      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 560, letterSpacing: "-0.02em" }}>
          {p.followers.toLocaleString()} on {label}
        </span>
        <span className="tag">{p.stageLabel}</span>
        {p.policy.kind === "follower_gated" && (
          <span className="tag" data-tone="warn">reach limited by followers</span>
        )}
        {p.policy.kind === "algorithmic" && (
          <span className="tag" data-tone="accent">reaches non-followers</span>
        )}
      </div>

      {p.toNextStage > 0 && (
        <>
          <div className="bar" style={{ marginTop: 10 }}>
            <span className="bar-label">to {p.toNextStage.toLocaleString()} more</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${Math.round(p.progress * 100)}%` }} />
            </span>
            <span className="bar-value">{Math.round(p.progress * 100)}%</span>
          </div>
        </>
      )}

      <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 10 }}>
        <strong style={{ fontWeight: 560 }}>What&rsquo;s stopping you:</strong> {p.policy.bottleneck}
      </p>

      {instruction && (
        <p style={{ fontSize: 14, marginTop: 8 }}>{instruction}</p>
      )}

      <details style={{ marginTop: 10 }}>
        <summary className="note" style={{ cursor: "pointer" }}>
          What works at this stage, and what doesn&rsquo;t
        </summary>

        <div style={{ marginTop: 8 }}>
          <div className="panel-title">Do</div>
          {p.policy.levers.map((lever, i) => (
            <div key={i} className="note" style={{ marginBottom: 3, color: "var(--ink-2)" }}>· {lever}</div>
          ))}

          <div className="panel-title" style={{ marginTop: 12 }}>Don&rsquo;t</div>
          {p.policy.antiPatterns.map((anti, i) => (
            <div key={i} className="note" data-tone="warn" style={{ marginBottom: 3 }}>· {anti}</div>
          ))}

          <div className="panel-title" style={{ marginTop: 12 }}>Watch</div>
          <div className="note">{p.policy.primaryMetric}</div>
          <div className="note" style={{ marginTop: 3 }}>
            Not follower count — it moves too slowly to learn anything from.
          </div>
        </div>
      </details>

      {stage.platforms.length > 1 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          {stage.platforms.filter((x) => x.platform !== p.platform).map((other) => (
            <div key={other.platform} className="note mono" style={{ marginBottom: 3 }}>
              {(CHANNEL_LABELS[other.platform as ActionChannel] ?? other.platform).padEnd(10)}
              {" "}{other.followers.toLocaleString()} · {other.stageLabel}
              {" · "}{other.cadence.actualPerWeek}/wk vs {other.cadence.targetPerWeek} target
            </div>
          ))}
        </div>
      )}

      {!p.cadence.onTrack && (
        <p className="note" data-tone="warn" style={{ marginTop: 10 }}>
          {p.cadence.actualPerWeek}× a week. This stage wants {p.policy.cadence.target}.
          {" "}{p.policy.cadence.note}
        </p>
      )}

      {stage.coldStart && (
        <p className="note" style={{ marginTop: 10 }}>
          Not enough of your own history yet, so this is based on how the platform works —
          not on what has worked for you. That changes as you publish.
        </p>
      )}
    </section>
  );
}
