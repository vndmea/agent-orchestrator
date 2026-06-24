import { z } from "zod";

import type { ExecutionContext, WorkerCapability } from "@agent-orchestrator/core";

import { WorkerAgent, type WorkerExecutionInput } from "./worker-agent.js";

const capability: WorkerCapability = {
  name: "summarize-worker",
  description: "Summarizes goals and scoped context into a compact execution brief.",
  inputSchema: z.object({
    goal: z.string(),
    scope: z.string().optional()
  }),
  outputSchema: z.object({
    brief: z.string(),
    focusAreas: z.array(z.string())
  }),
  supportedTaskTypes: ["summarization", "log-analysis", "json-extraction"],
  preferredModel: "worker",
  costTier: "low"
};

export class SummarizeWorker extends WorkerAgent {
  public constructor(context: ExecutionContext) {
    super(context, capability);
  }

  public async execute(input: WorkerExecutionInput) {
    return this.createResult(
      "worker.summarize",
      input.task,
      {
        brief: `Summarized goal: ${input.task.goal}`,
        focusAreas: [
          input.scope ? `Scope work to ${input.scope}` : "Scope not provided; keep changes minimal.",
          "Preserve package boundaries.",
          "Prefer deterministic validation."
        ]
      },
      [],
      0.86,
      [],
      input.workerProfile
    );
  }
}
