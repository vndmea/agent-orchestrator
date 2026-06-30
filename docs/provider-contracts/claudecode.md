# Claude Code Adapter

Use this document when `cw` should proxy worker calls through the dedicated Claude Code CLI adapter instead of a hosted HTTP API or the generic local client contract.

Use this path when:

- provider is `claudecode`
- the worker should run through a local `claude` / `claude.exe` command
- you want the dedicated Claude Code adapter instead of `provider=client`

## Expected Runtime Shape

`claudecode` currently uses the Claude Code print-mode JSON surface:

- command shape: `claude --print --output-format json`
- required flags include:
  - `--permission-mode`
  - `--model`
  - `--json-schema` for structured-output requests
- default command: `claude`

No API key is required by `cw` for `claudecode` providers.

You may still need Claude Code to be authenticated locally through its own supported auth flow.

## Minimal Config

```json
{
  "version": 1,
  "workerModel": {
    "provider": "claudecode",
    "model": "sonnet"
  },
  "workerClientCommand": "/path/to/claude"
}
```

If the executable is already available as `claude` on `PATH`, `workerClientCommand` is optional.

## Validation Flow

Run:

```bash
cw doctor
cw doctor --probe
```

Read these checks together:

- `worker-model`
- `local-client-command`
- `local-client-compatibility`
- `worker-connectivity`

## Worker Qualification Flow

```bash
cw worker register --worker=claudecode-local --provider=claudecode --model=sonnet --allow-write
cw worker interview --worker=claudecode-local --save
cw worker readiness --worker=claudecode-local --probe
```

Add benchmark qualification only after the interview is healthy:

```bash
cw worker benchmark --suite=coding-v1 --worker=claudecode-local --save
cw worker benchmark --suite=coding-v1 --worker=claudecode-local --save --update-profile-capabilities
```

## Common Failure Shapes

- the executable exists but is not actually Claude Code
- the executable is not on `PATH` and `workerClientCommand` points to the wrong place
- Claude Code local auth is missing, expired, or tied to the wrong environment
- compatibility passes, but the connectivity probe fails because the local CLI cannot complete a model call

## Notes

- `claudecode` is separate from `claude-compatible`
- `claude-compatible` is for Anthropic-compatible HTTP APIs
- `claudecode` is for the local Claude Code CLI adapter
