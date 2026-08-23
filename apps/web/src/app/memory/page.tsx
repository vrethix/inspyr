import { redirect } from "next/navigation";
import { and, eq, desc } from "drizzle-orm";
import { db, workspaceMemory, strategySignals } from "@inspyr/db";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { forgetSignal } from "@/lib/actions";
import { Nav } from "@/components/Nav";
import { MemoryForm } from "@/components/MemoryForm";
import { describeSignal } from "@inspyr/ranking";

export const dynamic = "force-dynamic";

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export default async function Memory() {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");

  const identity = await db.select().from(workspaceMemory)
    .where(and(eq(workspaceMemory.workspaceId, ws.id), eq(workspaceMemory.memoryType, "identity")));
  const get = (k: string) => identity.find((m) => m.key === k)?.valueJson;

  const learned = await db.select().from(strategySignals)
    .where(eq(strategySignals.workspaceId, ws.id))
    .orderBy(desc(strategySignals.updatedAt));

  return (
    <div className="shell">
      <Nav active="/memory" />
      <main className="main">
        <div className="page-head">
          <h1>Memory</h1>
          <p className="lede">
            What you told Inspyr, and what Inspyr worked out for itself. The two are never blurred,
            and anything learned can be removed.
          </p>
        </div>

        <h2 style={{ marginBottom: 3 }}>You told Inspyr</h2>
        <p className="note" style={{ marginBottom: 14 }}>Stable identity. Inspyr never overwrites this.</p>
        <MemoryForm
          initial={{
            objective: ws.objective,
            audience: str(get("audience")),
            voice: str(get("voice")),
            pillars: arr(get("pillars")),
            avoid: arr(get("avoid")),
            priorities: arr(get("strategic_priorities")),
          }}
        />

        <h2 style={{ margin: "36px 0 3px" }}>Inspyr learned</h2>
        <p className="note" style={{ marginBottom: 14 }}>
          Derived from your decisions. A signal below the evidence threshold is recorded but
          inactive — it does not move ranking until it has enough behind it.
        </p>

        {learned.length === 0 ? (
          <div className="empty">
            Nothing learned yet. Save, skip or reject a few opportunities and this fills in.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Signal</th><th>Effect</th><th>Evidence</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {learned.map((s) => (
                <tr key={s.id}>
                  <td>{describeSignal({
                    dimension: "topic", key: s.key, effect: s.effect,
                    confidence: s.confidence, sampleSize: s.sampleSize, active: s.active,
                    source: "mixed", evidenceStart: s.evidenceStart!, evidenceEnd: s.evidenceEnd!,
                  })}</td>
                  <td className="mono" style={{ color: s.effect < 0 ? "var(--warn)" : "var(--ok)" }}>
                    {s.effect > 0 ? "+" : ""}{s.effect.toFixed(2)}
                  </td>
                  <td className="mono">n={s.sampleSize}</td>
                  <td className="mono">{s.active ? "active" : "below threshold"}</td>
                  <td>
                    <form action={forgetSignal}>
                      <input type="hidden" name="signalId" value={s.id} />
                      <button type="submit">Forget</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
