import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, opportunities, sources, audienceState } from "@inspyr/db";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { runCycleNow } from "@/lib/actions";
import { Nav } from "@/components/Nav";
import { relativeTime, evidenceLabel } from "@/lib/format";
import { fatigueLevel } from "@inspyr/shared";
import { timelineAdvice, nextActions } from "@inspyr/pipeline";
import { NextActions } from "@/components/NextActions";
import { ReadinessForm } from "@/components/ReadinessForm";

export const dynamic = "force-dynamic";

export default async function Today() {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");

  const open = await db.select().from(opportunities)
    .where(and(eq(opportunities.workspaceId, ws.id), inArray(opportunities.status, ["new", "viewed"])))
    .orderBy(desc(opportunities.score));

  // The relevance floor (packages/ranking §RELEVANCE_FLOOR). Everything below it
  // stays scored and inspectable; it is simply not proposed as something to say.
  const queue = open.filter((o) => o.qualifies).slice(0, 12);
  const belowFloor = open.length - open.filter((o) => o.qualifies).length;

  const sourceCount = (await db.select({ id: sources.id }).from(sources)
    .where(eq(sources.workspaceId, ws.id))).length;

  const fatigued = (await db.select().from(audienceState)
    .where(eq(audienceState.workspaceId, ws.id)))
    .filter((f) => fatigueLevel(f.fatigueScore) !== "none")
    .sort((a, b) => b.fatigueScore - a.fatigueScore)
    .slice(0, 3);

  // Below the reach floor, "what to say" is not the binding constraint.
  const timeline = await timelineAdvice(ws.id, "x");
  const actions = await nextActions(ws.id);

  const headline = queue.length === 0
    ? "Nothing worth talking about today."
    : `I found ${queue.length} thing${queue.length === 1 ? "" : "s"} worth talking about today.`;

  return (
    <div className="shell">
      <Nav active="/today" />
      <main className="main">
        <div className="page-head">
          <h1>{headline}</h1>
          <p className="lede">
            {ws.name}
            {queue.length > 0 && " · ranked by what this workspace should publish first"}
          </p>
        </div>

        {!timeline.viable && timeline.followers > 0 && (
          <div className="panel" style={{ borderColor: "var(--warn)", marginBottom: 22 }}>
            <div className="panel-title">Read this first</div>
            <p style={{ fontSize: 13.5 }}>{timeline.message}</p>
          </div>
        )}

        <NextActions data={actions} />

        {sourceCount === 0 && (
          <div className="panel" style={{ marginBottom: 22 }}>
            <div className="panel-title">Start here</div>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
              Inspyr has nothing to watch yet. Add a feed, a page, or paste a note —
              anything you already read or write.
            </p>
            <Link href="/sources" className="btn" style={{ display: "inline-block", marginTop: 6 }}>
              Add sources
            </Link>
          </div>
        )}

        {fatigued.length > 0 && (
          <div className="panel" style={{ marginBottom: 22 }}>
            <div className="panel-title">Audience state</div>
            {fatigued.map((f) => (
              <div key={f.id} className="note" data-tone="warn" style={{ marginBottom: 3 }}>
                <strong style={{ fontWeight: 540 }}>{f.key}</strong> — {f.recentCount} recent post
                {f.recentCount === 1 ? "" : "s"} covered this. Expect a weaker response even if it
                normally performs.
              </div>
            ))}
          </div>
        )}

        <form action={runCycleNow} style={{ marginBottom: 18 }}>
          <button type="submit">Run a cycle now</button>
        </form>

        {queue.length === 0 && sourceCount > 0 && (
          <div className="empty">
            {belowFloor > 0 ? (
              <>
                Your sources produced {belowFloor} item{belowFloor === 1 ? "" : "s"}, but none of
                them matched this workspace&rsquo;s pillars or audience. That is a real answer:
                today there is nothing here worth saying as {ws.name}.
                {" "}Saying nothing is a legitimate decision.
              </>
            ) : (
              <>Sources are connected but have not produced anything yet. Run a cycle, or give the
              feeds time to publish.</>
            )}
          </div>
        )}

        <div className="queue">
          {queue.map((opp, i) => {
            const notes = (opp.fatigueJson?.notes ?? []) as string[];
            const adjustments = opp.adjustmentsJson;
            const suppressed = Object.entries(adjustments).filter(([, v]) => v < 0);

            return (
              <div key={opp.id} className="queue-item">
                <div className="queue-rank">{String(i + 1).padStart(2, "0")}</div>
                <div className="queue-body">
                  <Link href={`/opportunity/${opp.id}`}>
                    <div className="queue-title">{opp.title}</div>
                  </Link>
                  <div className="queue-why">{opp.whyItMatters}</div>

                  <div className="queue-meta">
                    <span className="queue-score">{opp.score.toFixed(1)}</span>
                    <span>{relativeTime(opp.createdAt)}</span>
                    {opp.recommendedAngle && <span className="tag">{opp.recommendedAngle}</span>}
                    {opp.understandingSource === "heuristic" && (
                      <span className="tag" data-tone="warn">no model — heuristic</span>
                    )}
                    {suppressed.length > 0 && (
                      <span className="tag" data-tone="warn">down-ranked</span>
                    )}
                  </div>

                  {notes.length > 0 && (
                    <div className="note" data-tone="warn" style={{ marginTop: 6 }}>{notes[0]}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <details style={{ marginTop: 34 }}>
          <summary className="panel-title" style={{ cursor: "pointer" }}>
            What do you have so far?
          </summary>
          <p className="note" style={{ margin: "8px 0 12px" }}>
            Tick what is true today. This changes what Inspyr recommends above.
          </p>
          <ReadinessForm initial={actions.readiness} />
        </details>

        {queue.length > 0 && (
          <div className="evidence">
            {evidenceLabel(queue[0]!.evidenceTier, queue[0]!.evidenceSampleSize)}
            {belowFloor > 0 && (
              <> · {belowFloor} more item{belowFloor === 1 ? "" : "s"} were ranked but did not
              match this workspace, so they are not proposed.</>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
