export const MCP_HOSTS = [
  "generic",
  "codex",
  "cursor",
  "vscode",
  "claude-desktop",
  "opencode"
] as const;

export type McpHost = (typeof MCP_HOSTS)[number];

const MCP_SERVER_KEY = "mcp-code-worker";

// Only the Codex host path is release-validated right now. The other host
// names are retained as snippet scaffolding so future host work can reuse the
// same config surface without implying current support.

export const isMcpHost = (value: string): value is McpHost =>
  MCP_HOSTS.includes(value as McpHost);

export const buildMcpConfigSnippet = (options: {
  args?: string[];
  command?: string;
  host?: string;
} = {}) => {
  const args = [...(options.args ?? ["mcp", "serve"])];
  const requestedHost = options.host ?? "generic";

  if (!isMcpHost(requestedHost)) {
    throw new Error(
      `Unsupported MCP host '${requestedHost}'. Expected one of: ${MCP_HOSTS.join(", ")}.`
    );
  }

  return {
    mcpServers: {
      [MCP_SERVER_KEY]: {
        command: options.command ?? "cw",
        args
      }
    }
  };
};

const formatTomlStringArray = (values: string[]): string =>
  `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;

export const renderMcpConfigSnippet = (options: {
  args?: string[];
  command?: string;
  host?: string;
} = {}): string => {
  const requestedHost = options.host ?? "generic";
  const snippet = buildMcpConfigSnippet(options);

  if (requestedHost === "codex") {
    const server = snippet.mcpServers[MCP_SERVER_KEY];

    return [
      `[mcp_servers."${MCP_SERVER_KEY}"]`,
      `command = ${JSON.stringify(server.command)}`,
      `args = ${formatTomlStringArray(server.args)}`
    ].join("\n");
  }

  return JSON.stringify(snippet, null, 2);
};
