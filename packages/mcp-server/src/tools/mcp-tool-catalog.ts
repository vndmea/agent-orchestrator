import {
  cwToolRegistry,
  type McpToolCategory
} from "./tool-registry.js";

export interface McpToolCatalogEntry {
  category: McpToolCategory;
  description: string;
  name: string;
  recommended?: boolean;
}

export interface McpToolCatalogView {
  groups: Array<{
    category: McpToolCategory;
    tools: McpToolCatalogEntry[];
  }>;
  recommendedEntrypoints: McpToolCatalogEntry[];
  summary: string;
}

export const mcpToolCatalog: McpToolCatalogEntry[] = cwToolRegistry.map((entry) => ({
  category: entry.category,
  description: entry.tool.description,
  name: entry.tool.name,
  ...(entry.recommended ? { recommended: true } : {})
}));

const CATALOG_ORDER: McpToolCategory[] = [
  "high-level-task-entrypoints",
  "diagnostics",
  "management",
  "workflow-building-blocks"
];

export const buildMcpToolCatalogView = (): McpToolCatalogView => ({
  summary:
    "Start with cw_start_task for host-managed coding flows; use lower-level tools only when you explicitly need narrower worker or artifact control.",
  recommendedEntrypoints: mcpToolCatalog.filter((tool) => tool.recommended),
  groups: CATALOG_ORDER.map((category) => ({
    category,
    tools: mcpToolCatalog.filter((tool) => tool.category === category)
  }))
});
