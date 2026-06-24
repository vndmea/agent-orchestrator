import { z } from "zod";

import { runPlanningWorkflow } from "@agent-orchestrator/graph";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  goal: z.string().min(1),
  contextFiles: z.array(z.string()).optional()
});

export const aoPlanTool: AoToolDefinition<typeof inputSchema.shape, Awaited<ReturnType<typeof runPlanningWorkflow>>> =
  {
    name: "ao_plan",
    description: "Create a structured plan, worker assignment proposal, and validation strategy.",
    inputSchema,
    execute: async (args) =>
      runPlanningWorkflow({
        goal: args.goal,
        contextFiles: args.contextFiles
      })
  };
