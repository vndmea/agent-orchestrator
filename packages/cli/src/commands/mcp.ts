import type { Command } from "commander";

import {
  buildMcpConfigSnippet,
  buildMcpToolCatalogView,
  isMcpHost,
  MCP_HOSTS,
  renderMcpConfigSnippet,
  serveCwMcpServer,
  type McpHost
} from "@mcp-code-worker/mcp-server";

import type { CliIo } from "../index.js";
import { writeOutput } from "../output.js";

export {
  buildMcpConfigSnippet,
  isMcpHost,
  MCP_HOSTS,
  renderMcpConfigSnippet,
  type McpHost
};

export const registerMcpCommand = (program: Command, io: CliIo): void => {
  const mcp = program.command("mcp").description("Manage the MCP server.");

  mcp
    .command("serve")
    .description(
      "Start the stdio MCP server for a connected host session. Manual runs can exit once stdio closes."
    )
    .action(async () => {
      await serveCwMcpServer();
    });

  mcp
    .command("list-tools")
    .description("List MCP tool definitions grouped by recommended entrypoint and tool type.")
    .action(() => {
      const catalog = buildMcpToolCatalogView();

      writeOutput(
        io,
        catalog,
        [
          "mcp tools",
          ...catalog.groups.map(
            (group) =>
              `${group.category}: ${group.tools.map((tool) => tool.name).join(", ")}`
          )
        ]
      );
    });

  mcp
    .command("config")
    .description(
      "Print a host-aware local MCP stdio server config snippet. Codex is release-validated; other host presets are snippet-only."
    )
    .option("--command <command>", "Command to launch the server", "cw")
    .option("--args <args...>", "Arguments passed to the command")
    .option(
      "--host <name>",
      `Target host preset. Codex is release-validated; others are snippet-only: ${MCP_HOSTS.join(", ")}`,
      "generic"
    )
    .action((options: {
      args?: string[];
      command: string;
      host: string;
    }) => {
      if (!isMcpHost(options.host)) {
        throw new Error(
          `Unsupported MCP host '${options.host}'. Expected one of: ${MCP_HOSTS.join(", ")}.`
        );
      }

      io.write(
        renderMcpConfigSnippet({
          args: options.args,
          command: options.command,
          host: options.host
        })
      );
    });
};
