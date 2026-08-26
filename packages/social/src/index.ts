export * from "./types";
export * from "./zernio";

import { ZernioProvider } from "./zernio";
import type { SocialProvider } from "./types";

let cached: SocialProvider | null = null;

/** Single place that decides which social provider the system runs on. */
export function getSocialProvider(): SocialProvider {
  if (!cached) cached = new ZernioProvider();
  return cached;
}
