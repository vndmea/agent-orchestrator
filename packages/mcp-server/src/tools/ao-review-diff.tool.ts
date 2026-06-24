import { z } from "zod";

import { runReviewWorkflow } from "@agent-orchestrator/graph";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  diff: z.string().optional(),
  files: z.array(z.string()).optional()
});

export const aoReviewDiffTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof runReviewWorkflow>>
> = {
  name: "ao_review_diff",
  description: "Review a diff or file list and return structured impact analysis.",
  inputSchema,
  execute: async (args) =>
    runReviewWorkflow({
      diff: args.diff,
      files: args.files
    })
};
