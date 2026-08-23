import { loadEnv } from "@inspyr/shared";

loadEnv();

import { runCycle, syncSource, understandPending, scoutOpportunities, rankOpportunities, computeAudienceState, recomputeStrategySignals } from "@inspyr/pipeline";
import { makeWorker, type WorkspaceJob } from "./queues";

/**
 * Worker entrypoint. Each stage is separately queueable so a failure retries
 * only what failed — §13: idempotent, structured logs, workspace-scoped.
 */
const workers = [
  makeWorker("source-sync", async (d: WorkspaceJob) =>
    d.sourceId ? syncSource(d.workspaceId, d.sourceId) : { skipped: "no sourceId" }),
  makeWorker("source-understand", (d) => understandPending(d.workspaceId)),
  makeWorker("opportunity-scout", (d) => scoutOpportunities(d.workspaceId)),
  makeWorker("opportunity-rank", (d) => rankOpportunities(d.workspaceId)),
  makeWorker("audience-state", (d) => computeAudienceState(d.workspaceId)),
  makeWorker("learning", (d) => recomputeStrategySignals(d.workspaceId)),
  makeWorker("daily-plan", (d) => runCycle(d.workspaceId, "daily_plan")),
];

for (const w of workers) {
  w.on("failed", (job, err) => {
    console.error(JSON.stringify({
      queue: w.name, jobId: job?.id, workspaceId: job?.data?.workspaceId,
      attempt: job?.attemptsMade, error: err.message, ok: false,
    }));
  });
}

console.log(`[inspyr:worker] listening on ${workers.length} queues`);

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
