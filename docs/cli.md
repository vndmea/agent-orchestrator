# CLI

The CLI entrypoint is `ao`.

## Commands

```bash
ao plan --goal "Generate TipTap nodes from S1000D proced.xsd"
ao run leader-worker-basic --goal "Generate tests for schema parser"
ao review --diff main...HEAD
ao fix --error ./tmp/tsc-error.log --scope packages/schema-codegen
ao models list
ao mcp serve
ao mcp list-tools
```

Writes remain in dry-run mode unless `--allow-write` is passed to `ao run` or environment policy allows writes.
