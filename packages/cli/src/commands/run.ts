import type { Command } from "commander";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import {
  runFixErrorWorkflow,
  runLeaderWorkerWorkflow,
  runPlanningWorkflow,
  runReviewWorkflow
} from "@agent-orchestrator/graph";

import type { CliIo } from "../index.js";

const workflowAliases: Record<string, string> = {
  "leader-worker-basic": "leader-worker-workflow"
};

export const registerRunCommand = (program: Command, io: CliIo): void => {
  program
    .command("run")
    .description("Run a built-in workflow by name.")
    .argument("<workflow>", "Workflow name")
    .option("--goal <goal>", "Goal for planning or leader-worker workflows")
    .option("--scope <scope>", "Optional repository or package scope")
    .option("--diff <diff>", "Diff text or revision range for review workflow")
    .option("--file <path...>", "Optional file list for review workflow")
    .option("--error-log <text>", "Error log text for fix-error workflow")
    .option("--allow-write", "Allow writes for this invocation", false)
    .action(
      async (
        workflow: string,
        options: {
          allowWrite: boolean;
          diff?: string;
          errorLog?: string;
          file?: string[];
          goal?: string;
          scope?: string;
        }
      ) => {
        const resolvedWorkflow = workflowAliases[workflow] ?? workflow;
        const context = createExecutionContextFromEnv(undefined, {
          allowWrite: options.allowWrite,
          dryRun: !options.allowWrite
        });

        let result: unknown;
        switch (resolvedWorkflow) {
          case "planning-workflow":
            result = await runPlanningWorkflow({
              context,
              goal: options.goal ?? "No goal provided"
            });
            break;
          case "leader-worker-workflow":
            result = await runLeaderWorkerWorkflow({
              context,
              goal: options.goal ?? "No goal provided",
              scope: options.scope
            });
            break;
          case "review-workflow":
            result = await runReviewWorkflow({
              context,
              diff: options.diff,
              files: options.file
            });
            break;
          case "fix-error-workflow":
            result = await runFixErrorWorkflow({
              context,
              errorLog: options.errorLog ?? "",
              scope: options.scope
            });
            break;
          default:
            throw new Error(`Unknown workflow: ${workflow}`);
        }

        io.write(JSON.stringify(result, null, 2));
      }
    );
};
