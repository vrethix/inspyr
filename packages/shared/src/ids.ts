import { randomUUID, randomBytes } from "node:crypto";

/** Prefixed, sortable-enough ids. Readable in logs and URLs. */
export function id(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export const uuid = randomUUID;
