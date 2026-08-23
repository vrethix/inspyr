import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * BUILD_SPEC_v0.1 §28.13 — every workspace query enforces tenant scope.
 *
 * This is deliberately a tiny helper rather than a convention: a convention is
 * something you forget at 2am, a helper is something the type checker asks for.
 */
export function scoped(
  workspaceColumn: PgColumn,
  workspaceId: string,
  ...rest: (SQL | undefined)[]
): SQL {
  const clauses = [eq(workspaceColumn, workspaceId), ...rest.filter(Boolean)] as SQL[];
  return (clauses.length === 1 ? clauses[0]! : and(...clauses)!) as SQL;
}

export class TenantViolationError extends Error {
  constructor(entity: string, id: string, workspaceId: string) {
    super(`${entity} ${id} does not belong to workspace ${workspaceId}`);
    this.name = "TenantViolationError";
  }
}

/** Guard for single-row reads: never return a row from another workspace. */
export function assertTenant<T extends { workspaceId: string }>(
  row: T | undefined,
  workspaceId: string,
  entity: string,
  id: string,
): T {
  if (!row || row.workspaceId !== workspaceId) {
    throw new TenantViolationError(entity, id, workspaceId);
  }
  return row;
}
