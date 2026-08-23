/**
 * CLI: run one full cycle for a workspace without Redis.
 *   npm run run-cycle --workspace=@inspyr/worker -- <workspace-id|slug>
 */
import { loadEnv } from "@inspyr/shared";

loadEnv();

import { db, workspaces } from "@inspyr/db";
import { eq } from "drizzle-orm";
import { runCycle } from "@inspyr/pipeline";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: run-cycle <workspace-id|slug>");
  process.exit(1);
}

const all = await db.select().from(workspaces);
const ws = all.find((w) => w.id === arg || w.slug === arg);
if (!ws) {
  console.error(`no workspace matching "${arg}". Available: ${all.map((w) => w.slug).join(", ")}`);
  process.exit(1);
}

console.log(`[cycle] ${ws.name} (${ws.slug})`);
const result = await runCycle(ws.id, "cli");
console.log(JSON.stringify(result, null, 2));
process.exit(0);
