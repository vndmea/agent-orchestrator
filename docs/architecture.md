# Architecture

`agent-orchestrator` is a leader-worker orchestration server built as a pnpm monorepo.

## Package map

- `packages/core`: shared contracts, schemas, policies, and execution context
- `packages/models`: model providers and leader/worker routing
- `packages/graph`: LangGraph-based workflows and agent logic
- `packages/tools`: deterministic engineering tool wrappers
- `packages/mcp-server`: MCP transport and tool bindings
- `packages/cli`: the `ao` CLI

## Text diagram

```text
Human / Codex / CI / MCP Client
            |
            v
        CLI or MCP
            |
            v
    Workflow Runtime Layer
            |
   +--------+--------+
   |                 |
   v                 v
 Leader Agent    Deterministic Tools
   |
   v
 Worker Agents
```
