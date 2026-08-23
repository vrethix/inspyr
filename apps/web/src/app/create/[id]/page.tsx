import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db, opportunities, opportunitySources, sourceItems, drafts, draftEdits, actionSpecs,
} from "@inspyr/db";
import { PLATFORMS, DEFAULT_CHANNEL_POLICIES, type Platform, type DraftContent, type Review } from "@inspyr/shared";
import { describeChecks, REPETITION_WARN_THRESHOLD } from "@inspyr/channels";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { createDraft, approveDraftAction, discardDraft } from "@/lib/actions";
import { Nav } from "@/components/Nav";
import { DraftEditor } from "@/components/DraftEditor";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const VERDICT_TONE: Record<string, string | undefined> = {
  match: "var(--ok)", clear: "var(--ok)", strong: "var(--ok)", native: "var(--ok)",
  adequate: undefined, drift: "var(--warn)", muddy: "var(--warn)",
  weak: "var(--warn)", translated: "var(--warn)",
  off: "var(--accent)", wrong_format: "var(--accent)",
};

export default async function Create({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");

  const { id } = await params;
  const { channel: requested } = await searchParams;
  const channel = (PLATFORMS as readonly string[]).includes(requested ?? "")
    ? (requested as Platform) : "x";

  const [opp] = await db.select().from(opportunities)
    .where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, ws.id))).limit(1);
  if (!opp) notFound();

  const links = await db.select({ id: opportunitySources.sourceItemId })
    .from(opportunitySources).where(eq(opportunitySources.opportunityId, opp.id));
  const evidence = links.length
    ? await db.select().from(sourceItems).where(and(
        eq(sourceItems.workspaceId, ws.id),
        inArray(sourceItems.id, links.map((l) => l.id)),
      ))
    : [];

  const allDrafts = await db.select().from(drafts)
    .where(and(eq(drafts.workspaceId, ws.id), eq(drafts.opportunityId, opp.id)))
    .orderBy(desc(drafts.version));

  const draft = allDrafts.find((d) => d.channel === channel && d.state !== "discarded");
  const edits = draft
    ? await db.select().from(draftEdits).where(eq(draftEdits.draftId, draft.id))
        .orderBy(desc(draftEdits.createdAt)).limit(5)
    : [];

  const specs = await db.select().from(actionSpecs)
    .where(and(eq(actionSpecs.workspaceId, ws.id), eq(actionSpecs.opportunityId, opp.id)));

  const review = (draft?.reviewJson ?? null) as Review | null;
  const checks = (draft?.checksJson ?? {}) as {
    constraintViolations?: string[]; repetitionRisk?: number;
    closestPriorTitle?: string | null; groundingCoverage?: number | null;
  };
  const checkNotes = draft ? describeChecks({
    constraintViolations: checks.constraintViolations ?? [],
    repetitionRisk: checks.repetitionRisk ?? 0,
    closestPriorTitle: checks.closestPriorTitle ?? null,
    groundingCoverage: checks.groundingCoverage ?? null,
  }) : [];

  const angles = (opp.anglesJson ?? []) as { kind: string; thesis: string }[];

  return (
    <div className="shell">
      <Nav active="/today" />
      <main className="main" style={{ maxWidth: 1240 }}>
        <Link href={`/opportunity/${opp.id}`} style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          ← Opportunity
        </Link>

        <div className="page-head" style={{ marginTop: 12 }}>
          <h1>{opp.title}</h1>
          <p className="lede">
            {ws.name} · creating for {DEFAULT_CHANNEL_POLICIES[channel].label}
            {" · "}
            <span className="mono">{opp.score.toFixed(1)}</span>
          </p>
        </div>

        {/* Channel tabs. Switching does not reformat — each channel has its own draft. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
          {PLATFORMS.map((p) => {
            const has = allDrafts.some((d) => d.channel === p && d.state !== "discarded");
            return (
              <Link key={p} href={`/create/${opp.id}?channel=${p}`}
                className="btn"
                style={{
                  borderColor: p === channel ? "var(--accent)" : "var(--line-strong)",
                  color: p === channel ? "var(--accent)" : "var(--ink-2)",
                }}>
                {DEFAULT_CHANNEL_POLICIES[p].label}{has ? " ·" : ""}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr) 280px", gap: 22 }}>
          {/* ---------------- left: source truth ---------------- */}
          <aside>
            <div className="panel-title">Brief</div>
            <p className="note" style={{ marginBottom: 12 }}>{opp.whyItMatters}</p>

            <div className="panel-title">Angle</div>
            <p className="note" style={{ marginBottom: 4 }}>
              <span className="tag" data-tone="accent">{draft?.angle ?? opp.recommendedAngle}</span>
            </p>
            <p className="note" style={{ marginBottom: 14 }}>
              {angles.find((a) => a.kind === (draft?.angle ?? opp.recommendedAngle))?.thesis}
            </p>

            <div className="panel-title">Objective</div>
            <p className="note" style={{ marginBottom: 14 }}>
              {specs.find((s) => s.channel === channel)?.objective
                ?? Object.keys(DEFAULT_CHANNEL_POLICIES[channel].rewardWeights).join(", ")}
            </p>

            <div className="panel-title">Source truth ({evidence.length})</div>
            {evidence.map((item) => (
              <div key={item.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 540 }}>
                  {item.canonicalUrl
                    ? <a href={item.canonicalUrl} target="_blank" rel="noreferrer">{item.title}</a>
                    : item.title}
                </div>
                <div className="note">{item.summary?.slice(0, 180)}</div>
              </div>
            ))}
            {evidence.length === 0 && <p className="note">No linked sources.</p>}
          </aside>

          {/* ---------------- centre: native editor ---------------- */}
          <section>
            {!draft ? (
              <div className="panel">
                <div className="panel-title">No {DEFAULT_CHANNEL_POLICIES[channel].label} draft yet</div>
                <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                  {DEFAULT_CHANNEL_POLICIES[channel].craft.split("\n")[0]}
                </p>
                <form action={createDraft} style={{ marginTop: 10 }}>
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <input type="hidden" name="channel" value={channel} />
                  <button type="submit" data-variant="primary">
                    Write the {DEFAULT_CHANNEL_POLICIES[channel].label} version
                  </button>
                </form>
              </div>
            ) : (
              <>
                <div className="queue-meta" style={{ marginBottom: 12 }}>
                  <span className="tag">{draft.actionType}</span>
                  <span>v{draft.version}</span>
                  <span>{relativeTime(draft.updatedAt)}</span>
                  {draft.origin === "heuristic" && (
                    <span className="tag" data-tone="warn">scaffold — no model configured</span>
                  )}
                  {draft.state === "approved" && <span className="tag" data-tone="accent">approved</span>}
                </div>

                <DraftEditor
                  draftId={draft.id}
                  opportunityId={opp.id}
                  channel={draft.channel}
                  initial={draft.contentJson as unknown as DraftContent}
                />

                <div className="actions" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                  <form action={createDraft}>
                    <input type="hidden" name="opportunityId" value={opp.id} />
                    <input type="hidden" name="channel" value={channel} />
                    <button type="submit">Regenerate</button>
                  </form>
                  <form action={approveDraftAction}>
                    <input type="hidden" name="opportunityId" value={opp.id} />
                    <input type="hidden" name="draftId" value={draft.id} />
                    <button type="submit" data-variant="primary">Approve</button>
                  </form>
                  <form action={discardDraft}>
                    <input type="hidden" name="opportunityId" value={opp.id} />
                    <input type="hidden" name="draftId" value={draft.id} />
                    <button type="submit">Discard</button>
                  </form>
                </div>
                <p className="note" style={{ marginTop: 8 }}>
                  Approved drafts stop here for now — publishing lands in the next milestone.
                </p>
              </>
            )}
          </section>

          {/* ---------------- right: Inspyr review ---------------- */}
          <aside>
            <div className="panel-title">Inspyr review</div>

            {!draft && <p className="note">Nothing to review yet.</p>}

            {draft && checkNotes.length > 0 && (
              <div className="panel" style={{ borderColor: "var(--warn)", marginBottom: 12 }}>
                <div className="panel-title">Checks</div>
                {checkNotes.map((n, i) => (
                  <div key={i} className="note" data-tone="warn" style={{ marginBottom: 3 }}>{n}</div>
                ))}
              </div>
            )}

            {draft && checkNotes.length === 0 && (
              <p className="note" style={{ color: "var(--ok)", marginBottom: 12 }}>
                Format constraints pass. No repetition against your published content.
              </p>
            )}

            {review && (
              <>
                {([
                  ["Voice", review.voice],
                  ["Clarity", review.clarity],
                  ["Hook", review.hook],
                  ["Structure", review.structure],
                ] as const).map(([label, item]) => (
                  <div key={label} style={{ marginBottom: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span style={{ color: "var(--ink-2)" }}>{label}</span>
                      <span className="mono" style={{ color: VERDICT_TONE[item.verdict] ?? "var(--ink-3)" }}>
                        {item.verdict.replace("_", " ")}
                      </span>
                    </div>
                    <div className="note">{item.note}</div>
                  </div>
                ))}

                {review.claims.length > 0 && (
                  <>
                    <div className="panel-title" style={{ marginTop: 16 }}>Grounding</div>
                    {review.claims.map((c, i) => (
                      <div key={i} style={{ marginBottom: 7 }}>
                        <div className="note" style={{
                          color: c.status === "supported" ? "var(--ink-3)" : "var(--warn)",
                        }}>
                          {c.status !== "supported" && "⚠ "}{c.text}
                        </div>
                        {c.status !== "supported" && <div className="note">{c.note}</div>}
                      </div>
                    ))}
                  </>
                )}

                <div className="panel" style={{ marginTop: 14 }}>
                  <div className="panel-title">One improvement</div>
                  <p style={{ fontSize: 13 }}>{review.one_improvement}</p>
                </div>
              </>
            )}

            {draft && !review && (
              <p className="note" style={{ marginTop: 10 }}>
                Deterministic checks only — no model configured, so voice, clarity and grounding
                were not assessed.
              </p>
            )}

            {edits.length > 0 && (
              <>
                <div className="panel-title" style={{ marginTop: 18 }}>Your edits</div>
                {edits.map((e) => (
                  <div key={e.id} className="note mono" style={{ marginBottom: 3 }}>
                    v{e.fromVersion}→v{e.toVersion} · {Math.round(e.changeRatio * 100)}% rewritten
                    {e.intent !== "manual" && ` · ${e.intent}`}
                  </div>
                ))}
              </>
            )}

            {specs.length > 0 && (
              <>
                <div className="panel-title" style={{ marginTop: 18 }}>Considered</div>
                <p className="note" style={{ marginBottom: 6 }}>
                  {specs.length} action{specs.length === 1 ? "" : "s"} enumerated across channels.
                  Only the chosen one was written.
                </p>
                {specs.filter((s) => s.channel === channel).map((s) => (
                  <div key={s.id} className="note mono" style={{
                    color: s.status === "chosen" ? "var(--ink-2)" : "var(--ink-3)",
                  }}>
                    {s.status === "chosen" ? "▸ " : "  "}{s.actionType} · {s.angle}
                  </div>
                ))}
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
