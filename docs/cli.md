# CLI

The CLI entrypoint is `ao`.

## Commands

```bash
ao plan --goal "Generate TipTap nodes from S1000D proced.xsd"
ao run leader-worker-basic --goal "Generate tests for schema parser"
ao review --diff main...HEAD
ao fix --error ./tmp/tsc-error.log --scope packages/schema-codegen
ao models list
ao worker interview --provider litellm --model qwen3-coder
ao worker benchmark --suite coding-v1 --worker litellm:qwen3-coder --save
ao worker benchmark --suite coding-v1 --worker litellm:qwen3-coder --save --update-profile-capabilities
ao worker list
ao worker profile litellm:qwen3-coder
ao mcp serve
ao mcp list-tools
```

Writes remain in dry-run mode unless `--allow-write` is passed to `ao run` or environment policy allows writes.

## Worker Evaluation

- `ao worker interview` is the onboarding step. It produces the persisted worker profile used for routing and safety gating.
- `ao worker benchmark --suite coding-v1` measures coding-oriented behavior separately from onboarding.
- `--save` persists the benchmark artifact under `.ao/worker-benchmarks/<workerId>/coding-v1.json` and refreshes `evaluationSummary` on an existing profile.
- `--update-profile-capabilities` is the explicit capability reconciliation switch. It updates persisted `supportedTaskTypes` and `routingPolicy.allowPatchGeneration` only when the benchmark qualifies the worker for `patch-generation`.
- Run `ao worker interview --save` before trying to update profile capabilities from benchmark results.
