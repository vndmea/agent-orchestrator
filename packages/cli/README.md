# @agent-orchestrator/cli

Experimental npm packaging target for the Agent Orchestrator CLI.

## Status

This package is prepared for single-package distribution validation, but the repository checkout flow is still the primary supported install path for the current RC line.

## Local Verification

From the repository root:

```bash
pnpm --filter @agent-orchestrator/cli... build
pnpm smoke:pack
```

## Workspace Binding

When `ao` is launched outside the repository checkout, pass an explicit workspace root:

```bash
ao mcp serve --root /path/to/project
```

or set `AO_ROOT_DIR`.
