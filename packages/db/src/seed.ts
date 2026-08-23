/**
 * Dev seed: one user, two workspaces with genuinely different strategies, and
 * real sources. §4 — the same source item must produce different opportunity
 * scores per workspace, which is the sharpest thing to demo, so the two
 * workspaces here are deliberately unalike.
 *
 *   npm run db:seed
 *   npm run run-cycle --workspace=@inspyr/worker -- aitorch
 */
import { loadEnv } from "@inspyr/shared";

loadEnv();

import { randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "./client";
import { users, workspaces, workspaceMemory, sources, priorContent } from "./schema";
import { contentHash } from "@inspyr/shared";

const EMAIL = process.env.SEED_EMAIL ?? "you@inspyr.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "inspyr-dev-password";

function hash(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const WORKSPACES = [
  {
    name: "AITorch", slug: "aitorch",
    objective: "Grow subscribers among technical AI builders",
    identity: {
      audience: "AI engineers, technical founders, serious learners",
      voice: "Explanatory, visual, evidence-driven. No hype, no announcement-chasing.",
      pillars: ["robotics", "AI infrastructure", "inference engineering", "tutorials"],
      avoid: ["funding news", "celebrity drama", "model leaderboard trivia"],
      strategic_priorities: ["robotics"],
    },
    sources: [
      { type: "rss", label: "Hacker News front page", config: { url: "https://news.ycombinator.com/rss" } },
      { type: "rss", label: "arXiv cs.RO (robotics)", config: { url: "https://rss.arxiv.org/rss/cs.RO" } },
    ],
    prior: [
      { title: "Why inference batching beats a bigger GPU", days: 3 },
      { title: "Robot policy transfer across embodiments, explained", days: 5 },
      { title: "A short guide to KV cache sizing", days: 9 },
    ],
  },
  {
    name: "Personal", slug: "personal",
    objective: "Reputation, network and inbound opportunities",
    identity: {
      audience: "founders, builders and investors",
      voice: "Direct, technical, opinionated. First person, from real building.",
      pillars: ["founder lessons", "AI infrastructure", "product engineering", "shipping"],
      avoid: ["generic productivity advice"],
      strategic_priorities: [],
    },
    sources: [
      { type: "rss", label: "Hacker News front page", config: { url: "https://news.ycombinator.com/rss" } },
    ],
    prior: [
      { title: "What I got wrong about ranking in week one", days: 2 },
      { title: "Shipping a closed loop before shipping features", days: 6 },
    ],
  },
];

const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
const userId = existing?.id ?? (await db.insert(users)
  .values({ email: EMAIL, name: "Inspyr operator", passwordHash: hash(PASSWORD) })
  .returning({ id: users.id }))[0]!.id;

for (const spec of WORKSPACES) {
  const [found] = await db.select().from(workspaces)
    .where(eq(workspaces.slug, spec.slug)).limit(1);

  const wsId = found?.id ?? (await db.insert(workspaces).values({
    ownerId: userId, name: spec.name, slug: spec.slug,
    objective: spec.objective, timezone: "America/Los_Angeles",
  }).returning({ id: workspaces.id }))[0]!.id;

  for (const [key, value] of Object.entries(spec.identity)) {
    const row = {
      workspaceId: wsId, memoryType: "identity", key, valueJson: value,
      source: "user", confidence: 1, lockedByUser: true, updatedAt: new Date(),
    };
    await db.insert(workspaceMemory).values(row).onConflictDoUpdate({
      target: [workspaceMemory.workspaceId, workspaceMemory.memoryType, workspaceMemory.key],
      set: row,
    });
  }

  for (const s of spec.sources) {
    await db.insert(sources).values({
      workspaceId: wsId, type: s.type, label: s.label, configJson: s.config,
    }).onConflictDoNothing();
  }

  for (const p of spec.prior) {
    await db.insert(priorContent).values({
      workspaceId: wsId, title: p.title, text: p.title,
      topicsJson: p.title.toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 6),
      publishedAt: new Date(Date.now() - p.days * 864e5),
      origin: "imported", contentHash: contentHash(`${p.title}\n${p.title}`),
    }).onConflictDoNothing();
  }

  console.log(`seeded workspace ${spec.name} (${spec.slug})`);
}

console.log(`\nsign in as ${EMAIL} / ${PASSWORD}`);
await sql.end();
