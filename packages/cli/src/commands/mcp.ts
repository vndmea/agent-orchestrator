import type { Command } from "commander";

import {
  buildMcpToolCatalogView,
  serveCwMcpServer
} from "@mcp-code-worker/mcp-server";
import { normalizeFileSystemPath } from "@mcp-code-worker/core";

import type { CliIo } from "../index.js";
import { writeOutput } from "../output.js";

export const buildMcpConfigSnippet = (options: {
  args?: string[];
  command?: string;
  cwHomeDir?: string;
  rootDir?: string;
} = {}) => {
  const args = [...(options.args ?? ["mcp", "serve"])];
  const env: Record<string, string> = {};

  if (options.rootDir) {
    env.CW_ROOT_DIR = normalizeFileSystemPath(options.rootDir);
  }

  if (options.cwHomeDir) {
    env.CW_HOME_DIR = normalizeFileSystemPath(options.cwHomeDir);
  }

  return {
    mcpServers: {
      "mcp-code-worker": {
        command: options.command ?? "cw",
        args,
        ...(Object.keys(env).length > 0 ? { env } : {})
      }
    }
  };
};

export const registerMcpCommand = (program: Command, io: CliIo): void => {
  const mcp = program.command("mcp").description("Manage the MCP server.");

  mcp
    .command("serve")
    .description("Start the stdio MCP server.")
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
    .description("Print a minimal local MCP stdio server config snippet. Worker, validation, and safety settings should live in cw config.json.")
    .option("--command <command>", "Command to launch the server", "cw")
    .option("--args <args...>", "Arguments passed to the command")
    .option(
      "--root-dir <path>",
      "Embed CW_ROOT_DIR in the snippet when the host does not launch cw from the target workspace root."
    )
    .option(
      "--home-dir <path>",
      "Embed CW_HOME_DIR in the snippet when CW-managed state should use a custom home root."
    )
    .action((options: {
      args?: string[];
      command: string;
      homeDir?: string;
      rootDir?: string;
    }) => {
      io.write(
        JSON.stringify(
          buildMcpConfigSnippet({
            args: options.args,
            command: options.command,
            ...(options.homeDir ? { cwHomeDir: options.homeDir } : {}),
            ...(options.rootDir ? { rootDir: options.rootDir } : {})
          }),
          null,
          2
        )
      );
    });
};
