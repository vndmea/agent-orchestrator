# agent-orchestrator

English | [简体中文](https://github.com/vndmea/agent-orchestrator/blob/master/README.zh-CN.md)

`agent-orchestrator` is a TypeScript orchestration server for multi-model engineering workflows. It is designed for leader-worker execution, deterministic validation, and thin delivery layers through a CLI and MCP server.

## What this is

- A TypeScript/Node.js monorepo for orchestrating leader and worker agents
- A CLI callable by humans or other coding agents through shell commands
- An MCP server exposing orchestration capabilities as structured tools
- A safe workflow engine that defaults to dry-run behavior

## What this is not

- Not a Codex, OpenCode, Cursor, or Claude Code clone
- Not an interactive coding terminal or TUI
- Not a full chat interface
- Not a web UI product

## Architecture diagram

```text
Human / Coding Agent / CI / MCP Client
                |
                v
           ao CLI / MCP
                |
                v
         LangGraph Workflows
                |
      +---------+---------+
      |                   |
      v                   v
 Leader Agent      Deterministic Tools
      |
      v
 Worker Agents
```

## Monorepo layout

```text
packages/
  core/
  models/
  graph/
  tools/
  mcp-server/
  cli/
apps/
  playground/
examples/
  leader-worker-basic/
docs/
```

## Setup

```bash
pnpm install
pnpm typecheck
pnpm test
```

## CLI usage

```bash
ao plan --goal "Generate TipTap nodes from S1000D proced.xsd"
ao run leader-worker-basic --goal "Generate tests for schema parser"
ao review --diff main...HEAD
ao fix --error ./tmp/tsc-error.log --scope packages/schema-codegen
ao models list
ao mcp serve
ao mcp list-tools
```

## MCP server usage

Start the stdio server:

```bash
ao mcp serve
```

List exposed tool names:

```bash
ao mcp list-tools
```

## Environment variables

See [.env.example](https://github.com/vndmea/agent-orchestrator/blob/master/.env.example).

- `LEADER_MODEL_PROVIDER`
- `LEADER_MODEL_NAME`
- `LEADER_MODEL_BASE_URL`
- `LEADER_MODEL_API_KEY`
- `WORKER_MODEL_PROVIDER`
- `WORKER_MODEL_NAME`
- `WORKER_MODEL_BASE_URL`
- `WORKER_MODEL_API_KEY`
- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`
- `MCP_SERVER_NAME`
- `MCP_SERVER_VERSION`
- `LOG_LEVEL`
- `AO_DRY_RUN`
- `AO_ALLOW_WRITE`
- `AO_ALLOWED_COMMANDS`

## Workflows

- `planning-workflow`: builds a plan, worker assignment proposal, risk list, and validation strategy
- `leader-worker-workflow`: coordinates leader planning, worker execution, tool validation, and final review
- `review-workflow`: summarizes diff impact, risks, missing tests, and follow-up items
- `fix-error-workflow`: analyzes error logs and proposes safe validation-oriented fix steps

## How to run the basic example

```bash
pnpm example:leader-worker-basic
```

## How to add a new worker

1. Add a worker class under `packages/graph/src/workers`.
2. Give it a clear `WorkerCapability` with Zod-backed schemas.
3. Route it from a workflow and keep its output reviewable.
4. Add tests for the workflow path it affects.

## How to add a new workflow

1. Create a workflow file under `packages/graph/src/workflows`.
2. Use LangGraph.js to model transitions explicitly.
3. Reuse core contracts and leader review patterns.
4. Expose it through the CLI or MCP only after tests exist.

## How to add a new MCP tool

1. Add a tool definition in `packages/mcp-server/src/tools`.
2. Keep the handler thin and delegate to core workflow APIs.
3. Register it in `packages/mcp-server/src/server.ts`.
4. Add a registration test.

## How to configure LiteLLM

Set `LEADER_MODEL_PROVIDER=litellm` or `WORKER_MODEL_PROVIDER=litellm`, then provide:

- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`

If you want different endpoints for leader and worker traffic, use the model-specific base URL variables instead.

## Safety model

- Default mode is dry-run.
- File writes require explicit policy allowance.
- Shell execution is allowlisted.
- Worker outputs are not final until leader review completes.
- Secrets are expected from environment variables and should never be logged.

## Roadmap

- Expand workflow coverage and richer deterministic validations
- Add domain-specific orchestration packages later
- Add CI automation for checks and releases
- Keep the core focused on orchestration rather than UI
