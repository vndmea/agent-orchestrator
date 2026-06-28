# VS Code MCP Setup

Use this guide when connecting `mcp-code-worker` to a VS Code MCP-capable extension or integration.

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

After applying the snippet:

- run `cw mcp list-tools` locally and compare the expected tool list
- confirm the VS Code-side integration can connect and list the same tools
- keep `CW_ROOT_DIR` unset unless you intentionally need it; prefer an explicit `--root`
