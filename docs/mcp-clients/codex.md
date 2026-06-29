# Codex MCP Setup

Use this guide when `mcp-code-worker` is launched as an MCP server from Codex.

## Recommended Server Snippet

Generate the snippet with:

```bash
cw mcp config --host codex
```

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

## Verification

Before relying on the client integration:

- run `cw doctor`
- run `cw doctor --mcp --host codex`
- run `cw mcp list-tools`
- run `cw mcp config`

Keep runtime worker and safety settings in `config.json`; use the MCP snippet only for launch wiring, and make sure Codex starts it from the intended workspace root.

`cw mcp list-tools` and `cw mcp config` only validate the local runtime and snippet shape. They do not prove that Codex loaded the snippet. Use `cw doctor --mcp --host codex` for the host-side check, and do not treat a bare `cw mcp serve` run as a persistent health signal because the stdio server can exit when no client remains attached.
