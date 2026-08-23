import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, sources, sourceItems, priorContent } from "@inspyr/db";
import { currentUser } from "@/lib/auth";
import { activeWorkspace } from "@/lib/workspace";
import { removeSource, resyncSource } from "@/lib/actions";
import { Nav } from "@/components/Nav";
import { SourceForm, ImportForm } from "@/components/SourceForm";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Sources() {
  if (!(await currentUser())) redirect("/login");
  const ws = await activeWorkspace();
  if (!ws) redirect("/onboarding");

  const rows = await db.select().from(sources)
    .where(eq(sources.workspaceId, ws.id)).orderBy(desc(sources.createdAt));
  const itemCount = (await db.select({ id: sourceItems.id }).from(sourceItems)
    .where(eq(sourceItems.workspaceId, ws.id))).length;
  const priorCount = (await db.select({ id: priorContent.id }).from(priorContent)
    .where(eq(priorContent.workspaceId, ws.id))).length;

  return (
    <div className="shell">
      <Nav active="/sources" />
      <main className="main">
        <div className="page-head">
          <h1>Sources</h1>
          <p className="lede">
            What Inspyr is allowed to watch. {itemCount} item{itemCount === 1 ? "" : "s"} ingested
            · {priorCount} prior post{priorCount === 1 ? "" : "s"} imported.
          </p>
        </div>

        {rows.length > 0 && (
          <table style={{ marginBottom: 30 }}>
            <thead>
              <tr><th>Source</th><th>Type</th><th>Last sync</th><th>Items</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 520 }}>{s.label || "(untitled)"}</div>
                    {s.lastError && <div className="note" data-tone="warn">{s.lastError.slice(0, 110)}</div>}
                  </td>
                  <td className="mono">{s.type}</td>
                  <td className="mono">{s.lastSyncedAt ? relativeTime(s.lastSyncedAt) : "never"}</td>
                  <td className="mono">{s.itemsIngested}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <form action={resyncSource}>
                        <input type="hidden" name="sourceId" value={s.id} />
                        <button type="submit">Sync</button>
                      </form>
                      <form action={removeSource}>
                        <input type="hidden" name="sourceId" value={s.id} />
                        <button type="submit">Remove</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 style={{ marginBottom: 12 }}>Add a source</h2>
        <SourceForm />

        <h2 style={{ margin: "34px 0 4px" }}>Import prior content</h2>
        <p className="note" style={{ marginBottom: 12 }}>
          Inspyr needs to know what you have already said — that is what novelty and audience
          fatigue are measured against.
        </p>
        <ImportForm />
      </main>
    </div>
  );
}
