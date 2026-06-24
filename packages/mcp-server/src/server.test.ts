import { describe, expect, it } from "vitest";

import { aoListModelsTool, aoToolDefinitions } from "@agent-orchestrator/mcp-server";

describe("mcp tool registration", () => {
  it("registers the expected MCP tool names", () => {
    expect(aoToolDefinitions.map((tool) => tool.name)).toEqual([
      "ao_plan",
      "ao_run_workflow",
      "ao_review_diff",
      "ao_fix_error",
      "ao_list_models",
      "ao_list_workflows",
      "ao_list_tools"
    ]);
  });

  it("lists configured models", async () => {
    const models = await aoListModelsTool.execute({});
    expect(models).toHaveLength(2);
  });
});
