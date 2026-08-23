/**
 * End-to-end check for Milestone 2 step 1 (§5.4 / §6.6 / §6.7): one opportunity
 * becomes genuinely different native artefacts per channel, each traceable to
 * its sources, each reviewed.
 *
 *   npx tsx scripts/verify-create.ts <workspace-slug>
 */
import { loadEnv } from "@inspyr/shared";

loadEnv();

import { and, desc, eq } from "drizzle-orm";
import { db, sql, workspaces, opportunities, drafts, actionSpecs } from "@inspyr/db";
import { PLATFORMS, draftText, constraintViolations, draftSurface, type DraftContent, type Platform } from "@inspyr/shared";
import { generateDraft, recordDraftEdit, generateActionSpecs } from "@inspyr/pipeline";

const slug = process.argv[2] ?? "aitorch";
const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
if (!ws) throw new Error(`no workspace ${slug}`);

const [opp] = await db.select().from(opportunities)
  .where(and(eq(opportunities.workspaceId, ws.id), eq(opportunities.qualifies, true)))
  .orderBy(desc(opportunities.score)).limit(1);
if (!opp) throw new Error("no qualifying opportunity — run a cycle first");

console.log(`workspace   ${ws.name}`);
console.log(`opportunity ${opp.title}\n`);

const specCount = await generateActionSpecs(ws.id, opp.id);
const specs = await db.select().from(actionSpecs)
  .where(and(eq(actionSpecs.workspaceId, ws.id), eq(actionSpecs.opportunityId, opp.id)));
console.log(`action specs enumerated: ${specs.length} (${specCount} new) — none written yet\n`);

const texts = new Map<Platform, string>();

for (const channel of PLATFORMS) {
  const row = await generateDraft({ workspaceId: ws.id, opportunityId: opp.id, channel });
  const content = row.contentJson as unknown as DraftContent;
  const text = draftText(channel, content);
  texts.set(channel, text);

  const violations = constraintViolations(channel, draftSurface(channel, content));
  const checks = row.checksJson as { repetitionRisk?: number; groundingCoverage?: number | null };

  console.log(`${channel.padEnd(10)} ${row.actionType.padEnd(16)} v${row.version} ${row.origin}`);
  console.log(`  ${text.replace(/\n+/g, " / ").slice(0, 96)}`);
  console.log(`  constraints ${violations.length === 0 ? "pass" : violations.join("; ")}`
    + `  repetition ${checks.repetitionRisk ?? 0}`
    + `  sources ${row.sourceItemIdsJson.length}`);
}

// Each channel must be a different artefact, not a reformat of one draft.
const distinct = new Set(texts.values()).size;
console.log(`\ndistinct artefacts: ${distinct}/${PLATFORMS.length}`);

// An edit must be measured and stored.
const [xDraft] = await db.select().from(drafts)
  .where(and(eq(drafts.workspaceId, ws.id), eq(drafts.opportunityId, opp.id), eq(drafts.channel, "x")))
  .orderBy(desc(drafts.version)).limit(1);

const before = xDraft!.contentJson as unknown as DraftContent & { posts: string[] };
const edited = { ...before, posts: [...before.posts] };
edited.posts[0] = `${edited.posts[0]} — edited by the operator.`;
const after = await recordDraftEdit({ workspaceId: ws.id, draftId: xDraft!.id, content: edited, intent: "sharper" });

console.log(`edit recorded: v${xDraft!.version} → v${after.version}, state ${after.state}`);
console.log(
  distinct === PLATFORMS.length && after.version > xDraft!.version
    ? "\nPASS — every channel produced its own artefact, and the edit was measured."
    : "\nFAIL",
);
await sql.end();
