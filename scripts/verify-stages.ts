/**
 * Shows how differently Inspyr behaves at each stage, on each kind of platform.
 *   npx tsx scripts/verify-stages.ts
 */
import { loadEnv } from "@inspyr/shared/env";

loadEnv();

import { eq } from "drizzle-orm";
import { db, sql, workspaces } from "@inspyr/db";
import { savePlatformSelection, workspaceStage, nextActions } from "@inspyr/pipeline";
import { stagePolicy, detectStage } from "@inspyr/shared";

console.log("SAME STAGE, DIFFERENT PLATFORM\n");
for (const platform of ["tiktok", "linkedin"]) {
  const p = stagePolicy("0_1k", platform);
  console.log(`${platform} at 0-1k  [${p.kind}]`);
  console.log(`  bottleneck  ${p.bottleneck}`);
  console.log(`  do          ${p.levers[0]}`);
  console.log(`  don't       ${p.antiPatterns[0]}`);
  console.log(`  cadence     ${p.cadence.target}/week — ${p.cadence.note}`);
  console.log(`  timeline    ${p.timelineViable ? "worth posting to" : "NOT worth posting to"}\n`);
}

console.log("SAME PLATFORM, AS IT GROWS\n");
for (const followers of [9, 4_000, 40_000, 400_000]) {
  const stage = detectStage(followers);
  const p = stagePolicy(stage, "youtube");
  console.log(`youtube @ ${followers.toLocaleString().padStart(8)}  ${stage.padEnd(9)} ${p.cadence.target}/wk`);
  console.log(`   watch: ${p.primaryMetric}`);
  console.log(`   fix:   ${p.bottleneck}\n`);
}

const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, "tako")).limit(1);
if (ws) {
  await savePlatformSelection(ws.id, ["x", "youtube"]);
  const stage = await workspaceStage(ws.id);
  const actions = await nextActions(ws.id);

  console.log("TAKO, LIVE\n");
  console.log(`  primary     ${stage.primary?.platform} · ${stage.primary?.followers} · ${stage.primary?.stageLabel}`);
  console.log(`  cold start  ${stage.coldStart}`);
  console.log(`  instruction ${actions.instruction}\n`);
  console.log("  do next:");
  actions.available.slice(0, 3).forEach((a, i) =>
    console.log(`    ${i + 1}. ${a.label} [${a.channelLabel}] — value ${a.value}`));
  console.log("\n  blocked by stage:");
  actions.blocked.filter((b) => b.blockedBy.some((x) => x.includes("followers on")))
    .forEach((b) => console.log(`    ${b.label} — ${b.blockedBy[0]}`));
}
await sql.end();
