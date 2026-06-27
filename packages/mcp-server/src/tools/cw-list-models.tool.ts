import { z } from "zod";

import { resolveExecutionContext } from "@mcp-code-worker/core";
import { ModelRouter } from "@mcp-code-worker/models";

import type { CwToolDefinition } from "./tool-types.js";

const inputSchema = z.object({});

export const cwListModelsTool: CwToolDefinition<
  typeof inputSchema.shape,
  ReturnType<ModelRouter["listModels"]>
> = {
  name: "cw_list_models",
  description: "List configured worker models.",
  inputSchema,
  execute: async () => {
    const context = await resolveExecutionContext();
    const router = new ModelRouter(context.workerModel);
    return router.listModels();
  }
};
