import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, opportunities, opportunitySources, sourceItems } from "@inspyr/db";
import { COMPONENT_WEIGHTS, type ScoreComponent } from "@inspyr/shared";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { decideOpportunity } from "@/lib/actions";
import { Nav } from "@/components/Nav";
import { COMPONENT_LABELS, ADJUSTMENT_LABELS, evidenceLabel, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Angle { kind: string; headline: string; thesis: string; why_this_workspace: string }
interface Output { platform: string; format: string; rationale: string }

export default async function OpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");
  const { id } = await params;

  // §28.13 — tenant scope in the query itself, not checked afterwards.
  const [opp] = await db.select().from(opportunities)
    .where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, ws.id)))
    .limit(1);
  if (!opp) notFound();

  const links = await db.select({ id: opportunitySources.sourceItemId })
    .from(opportunitySources).where(eq(opportunitySources.opportunityId, opp.id));
  const evidence = links.length
    ? await db.select().from(sourceItems).where(inArray(sourceItems.id, links.map((l) => l.id)))
    : [];

  const angles = (opp.anglesJson ?? []) as unknown as Angle[];
  const outputs = (opp.recommendedOutputsJson ?? []) as unknown as Output[];
  const components = opp.scoreComponentsJson as Record<ScoreComponent, number>;
  const adjustments = opp.adjustmentsJson;
  const notes = (opp.fatigueJson?.notes ?? []) as string[];

  const ordered = (Object.keys(components) as ScoreComponent[])
    .sort((a, b) => COMPONENT_WEIGHTS[b] * components[b] - COMPONENT_WEIGHTS[a] * components[a]);

  const decisions = [
    { value: "saved", label: "Save" },
    { value: "skipped", label: "Skip" },
    { value: "already_covered", label: "Already covered" },
    { value: "rejected", label: "Not relevant" },
  ];

  return (
    <div className="shell">
      <Nav active="/today" />
      <main className="main">
        <Link href="/today" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>← Today</Link>

        <div className="page-head" style={{ marginTop: 12 }}>
          <h1>{opp.title}</h1>
          <p className="lede">
            <span className="mono">{opp.score.toFixed(1)}</span> · {ws.name} · {relativeTime(opp.createdAt)}
            {opp.understandingSource === "heuristic" && " · heuristic (no model configured)"}
          </p>
        </div>

        {/* Reasoning is not hidden behind an "AI Insights" modal (§5.1). */}
        <div className="panel">
          <div className="panel-title">Why it matters</div>
          <p>{opp.whyItMatters}</p>
        </div>

        <div className="panel">
          <div className="panel-title">Why it matters to {ws.name}</div>
          <p>{opp.whyItFits}</p>
        </div>

        <div className="panel">
          <div className="panel-title">Why now</div>
          <p>{opp.whyNow}</p>
          {notes.map((n, i) => (
            <p key={i} className="note" data-tone="warn" style={{ marginTop: 6 }}>{n}</p>
          ))}
        </div>

        <div className="panel">
          <div className="panel-title">How this was scored</div>
          {ordered.map((key) => (
            <div className="bar" key={key}>
              <span className="bar-label">{COMPONENT_LABELS[key] ?? key}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${components[key]}%` }} />
              </span>
              <span className="bar-value">{components[key].toFixed(0)}</span>
            </div>
          ))}

          {Object.keys(adjustments).length > 0 && (
            <div style={{ marginTop: 13, paddingTop: 11, borderTop: "1px solid var(--line)" }}>
              {Object.entries(adjustments).map(([key, value]) => (
                <div key={key} className="note" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{ADJUSTMENT_LABELS[key] ?? key}</span>
                  <span className="mono" style={{ color: value < 0 ? "var(--warn)" : "var(--ok)" }}>
                    {value > 0 ? "+" : ""}{value.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="evidence">{evidenceLabel(opp.evidenceTier, opp.evidenceSampleSize)}</div>
        </div>

        <div className="panel">
          <div className="panel-title">Angles</div>
          {angles.map((angle, i) => (
            <div key={i} style={{ paddingBottom: 11, marginBottom: 11,
              borderBottom: i < angles.length - 1 ? "1px solid var(--line)" : "none" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span className="tag" data-tone={angle.kind === opp.recommendedAngle ? "accent" : undefined}>
                  {angle.kind}
                </span>
                <strong style={{ fontWeight: 540, fontSize: 14 }}>{angle.headline}</strong>
              </div>
              <p className="note" style={{ marginTop: 4 }}>{angle.thesis}</p>
            </div>
          ))}
        </div>

        {outputs.length > 0 && (
          <div className="panel">
            <div className="panel-title">Suggested outputs</div>
            {outputs.map((o, i) => (
              <div key={i} className="note" style={{ marginBottom: 4 }}>
                <span className="tag">{o.platform}</span>{" "}
                <strong style={{ fontWeight: 540 }}>{o.format}</strong> — {o.rationale}
              </div>
            ))}
          </div>
        )}

        <div className="panel">
          <div className="panel-title">Source evidence ({evidence.length})</div>
          {evidence.map((item) => (
            <div key={item.id} style={{ marginBottom: 11 }}>
              <div style={{ fontSize: 13.5, fontWeight: 540 }}>
                {item.canonicalUrl
                  ? <a href={item.canonicalUrl} target="_blank" rel="noreferrer">{item.title}</a>
                  : item.title}
              </div>
              <div className="note">{item.summary?.slice(0, 260)}</div>
              {item.claimsJson.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary className="note" style={{ cursor: "pointer" }}>
                    {item.claimsJson.length} extracted claim{item.claimsJson.length === 1 ? "" : "s"}
                  </summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 17 }}>
                    {item.claimsJson.map((c, i) => (
                      <li key={i} className="note" style={{ color: c.supported ? "var(--ink-3)" : "var(--warn)" }}>
                        {c.text}{!c.supported && " (unsupported)"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          {evidence.length === 0 && <div className="note">No linked source items.</div>}
        </div>

        <div className="actions">
          {/* Create is a navigation, not a decision: the decision is recorded
              when a draft is actually generated. */}
          <Link href={`/create/${opp.id}`} className="btn"
            style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}>
            Create
          </Link>
          {decisions.map((d) => (
            <form key={d.value} action={decideOpportunity}>
              <input type="hidden" name="opportunityId" value={opp.id} />
              <input type="hidden" name="decision" value={d.value} />
              <button type="submit">{d.label}</button>
            </form>
          ))}
        </div>
        <p className="note" style={{ marginTop: 9 }}>
          Every one of these is a learning event. A skip teaches Inspyr as much as a create.
        </p>
      </main>
    </div>
  );
}
