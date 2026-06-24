import { z } from "zod";

import type { ExecutionContext, WorkerCapability } from "@agent-orchestrator/core";

import { WorkerAgent, type WorkerExecutionInput } from "./worker-agent.js";

const capability: WorkerCapability = {
  name: "review-worker",
  description: "Performs a low-cost review pass to highlight likely risks.",
  inputSchema: z.object({
    goal: z.string()
  }),
  outputSchema: z.object({
    findings: z.array(z.string())
  }),
  supportedTaskTypes: ["review-lite"],
  preferredModel: "worker",
  costTier: "low"
};

export class ReviewWorker extends WorkerAgent {
  public constructor(context: ExecutionContext) {
    super(context, capability);
  }

  public async execute(input: WorkerExecutionInput) {
    return this.createResult(
      "worker.review",
      input.task,
      {
        findings: [
          "Ensure dry-run behavior is preserved in CLI and MCP flows.",
          "Avoid exposing unrestricted shell access through public interfaces."
        ]
      },
      [],
      0.77,
      [],
      input.workerProfile
    );
  }
}
