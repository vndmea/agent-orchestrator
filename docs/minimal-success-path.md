# Minimal Success Path

If you are new to `cw`, use this five-step path instead of learning every low-level tool first.

1. Bind the current repository and inspect readiness.

```bash
cw init
cw doctor
```

If you already know the worker shape you want, use explicit scripted worker fields:

```bash
cw init --worker-id=mock-local --worker-provider=mock --worker-model=gpt-5.4-mini --register-worker --allow-write
cw init --worker-id=deepseek-flash --worker-provider=openai-compatible --worker-model=deepseek-v4-flash --worker-base-url=https://api.deepseek.com --register-worker --allow-write
```

Local adapter configurations such as `provider=opencode`, `provider=claudecode`, `provider=codex`, and generic `provider=client` are experimental compatibility paths, not the current minimal success path.

2. Verify model access and credentials.

- Confirm the active `rootDir` matches your repository.
- Confirm the resolved worker model is the one you expect.
- If a non-mock API provider is configured, run `cw auth login --worker=<workerId>` or, for scripts, `cw auth login --worker=<workerId> --api-key-env=<ENV_NAME> --allow-write`.
- Use `cw auth list` to confirm a credential exists without printing the key.

3. Start a dry-run task first.

```bash
cw task start --goal="Review this repository" --worker=<workerId>
```

4. Read the report before taking the next step.

- For temporary sessions, read the inline `reportPreview` and `readinessSummary`.
- For persisted sessions, run `cw task report <taskId>`.

5. Decide whether to continue into patch work.

```bash
cw task resume <taskId> --propose-patch --inspect-patch
```

Only enable repository writes after you have manually reviewed the stored report and patch proposal.
