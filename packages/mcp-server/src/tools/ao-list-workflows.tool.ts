import { z } from "zod";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({});

export const aoListWorkflowsTool: AoToolDefinition<
  typeof inputSchema.shape,
  Array<{ description: string; name: string }>
> = {
  name: "ao_list_workflows",
  description: "List available built-in workflows.",
  inputSchema,
  execute: () => [
    {
      name: "planning-workflow",
      description: "Create a task plan with worker assignments, risks, and validation strategy."
    },
    {
      name: "leader-worker-workflow",
      description: "Coordinate leader planning, workers, tool validation, and final review."
    },
    {
      name: "review-workflow",
      description: "Review a diff or file list and return structured findings."
    },
    {
      name: "fix-error-workflow",
      description: "Analyze an error log and return a safe candidate fix plan."
    }
  ]
};
