import { z } from "zod";

import { runFixErrorWorkflow } from "@agent-orchestrator/graph";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  errorLog: z.string().min(1),
  scope: z.string().optional()
});

export const aoFixErrorTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof runFixErrorWorkflow>>
> = {
  name: "ao_fix_error",
  description: "Analyze an error log, propose a safe fix plan, and return validation guidance.",
  inputSchema,
  execute: async (args) =>
    runFixErrorWorkflow({
      errorLog: args.errorLog,
      scope: args.scope
    })
};
