import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Loads the repo-root .env.
 *
 * Next reads .env from the app directory and tsx does not read one at all, so
 * a monorepo with a single root .env silently starts with no DATABASE_URL and
 * fails at the first query. This walks up for the root marker and loads once.
 */
export function loadEnv(startDir = process.cwd()): void {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(join(dir, "package.json")) && existsSync(candidate)) {
      apply(readFileSync(candidate, "utf8"));
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

function apply(contents: string): void {
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Real environment always wins over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
