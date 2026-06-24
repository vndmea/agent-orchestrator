import { z } from "zod";

import type { ExecutionContext, WorkerCapability } from "@agent-orchestrator/core";

import { WorkerAgent, type WorkerExecutionInput } from "./worker-agent.js";

const capability: WorkerCapability = {
  name: "test-worker",
  description: "Suggests workflow and policy coverage to validate changes.",
  inputSchema: z.object({
    goal: z.string()
  }),
  outputSchema: z.object({
    suggestedTests: z.array(z.string())
  }),
  supportedTaskTypes: ["test-generation"],
  preferredModel: "worker",
  costTier: "low"
};

export class TestWorker extends WorkerAgent {
  public constructor(context: ExecutionContext) {
    super(context, capability);
  }

  public async execute(input: WorkerExecutionInput) {
    return this.createResult(
      "worker.test",
      input.task,
      {
        suggestedTests: [
          "Validate schema parsing for structured workflow outputs.",
          "Validate state transitions for planning and leader-worker workflows.",
          "Validate write and shell safety policies."
        ]
      },
      [],
      0.81,
      [],
      input.workerProfile
    );
  }
}
