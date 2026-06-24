# Safety

Default behavior is conservative.

- File writes stay in dry-run mode unless policy explicitly allows them.
- Shell execution uses an allowlist.
- Worker outputs require leader review before final acceptance.
- Secrets are expected from environment variables and should never be logged.
- MCP tools do not expose unrestricted shell access.
