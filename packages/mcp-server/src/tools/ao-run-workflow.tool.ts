import { z } from "zod";

import {
  runFixErrorWorkflow,
  runLeaderWorkerWorkflow,
  runPlanningWorkflow,
  runReviewWorkflow,
  runWorkerInterviewWorkflow
} from "@agent-orchestrator/graph";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  workflow: z.enum([
    "planning-workflow",
    "leader-worker-workflow",
    "review-workflow",
    "fix-error-workflow",
    "worker-interview-workflow"
  ]),
  goal: z.string().optional(),
  scope: z.string().optional(),
  diff: z.string().optional(),
  files: z.array(z.string()).optional(),
  errorLog: z.string().optional(),
  contextFiles: z.array(z.string()).optional()
});

export const aoRunWorkflowTool: AoToolDefinition<
  typeof inputSchema.shape,
  unknown
> = {
  name: "ao_run_workflow",
  description: "Run a low-level built-in workflow directly. Prefer ao_start_task or ao_run_leader_worker for host-facing use.",
  inputSchema,
  execute: async (args) => {
    switch (args.workflow) {
      case "planning-workflow":
        return runPlanningWorkflow({
          goal: args.goal ?? "No goal provided",
          contextFiles: args.contextFiles
        });
      case "leader-worker-workflow":
        return runLeaderWorkerWorkflow({
          goal: args.goal ?? "No goal provided",
          scope: args.scope
        });
      case "review-workflow":
        return runReviewWorkflow({
          diff: args.diff,
          files: args.files
        });
      case "fix-error-workflow":
        return runFixErrorWorkflow({
          errorLog: args.errorLog ?? "",
          scope: args.scope
        });
      case "worker-interview-workflow":
        return runWorkerInterviewWorkflow({
          workerId: args.scope
        });
      default:
        return null;
    }
  }
};
