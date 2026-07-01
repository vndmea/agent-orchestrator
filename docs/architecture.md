# Architecture

`mcp-code-worker` is an orchestration runtime built as a pnpm monorepo.

## Package map

- `packages/core`: shared contracts, schemas, policies, execution context, and SQLite-backed execution records
- `packages/models`: model providers, model behavior profiles, worker routing, and qualification stores
- `packages/graph`: LangGraph-based workflows, host adapters, task contracts, semantic validators, and agent logic
- `packages/tools`: deterministic engineering tool wrappers
- `packages/mcp-server`: MCP transport and tool bindings
- `packages/cli`: the `cw` CLI

## Text diagram

```text
Human / Codex / CI / MCP Client
            |
            v
        CLI or MCP
            |
            v
   Orchestration Runtime
      |            |        \
      v            v         v
 Worker Routing  Deterministic Tools  CW Storage / Artifacts
      |
      v
 Worker Models / Local Clients
```

## Host-Owned Worker Contract Chain

The main worker path is host-owned and contract-first:

1. `CodexHostAdapter` turns host intent and repository context into a `WorkerTaskEnvelope`.
2. `TaskContractRegistry` provides the task schema, prompt rules, mock response, and output contract for the task type.
3. `WorkerAgent` invokes the selected model using the routed `ModelBehaviorProfile` for structured-output strategy and repair policy.
4. The worker returns a `WorkerResultEnvelope` with structured-output mode, repair attempts, fallback reason, and failure kind.
5. `HostSemanticValidator` checks parsed output against repository context, validation evidence, and patch boundaries.
6. Host workflows record a local `WorkerTaskExecutionRecord` with task/result envelopes, `WorkerTrustProfile`, semantic status, diagnostics, and artifact refs.

Adding a task type should extend the contract registry. Adding model-specific behavior should extend the model behavior profile registry. Host-specific prompt or rule injection should stay in the host adapter.
