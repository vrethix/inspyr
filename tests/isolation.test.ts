import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db, sql, users, workspaces, sources, sourceItems, opportunities,
  opportunitySources, feedbackEvents, priorContent, assertTenant, TenantViolationError,
} from "@inspyr/db";
import { syncSource, scoutOpportunities, rankOpportunities, importPriorContent, computeAudienceState } from "@inspyr/pipeline";
import { contentHash } from "@inspyr/shared";

/**
 * BUILD_SPEC_v0.1 §28.13 — every workspace query enforces tenant scope.
 * §4 — the same source item must produce different results per workspace, and
 * memory must never leak between them.
 */

let userA: string, userB: string, wsA: string, wsB: string;

const NOTE_TEXT =
  "Generalist released physical prompting, a way to instruct robots by demonstration. "
  + "The method transfers across robot bodies, which the team calls cross-embodiment transfer.";

beforeAll(async () => {
  await db.delete(users);

  const [a] = await db.insert(users)
    .values({ email: "a@test.local", passwordHash: "x" }).returning({ id: users.id });
  const [b] = await db.insert(users)
    .values({ email: "b@test.local", passwordHash: "x" }).returning({ id: users.id });
  userA = a!.id; userB = b!.id;

  const [w1] = await db.insert(workspaces).values({
    ownerId: userA, name: "AITorch", slug: "aitorch", objective: "subscribers",
  }).returning({ id: workspaces.id });
  const [w2] = await db.insert(workspaces).values({
    ownerId: userB, name: "Rival", slug: "rival", objective: "reach",
  }).returning({ id: workspaces.id });
  wsA = w1!.id; wsB = w2!.id;
});

afterAll(async () => {
  await db.delete(users);
  await sql.end();
});

describe("workspace isolation", () => {
  it("ingests the same note into two workspaces without collision", async () => {
    for (const ws of [wsA, wsB]) {
      const [src] = await db.insert(sources).values({
        workspaceId: ws, type: "note", label: "note",
        configJson: { text: NOTE_TEXT, title: "Physical prompting" },
      }).returning({ id: sources.id });
      const result = await syncSource(ws, src!.id);
      expect(result.inserted).toBe(1);
    }

    const a = await db.select().from(sourceItems).where(eq(sourceItems.workspaceId, wsA));
    const b = await db.select().from(sourceItems).where(eq(sourceItems.workspaceId, wsB));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    // Identical content, distinct rows — the unique index is per workspace.
    expect(a[0]!.contentHash).toBe(b[0]!.contentHash);
    expect(a[0]!.id).not.toBe(b[0]!.id);
  });

  it("refuses to sync a source belonging to another workspace", async () => {
    const [foreign] = await db.select({ id: sources.id }).from(sources)
      .where(eq(sources.workspaceId, wsB)).limit(1);
    await expect(syncSource(wsA, foreign!.id)).rejects.toThrow(/not in workspace/);
  });

  it("dedupes a second identical ingest within the same workspace", async () => {
    const [src] = await db.insert(sources).values({
      workspaceId: wsA, type: "note", label: "dupe",
      configJson: { text: NOTE_TEXT, title: "Physical prompting" },
    }).returning({ id: sources.id });
    const result = await syncSource(wsA, src!.id);
    expect(result.inserted).toBe(0);
    expect(result.duplicates).toBe(1);
  });

  it("scopes opportunities to their own workspace", async () => {
    // Understanding is skipped here; mark items understood so the scout sees them.
    await db.update(sourceItems).set({
      understoodAt: new Date(), topicsJson: ["robotics", "prompting"],
      summary: NOTE_TEXT, contentType: "announcement", sourceConfidence: 70,
    });

    await scoutOpportunities(wsA);
    await scoutOpportunities(wsB);
    await rankOpportunities(wsA);
    await rankOpportunities(wsB);

    const a = await db.select().from(opportunities).where(eq(opportunities.workspaceId, wsA));
    const b = await db.select().from(opportunities).where(eq(opportunities.workspaceId, wsB));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a.every((o) => o.workspaceId === wsA)).toBe(true);
    expect(b.every((o) => o.workspaceId === wsB)).toBe(true);

    // Every opportunity carries its components, never a bare score (§7).
    for (const o of [...a, ...b]) {
      expect(Object.keys(o.scoreComponentsJson).length).toBe(8);
    }
  });

  it("never links an opportunity to another workspace's source item", async () => {
    const aOpps = await db.select({ id: opportunities.id }).from(opportunities)
      .where(eq(opportunities.workspaceId, wsA));
    const links = await db.select().from(opportunitySources)
      .where(inArray(opportunitySources.opportunityId, aOpps.map((o) => o.id)));
    const linked = await db.select({ ws: sourceItems.workspaceId }).from(sourceItems)
      .where(inArray(sourceItems.id, links.map((l) => l.sourceItemId)));
    expect(linked.every((i) => i.ws === wsA)).toBe(true);
  });

  it("keeps prior content and audience state per workspace", async () => {
    await importPriorContent(wsA, [
      { title: "Robotics explainer one", text: "robotics transfer policy", publishedAt: new Date() },
      { title: "Robotics explainer two", text: "robotics manipulation policy", publishedAt: new Date() },
    ]);
    await computeAudienceState(wsA);
    await computeAudienceState(wsB);

    const aPrior = await db.select().from(priorContent).where(eq(priorContent.workspaceId, wsA));
    const bPrior = await db.select().from(priorContent).where(eq(priorContent.workspaceId, wsB));
    expect(aPrior).toHaveLength(2);
    expect(bPrior).toHaveLength(0);
  });

  it("rejects a cross-tenant row at the guard", () => {
    expect(() => assertTenant({ workspaceId: wsB }, wsA, "opportunity", "x"))
      .toThrow(TenantViolationError);
    expect(() => assertTenant(undefined, wsA, "opportunity", "x"))
      .toThrow(TenantViolationError);
    expect(assertTenant({ workspaceId: wsA }, wsA, "opportunity", "x")).toEqual({ workspaceId: wsA });
  });
});

describe("feedback events (§8.1)", () => {
  it("records a decision with the topics that justified it", async () => {
    const [opp] = await db.select().from(opportunities)
      .where(eq(opportunities.workspaceId, wsA)).limit(1);

    await db.insert(feedbackEvents).values({
      workspaceId: wsA, eventType: "opportunity_skipped",
      entityType: "opportunity", entityId: opp!.id,
      metadataJson: { topics: ["robotics"], decision: "skipped" },
    });

    const events = await db.select().from(feedbackEvents)
      .where(and(eq(feedbackEvents.workspaceId, wsA), eq(feedbackEvents.entityId, opp!.id)));
    expect(events).toHaveLength(1);
    expect(events[0]!.metadataJson.topics).toEqual(["robotics"]);
    expect(events[0]!.actor).toBe("user");
  });

  it("does not surface another workspace's events", async () => {
    const events = await db.select().from(feedbackEvents).where(eq(feedbackEvents.workspaceId, wsB));
    expect(events).toHaveLength(0);
  });

  it("hashes prior content so a repeat import is a no-op", async () => {
    const before = (await db.select().from(priorContent).where(eq(priorContent.workspaceId, wsA))).length;
    await importPriorContent(wsA, [
      { title: "Robotics explainer one", text: "robotics transfer policy", publishedAt: new Date() },
    ]);
    const after = (await db.select().from(priorContent).where(eq(priorContent.workspaceId, wsA))).length;
    expect(after).toBe(before);
    expect(contentHash("Robotics explainer one\nrobotics transfer policy")).toBeTruthy();
  });
});
