/**
 * Acceptance criterion #12 (BUILD_SPEC_v0.1 §20): a decision made now must
 * measurably change the next ranking. If this script prints "unchanged",
 * Inspyr does not learn yet and the milestone is not done.
 *
 *   npx tsx scripts/verify-loop.ts <workspace-slug>
 */
import { loadEnv } from "@inspyr/shared/env";

loadEnv();

import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db, sql, workspaces, opportunities, opportunitySources, sourceItems,
  feedbackEvents, strategySignals,
} from "@inspyr/db";
import { recomputeStrategySignals, rankOpportunities } from "@inspyr/pipeline";

const slug = process.argv[2] ?? "aitorch";
const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
if (!ws) throw new Error(`no workspace ${slug}`);

const [target] = await db.select().from(opportunities)
  .where(and(eq(opportunities.workspaceId, ws.id), eq(opportunities.qualifies, true)))
  .orderBy(desc(opportunities.score)).limit(1);
if (!target) throw new Error("no qualifying opportunity — run a cycle first");

const links = await db.select({ id: opportunitySources.sourceItemId })
  .from(opportunitySources).where(eq(opportunitySources.opportunityId, target.id));
const items = await db.select({ topics: sourceItems.topicsJson }).from(sourceItems)
  .where(inArray(sourceItems.id, links.map((l) => l.id)));
const topics = [...new Set(items.flatMap((i) => i.topics))].slice(0, 4);

console.log(`workspace   ${ws.name}`);
console.log(`opportunity ${target.title.slice(0, 60)}`);
console.log(`topics      ${topics.join(", ")}`);
console.log(`score before ${target.score.toFixed(2)}  (fit ${target.scoreComponentsJson.historical_topic_fit})`);

// Three rejections of these topics — the operator saying "not this, repeatedly".
for (let i = 0; i < 3; i++) {
  await db.insert(feedbackEvents).values({
    workspaceId: ws.id, eventType: "opportunity_rejected",
    entityType: "opportunity", entityId: target.id,
    metadataJson: { topics, decision: "rejected", synthetic: true },
  });
}

const derived = await recomputeStrategySignals(ws.id);
await rankOpportunities(ws.id);

const [after] = await db.select().from(opportunities).where(eq(opportunities.id, target.id)).limit(1);
const active = await db.select().from(strategySignals)
  .where(and(eq(strategySignals.workspaceId, ws.id), eq(strategySignals.active, true)));

console.log(`\nsignals derived ${derived}, active ${active.length}`);
for (const s of active.slice(0, 4)) {
  console.log(`  ${s.key.padEnd(20)} effect ${s.effect.toFixed(3)}  conf ${s.confidence.toFixed(2)}  n=${s.sampleSize}`);
}
console.log(`\nscore after  ${after!.score.toFixed(2)}  (fit ${after!.scoreComponentsJson.historical_topic_fit})`);
console.log(`adjustments  ${JSON.stringify(after!.adjustmentsJson)}`);
console.log(
  after!.score < target.score
    ? `\nPASS — ranking moved by ${(target.score - after!.score).toFixed(2)} because of the decisions.`
    : `\nFAIL — unchanged. Inspyr does not learn yet.`,
);

// Leave the database as we found it.
await db.delete(feedbackEvents).where(and(
  eq(feedbackEvents.workspaceId, ws.id), eq(feedbackEvents.entityId, target.id),
));
await recomputeStrategySignals(ws.id);
await rankOpportunities(ws.id);
await sql.end();
