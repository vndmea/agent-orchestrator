# @mcp-code-worker/cli

Experimental npm packaging target for the MCP Code Worker CLI.

## Status

This package is prepared for single-package distribution validation, but the repository checkout flow is still the primary supported install path for the current RC line.

## Local Verification

From the repository root:

```bash
pnpm --filter @mcp-code-worker/cli... build
pnpm smoke:pack
```

## Workspace Binding

When `cw` is launched outside the repository checkout, pass an explicit workspace root:

```bash
cw mcp serve --root /path/to/project
```

or set `CW_ROOT_DIR`.
