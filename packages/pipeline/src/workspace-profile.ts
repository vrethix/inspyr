import { db, workspaceMemory, workspaces } from "@inspyr/db";
import { eq, and } from "drizzle-orm";
import type { WorkspaceProfile } from "@inspyr/ranking";

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Assembles identity memory (§5.7-A) into the profile every downstream step
 * reads. Deliberately small: ARCHITECTURE_v0.2 §12 — build only the context a
 * step needs, never the whole brand dumped into a prompt.
 */
export async function loadWorkspaceProfile(workspaceId: string): Promise<WorkspaceProfile> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);

  const memories = await db.select().from(workspaceMemory)
    .where(and(eq(workspaceMemory.workspaceId, workspaceId), eq(workspaceMemory.memoryType, "identity")));

  const get = (key: string): unknown => memories.find((m) => m.key === key)?.valueJson;

  return {
    id: ws.id,
    name: ws.name,
    objective: ws.objective,
    audience: asString(get("audience")),
    voice: asString(get("voice")),
    pillars: asStringArray(get("pillars")),
    avoid: asStringArray(get("avoid")),
    strategicPriorities: asStringArray(get("strategic_priorities")),
  };
}
