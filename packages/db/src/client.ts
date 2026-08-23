import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgresql://localhost:5432/inspyr";

declare global {
  // eslint-disable-next-line no-var
  var __inspyrSql: ReturnType<typeof postgres> | undefined;
}

// Next dev reloads modules; reuse the pool so we don't exhaust connections.
const sql = globalThis.__inspyrSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalThis.__inspyrSql = sql;

export const db = drizzle(sql, { schema });
export { sql, schema };
export type Db = typeof db;
