import { runLeaderWorkerWorkflow } from "@agent-orchestrator/graph";

const result = await runLeaderWorkerWorkflow({
  goal: "Demonstrate the leader-worker orchestration flow in dry-run mode."
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
