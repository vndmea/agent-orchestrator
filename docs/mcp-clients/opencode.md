# OpenCode MCP Setup

Use this guide when `mcp-code-worker` is launched as an MCP server from OpenCode or when OpenCode-compatible local client behavior is part of your workflow.

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

## Root Resolution

Prefer an explicit `--root` so repository files, git state, and CW-managed artifacts resolve against the intended workspace.

## Local Client Provider Note

If you also use the local client provider bridge, `opencode` is the default compatible command behind `CW_WORKER_CLIENT_COMMAND`. Set that variable only when you need a different executable name or path.
