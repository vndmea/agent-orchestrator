# Storage And Artifacts

`mcp-code-worker` keeps local managed state outside the repository checkout by default.

The default base path is:

```text
~/.code-worker/<workspace-id>/
```

CW uses `~/.code-worker` for user-scoped state. `--root` on supported CLI
commands changes which repository path maps to `<workspace-id>`.

## Common Files And Directories

Typical CW-managed workspace files include:

- `config.json`
- `data.db`

`config.json` remains human-editable and stores worker definitions plus runtime
defaults. `data.db` is the SQLite store for worker secrets, worker profiles,
latest benchmark records per worker and suite, worker execution records, task
sessions, task artifacts, and audit events.

## Task Session Artifacts

Task sessions are stored in SQLite under:

```text
~/.code-worker/<workspace-id>/data.db#task_sessions
```

Common artifacts include:

- `repository-context.summary.json`
- `review-result.summary.json`
- `report.md`
- `validation-report.json`
- `patch-proposal.json`
- `patch-inspection.json`
- `patch-apply-result.json`

`repository-context.summary.json` and `review-result.summary.json` are
lightweight summary artifacts. They keep file paths, counts, selection reasons,
validation summaries, and review findings without storing repository file
contents.

These logical artifacts are review artifacts, not repository source files. Use
`cw task report`, `cw read-task-artifact`, or the returned artifact refs to read
them back instead of expecting stable filesystem paths.

## Worker Qualification Artifacts

Worker qualification state is stored in user-scoped CW storage:

- registrations and non-secret worker defaults: `config.json.workers[]`
- profiles: `data.db#worker_profiles`
- benchmarks: `data.db#worker_benchmarks`

Benchmark retention keeps only the latest persisted row per
`(worker_id, suite_name)`.

## Worker Execution Records

Host-owned contract runs are represented as execution records in SQLite:

```text
~/.code-worker/<workspace-id>/data.db#worker_task_executions
```

Each `WorkerTaskExecutionRecord` stores:

- the `WorkerTaskEnvelope` requested by the host
- the `WorkerResultEnvelope` returned to the host
- the `WorkerTrustProfile` used for the run
- structured-output mode, repair attempts, fallback reason, and failure kind
- semantic validation status and reasons
- artifact references such as patch proposal ids or worker debug artifacts

Execution artifact references are tracked in:

```text
~/.code-worker/<workspace-id>/data.db#artifact_records
```

`cleanup_runs` records cleanup bookkeeping for local retention workflows. The
current cleanup commands prune task sessions and audit events; execution-record
retention should be treated as local CW-managed state and not as repository
source.

## Audit Artifacts

Audit events are local CW artifacts in:

```text
~/.code-worker/<workspace-id>/data.db#audit_events
```

Dry-run does not create persisted audit rows by default for ordinary evaluation paths, but explicit audit-writing paths still remain local to CW storage.

Worker execution records follow the same local-managed storage principle:
dry-run contexts can return a candidate record id for traceability, but records
are only persisted when the execution context allows managed storage writes.

## Cleanup Scope

- `cw cleanup runs` prunes persisted task-session rows from SQLite
- `cw cleanup audit` prunes persisted audit rows from SQLite

Default retention is:

- runs: latest `1` task session per retention group
- audit: latest `3` events per event type

Neither cleanup command modifies repository source files.

## Storage Review Tips

When something looks “missing,” verify:

- the active repository root
- the active CW storage root under `~/.code-worker`
- the derived workspace id
- whether the state was created by `cw init`, task sessions, or audit-producing actions
- whether the workflow ran in dry-run mode, which can return execution metadata without persisting it

The most common source of confusion is not data loss but a different effective root or CW home path.
