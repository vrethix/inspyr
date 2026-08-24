/**
 * Replays Tako's actual failure through Inspyr, then a realistic alternative.
 *
 *   npx tsx scripts/verify-conversations.ts
 */
import { loadEnv } from "@inspyr/shared/env";

loadEnv();

import { eq } from "drizzle-orm";
import { db, sql, workspaces } from "@inspyr/db";
import { addConversationTarget, recordReplyOutcome, timelineAdvice } from "@inspyr/pipeline";

const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, "tako")).limit(1);
if (!ws) throw new Error("run scripts/seed-tako.ts first");

const timeline = await timelineAdvice(ws.id, "x");
console.log(`TIMELINE\n  ${timeline.message || "viable"}\n`);

const cases = [
  {
    label: "the reply that actually failed",
    input: {
      url: "https://x.com/base/status/000000000000000001",
      authorHandle: "base",
      authorFollowers: 2_400_000,
      replyDepth: 639,
      postedAt: new Date(Date.now() - 190 * 60_000),
      text: "Base is for everyone. What are you building this year?",
    },
  },
  {
    label: "a smaller builder, early, on topic",
    input: {
      url: "https://x.com/somebuilder/status/000000000000000002",
      authorHandle: "somebuilder",
      authorFollowers: 6_800,
      replyDepth: 3,
      postedAt: new Date(Date.now() - 9 * 60_000),
      text: "Genuinely stuck on agent wallet permissions. How do you stop an agent draining the wallet if the model gets prompt injected on Base?",
    },
  },
  {
    label: "on topic but far too late",
    input: {
      url: "https://x.com/somebuilder/status/000000000000000003",
      authorHandle: "otherbuilder",
      authorFollowers: 11_200,
      replyDepth: 6,
      postedAt: new Date(Date.now() - 9 * 60 * 60_000),
      text: "Thread on session keys and scoped permissions for onchain agents.",
    },
  },
  {
    label: "right size, right time, nothing to add",
    input: {
      url: "https://x.com/somebuilder/status/000000000000000004",
      authorHandle: "designer",
      authorFollowers: 9_100,
      replyDepth: 2,
      postedAt: new Date(Date.now() - 5 * 60_000),
      text: "Hot take: most landing pages would be better with half the copy and one screenshot.",
    },
  },
];

let eligibleId: string | null = null;

for (const c of cases) {
  const { row, result } = await addConversationTarget(ws.id, c.input);
  console.log(`${result.eligible ? "ENTER " : "SKIP  "} ${c.label}`);
  console.log(`  score ${result.score.toFixed(1)}  depth ${c.input.replyDepth}  ${result.reachBand}  ${result.ageMinutes}m old`);
  for (const g of result.gateFailures) console.log(`  gate: ${g.reason}`);
  if (result.contribution) console.log(`  add:  ${result.contribution.slice(0, 78)}`);
  console.log();
  if (result.eligible && !eligibleId) eligibleId = row.id;
}

if (eligibleId) {
  console.log("--- logging an outcome on the eligible one ---");
  await recordReplyOutcome({
    workspaceId: ws.id, conversationTargetId: eligibleId,
    impressions: 340, engagements: 6, profileVisits: 4, followsGained: 1,
  });
  const { strategySignals } = await import("@inspyr/db");
  const signals = await db.select().from(strategySignals).where(eq(strategySignals.workspaceId, ws.id));
  for (const s of signals.filter((x) => x.dimension === "reply_context")) {
    console.log(`  prior moved: ${s.key} effect ${s.effect.toFixed(3)} conf ${s.confidence.toFixed(2)} n=${s.sampleSize}`);
  }
  console.log("\nOne observation. No training set, no batch fit.");
}

await sql.end();
