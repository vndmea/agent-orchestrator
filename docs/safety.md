# Safety

Default behavior is conservative.

- File writes stay in dry-run mode unless policy explicitly allows them.
- Shell execution uses an allowlist.
- Worker outputs require leader review before final acceptance.
- Workers should be interviewed before they are trusted with production task routing.
- Benchmarks are a separate coding-ability signal; they do not replace interview onboarding.
- `patch-generation` should only be enabled through an explicit persisted profile update after a qualifying benchmark.
- Workers with weak structured-output or codegen performance are limited or blocked.
- Secrets are expected from environment variables and should never be logged.
- MCP tools do not expose unrestricted shell access.
