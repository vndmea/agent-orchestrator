# MCP Client Setup

This document explains how to connect `mcp-code-worker` to MCP-capable hosts and editor clients.

`cw` is the MCP server entrypoint. The same runtime can be launched from:

- a public npm install (`npm i -g mcp-code-worker`)
- a repository checkout (`pnpm exec cw ...` from the repository root)

## Recommended Setup Pattern

For most clients, the recommended command shape is:

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

If the client launches from a shared tools checkout instead of the active repository, prefer an explicit `--root` or set `CW_ROOT_DIR`.

## Validation Before Client Setup

Before connecting any client, verify the runtime locally:

```bash
cw doctor
cw mcp list-tools
cw mcp config
```

If you are using a repository checkout instead of the public install path, read every `cw ...` example in this document as `pnpm exec cw ...` from the repository root.

## Root And Storage Notes

- `CW_ROOT_DIR` controls which repository the server operates on.
- `CW_HOME_DIR` controls where user-scoped CW state is stored.
- By default, CW-managed state is stored under `~/.cw/workspaces/<workspace-id>/`.

For workspace-scoped editor use, prefer `cw mcp serve --root <workspace-path>` so repository files, git state, and task artifacts resolve against the intended checkout.

## Local Client Provider Note

If the worker model uses the local client provider, `opencode` is the default compatible client bridge command. Set `CW_WORKER_CLIENT_COMMAND` only when you need a different compatible executable name or path.

Example:

```json
{
  "mcpServers": {
    "mcp-code-worker": {
      "command": "cw",
      "args": ["mcp", "serve", "--root", "${workspaceFolder}"],
      "env": {
        "CW_WORKER_CLIENT_COMMAND": "/path/to/compatible-client"
      }
    }
  }
}
```

## Client-specific Guides

Use the guide that matches your host or editor:

- [Codex](https://github.com/vndmea/mcp-code-worker/blob/master/docs/mcp-clients/codex.md)
- [OpenCode](https://github.com/vndmea/mcp-code-worker/blob/master/docs/mcp-clients/opencode.md)
- [Claude Desktop](https://github.com/vndmea/mcp-code-worker/blob/master/docs/mcp-clients/claude-desktop.md)
- [Cursor](https://github.com/vndmea/mcp-code-worker/blob/master/docs/mcp-clients/cursor.md)
- [VS Code](https://github.com/vndmea/mcp-code-worker/blob/master/docs/mcp-clients/vscode.md)

Each guide uses the same `cw mcp serve` runtime and explains the minimum configuration and verification loop.
