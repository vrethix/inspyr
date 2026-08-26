import type { Metrics } from "@inspyr/shared";

/**
 * BUILD_SPEC_v0.1 §11 — every external provider sits behind an adapter.
 *
 * Zernio is the first implementation because it covers 16 platforms for $6 an
 * account, which is the difference between Inspyr measuring one platform and
 * measuring all of them. That is a good reason to use it and a bad reason to
 * couple to it.
 */

export interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  connected: boolean;
  followers: number | null;
}

export interface PublishRequest {
  accountIds: string[];
  text: string;
  scheduledAt?: Date;
  mediaUrls?: string[];
  link?: string;
}

export interface PublishResult {
  externalId: string;
  status: string;
  publishedUrl: string | null;
  platforms: string[];
}

export interface FetchedMetrics {
  metrics: Metrics;
  platform: string | null;
  lastUpdated: Date | null;
  /** Metrics the provider does not return for this platform. */
  unavailable: string[];
}

export interface SocialProvider {
  readonly name: string;
  readonly available: boolean;
  listAccounts(): Promise<SocialAccount[]>;
  publish(request: PublishRequest): Promise<PublishResult>;
  fetchPostMetrics(externalPostId: string): Promise<FetchedMetrics>;
}

export class SocialUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialUnavailableError";
  }
}
