import { runHostWorkerWorkflow } from "@agent-orchestrator/graph";

const result = await runHostWorkerWorkflow({
  goal: "Demonstrate host-managed worker execution in dry-run mode.",
  taskType: "review-lite"
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
