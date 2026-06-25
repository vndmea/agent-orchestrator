import { z } from "zod";

import { resolveExecutionContext } from "@agent-orchestrator/core";
import { runReviewWorkflow } from "@agent-orchestrator/graph";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  base: z.string().optional(),
  head: z.string().optional(),
  scope: z.string().optional(),
  typecheck: z.boolean().optional(),
  lint: z.boolean().optional(),
  test: z.boolean().optional(),
  maxFileBytes: z.number().int().positive().optional(),
  maxTotalBytes: z.number().int().positive().optional()
});

export const aoReviewDiffTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof runReviewWorkflow>>
> = {
  name: "ao_review_diff",
  description: "Review a git diff and return structured impact analysis.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveExecutionContext();
    return runReviewWorkflow({
      context,
      includeDiff: true,
      diffBase: args.base,
      diffHead: args.head,
      scope: args.scope,
      maxFileBytes: args.maxFileBytes,
      maxTotalBytes: args.maxTotalBytes,
      validate: {
        typecheck: args.typecheck,
        lint: args.lint,
        test: args.test
      }
    });
  }
};
