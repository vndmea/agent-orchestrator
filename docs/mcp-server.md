# MCP Server

The MCP server is a first-class interface for `agent-orchestrator`.

## Exposed tools

- `ao_plan`
- `ao_run_workflow`
- `ao_review_diff`
- `ao_fix_error`
- `ao_list_models`
- `ao_list_workflows`
- `ao_list_tools`

The MCP layer is intentionally thin. It delegates to the same workflow functions used by the CLI.
