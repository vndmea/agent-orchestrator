import { z } from "zod";

import { resolveExecutionContext } from "@agent-orchestrator/core";
import {
  formatPatchProposalWorkflowOutput,
  runPatchProposalWorkflow
} from "@agent-orchestrator/graph";

import type { AoToolDefinition } from "./tool-types.js";
import {
  resolveWorkflowOutputOptions,
  workflowOutputOptionShape
} from "./output-options.js";

const inputSchema = z.object({
  goal: z.string().optional(),
  scope: z.string().optional(),
  errorLog: z.string().optional(),
  workerId: z.string().optional(),
  requireProfile: z.boolean().optional(),
  detailLevel: workflowOutputOptionShape.detailLevel,
  maxBytes: workflowOutputOptionShape.maxBytes
});

export const aoProposePatchTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof runPatchProposalWorkflow>> | Record<string, unknown>
> = {
  name: "ao_propose_patch",
  description: "Generate a structured patch proposal and inspect it without applying changes.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveExecutionContext();
    const result = await runPatchProposalWorkflow({
      context,
      goal: args.goal,
      scope: args.scope,
      errorLog: args.errorLog,
      workerId: args.workerId,
      requireProfile: args.requireProfile
    });

    return formatPatchProposalWorkflowOutput(
      result,
      resolveWorkflowOutputOptions(args)
    );
  }
};
