import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, agentRuns, agentSteps } from "@inspyr/db";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { Nav } from "@/components/Nav";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * ARCHITECTURE_v0.2 §19.22 — a full agent run trace must be inspectable from
 * the UI: every step, input, output, model and cost.
 */
export default async function RunTrace({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");
  const { id } = await params;

  const [run] = await db.select().from(agentRuns)
    .where(and(eq(agentRuns.id, id), eq(agentRuns.workspaceId, ws.id))).limit(1);
  if (!run) notFound();

  const steps = await db.select().from(agentSteps)
    .where(eq(agentSteps.agentRunId, run.id)).orderBy(asc(agentSteps.seq));

  return (
    <div className="shell">
      <Nav active="/growth" />
      <main className="main">
        <Link href="/growth" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>← Growth</Link>
        <div className="page-head" style={{ marginTop: 12 }}>
          <h1>Run trace</h1>
          <p className="lede mono">
            {run.trigger} · {run.state} · {relativeTime(run.startedAt)}
            {run.endedAt && ` · ${run.endedAt.getTime() - run.startedAt.getTime()}ms`}
          </p>
        </div>

        {run.errorJson && (
          <div className="panel" style={{ borderColor: "var(--warn)" }}>
            <div className="panel-title">Error</div>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {JSON.stringify(run.errorJson, null, 2)}
            </pre>
          </div>
        )}

        {steps.map((step) => (
          <div className="panel" key={step.id}>
            <div className="panel-title">
              {String(step.seq).padStart(2, "0")} · {step.agentRole} · {step.toolName}
              {step.status === "error" && " · FAILED"}
            </div>
            <div className="note mono" style={{ marginBottom: 7 }}>
              {step.latencyMs}ms
              {step.model && ` · ${step.model}`}
              {step.promptVersion && ` · ${step.promptVersion}`}
            </div>
            <pre className="mono" style={{
              whiteSpace: "pre-wrap", margin: 0, fontSize: 11.5, color: "var(--ink-2)",
              maxHeight: 220, overflow: "auto",
            }}>
              {JSON.stringify(step.outputJson, null, 2)}
            </pre>
          </div>
        ))}

        {steps.length === 0 && <div className="empty">No steps recorded.</div>}
      </main>
    </div>
  );
}
