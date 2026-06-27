import { z } from "zod";

import type { CwToolDefinition } from "./tool-types.js";
import { buildMcpToolCatalogView } from "./mcp-tool-catalog.js";

const inputSchema = z.object({});

export const cwListToolsTool: CwToolDefinition<
  typeof inputSchema.shape,
  ReturnType<typeof buildMcpToolCatalogView>
> = {
  name: "cw_list_tools",
  description: "List MCP tool definitions exposed by the server.",
  inputSchema,
  execute: () => buildMcpToolCatalogView()
};
