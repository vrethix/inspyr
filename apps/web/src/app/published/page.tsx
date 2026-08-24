import Link from "next/link";
import { redirect } from "next/navigation";
import { listPublications, baselineProgress, hearThenRewriteSignals, describeHearThenRewrite } from "@inspyr/pipeline";
import { BASELINE_MIN_SAMPLE, CHANNEL_LABELS, type ActionChannel } from "@inspyr/shared";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { Nav } from "@/components/Nav";
import { AddPublicationForm, MetricsForm } from "@/components/PublishedForms";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * One place. Everything that went out, and what happened after.
 *
 * This is the half of the loop that was missing: Inspyr could decide, create
 * and notice how the operator behaved, but it had no way to find out how
 * anything performed. Numbers are entered by hand — the APIs that would
 * automate this cost money — and compared against this workspace's own recent
 * posts rather than an absolute.
 */
export default async function Published() {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");

  const rows = await listPublications(ws.id);
  const voiceSignals = await hearThenRewriteSignals(ws.id);

  const channels = [...new Set(rows.map((r) => r.channel))];
  const progress = await Promise.all(
    channels.map(async (c) => ({ channel: c, ...(await baselineProgress(ws.id, c)) })),
  );

  const measured = rows.filter((r) => typeof r.outcomeScore === "number");
  const best = measured.slice().sort((a, b) => (b.outcomeScore ?? 0) - (a.outcomeScore ?? 0))[0];

  return (
    <div className="shell">
      <Nav active="/published" />
      <main className="main">
        <div className="page-head">
          <h1>Published</h1>
          <p className="lede">
            Everything you put out, and what happened after. Inspyr compares each one to your own
            recent posts — not to anyone else&rsquo;s numbers.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-title">Nothing recorded yet</div>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
              Inspyr cannot tell you what works until it knows what you published and how it did.
              Add anything you have posted recently, even from before you used Inspyr.
            </p>
          </div>
        ) : (
          <>
            {progress.some((p) => !p.ready) && (
              <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-title">Building your baseline</div>
                {progress.filter((p) => !p.ready).map((p) => (
                  <div key={p.channel} className="note" style={{ marginBottom: 3 }}>
                    {CHANNEL_LABELS[p.channel as ActionChannel] ?? p.channel}: {p.count} of{" "}
                    {BASELINE_MIN_SAMPLE}. {p.needed} more and Inspyr can tell you whether a post
                    did well.
                  </div>
                ))}
                <p className="note" style={{ marginTop: 6 }}>
                  Until then it will not show a comparison. A number measured against two posts is
                  not evidence.
                </p>
              </div>
            )}

            {best && (
              <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-title">Best so far</div>
                <div style={{ fontSize: 14, fontWeight: 540 }}>{best.title}</div>
                <div className="note">{best.explanation}</div>
              </div>
            )}
          </>
        )}

        <div className="queue">
          {rows.map((row) => (
            <div key={row.id} className="queue-item">
              <div className="queue-rank">
                {typeof row.outcomeScore === "number"
                  ? <span className="mono" style={{
                      color: row.outcomeScore >= 1.15 ? "var(--ok)"
                        : row.outcomeScore < 0.85 ? "var(--warn)" : "var(--ink-3)",
                    }}>{row.outcomeScore.toFixed(1)}×</span>
                  : "—"}
              </div>
              <div className="queue-body">
                <div className="queue-title">
                  {row.externalUrl
                    ? <a href={row.externalUrl} target="_blank" rel="noreferrer">{row.title}</a>
                    : row.title}
                </div>

                <div className="queue-meta">
                  <span className="tag">{CHANNEL_LABELS[row.channel as ActionChannel] ?? row.channel}</span>
                  <span>{relativeTime(row.publishedAt)}</span>
                  {row.hookType && <span className="tag">{row.hookType} hook</span>}
                  {row.angle && <span className="tag">{row.angle}</span>}
                  {!row.hasMetrics && <span className="tag" data-tone="warn">no numbers yet</span>}
                </div>

                <div className="note" style={{ marginTop: 5 }}>{row.explanation}</div>

                {Object.keys(row.outcomeJson).length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="note" style={{ cursor: "pointer" }}>
                      Compared to your normal
                    </summary>
                    <div style={{ marginTop: 6 }}>
                      {Object.entries(row.outcomeJson).map(([key, lift]) => (
                        <div key={key} className="note mono">
                          {key}: {typeof lift === "number" ? `${lift.toFixed(2)}×` : "—"}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <details style={{ marginTop: 6 }}>
                  <summary className="note" style={{ cursor: "pointer" }}>
                    {row.hasMetrics ? "Update the numbers" : "Add the numbers"}
                  </summary>
                  <MetricsForm publicationId={row.id} channel={row.channel} />
                </details>
              </div>
            </div>
          ))}
        </div>

        {voiceSignals.length > 0 && (
          <>
            <h2 style={{ margin: "34px 0 4px" }}>What hearing it taught Inspyr</h2>
            <p className="note" style={{ marginBottom: 12 }}>
              When you listen to a draft and then rewrite it, the writing did not survive being
              read aloud. That is a result Inspyr gets in minutes instead of weeks.
            </p>
            {voiceSignals.map((s) => (
              <div key={s.hookType} className="learned">
                <span className="learned-dot" />
                <div style={{ fontSize: 13.5 }}>{describeHearThenRewrite(s)}</div>
              </div>
            ))}
          </>
        )}

        <h2 style={{ margin: "34px 0 4px" }}>Add something you published</h2>
        <p className="note" style={{ marginBottom: 12 }}>
          Anything counts, including posts from before you used Inspyr. More history means a
          better baseline sooner.
        </p>
        <AddPublicationForm />

        <p className="note" style={{ marginTop: 24 }}>
          Numbers are entered by hand for now. The APIs that would fetch them automatically cost
          money — except YouTube, which is free and comes next. See{" "}
          <Link href="/growth">Growth</Link> for what Inspyr has learned from all of this.
        </p>
      </main>
    </div>
  );
}
