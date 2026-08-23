import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

/** §13 — one queue per stage, every job idempotent, permanent failures to DLQ. */
export const QUEUES = [
  "source-sync",
  "source-understand",
  "opportunity-scout",
  "opportunity-rank",
  "audience-state",
  "learning",
  "daily-plan",
] as const;
export type QueueName = (typeof QUEUES)[number];

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 86_400, count: 500 },
  removeOnFail: false,       // failures stay inspectable; §13 requires a DLQ view
};

const queues = new Map<QueueName, Queue>();

export function queue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queues.set(name, q);
  }
  return q;
}

export interface WorkspaceJob { workspaceId: string; sourceId?: string }

export function makeWorker(
  name: QueueName,
  handler: (data: WorkspaceJob) => Promise<unknown>,
): Worker {
  return new Worker<WorkspaceJob>(name, async (job) => {
    const started = Date.now();
    const result = await handler(job.data);
    console.log(JSON.stringify({
      queue: name, jobId: job.id, workspaceId: job.data.workspaceId,
      ms: Date.now() - started, ok: true,
    }));
    return result;
  }, { connection, concurrency: 2 });
}
