/**
 * Dev helper: mint a signed session cookie for the seeded user so pages can be
 * checked without driving a browser.
 *   npx tsx scripts/dev-session.ts
 */
import { loadEnv } from "@inspyr/shared/env";

loadEnv();

import { randomBytes, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql, users, sessions } from "@inspyr/db";

const email = process.env.SEED_EMAIL ?? "you@inspyr.local";
const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
if (!user) throw new Error(`no seeded user ${email} — run npm run db:seed`);

const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error("SESSION_SECRET not set");

const id = randomBytes(24).toString("base64url");
await db.insert(sessions).values({ id, userId: user.id, expiresAt: new Date(Date.now() + 864e5) });
console.log(`inspyr_session=${id}.${createHmac("sha256", secret).update(id).digest("base64url")}`);
await sql.end();
