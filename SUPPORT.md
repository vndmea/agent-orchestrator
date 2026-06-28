# Support

## Supported Entry Paths

`mcp-code-worker` currently supports two primary usage paths:

- public npm install: `npm i -g mcp-code-worker`
- repository checkout for development: `pnpm install`, `pnpm build`, then `pnpm exec cw ...` from the repository root

## Runtime Baseline

- Node.js `22`
- pnpm `>=10`

CI currently validates Node.js 22. Other Node.js `>=22` versions are best-effort until they are added to the CI matrix.

## What Support Covers

Support-oriented documentation in this repository covers:

- CLI setup and validation
- MCP server setup and root resolution
- worker onboarding and qualification
- provider configuration
- patch gating and local artifact storage

## What Support Does Not Promise

This repository does not promise:

- support for legacy repository-local `.cw/` directories
- automatic acceptance of worker outputs without host review
- repository writes without explicit gates
- production qualification for workers that have not passed onboarding
- claims for environments or client integrations that were not validated and documented

## Before Asking For Help

Please gather:

- `cw` version
- Node.js version
- pnpm version
- install path used (npm or repository checkout)
- whether `CW_ROOT_DIR` or `CW_HOME_DIR` is set
- the failing command
- sanitized error output

Start with:

```bash
cw doctor
cw mcp list-tools
```
