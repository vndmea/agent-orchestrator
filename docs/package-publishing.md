# Package Publishing

This document describes how the public npm package is prepared and validated for `mcp-code-worker`.

## Source And Published Package Names

- Source workspace package: `@mcp-code-worker/cli`
- Published package: `mcp-code-worker`
- Installed command: `cw`

The public npm package is generated from the CLI workspace because that is the end-user entrypoint.

## Publish Staging Directory

The publish staging directory is:

```text
packages/cli/.publish/
```

The publish preparation step rewrites the manifest for the public package shape and copies the built CLI output plus publish-facing documentation.

## Publish Commands

From `packages/cli`:

```bash
pnpm run prepack
pnpm run pack:publish
pnpm run publish:npm
```

`prepack` performs the build and prepares the staged publish directory.

## Validation Before Publish

Before publishing, run the repository-level checks:

```bash
pnpm build
pnpm smoke:pack
pnpm smoke:dist
```

You should also validate the public install path explicitly:

```bash
npm i -g mcp-code-worker
cw doctor
cw mcp list-tools
```

## What To Inspect In The Staged Package

Review `packages/cli/.publish/` and confirm:

- the package name is `mcp-code-worker`
- the compiled `dist/` output is present
- `README.md` is present
- `package.json` is present
- no internal `workspace:*` dependencies remain in the published manifest
- no development-only or secret-bearing files are included

## README For npm

Because the npm package is published from the CLI workspace, the publish-facing `README.md` should match the project README and use absolute repository links where a user on npm needs to navigate back to the source repository or docs.
