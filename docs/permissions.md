# Permissions

`agent-orchestrator` uses a layered permission model so read, local artifact writes, and repository writes do not collapse into a single switch.

## Permission Layers

- `read-only`: repository reads, diff inspection, task/status/report reads, and validation planning.
- `session-write`: local task artifacts under `.ao/runs/<taskId>`.
- `project-write`: repository file writes when a command explicitly supports them.
- `patch-apply`: the second gate for mutating source files through patch application.
- `audit-write`: local audit events under `.ao/audit`.

## Default Behavior

- Default mode is dry-run.
- Dry-run does not create audit files by default for ordinary evaluation paths.
- Repository reads and safe inspection commands can still run in dry-run mode.
- Worker outputs are not accepted until leader review completes.

## Gates

- `--allow-write-session` allows `.ao/runs` persistence only.
- `--allow-write` allows commands with write support to modify local managed files or repository files, depending on the command.
- `--confirm-apply` is required in addition to `--allow-write` before `patch apply` can touch project files.

Patch apply stays explicitly two-step:

1. generate and inspect a proposal
2. apply only with `--allow-write --confirm-apply`

## What Writes Under `.ao`

Local-managed artifacts include:

- `.ao/config.json`
- `.ao/workers.json`
- `.ao/worker-profiles.json`
- `.ao/worker-benchmarks/`
- `.ao/runs/`
- `.ao/audit/`

`benchmark` artifacts are local `.ao` artifacts, not project source files.

## What Can Modify Project Files

- `ao patch apply ... --allow-write --confirm-apply`
- task-session resume paths only when they explicitly reach patch apply with both gates

`ao fix error`, `ao review ...`, `ao validate`, and `ao patch propose` do not apply repository changes by themselves.

## Cleanup Scope

- `ao cleanup runs` only removes local task-session artifacts under `.ao/runs`.
- `ao cleanup audit` only removes local audit artifacts under `.ao/audit`.
- Cleanup commands do not touch project source files.
