import { z } from "zod";

import { resolveExecutionContext } from "@mcp-code-worker/core";
import { listWorkerProfiles } from "@mcp-code-worker/models";

import type { CwToolDefinition } from "./tool-types.js";

const inputSchema = z.object({});

export const cwListWorkersTool: CwToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof listWorkerProfiles>>
> = {
  name: "cw_list_workers",
  description: "List persisted worker capability profiles.",
  inputSchema,
  execute: async () => {
    const context = await resolveExecutionContext();
    return listWorkerProfiles(context.rootDir, context.cwStorageDir);
  }
};
