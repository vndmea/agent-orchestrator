import { z } from "zod";

import { createExecutionContextFromEnv, PatchProposalSchema } from "@agent-orchestrator/core";
import { applyPatchProposal } from "@agent-orchestrator/tools";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  patchProposal: z.unknown(),
  dryRun: z.boolean().optional(),
  allowWrite: z.boolean().optional(),
  confirmApply: z.boolean().optional(),
  typecheck: z.boolean().optional(),
  lint: z.boolean().optional(),
  test: z.boolean().optional()
});

export const aoApplyPatchTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof applyPatchProposal>>
> = {
  name: "ao_apply_patch",
  description: "Apply a structured patch proposal with dry-run default and explicit confirmation gates.",
  inputSchema,
  execute: async (args) => {
    const context = createExecutionContextFromEnv(undefined, {
      allowWrite: args.allowWrite,
      dryRun: false
    });
    const proposal = PatchProposalSchema.parse(args.patchProposal);

    return applyPatchProposal(context, proposal, {
      dryRun: args.dryRun ?? !args.allowWrite,
      allowWrite: args.allowWrite,
      confirmApply: args.confirmApply,
      runValidation: {
        typecheck: args.typecheck,
        lint: args.lint,
        test: args.test
      }
    });
  }
};
