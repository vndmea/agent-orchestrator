# Changesets

This repository uses Changesets to manage version bumps and changelog entries for the npm CLI release.

## What gets versioned

- Published package: `@mcp-code-worker/cli`
- Published npm artifact name: `mcp-code-worker`
- Internal workspace packages are ignored by Changesets config for release planning.

## Typical flow

1. Add a changeset for user-facing work:

   ```bash
   pnpm changeset
   ```

2. Review the generated markdown file under `.changeset/`.

3. When preparing a release:

   ```bash
   pnpm version:packages
   pnpm release:check
   pnpm release:npm
   ```

## Example

See [docs/examples/changeset.example.md](../docs/examples/changeset.example.md) for a repository-specific template.
