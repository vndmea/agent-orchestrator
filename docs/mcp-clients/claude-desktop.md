# Claude Desktop MCP Setup

Use this guide when connecting `mcp-code-worker` to Claude Desktop through the client's MCP configuration surface.

## Recommended Server Snippet

```json
{
  "mcpServers": {
    "mcp-code-worker": {
      "command": "cw",
      "args": ["mcp", "serve", "--root", "${workspaceFolder}"]
    }
  }
}
```

## Validation Loop

Before saving the client configuration:

- run `cw doctor`
- run `cw mcp list-tools`
- confirm `cw mcp serve --root <workspace-path>` starts cleanly

If Claude Desktop launches the server from a location other than the repository root, keep the explicit `--root` argument.
