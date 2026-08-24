/**
 * Tako as a live test case, at its real baseline of 9 followers.
 *
 *   npx tsx scripts/seed-tako.ts
 */
import { loadEnv } from "@inspyr/shared/env";

loadEnv();

import { eq } from "drizzle-orm";
import { db, sql, users, workspaces, workspaceMemory } from "@inspyr/db";
import { ensureChannelPolicies } from "@inspyr/pipeline";

const [user] = await db.select().from(users).limit(1);
if (!user) throw new Error("no user — run npm run db:seed first");

const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, "tako")).limit(1);
const wsId = existing?.id ?? (await db.insert(workspaces).values({
  ownerId: user.id, name: "Tako", slug: "tako",
  objective: "Reach builders who care about agent safety on Base",
  timezone: "Asia/Kolkata",
}).returning({ id: workspaces.id }))[0]!.id;

const identity: Record<string, unknown> = {
  audience: "Base builders, agent developers, wallet engineers, onchain privacy people",
  voice: "Concrete and technical. Design decisions and tradeoffs, never hype.",
  pillars: ["agent wallets", "onchain agents", "privacy", "Base", "agent safety"],
  avoid: ["price talk", "airdrop farming", "generic crypto hype"],
  strategic_priorities: ["agent safety"],
  // The real baseline from the sprint doc: 9 total, ~5 relevant.
  audience_size: { x: 9, linkedin: 0, instagram: 0, youtube: 0 },
  // What Tako can actually contribute to a conversation.
  facts: [
    "Tako scopes agent wallet permissions per session, so a compromised agent cannot drain the wallet.",
    "Paper trading mode runs the same execution path as live trading with a stubbed settlement layer.",
    "The threat model assumes the agent itself is hostile, not just the counterparty.",
    "Agent actions are signed with a session key that expires, rather than a long-lived delegation.",
  ],
};

for (const [key, value] of Object.entries(identity)) {
  const row = {
    workspaceId: wsId, memoryType: "identity", key, valueJson: value,
    source: "user", confidence: 1, lockedByUser: true, updatedAt: new Date(),
  };
  await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
    target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
    set: row,
  });
}

await ensureChannelPolicies(wsId);
console.log(`seeded Tako at its real baseline: 9 followers on X, ${(identity.facts as string[]).length} contributable facts`);
await sql.end();
