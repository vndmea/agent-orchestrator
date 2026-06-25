import { z } from "zod";

import { createExecutionContextFromEnv, PatchProposalSchema } from "@agent-orchestrator/core";
import { inspectPatch } from "@agent-orchestrator/tools";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  patchProposal: z.unknown()
});

export const aoInspectPatchTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof inspectPatch>>
> = {
  name: "ao_inspect_patch",
  description: "Inspect a structured patch proposal for safety and applicability.",
  inputSchema,
  execute: async (args) => {
    const context = createExecutionContextFromEnv(undefined, {
      dryRun: false
    });
    const proposal = PatchProposalSchema.parse(args.patchProposal);

    return inspectPatch(context, proposal);
  }
};
