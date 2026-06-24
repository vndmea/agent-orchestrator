import type { Command } from "commander";

import { aoToolDefinitions, serveAoMcpServer } from "@agent-orchestrator/mcp-server";

import type { CliIo } from "../index.js";

export const registerMcpCommand = (program: Command, io: CliIo): void => {
  const mcp = program.command("mcp").description("Manage the MCP server.");

  mcp
    .command("serve")
    .description("Start the stdio MCP server.")
    .action(async () => {
      await serveAoMcpServer();
    });

  mcp
    .command("list-tools")
    .description("List MCP tool definitions.")
    .action(() => {
      io.write(
        JSON.stringify(
          aoToolDefinitions.map((tool) => ({
            name: tool.name,
            description: tool.description
          })),
          null,
          2
        )
      );
    });
};
