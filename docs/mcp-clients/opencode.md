# OpenCode MCP Setup

Use this guide only as untested launch-snippet scaffolding when `mcp-code-worker` is launched as an MCP server from OpenCode or when OpenCode-compatible local client behavior is part of your workflow.

Status: snippet-only / untested for the current release. Codex is the only release-validated MCP host path right now.

## Recommended Server Snippet

Generate the snippet with:

```bash
cw mcp config --host=opencode
```

This command only prints the generic stdio snippet shape. It does not prove OpenCode has loaded the server, launched it from the intended repository root, or completed a host-side tool round trip.

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

## Root Resolution

Launch the server from the intended workspace root. If OpenCode starts it from elsewhere, change the launch path instead of relying on environment overrides.

## Local Client Provider Note

If you also experiment with the dedicated OpenCode worker adapter, set `provider=opencode`. This worker adapter is not part of the current release-supported npm/e2e path. `opencode` remains the default command, and `config.json.workers[][*].clientCommand` is only needed when the executable name or path differs.

If you experiment with the generic local client provider instead, its default command is `sparkcode`, not `opencode`.
