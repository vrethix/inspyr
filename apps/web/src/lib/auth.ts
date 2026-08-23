import { cookies } from "next/headers";
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { db, users, sessions } from "@inspyr/db";
import { eq } from "drizzle-orm";

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;

const COOKIE = "inspyr_session";
const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) {
    throw new Error("SESSION_SECRET must be set to at least 24 characters");
  }
  return s;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Cookie carries id.signature so a forged id is rejected before touching the DB. */
function sign(id: string): string {
  return `${id}.${createHmac("sha256", secret()).update(id).digest("base64url")}`;
}

function unsign(value: string): string | null {
  const idx = value.lastIndexOf(".");
  if (idx < 0) return null;
  const id = value.slice(0, idx);
  const mac = value.slice(idx + 1);
  const expected = createHmac("sha256", secret()).update(id).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function createSession(userId: string): Promise<void> {
  const id = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ id, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, sign(id), {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const id = raw ? unsign(raw) : null;
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  jar.delete(COOKIE);
}

export interface CurrentUser { id: string; email: string; name: string | null }

export async function currentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const id = unsign(raw);
  if (!id) return null;

  const [row] = await db.select({
    userId: sessions.userId, expiresAt: sessions.expiresAt,
    email: users.email, name: users.name,
  }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id)).limit(1);

  if (!row || row.expiresAt < new Date()) return null;
  return { id: row.userId, email: row.email, name: row.name };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
