# Safety

Default behavior is conservative.

For the concrete permission model and write gates, see `docs/permissions.md`.

- File writes stay in dry-run mode unless policy explicitly allows them.
- Worker execution records stay dry-run unless managed storage writes are explicitly allowed by the execution context.
- Shell execution uses an allowlist.
- Worker outputs require host review before final acceptance.
- Workers should be interviewed or benchmarked before they are trusted with production task routing; missing evidence lowers trust and should keep results in dry-run or host-review posture.
- Benchmarks are a separate coding-ability signal; they do not replace interview onboarding.
- `patch-generation` should only be enabled through an explicit persisted profile update after a qualifying benchmark.
- Workers with weak structured-output or codegen performance are marked `not-qualified`. Environment or configuration failures make them unavailable for formal tasks until fixed.
- Secrets should be persisted in the user-scoped CW `config.json` and should never be logged.
- MCP tools do not expose unrestricted shell access.
