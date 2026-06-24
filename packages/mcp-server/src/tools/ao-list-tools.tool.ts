import { z } from "zod";

import { registeredTools } from "@agent-orchestrator/tools";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({});

export const aoListToolsTool: AoToolDefinition<
  typeof inputSchema.shape,
  typeof registeredTools
> = {
  name: "ao_list_tools",
  description: "List deterministic tool abstractions available to orchestrated workflows.",
  inputSchema,
  execute: () => registeredTools
};
