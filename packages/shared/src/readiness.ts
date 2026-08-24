/**
 * What a workspace actually has.
 *
 * Some actions are impossible until something exists. You cannot post a Show HN
 * for a repo nobody can run, and asking people to review code that is not public
 * is asking them to take your word for it. Inspyr should say which actions are
 * blocked and what unblocks them — not silently rank them low, and not refuse
 * without an alternative.
 */

export const READINESS_KEYS = [
  "public_repo",
  "runnable_artifact",
  "test_evidence",
  "demo_video",
  "written_story",
  "landing_page",
] as const;

export type ReadinessKey = (typeof READINESS_KEYS)[number];

export const READINESS_LABELS: Record<ReadinessKey, string> = {
  public_repo: "Code is public",
  runnable_artifact: "Someone else can run it",
  test_evidence: "Tests or results you can show",
  demo_video: "A short video of it working",
  written_story: "A written explanation of what you built",
  landing_page: "A page explaining the product",
};

export type Readiness = Partial<Record<ReadinessKey, boolean>>;

export function has(readiness: Readiness, key: ReadinessKey): boolean {
  return readiness[key] === true;
}

export function missing(readiness: Readiness, keys: ReadinessKey[]): ReadinessKey[] {
  return keys.filter((k) => !has(readiness, k));
}
