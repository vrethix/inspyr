import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, workspaceMemory, replyOutcomes } from "@inspyr/db";
import { listConversationTargets, timelineAdvice } from "@inspyr/pipeline";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { skipConversation } from "@/lib/actions";
import { Nav } from "@/components/Nav";
import {
  AddConversationForm, ReplyOutcomeForm, AudienceSizeForm, FactsForm,
} from "@/components/ConversationForms";
import { formatAge } from "@inspyr/shared";

export const dynamic = "force-dynamic";

const COMPONENT_LABELS: Record<string, string> = {
  reply_position: "Position in thread",
  recency: "Freshness",
  author_reach: "Author reach",
  contribution: "What you add",
  topical_fit: "Topical fit",
};

export default async function Conversations() {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");

  const targets = await listConversationTargets(ws.id);
  const timeline = await timelineAdvice(ws.id, "x");

  const memory = await db.select().from(workspaceMemory)
    .where(and(eq(workspaceMemory.workspaceId, ws.id), eq(workspaceMemory.memoryType, "identity")));
  const facts = (memory.find((m) => m.key === "facts")?.valueJson ?? []) as string[];
  const sizes = (memory.find((m) => m.key === "audience_size")?.valueJson ?? {}) as Record<string, number>;

  const outcomes = await db.select().from(replyOutcomes).where(eq(replyOutcomes.workspaceId, ws.id));
  const converted = outcomes.filter((o) => (o.followsGained ?? 0) > 0 || (o.profileVisits ?? 0) > 0).length;

  const eligible = targets.filter((t) => t.eligible);
  const gated = targets.filter((t) => !t.eligible);

  return (
    <div className="shell">
      <Nav active="/conversations" />
      <main className="main">
        <div className="page-head">
          <h1>Conversations</h1>
          <p className="lede">
            Below about {300} followers, a reply into someone else&rsquo;s audience is the only
            distribution you have. This is where Inspyr decides which ones are worth entering.
          </p>
        </div>

        {!timeline.viable && (
          <div className="panel" style={{ borderColor: "var(--warn)", marginBottom: 20 }}>
            <div className="panel-title">Timeline reach</div>
            <p style={{ fontSize: 13.5 }}>{timeline.message}</p>
          </div>
        )}

        {facts.length === 0 && (
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-title">Set this first</div>
            <p className="note" style={{ marginBottom: 10 }}>
              Inspyr cannot judge a conversation until it knows what you can add to one. Without
              facts configured, every conversation is gated as &ldquo;nothing concrete to say&rdquo;.
            </p>
            <FactsForm initial={facts} />
          </div>
        )}

        <h2 style={{ marginBottom: 12 }}>Judge a conversation</h2>
        <AddConversationForm />

        {eligible.length > 0 && (
          <>
            <h2 style={{ margin: "34px 0 12px" }}>Worth entering ({eligible.length})</h2>
            <div className="queue">
              {eligible.map((t, i) => (
                <div key={t.id} className="queue-item">
                  <div className="queue-rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="queue-body">
                    <a href={t.url} target="_blank" rel="noreferrer">
                      <div className="queue-title">@{t.authorHandle || "unknown"}</div>
                    </a>
                    <div className="queue-why">{t.text.slice(0, 180)}</div>

                    <div className="queue-meta">
                      <span className="queue-score">{t.score.toFixed(1)}</span>
                      <span>{t.replyDepth} replies</span>
                      <span>{formatAge((Date.now() - t.postedAt.getTime()) / 60_000)} old</span>
                      <span className="tag">{t.reachBand}</span>
                      <span>{t.authorFollowers.toLocaleString()} followers</span>
                    </div>

                    {t.contribution && (
                      <div className="note" style={{ marginTop: 6, color: "var(--ok)" }}>
                        Answer from: {t.contribution}
                      </div>
                    )}

                    <details style={{ marginTop: 6 }}>
                      <summary className="note" style={{ cursor: "pointer" }}>How this scored</summary>
                      <div style={{ marginTop: 6 }}>
                        {(t.reasonsJson as { component: string; value: number; explanation: string }[])
                          .map((r) => (
                            <div className="bar" key={r.component}>
                              <span className="bar-label">{COMPONENT_LABELS[r.component] ?? r.component}</span>
                              <span className="bar-track">
                                <span className="bar-fill" style={{ width: `${r.value}%` }} />
                              </span>
                              <span className="bar-value">{r.value.toFixed(0)}</span>
                            </div>
                          ))}
                      </div>
                    </details>

                    <ReplyOutcomeForm targetId={t.id} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {gated.length > 0 && (
          <>
            <h2 style={{ margin: "34px 0 4px" }}>Not worth entering ({gated.length})</h2>
            <p className="note" style={{ marginBottom: 12 }}>
              These failed a gate. A gate is not a low score — it means the reply would not be
              seen, or would add nothing. No amount of good writing changes that.
            </p>
            <div className="queue">
              {gated.map((t) => (
                <div key={t.id} className="queue-item">
                  <div className="queue-rank">—</div>
                  <div className="queue-body">
                    <a href={t.url} target="_blank" rel="noreferrer">
                      <div className="queue-title" style={{ color: "var(--ink-3)" }}>
                        @{t.authorHandle || "unknown"}
                      </div>
                    </a>
                    {(t.gateFailuresJson as { gate: string; reason: string }[]).map((g) => (
                      <div key={g.gate} className="note" data-tone="warn" style={{ marginTop: 4 }}>
                        {g.reason}
                      </div>
                    ))}
                    <form action={skipConversation} style={{ marginTop: 8 }}>
                      <input type="hidden" name="targetId" value={t.id} />
                      <button type="submit">Dismiss</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {outcomes.length > 0 && (
          <>
            <h2 style={{ margin: "34px 0 4px" }}>What replies have produced</h2>
            <p className="note" style={{ marginBottom: 12 }}>
              {converted} of {outcomes.length} replies converted. Every one of these moved the
              prior for its reach band — no training run, no minimum dataset.
            </p>
            <table>
              <thead>
                <tr><th>Band</th><th>Depth</th><th>Impressions</th><th>Visits</th><th>Follows</th></tr>
              </thead>
              <tbody>
                {outcomes.map((o) => {
                  const f = o.featuresJson as Record<string, unknown>;
                  return (
                    <tr key={o.id}>
                      <td className="mono">{String(f.reach_band ?? "—")}</td>
                      <td className="mono">{String(f.reply_depth ?? "—")}</td>
                      <td className="mono">{o.impressions ?? "—"}</td>
                      <td className="mono">{o.profileVisits ?? "—"}</td>
                      <td className="mono" style={{
                        color: (o.followsGained ?? 0) > 0 ? "var(--ok)" : "var(--ink-3)",
                      }}>{o.followsGained ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <h2 style={{ margin: "34px 0 12px" }}>Your reach</h2>
        <AudienceSizeForm initial={sizes} />

        {facts.length > 0 && (
          <>
            <h2 style={{ margin: "34px 0 12px" }}>What you can contribute</h2>
            <FactsForm initial={facts} />
          </>
        )}
      </main>
    </div>
  );
}
