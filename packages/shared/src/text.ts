import { createHash } from "node:crypto";

/**
 * Canonical text normalization. Used for content hashing and dedupe, so it must
 * be stable: two ingests of the same article must produce the same hash even if
 * whitespace, entities or tracking noise differ.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeText(text).toLowerCase()).digest("hex");
}

/** Strips query noise so the same article from two feeds dedupes to one item. */
export function canonicalUrl(input: string): string {
  try {
    const u = new URL(input);
    const drop = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "ref_src", "source", "fbclid", "gclid", "mc_cid", "mc_eid",
    ];
    for (const k of drop) u.searchParams.delete(k);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    u.hostname = u.hostname.replace(/^www\./, "");
    return u.toString();
  } catch {
    return input.trim();
  }
}

const STOPWORDS = new Set(
  ("a an the and or but if then else for to of in on at by with from as is are was were be been being " +
   "this that these those it its it's we you your our their they them he she his her i me my not no so " +
   "do does did done have has had will would can could should may might just about into over under more " +
   "most other some such only own same than too very s t don now new via how what why when where who")
    .split(" "),
);

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.-]/g, " ")
    .split(/\s+/)
    // >= 2, not > 2: "ai", "ml", "go" and "3d" are real topics. The stopword
    // list already removes the short function words this would otherwise admit.
    .filter((w) => w.length >= 2 && w.length < 32 && !STOPWORDS.has(w));
}

/** Bag-of-words cosine. Used for dedupe and clustering before embeddings exist. */
export function lexicalSimilarity(a: string, b: string): number {
  const ta = tokenize(a), tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const fa = new Map<string, number>(), fb = new Map<string, number>();
  for (const t of ta) fa.set(t, (fa.get(t) ?? 0) + 1);
  for (const t of tb) fb.set(t, (fb.get(t) ?? 0) + 1);
  let dot = 0;
  for (const [t, v] of fa) dot += v * (fb.get(t) ?? 0);
  const na = Math.sqrt([...fa.values()].reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt([...fb.values()].reduce((s, v) => s + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
