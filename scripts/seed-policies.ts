import { loadEnv } from "@inspyr/shared";

loadEnv();

import { db, sql, workspaces } from "@inspyr/db";
import { ensureChannelPolicies } from "@inspyr/pipeline";

for (const ws of await db.select().from(workspaces)) {
  await ensureChannelPolicies(ws.id);
  console.log(`channel policies ready for ${ws.name}`);
}
await sql.end();
