# Installation

The current internal-trial install method is a pinned workspace checkout of this repository.

Supported path for fresh-machine setup:

```bash
pnpm install
pnpm build
pnpm exec cw doctor
pnpm exec cw mcp list-tools
```

This route has been verified from the repository root after `pnpm build`, and it is the current official internal distribution shape.

## Recommended Internal-Trial Flow

From the repository root:

```bash
pnpm install
pnpm build
pnpm exec cw setup --allow-write
pnpm exec cw doctor
pnpm exec cw mcp config
pnpm exec cw mcp serve
```

Notes:

- In this document, `cw ...` means `pnpm exec cw ...` from the repository root unless you have separately linked or published the CLI.
- Run all `pnpm exec cw ...` commands from the repository root.
- `pnpm --filter @mcp-code-worker/cli exec cw ...` is not the recommended entrypoint because it changes path resolution semantics.
- The repository is still private and does not yet document a supported global install, internal npm registry release, or Docker distribution as the primary trial path.
- Treat the pinned git checkout plus `pnpm exec cw ...` flow as the only supported internal distribution path for this RC line.
- CW-managed local state now lives under `~/.cw/workspaces/<workspace-id>/` by default. Use `CW_HOME_DIR` if you need a non-default CW home root.
- Repository-local legacy `.cw/` directories are unsupported and ignored by current builds.

## Direct Fallback

If the local bin shim is unavailable, call the built CLI directly:

```bash
node packages/cli/dist/main.js doctor
node packages/cli/dist/main.js mcp list-tools
```

## PowerShell Example

```powershell
pnpm install
pnpm build
pnpm exec cw doctor
pnpm exec cw mcp serve
```

## MCP Client Notes

- MCP clients should launch the server from the repository root.
- Use `pnpm exec cw mcp config` to print a stdio config snippet.
- For workspace-scoped IDE use, prefer `pnpm exec cw mcp config --root ${workspaceFolder}` or set `CW_ROOT_DIR` in the MCP server environment.
- For local client providers, `opencode` is the default command. Use `--worker-client-command <command>` or set `CW_WORKER_CLIENT_COMMAND=<command>` only when your compatible local wrapper uses a different executable name.
- For cross-checkout or shared-tool setups, also decide whether `CW_HOME_DIR` should be fixed so CW-managed artifacts land in a predictable user-scoped location.
- For internal trial, prefer the workspace checkout over hardcoded developer-local absolute paths.
- See `docs/distribution.md` for the explicit distribution decision and current non-goals.
