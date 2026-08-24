import Link from "next/link";
import type { NextActions as NextActionsData } from "@inspyr/pipeline";

/**
 * "What should I do today?"
 *
 * This sits above everything else on Today because at a small follower count it
 * is the only question that matters, and because Inspyr refusing to recommend a
 * post is only useful if it says what to do instead.
 */
export function NextActions({ data }: { data: NextActionsData }) {
  const { available, blocked, audienceSize } = data;

  return (
    <section style={{ marginBottom: 30 }}>
      <div className="panel-title">Do this today</div>

      {available.length === 0 ? (
        <div className="empty">Nothing available. Everything is waiting on something else.</div>
      ) : (
        <div className="queue" style={{ borderTop: "1px solid var(--line)" }}>
          {available.map((action, i) => (
            <div key={action.key} className="queue-item">
              <div className="queue-rank">{String(i + 1).padStart(2, "0")}</div>
              <div className="queue-body">
                <div className="queue-title">
                  {action.href
                    ? <Link href={action.href}>{action.label}</Link>
                    : action.label}
                </div>
                <div className="queue-why">{action.what}</div>

                <div className="queue-meta">
                  <span className="tag">{action.channelLabel}</span>
                  <span>
                    {action.expectedReach === 0
                      ? "reaches nobody"
                      : `reaches about ${action.expectedReach.toLocaleString()}`}
                  </span>
                  <span>{action.effortMinutes} min</span>
                  {action.unlockValue > 0 && (
                    <span className="tag" data-tone="accent">unlocks more</span>
                  )}
                </div>

                {action.detail && (
                  <div className="note" style={{ marginTop: 5 }}>{action.detail}</div>
                )}
                {action.unlockValue > 0 && (
                  <div className="note" style={{ marginTop: 3, color: "var(--ok)" }}>
                    Doing this makes other things possible. That is why it is first.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {blocked.length > 0 && (
        <>
          <div className="panel-title" style={{ marginTop: 22 }}>
            Not possible yet
          </div>
          <p className="note" style={{ marginBottom: 8 }}>
            These need something to exist first. Nothing is wrong — they just come later.
          </p>
          {blocked.map((b) => (
            <div key={b.key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                {b.label} <span className="tag">{b.channelLabel}</span>
              </div>
              <div className="note" data-tone="warn">
                Needs first: {b.blockedBy.join(", ")}
              </div>
            </div>
          ))}
        </>
      )}

      {audienceSize > 0 && audienceSize < 300 && (
        <p className="note" style={{ marginTop: 14 }}>
          You have {audienceSize} follower{audienceSize === 1 ? "" : "s"}. Anything that only
          reaches your own followers is near the bottom of this list on purpose. That changes as
          you grow.
        </p>
      )}
    </section>
  );
}
