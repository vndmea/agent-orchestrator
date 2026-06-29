import { z } from "zod";

import type { McpToolCatalogView } from "./mcp-tool-catalog.js";
import type { CwToolDefinition } from "./tool-types.js";

const inputSchema = z.object({});

export const cwListToolsTool: CwToolDefinition<
  typeof inputSchema.shape,
  McpToolCatalogView
> = {
  name: "cw_list_tools",
  description: "List MCP tool definitions exposed by the server.",
  inputSchema,
  execute: async () => {
    const { buildMcpToolCatalogView } = await import("./mcp-tool-catalog.js");

    return buildMcpToolCatalogView();
  }
};
