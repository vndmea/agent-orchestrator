---
"@mcp-code-worker/cli": patch
---

Publish the npm CLI with the latest bug fixes and packaging updates.

Use this file as a template when creating a real changeset with:

```bash
pnpm changeset
```

Guidelines:

- Use `patch` for bug fixes, packaging fixes, and doc-only install-path corrections.
- Use `minor` for backward-compatible new CLI or MCP capabilities.
- Use `major` for breaking command, config, or distribution changes.
- Keep the summary user-facing. It should describe what changed for someone installing or running `cw`.
