# Cursor MCP Setup

Use this guide when configuring `mcp-code-worker` inside Cursor.

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

## Notes

- `cw mcp config` is the quickest way to compare the expected stdio snippet with what you pasted into the client.
- If the client starts from a shared tools checkout, the explicit `--root` is what keeps file access and CW state aligned to the active workspace.
