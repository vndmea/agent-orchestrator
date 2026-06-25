import { z } from "zod";

import { resolveExecutionContext } from "@agent-orchestrator/core";
import { runPatchProposalWorkflow } from "@agent-orchestrator/graph";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  goal: z.string().optional(),
  scope: z.string().optional(),
  errorLog: z.string().optional(),
  workerId: z.string().optional(),
  requireProfile: z.boolean().optional()
});

export const aoProposePatchTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof runPatchProposalWorkflow>>
> = {
  name: "ao_propose_patch",
  description: "Generate a structured patch proposal and inspect it without applying changes.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveExecutionContext();
    return runPatchProposalWorkflow({
      context,
      goal: args.goal,
      scope: args.scope,
      errorLog: args.errorLog,
      workerId: args.workerId,
      requireProfile: args.requireProfile
    });
  }
};
