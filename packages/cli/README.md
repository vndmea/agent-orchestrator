# mcp-code-worker npm package

This workspace package is the source for the published `mcp-code-worker` npm CLI.

## Publish shape

- Source workspace package name: `@mcp-code-worker/cli`
- Published npm package name: `mcp-code-worker`
- Installed command: `cw`

## Local verification

From the repository root:

```bash
pnpm --filter @mcp-code-worker/cli... build
pnpm smoke:pack
```

## Global install

```bash
npm i -g mcp-code-worker
cw doctor
```

## Workspace binding

When `cw` is launched outside the repository checkout, pass an explicit workspace root:

```bash
cw mcp serve --root /path/to/project
```

or set `CW_ROOT_DIR`.
