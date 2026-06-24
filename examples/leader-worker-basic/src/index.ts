import { runLeaderWorkerWorkflow } from "@agent-orchestrator/graph";

const result = await runLeaderWorkerWorkflow({
  goal: "Generate tests for schema parser",
  scope: "packages/core"
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
