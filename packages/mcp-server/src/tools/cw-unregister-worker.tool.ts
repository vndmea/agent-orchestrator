import { z } from "zod";

import { resolveExecutionContext } from "@mcp-code-worker/core";
import { removeWorkerRegistration } from "@mcp-code-worker/models";

import type { CwToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  workerId: z.string().min(1),
  allowWrite: z.boolean().optional()
});

export const cwUnregisterWorkerTool: CwToolDefinition<
  typeof inputSchema.shape,
  { mode: "execute" | "dry-run"; path: string; removed: boolean }
> = {
  name: "cw_unregister_worker",
  description: "Remove a worker from the local worker registry.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveExecutionContext({
      cliOverrides: {
        allowWrite: args.allowWrite ?? false,
        dryRun: !(args.allowWrite ?? false)
      }
    });
    return removeWorkerRegistration(
      context,
      args.workerId,
      args.allowWrite ?? false
    );
  }
};
