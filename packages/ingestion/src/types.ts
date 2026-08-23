export interface RawItem {
  externalId: string | null;
  url: string | null;
  title: string;
  text: string;
  publishedAt: Date | null;
}

export interface FetchResult {
  items: RawItem[];
  cursor?: string | null;
}

export interface SourceConfig {
  url?: string;
  text?: string;
  title?: string;
  repo?: string;
  channelId?: string;
}
