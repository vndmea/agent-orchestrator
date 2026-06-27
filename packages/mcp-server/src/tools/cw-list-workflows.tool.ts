import { z } from "zod";

import type { CwToolDefinition } from "./tool-types.js";

const inputSchema = z.object({});

export const cwListWorkflowsTool: CwToolDefinition<
  typeof inputSchema.shape,
  Array<{ description: string; name: string }>
> = {
  name: "cw_list_workflows",
  description: "List host-managed workflows that remain available through public cw tools.",
  inputSchema,
  execute: () => [
    {
      name: "host-worker-workflow",
      description: "Run one explicit worker task under host control with repository-scoped quality gates."
    },
    {
      name: "review-workflow",
      description: "Review a diff, scope, or file list through host-managed worker execution."
    },
    {
      name: "fix-error-workflow",
      description: "Analyze an error log with host-managed workers and return a safe candidate fix plan."
    },
    {
      name: "patch-proposal-workflow",
      description: "Generate and inspect a patch proposal without applying repository writes."
    },
    {
      name: "task-session-workflow",
      description: "Run the end-to-end task session pipeline with persisted artifacts and patch gates."
    },
    {
      name: "worker-interview-workflow",
      description: "Evaluate worker capability before allowing production task routing."
    }
  ]
};
