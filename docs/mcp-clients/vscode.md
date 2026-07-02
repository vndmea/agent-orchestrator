# VS Code MCP Setup

Use this guide only as untested launch-snippet scaffolding when connecting `mcp-code-worker` to a VS Code MCP-capable extension or integration.

Status: snippet-only / untested for the current release. Codex is the only release-validated MCP host path right now.

## Recommended Server Snippet

Generate the snippet with:

```bash
cw mcp config --host=vscode
```

This command only prints the generic stdio snippet shape. It does not prove VS Code has loaded the server, launched it from the intended repository root, or completed a host-side tool round trip.

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

After applying the snippet:

- run `cw mcp list-tools` locally and compare the expected tool list
- confirm the VS Code-side integration can connect and list the same tools
- keep runtime worker/provider settings in `config.json` and make sure VS Code launches `cw` from the target workspace root
