import { db, agentRuns, agentSteps } from "@inspyr/db";
import { eq } from "drizzle-orm";

/**
 * ARCHITECTURE_v0.2 §17.28 — every step is persisted: tool, input, output,
 * model, prompt version, cost, latency. This one table is simultaneously the
 * observability story, the "Why did you say this?" UI, and the eval substrate.
 */
export class Trace {
  private seq = 0;
  private tokens = 0;

  private constructor(readonly runId: string, readonly workspaceId: string) {}

  static async start(workspaceId: string, trigger: string, goal: string): Promise<Trace> {
    const [run] = await db.insert(agentRuns)
      .values({ workspaceId, trigger, goal, state: "running" })
      .returning({ id: agentRuns.id });
    return new Trace(run!.id, workspaceId);
  }

  async step<T>(
    opts: { role: string; tool: string; input?: Record<string, unknown>; model?: string; promptVersion?: string },
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const seq = ++this.seq;
    const started = Date.now();
    try {
      const output = await fn();
      await this.record(seq, opts, started, "ok", this.summarize(output));
      return output;
    } catch (err) {
      await this.record(seq, opts, started, "error", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  addTokens(n: number): void { this.tokens += n; }

  private summarize(output: unknown): Record<string, unknown> {
    if (output === undefined || output === null) return {};
    if (Array.isArray(output)) return { count: output.length, sample: output.slice(0, 3) };
    if (typeof output === "object") return output as Record<string, unknown>;
    return { value: output };
  }

  private async record(
    seq: number,
    opts: { role: string; tool: string; input?: Record<string, unknown>; model?: string; promptVersion?: string },
    started: number,
    status: string,
    output: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(agentSteps).values({
      agentRunId: this.runId,
      seq,
      agentRole: opts.role,
      toolName: opts.tool,
      inputJson: opts.input ?? {},
      outputJson: output,
      model: opts.model ?? null,
      promptVersion: opts.promptVersion ?? null,
      latencyMs: Date.now() - started,
      status,
    });
  }

  async finish(state: "succeeded" | "failed", error?: unknown): Promise<void> {
    await db.update(agentRuns).set({
      state,
      endedAt: new Date(),
      tokenCost: this.tokens,
      errorJson: error ? { message: error instanceof Error ? error.message : String(error) } : null,
    }).where(eq(agentRuns.id, this.runId));
  }
}
