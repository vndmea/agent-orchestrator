import { runHostWorkerWorkflow } from "@mcp-code-worker/graph";

const result = await runHostWorkerWorkflow({
  goal: "Review schema-parser files for missing test coverage",
  scope: "packages/core",
  taskType: "review-lite"
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
