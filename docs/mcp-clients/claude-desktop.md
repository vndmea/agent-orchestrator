# Claude Desktop MCP Setup

Use this guide only as untested launch-snippet scaffolding when connecting `mcp-code-worker` to Claude Desktop through the client's MCP configuration surface.

Status: snippet-only / untested for the current release. Codex is the only release-validated MCP host path right now. Claude Code MCP host integration is not currently supported.

## Recommended Server Snippet

Generate the snippet with:

```bash
cw mcp config --host=claude-desktop
```

This command only prints the generic stdio snippet shape. It does not prove Claude Desktop has loaded the server, launched it from the intended repository root, or completed a host-side tool round trip.

```json
{
  "mcpServers": {
    "mcp-code-worker": {
      "command": "cw",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Validation Loop

Before saving the client configuration:

- run `cw doctor`
- run `cw mcp list-tools`
- confirm `cw mcp serve` starts cleanly from the target workspace root

If Claude Desktop launches the server from a location other than the repository root, change the launch path so `cw mcp serve` starts inside the target repository.
