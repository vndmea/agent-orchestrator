import { z } from "zod";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import { removeWorkerRegistration } from "@agent-orchestrator/models";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  workerId: z.string().min(1),
  allowWrite: z.boolean().optional()
});

export const aoUnregisterWorkerTool: AoToolDefinition<
  typeof inputSchema.shape,
  { mode: "execute" | "dry-run"; path: string; removed: boolean }
> = {
  name: "ao_unregister_worker",
  description: "Remove a worker from the local worker registry.",
  inputSchema,
  execute: async (args) => {
    const context = createExecutionContextFromEnv(undefined, {
      allowWrite: args.allowWrite ?? false,
      dryRun: !(args.allowWrite ?? false)
    });
    return removeWorkerRegistration(
      context,
      args.workerId,
      args.allowWrite ?? false
    );
  }
};
