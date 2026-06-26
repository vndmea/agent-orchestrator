# User-Scoped Storage Migration

`agent-orchestrator` now stores local AO state in user-scoped workspace storage instead of repository-local `.ao/`.

## Current Storage Model

- Default AO home: `~/.ao`
- Workspace storage: `~/.ao/workspaces/<workspace-id>/`
- Override AO home with `AO_HOME_DIR`
- Override workspace binding with `AO_ROOT_DIR` or `ao ... --root <workspace-path>` where supported

Typical files under one workspace storage directory:

- `config.json`
- `workers.json`
- `worker-profiles.json`
- `worker-benchmarks/`
- `runs/`
- `audit/`

## Compatibility Status

There is currently no automatic migration from legacy repository-local `.ao/` directories into user-scoped storage.

That means older trial artifacts may appear "missing" after upgrading even though the files still exist in the repository checkout.

## Recommended Migration Steps

1. Identify the old repository-local `.ao/` directory.
2. Run `pnpm exec ao setup --allow-write` once so the new user-scoped workspace directory is created.
3. Copy only the files you want to preserve into the new workspace storage directory.
4. Re-run `pnpm exec ao doctor` and verify the expected config, worker registry, profiles, runs, and audit artifacts are visible.

## Suggested File Mapping

- `.ao/config.json` -> `~/.ao/workspaces/<workspace-id>/config.json`
- `.ao/workers.json` -> `~/.ao/workspaces/<workspace-id>/workers.json`
- `.ao/worker-profiles.json` -> `~/.ao/workspaces/<workspace-id>/worker-profiles.json`
- `.ao/worker-benchmarks/` -> `~/.ao/workspaces/<workspace-id>/worker-benchmarks/`
- `.ao/runs/` -> `~/.ao/workspaces/<workspace-id>/runs/`
- `.ao/audit/` -> `~/.ao/workspaces/<workspace-id>/audit/`

## Operator Notes

- Workspace ids are derived from the absolute repository path, so two different checkouts of the same repo produce different workspace directories.
- If you want multiple checkouts or tools to share one AO home root, set the same `AO_HOME_DIR` explicitly.
- Repository writes are still separate from AO storage writes. Migrating storage does not grant project file write access.
