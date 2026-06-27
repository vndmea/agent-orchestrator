import { z } from "zod";

import type { ExecutionContext, WorkerCapability } from "@agent-orchestrator/core";

import {
  buildRepositoryContextPromptLines,
  getRepositoryContextFromTask,
  WorkerAgent,
  type WorkerExecutionInput
} from "./worker-agent.js";

const inputSchema = z.object({
  goal: z.string()
});

const outputSchema = z.object({
  findings: z.array(z.string())
});

const capability: WorkerCapability = {
  name: "review-worker",
  description: "Performs a low-cost review pass to highlight likely risks.",
  inputSchema,
  outputSchema,
  supportedTaskTypes: ["review-lite"],
  preferredModel: "worker",
  costTier: "low"
};

export class ReviewWorker extends WorkerAgent {
  public constructor(context: ExecutionContext) {
    super(context, capability);
  }

  public async execute(input: WorkerExecutionInput) {
    const repositoryContext = getRepositoryContextFromTask(input.task);
    const selectedPaths = repositoryContext?.selectedFiles
      .slice(0, 3)
      .map((file) => file.path) ?? [];
    const fallbackOutput = {
      findings: [
        ...(selectedPaths.length > 0
          ? [`Review concrete risks in ${selectedPaths.join(", ")}.`]
          : []),
        "Ensure dry-run behavior is preserved in CLI and MCP flows.",
        "Avoid exposing unrestricted shell access through public interfaces."
      ]
    };

    return this.createResult({
      agentId: "worker.review",
      task: input.task,
      prompt: [
        "Return JSON with key findings.",
        "Focus on implementation and workflow risks.",
        "Reference concrete repository file paths from the provided context.",
        `Goal: ${input.task.goal}`,
        ...buildRepositoryContextPromptLines(input.task)
      ].join("\n"),
      outputSchema,
      fallbackOutput,
      risks: [],
      confidence: 0.77,
      artifacts: [],
      workerProfile: input.workerProfile
    });
  }
}
