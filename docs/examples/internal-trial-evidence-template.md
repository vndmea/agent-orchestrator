# Internal Trial Evidence Template

Use one copy of this template for each real worker end-to-end trial.

Prefer sanitized placeholders such as `<workspace-root>`, `%USERPROFILE%\.cw`, or `<cw-home>` instead of raw operator usernames or machine-specific absolute paths.

## Run Identity

- Date:
- Operator:
- Commit SHA:
- Runtime trial target:
- `cw` package version:
- Workspace root:
- CW home override:
- Note if later documentation-only commits differ from the runtime trial target:

## Worker Configuration

- Worker id:
- Provider:
- Model:
- Base URL:
- API key env var name:
- Registered worker artifact path:

## Interview And Benchmark

- Interview command:
- Interview persistence mode:
- Interview profile path:
- Interview warnings:
- Benchmark command:
- Benchmark persistence mode:
- Benchmark artifact path:
- Capability update applied:

## Task Session

- Task goal:
- Task id:
- Session path:
- Report path:
- Validation artifact path:
- Patch proposal path:
- Patch inspection path:
- Patch apply result path:

## MCP / Artifact Verification

- `cw_get_task_report` checked:
- `cw_read_task_artifact` checked:
- Artifact names read:

## Outcome

- Trial result: pass / pass-with-issues / fail
- Sanitized failure reason:
- Re-interview guidance returned:
- Rollback or cleanup actions taken:
- Follow-up owner:
- Follow-up due date:
