import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, strategySignals, feedbackEvents, opportunities, agentRuns } from "@inspyr/db";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { Nav } from "@/components/Nav";
import { describeSignal } from "@inspyr/ranking";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Growth() {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");

  const signals = await db.select().from(strategySignals)
    .where(and(eq(strategySignals.workspaceId, ws.id), eq(strategySignals.active, true)))
    .orderBy(desc(sql`abs(${strategySignals.effect})`))
    .limit(10);

  const decisions = await db.select({
    eventType: feedbackEvents.eventType,
    count: sql<number>`count(*)::int`,
  }).from(feedbackEvents)
    .where(eq(feedbackEvents.workspaceId, ws.id))
    .groupBy(feedbackEvents.eventType);

  const suppressed = await db.select().from(opportunities)
    .where(and(eq(opportunities.workspaceId, ws.id), sql`${opportunities.adjustmentsJson} != '{}'::jsonb`))
    .orderBy(desc(opportunities.updatedAt))
    .limit(5);

  const runs = await db.select().from(agentRuns)
    .where(eq(agentRuns.workspaceId, ws.id))
    .orderBy(desc(agentRuns.startedAt))
    .limit(5);

  const total = decisions.reduce((s, d) => s + d.count, 0);

  return (
    <div className="shell">
      <Nav active="/growth" />
      <main className="main">
        <div className="page-head">
          <h1>What Inspyr learned</h1>
          <p className="lede">
            Not a report. These are the policy changes your decisions have already produced.
          </p>
        </div>

        {signals.length === 0 ? (
          <div className="empty">
            Nothing learned yet. Inspyr needs a handful of decisions before it will claim a pattern —
            it will not infer a preference from one skip.
          </div>
        ) : (
          <div style={{ borderTop: "1px solid var(--line)" }}>
            {signals.map((s) => (
              <div key={s.id} className="learned">
                <span className="learned-dot" />
                <div>
                  <div style={{ fontSize: 14 }}>
                    {describeSignal({
                      dimension: "topic", key: s.key, effect: s.effect, confidence: s.confidence,
                      sampleSize: s.sampleSize, active: s.active, source: "mixed",
                      evidenceStart: s.evidenceStart!, evidenceEnd: s.evidenceEnd!,
                    })}
                  </div>
                  <div className="note mono">
                    effect {s.effect > 0 ? "+" : ""}{s.effect.toFixed(2)} ·
                    confidence {s.confidence.toFixed(2)} · n={s.sampleSize}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ margin: "34px 0 12px" }}>Decisions recorded</h2>
        {total === 0 ? (
          <div className="empty">No decisions yet.</div>
        ) : (
          <table>
            <thead><tr><th>Event</th><th>Count</th></tr></thead>
            <tbody>
              {decisions.sort((a, b) => b.count - a.count).map((d) => (
                <tr key={d.eventType}>
                  <td className="mono">{d.eventType}</td>
                  <td className="mono">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {suppressed.length > 0 && (
          <>
            <h2 style={{ margin: "34px 0 4px" }}>Ranking changes applied</h2>
            <p className="note" style={{ marginBottom: 12 }}>
              Opportunities whose score was moved by something Inspyr learned or observed.
            </p>
            <table>
              <thead><tr><th>Opportunity</th><th>Adjustments</th><th>Score</th></tr></thead>
              <tbody>
                {suppressed.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/opportunity/${o.id}`}>{o.title.slice(0, 70)}</Link></td>
                    <td className="mono">
                      {Object.entries(o.adjustmentsJson)
                        .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v.toFixed(1)}`)
                        .join(" · ")}
                    </td>
                    <td className="mono">{o.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 style={{ margin: "34px 0 12px" }}>Recent runs</h2>
        {runs.length === 0 ? <div className="empty">No cycles run yet.</div> : (
          <table>
            <thead><tr><th>Started</th><th>Trigger</th><th>State</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{relativeTime(r.startedAt)}</td>
                  <td className="mono">{r.trigger}</td>
                  <td className="mono" style={{ color: r.state === "failed" ? "var(--warn)" : undefined }}>
                    {r.state}
                  </td>
                  <td><Link href={`/runs/${r.id}`}>Trace →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
