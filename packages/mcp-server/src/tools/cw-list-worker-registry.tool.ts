import { z } from "zod";

import { resolveExecutionContext } from "@mcp-code-worker/core";
import { listWorkerRegistrations } from "@mcp-code-worker/models";

import type { CwToolDefinition } from "./tool-types.js";

const inputSchema = z.object({});

export const cwListWorkerRegistryTool: CwToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof listWorkerRegistrations>>
> = {
  name: "cw_list_worker_registry",
  description: "List registered worker models.",
  inputSchema,
  execute: async () => {
    const context = await resolveExecutionContext();
    return listWorkerRegistrations(context.rootDir, context.cwStorageDir);
  }
};
