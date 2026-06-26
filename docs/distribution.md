# Distribution Strategy

`agent-orchestrator` does not currently ship through npm, Docker, or GitHub release artifacts.

## Official Internal Distribution Shape

The supported internal distribution path is:

1. a pinned git checkout of this repository
2. `pnpm install`
3. `pnpm build`
4. `pnpm exec ao ...` from the repository root

This is the only documented distribution shape for the current internal RC line.

## Why This Is The Current Standard

- The repository root controls workspace binding and path resolution consistently.
- The CLI, MCP server, docs, and tests are already validated against this path.
- It avoids implying that a global install or registry package is production-ready when it is not.

## Not Yet Supported As Primary Distribution

- public npm package
- private npm registry package
- Docker image
- GitHub release tarball
- global `npm install -g` path as the documented default

## Revisit Criteria

Promote a new distribution shape only after:

- CI evidence is stable for the intended release branch
- install and upgrade instructions are documented end-to-end
- AO storage and workspace binding behavior are verified in that packaging mode
- smoke coverage exists for the new install path
