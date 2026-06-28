# Worker Onboarding

Worker onboarding is the process of registering, evaluating, and approving a worker model before it is trusted with real tasks.

`mcp-code-worker` does not assume a worker is safe or capable just because an endpoint exists. A worker should be qualified explicitly and reviewed before production use.

> Warning:
> A weaker worker is not automatically a token-saving choice. If the host must still spend significant effort validating or rewriting the result, the combined cost can be higher than doing the work directly with the stronger model.
> Worker delegation is more likely to save tokens when the task is narrow, repetitive, low-risk, and easy to verify mechanically.

## Goals Of Onboarding

Onboarding establishes:

- whether the worker can follow instructions
- whether it returns structured JSON reliably
- whether it respects narrow repository scope
- whether it is safe to route production tasks through it
- whether it should remain blocked, limited, or active

## When A Worker Can Actually Save Tokens

Worker delegation is more likely to be efficient when the worker is used for:

- narrow file or symbol extraction
- structured field collection
- focused command execution and log capture
- small-scope summarization
- repetitive mechanical steps with clear acceptance criteria

It is less likely to save tokens when the worker is used for:

- final documentation writing
- architecture decisions
- complex code changes
- broad exploratory work that the host must re-check in full

## Basic Flow

Use this sequence for a new worker:

```bash
cw worker register \
  --provider <provider> \
  --model <model> \
  --base-url <base-url-if-needed> \
  --allow-write

cw worker interview --worker <workerId> --save
cw worker profile <workerId>
```

If the worker will be used for coding qualification or patch generation review, continue with:

```bash
cw worker benchmark --suite coding-v1 --worker <workerId> --save
```

Only after reviewing the benchmark result should you consider:

```bash
cw worker benchmark --suite coding-v1 --worker <workerId> --save --update-profile-capabilities
```

## What The Interview Evaluates

The interview workflow checks:

- instruction following
- structured JSON output
- strict scope discipline
- summarization
- evidence-linked repository review
- refusal when mandatory evidence is missing
- code understanding
- simple TypeScript code generation
- confidence calibration

## Status Meanings

Interview output produces a `WorkerCapabilityProfile` that affects routing.

- `active`: the worker can receive the task types it qualified for
- `limited`: the worker is restricted to lower-risk tasks and requires host review
- `blocked`: the worker should not receive production tasks

The profile status is not just descriptive. It changes how routing and policy checks behave.

## Persisted Artifacts

By default, onboarding-related state is stored under:

```text
~/.cw/workspaces/<workspace-id>/
```

Typical files include:

- `workers.json`
- `worker-profiles.json`
- `worker-benchmarks/<sanitized-worker-id>/coding-v1.json`

`<sanitized-worker-id>` is the filesystem-safe form of the worker id.

## `--require-profile`

Use `--require-profile` when a task should fail instead of silently using an unqualified worker.

This is the safer option for:

- coding tasks
- review flows that matter for release decisions
- any workflow where host review expects a previously qualified worker profile

## Example: DeepSeek / OpenAI-compatible Worker

```bash
cw worker register \
  --worker openai-compatible:deepseek-v4-flash \
  --provider openai-compatible \
  --model deepseek-v4-flash \
  --base-url https://api.deepseek.com \
  --allow-write

cw worker interview --worker openai-compatible:deepseek-v4-flash --save
cw worker benchmark --suite coding-v1 --worker openai-compatible:deepseek-v4-flash --save
```

See [docs/provider-contracts/deepseek.md](https://github.com/vndmea/mcp-code-worker/blob/master/docs/provider-contracts/deepseek.md) for provider-specific health checks and retry guidance.

## Example: LiteLLM Worker

```bash
cw worker register \
  --provider litellm \
  --model qwen3-coder \
  --base-url http://localhost:4000/v1 \
  --allow-write

cw worker interview --worker litellm:qwen3-coder --save
```

## Failure And Retry Guidance

Stop and fix the environment before retrying when:

- provider invocation fails during interview
- API key wiring is missing from the actual runtime
- the base URL or model name is wrong
- a local client provider points to the wrong executable

Do not treat a provider-failure-style blocked profile as a completed qualification result.
