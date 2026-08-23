import { db, workspaces, assertTenant } from "@inspyr/db";
import { eq, and, asc } from "drizzle-orm";
import { cookies } from "next/headers";
import { requireUser } from "./auth";

const WS_COOKIE = "inspyr_ws";

export async function listWorkspaces() {
  const user = await requireUser();
  return db.select().from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .orderBy(asc(workspaces.createdAt));
}

/**
 * Resolves the active workspace and proves ownership.
 * §28.13 — every workspace query enforces tenant scope; this is where that
 * starts, so no page can accidentally read across identities.
 */
export async function activeWorkspace() {
  const user = await requireUser();
  const jar = await cookies();
  const preferred = jar.get(WS_COOKIE)?.value;

  if (preferred) {
    const [row] = await db.select().from(workspaces)
      .where(and(eq(workspaces.id, preferred), eq(workspaces.ownerId, user.id)))
      .limit(1);
    if (row) return row;
  }

  const [first] = await db.select().from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  return first ?? null;
}

export async function requireWorkspace() {
  const ws = await activeWorkspace();
  if (!ws) throw new Error("NO_WORKSPACE");
  return ws;
}

export async function setActiveWorkspace(workspaceId: string) {
  const user = await requireUser();
  const [row] = await db.select().from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1);
  assertTenant(row ? { ...row, workspaceId: row.id } : undefined, workspaceId, "workspace", workspaceId);
  const jar = await cookies();
  jar.set(WS_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/" });
}
