# Cursor MCP Setup

Use this guide only as untested launch-snippet scaffolding when configuring `mcp-code-worker` inside Cursor.

Status: snippet-only / untested for the current release. Codex is the only release-validated MCP host path right now.

## Recommended Server Snippet

Generate the snippet with:

```bash
cw mcp config --host=cursor
```

This command only prints the generic stdio snippet shape. It does not prove Cursor has loaded the server, launched it from the intended repository root, or completed a host-side tool round trip.

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

## Notes

- `cw mcp config` is the quickest way to compare the expected stdio snippet with what you pasted into the client.
- Keep worker/provider/local-client defaults in `config.json`.
- If the client starts from a shared tools checkout, switch it to launch `cw mcp serve` from the active workspace instead of relying on environment overrides.
