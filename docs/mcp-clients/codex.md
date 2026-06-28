# Codex MCP Setup

Use this guide when `mcp-code-worker` is launched as an MCP server from Codex.

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

## Verification

Before relying on the client integration:

- run `cw doctor`
- run `cw mcp list-tools`
- run `cw mcp config`

If Codex launches from a shared tools checkout instead of the active repository, keep the explicit `--root` or set `CW_ROOT_DIR`.
