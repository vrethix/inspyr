import { XMLParser } from "fast-xml-parser";
import { canonicalUrl, normalizeText, stripHtml } from "@inspyr/shared";
import type { FetchResult, RawItem, SourceConfig } from "./types";

const UA = "Inspyr/0.1 (+https://inspyr.social)";
const TIMEOUT_MS = 15_000;

async function get(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object" && "#text" in node) {
    return String((node as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function parseDate(value: unknown): Date | null {
  const raw = textOf(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Handles both RSS 2.0 (`channel/item`) and Atom (`feed/entry`). */
export async function fetchRss(config: SourceConfig): Promise<FetchResult> {
  if (!config.url) throw new Error("rss source requires config.url");
  const xml = await get(config.url);
  const doc = parser.parse(xml) as Record<string, any>;

  const rssItems = asArray(doc?.rss?.channel?.item);
  const atomEntries = asArray(doc?.feed?.entry);

  const items: RawItem[] = [];

  for (const it of rssItems) {
    const link = textOf(it.link) || textOf(it.guid);
    const body = stripHtml(textOf(it["content:encoded"]) || textOf(it.description));
    items.push({
      externalId: textOf(it.guid) || (link ? canonicalUrl(link) : null),
      url: link ? canonicalUrl(link) : null,
      title: normalizeText(textOf(it.title)),
      text: normalizeText(body),
      publishedAt: parseDate(it.pubDate ?? it["dc:date"]),
    });
  }

  for (const e of atomEntries) {
    const linkNode = asArray(e.link).find((l: any) => !l?.["@_rel"] || l["@_rel"] === "alternate");
    const link = linkNode?.["@_href"] ?? textOf(e.link);
    const body = stripHtml(textOf(e.content) || textOf(e.summary));
    items.push({
      externalId: textOf(e.id) || (link ? canonicalUrl(link) : null),
      url: link ? canonicalUrl(link) : null,
      title: normalizeText(textOf(e.title)),
      text: normalizeText(body),
      publishedAt: parseDate(e.updated ?? e.published),
    });
  }

  return { items: items.filter((i) => i.title || i.text) };
}

const META_PATTERNS: [string, RegExp][] = [
  ["title", /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i],
  ["title", /<title[^>]*>([\s\S]*?)<\/title>/i],
  ["description", /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i],
  ["description", /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i],
  ["published", /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i],
];

function extractMeta(html: string, key: string): string | null {
  for (const [k, re] of META_PATTERNS) {
    if (k !== key) continue;
    const m = html.match(re);
    if (m?.[1]) return normalizeText(stripHtml(m[1]));
  }
  return null;
}

/** Single web page. Body extraction is intentionally crude — readability lands later. */
export async function fetchUrl(config: SourceConfig): Promise<FetchResult> {
  if (!config.url) throw new Error("url source requires config.url");
  const url = canonicalUrl(config.url);
  const html = await get(url);

  const title = extractMeta(html, "title") ?? url;
  const description = extractMeta(html, "description") ?? "";
  const publishedRaw = extractMeta(html, "published");

  const main = html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html;
  const body = normalizeText(stripHtml(main)).slice(0, 40_000);

  return {
    items: [{
      externalId: url,
      url,
      title,
      text: body.length > description.length ? body : description,
      publishedAt: publishedRaw ? new Date(publishedRaw) : null,
    }],
  };
}

/**
 * Fetches the body of an already-ingested item whose feed gave us nothing.
 *
 * Feeds like Hacker News carry a title and a link and literally nothing else —
 * the description is the word "Comments". Ranking on a title alone cannot
 * discriminate, so an item with no body is an item Inspyr cannot reason about.
 */
export async function fetchArticleBody(url: string): Promise<{ text: string; title: string | null } | null> {
  try {
    const result = await fetchUrl({ url });
    const item = result.items[0];
    if (!item || item.text.length < MIN_USEFUL_TEXT) return null;
    return { text: item.text, title: item.title === url ? null : item.title };
  } catch {
    // Paywalls, JS-only pages and 403s are expected and are not cycle failures.
    return null;
  }
}

/** Below this an item has a title and effectively no content. */
export const MIN_USEFUL_TEXT = 240;

/** A note the user typed. Already canonical — no fetching. */
export function fetchNote(config: SourceConfig): FetchResult {
  const text = normalizeText(config.text ?? "");
  if (!text) return { items: [] };
  const title = config.title?.trim() || text.split("\n")[0]!.slice(0, 120);
  return {
    items: [{
      externalId: null,
      url: null,
      title,
      text,
      publishedAt: new Date(),
    }],
  };
}

/** GitHub releases for a repo, via the public API. */
export async function fetchGithubReleases(config: SourceConfig): Promise<FetchResult> {
  const repo = config.repo ?? config.url?.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error("github source requires config.repo as owner/name");
  }
  const body = await get(`https://api.github.com/repos/${repo}/releases?per_page=10`);
  const releases = JSON.parse(body) as Array<Record<string, any>>;
  return {
    items: releases.map((r) => ({
      externalId: String(r.id),
      url: r.html_url ? canonicalUrl(r.html_url) : null,
      title: normalizeText(`${repo} ${r.name || r.tag_name || "release"}`),
      text: normalizeText(String(r.body ?? "")),
      publishedAt: r.published_at ? new Date(r.published_at) : null,
    })).filter((i) => i.title),
  };
}

/** YouTube channel uploads via the public feed — no API key required. */
export async function fetchYoutube(config: SourceConfig): Promise<FetchResult> {
  const channelId = config.channelId ?? config.url?.match(/channel\/([\w-]+)/)?.[1];
  if (!channelId) throw new Error("youtube source requires config.channelId");
  return fetchRss({ url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` });
}
