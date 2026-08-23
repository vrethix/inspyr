import {
  type Understanding, type OpportunitySynthesis, type AngleKind,
  tokenize, normalizeText,
} from "@inspyr/shared";

/**
 * The deterministic path.
 *
 * Inspyr must run end-to-end with no ANTHROPIC_API_KEY: it keeps the loop
 * testable, keeps dogfooding cheap (BUILD_SPEC_v0.1 §18), and means an outage
 * or a refusal degrades the product rather than stopping it. Quality is lower —
 * `understanding_source` records which path produced each record so the UI
 * never passes heuristic output off as reasoning.
 */

const TYPE_RULES: [RegExp, Understanding["content_type"]][] = [
  [/\b(released?|announc\w+|launch\w*|introduc\w+|unveil\w+|now available|ships?)\b/i, "announcement"],
  [/\b(paper|arxiv|study|benchmark|we (?:show|find|propose)|abstract|preprint)\b/i, "research"],
  [/\b(how to|tutorial|guide|walkthrough|step \d|getting started)\b/i, "tutorial"],
  [/\b(v?\d+\.\d+\.\d+|changelog|release notes|patch|hotfix)\b/i, "release"],
  [/\b(i think|in my opinion|argue|wrong about|unpopular|hot take|should stop)\b/i, "opinion"],
  [/\b(discussion|thread|ask hn|comments|debate)\b/i, "discussion"],
  [/\b(reference|documentation|api docs|spec(ification)?)\b/i, "reference"],
];

function detectContentType(text: string): Understanding["content_type"] {
  for (const [re, type] of TYPE_RULES) if (re.test(text)) return type;
  return /\b(today|yesterday|this week|reports?|according to)\b/i.test(text) ? "news" : "other";
}

/**
 * Capitalised runs, used as a crude entity proxy.
 *
 * Sentence-initial words are ambiguous — "The" and "Generalist" look identical
 * at position 0 — so a run that only ever appears there must earn its place by
 * repeating or by being multi-word. Dropping them outright loses exactly the
 * subjects that headlines lead with.
 */
const SENTENCE_STARTERS = new Set([
  "The", "This", "That", "These", "Those", "It", "They", "We", "You", "He", "She",
  "There", "Here", "But", "And", "If", "When", "While", "After", "Before", "In",
  "On", "At", "For", "A", "An", "As", "By", "So", "Its", "Their", "Our", "Early",
  "Now", "Today", "However", "Because", "Some", "Most", "Many", "Both", "Each",
]);

function extractEntities(text: string): string[] {
  const total = new Map<string, number>();
  const midSentence = new Map<string, number>();

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.trim().split(/\s+/);
    let run: string[] = [];
    let runStartsSentence = false;

    const flush = () => {
      if (!run.length) return;
      const key = run.join(" ");
      total.set(key, (total.get(key) ?? 0) + 1);
      if (!runStartsSentence) midSentence.set(key, (midSentence.get(key) ?? 0) + 1);
      run = [];
    };

    words.forEach((w, i) => {
      const clean = w.replace(/[^A-Za-z0-9.&'-]/g, "");
      const isCap = /^[A-Z][A-Za-z0-9.&'-]*$/.test(clean) && clean.length > 1;
      if (isCap) {
        if (!run.length) runStartsSentence = i === 0;
        run.push(clean);
      } else {
        flush();
      }
    });
    flush();
  }

  return [...total.entries()]
    .filter(([key, count]) => {
      if (key.length <= 2 || key.length >= 60) return false;
      const words = key.split(" ");
      // Kept if it ever appears mid-sentence, repeats, or is a multi-word name.
      if ((midSentence.get(key) ?? 0) > 0) return true;
      if (words.length > 1) return true;
      if (SENTENCE_STARTERS.has(key)) return false;
      return count > 1;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);
}

function extractTopics(text: string, title: string): string[] {
  const freq = new Map<string, number>();
  // Title terms weigh more — they are the author's own summary of the subject.
  for (const t of tokenize(title)) freq.set(t, (freq.get(t) ?? 0) + 3);
  for (const t of tokenize(text)) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
}

function firstSentences(text: string, count: number): string {
  const parts = normalizeText(text).split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
  return parts.slice(0, count).join(" ").slice(0, 1000);
}

/** Sentences quoted verbatim from the source. Never synthesised. */
function extractClaims(text: string): { text: string; supported: boolean }[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400)
    .filter((s) => /\b(is|are|was|were|will|can|has|have|shows?|found|reduces?|improves?|enables?)\b/i.test(s))
    .slice(0, 6)
    .map((s) => ({ text: s, supported: true }));
}

function sourceConfidence(text: string, hasUrl: boolean, hasDate: boolean): number {
  let score = 40;
  if (hasUrl) score += 20;
  if (hasDate) score += 10;
  if (text.length > 800) score += 15;
  else if (text.length > 300) score += 8;
  if (/\b(arxiv|doi|github\.com|official|documentation)\b/i.test(text)) score += 10;
  if (/\b(rumou?r|allegedly|unconfirmed|reportedly)\b/i.test(text)) score -= 20;
  return Math.max(0, Math.min(100, score));
}

export function heuristicUnderstanding(input: {
  title: string;
  text: string;
  url?: string | null;
  publishedAt?: Date | null;
}): Understanding {
  const text = normalizeText(input.text);
  const title = input.title.trim() || firstSentences(text, 1).slice(0, 120) || "Untitled source item";
  return {
    title: title.slice(0, 300),
    summary: firstSentences(text, 3) || title,
    topics: extractTopics(text, title),
    entities: extractEntities(`${title}. ${text}`),
    claims: extractClaims(text),
    content_type: detectContentType(`${title} ${text}`),
    source_confidence: sourceConfidence(text, Boolean(input.url), Boolean(input.publishedAt)),
  };
}

const ANGLE_TEMPLATES: Record<AngleKind, (subject: string, audience: string) => string> = {
  explain: (s) => `What ${s} actually does, and how the mechanism works.`,
  argue: (s) => `Why the common reading of ${s} is incomplete.`,
  teach: (s, a) => `A working walkthrough of ${s} for ${a}.`,
  founder_story: (s) => `What ${s} changes about how we are building.`,
  contrarian: (s) => `The part of ${s} nobody is talking about.`,
  playbook: (s, a) => `How ${a} should actually use ${s}.`,
  visual_breakdown: (s) => `${s}, broken down step by step.`,
};

/**
 * Deterministic synthesis. Deliberately plain: it must read as a placeholder,
 * not as insight, so a heuristic opportunity is never mistaken for a reasoned
 * one. No numbers appear here — that is the point.
 */
export function heuristicSynthesis(input: {
  title: string;
  summary: string;
  topics: string[];
  contentType: string;
  audience: string;
  pillars: string[];
  sourceCount: number;
}): OpportunitySynthesis {
  const subject = input.title.replace(/\.$/, "");
  const audience = input.audience || "your audience";
  const overlap = input.topics.filter((t) => input.pillars.some((p) => p.toLowerCase().includes(t)));

  const kinds: AngleKind[] =
    input.contentType === "research" ? ["explain", "teach", "contrarian"]
    : input.contentType === "announcement" ? ["contrarian", "explain", "argue"]
    : input.contentType === "tutorial" ? ["teach", "playbook", "visual_breakdown"]
    : ["explain", "argue", "playbook"];

  return {
    title: subject.slice(0, 200),
    why_it_matters: input.summary.slice(0, 700) || `${subject} is new in your sources.`,
    why_it_fits: overlap.length
      ? `Overlaps your content pillars: ${overlap.join(", ")}.`
      : `Matched on topic proximity to this workspace's pillars.`,
    why_now: input.sourceCount > 1
      ? `${input.sourceCount} of your sources surfaced this within the same window.`
      : `Newly observed in your sources.`,
    recommended_angle: kinds[0]!,
    angles: kinds.map((kind) => ({
      kind,
      headline: ANGLE_TEMPLATES[kind](subject, audience).slice(0, 160),
      thesis: ANGLE_TEMPLATES[kind](subject, audience),
      why_this_workspace: `Written for ${audience}.`,
    })),
    recommended_outputs: [
      { platform: "x" as const, format: "thread", rationale: "Fast to publish while the story is fresh." },
    ],
  };
}
