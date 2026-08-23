export * from "./types";
export * from "./fetchers";
export * from "./dedupe";
export * from "./cluster";
export { createClusterKey } from "./cluster-key";

import { fetchRss, fetchUrl, fetchNote, fetchGithubReleases, fetchYoutube } from "./fetchers";
import type { FetchResult, SourceConfig } from "./types";

export async function fetchSource(type: string, config: SourceConfig): Promise<FetchResult> {
  switch (type) {
    case "rss": return fetchRss(config);
    case "url": return fetchUrl(config);
    case "note": return fetchNote(config);
    case "github": return fetchGithubReleases(config);
    case "youtube": return fetchYoutube(config);
    default: throw new Error(`unknown source type: ${type}`);
  }
}
