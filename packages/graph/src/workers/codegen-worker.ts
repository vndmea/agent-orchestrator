import { z } from "zod";

import type { ExecutionContext, WorkerCapability } from "@agent-orchestrator/core";

import { WorkerAgent, type WorkerExecutionInput } from "./worker-agent.js";

const capability: WorkerCapability = {
  name: "codegen-worker",
  description: "Produces candidate implementation notes or patch plans.",
  inputSchema: z.object({
    goal: z.string(),
    scope: z.string().optional()
  }),
  outputSchema: z.object({
    patchPlan: z.array(z.string()),
    notes: z.array(z.string())
  }),
  supportedTaskTypes: ["codegen"],
  preferredModel: "worker",
  costTier: "medium"
};

export class CodegenWorker extends WorkerAgent {
  public constructor(context: ExecutionContext) {
    super(context, capability);
  }

  public async execute(input: WorkerExecutionInput) {
    return this.createResult(
      "worker.codegen",
      input.task,
      {
        patchPlan: [
          "Add strict typed contracts before implementation.",
          "Keep writes gated behind policy checks.",
          "Return structured artifacts for review."
        ],
        notes: [
          input.scope ? `Limit implementation to ${input.scope}.` : "No scope provided.",
          "Candidate patches still require leader review."
        ]
      },
      ["Generated code suggestions should not be accepted without deterministic validation."],
      0.72,
      [
        {
          name: "candidate-patch-plan.md",
          type: "text/markdown",
          content: "- Add contracts\n- Wire workflows\n- Validate before acceptance\n"
        }
      ],
      input.workerProfile
    );
  }
}
