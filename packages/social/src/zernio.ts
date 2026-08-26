import type { Metrics, MetricKey } from "@inspyr/shared";
import type {
  FetchedMetrics, PublishRequest, PublishResult, SocialAccount, SocialProvider,
} from "./types";
import { SocialUnavailableError } from "./types";

const BASE_URL = process.env.ZERNIO_BASE_URL ?? "https://zernio.com/api/v1";
const TIMEOUT_MS = 20_000;

interface ZernioAccount {
  id: string;
  platform: string;
  username?: string;
  displayName?: string;
  connected?: boolean;
  followers?: number;
  followerCount?: number;
}

interface ZernioAnalytics {
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  impressions?: number;
  views?: number;
  clicks?: number;
  engagementRate?: number;
  platform?: string;
  lastUpdated?: string;
}

/**
 * Zernio's vocabulary mapped onto Inspyr's.
 *
 * Note what is missing: `follows` and `profile_visits`. Those are the two
 * numbers that matter most for growth, and the documented analytics response
 * does not carry them. Inspyr fills that gap by polling account follower counts
 * on a schedule and keeping the series itself — see `accountSnapshots`.
 */
function mapMetrics(a: ZernioAnalytics): { metrics: Metrics; unavailable: string[] } {
  const metrics: Metrics = {};
  const set = (key: MetricKey, value: number | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value;
  };

  // Prefer impressions; fall back to reach, then views, so a platform that only
  // reports one of them still normalises correctly against the baseline.
  set("impressions", a.impressions ?? a.reach ?? a.views);
  set("engagements", a.likes);
  set("replies", a.comments);
  set("shares", a.shares);
  set("saves", a.saves);
  set("clicks", a.clicks);

  const unavailable = ["follows", "profile_visits", "watch_seconds", "retention_pct"]
    .filter((k) => metrics[k as MetricKey] === undefined);

  return { metrics, unavailable };
}

export class ZernioProvider implements SocialProvider {
  readonly name = "zernio";
  private readonly apiKey: string | undefined;
  private readonly profileId: string | undefined;

  constructor(
    apiKey = process.env.ZERNIO_API_KEY,
    profileId = process.env.ZERNIO_PROFILE_ID,
  ) {
    this.apiKey = apiKey;
    this.profileId = profileId;
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new SocialUnavailableError(
        "No ZERNIO_API_KEY set. Two connected accounts are free at zernio.com — "
        + "until then, numbers are entered by hand.",
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new SocialUnavailableError(`Zernio returned ${res.status}. ${body.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof SocialUnavailableError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new SocialUnavailableError("Zernio timed out.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async listAccounts(): Promise<SocialAccount[]> {
    const body = await this.request<{ data?: ZernioAccount[] } | ZernioAccount[]>("/accounts");
    const rows = Array.isArray(body) ? body : (body.data ?? []);
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      username: r.username ?? "",
      displayName: r.displayName ?? r.username ?? "",
      connected: r.connected !== false,
      followers: typeof r.followers === "number" ? r.followers
        : typeof r.followerCount === "number" ? r.followerCount
        : null,
    }));
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const body = await this.request<{
      id: string; status?: string; publishedUrl?: string; platforms?: string[];
    }>("/post", {
      method: "POST",
      body: JSON.stringify({
        ...(this.profileId ? { profileId: this.profileId } : {}),
        text: request.text,
        socialAccountIds: request.accountIds,
        ...(request.scheduledAt ? { scheduledAt: request.scheduledAt.toISOString() } : {}),
        ...(request.mediaUrls?.length ? { media: request.mediaUrls } : {}),
        ...(request.link ? { link: request.link } : {}),
      }),
    });

    return {
      externalId: body.id,
      status: body.status ?? "unknown",
      publishedUrl: body.publishedUrl ?? null,
      platforms: body.platforms ?? [],
    };
  }

  async fetchPostMetrics(externalPostId: string): Promise<FetchedMetrics> {
    const body = await this.request<ZernioAnalytics & { data?: ZernioAnalytics }>(
      `/analytics?postId=${encodeURIComponent(externalPostId)}`,
    );
    const analytics = body.data ?? body;
    const { metrics, unavailable } = mapMetrics(analytics);

    return {
      metrics,
      platform: analytics.platform ?? null,
      lastUpdated: analytics.lastUpdated ? new Date(analytics.lastUpdated) : null,
      unavailable,
    };
  }
}

export { mapMetrics as __mapMetricsForTests };
