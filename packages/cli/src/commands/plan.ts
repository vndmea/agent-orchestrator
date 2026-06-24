import type { Command } from "commander";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import { runPlanningWorkflow } from "@agent-orchestrator/graph";

import type { CliIo } from "../index.js";

export const registerPlanCommand = (program: Command, io: CliIo): void => {
  program
    .command("plan")
    .description("Create a structured task plan.")
    .requiredOption("--goal <goal>", "Goal to plan for")
    .option("--context-file <path...>", "Optional context files")
    .action(async (options: { contextFile?: string[]; goal: string }) => {
      const context = createExecutionContextFromEnv();
      const result = await runPlanningWorkflow({
        context,
        goal: options.goal,
        contextFiles: options.contextFile
      });

      io.write(JSON.stringify(result, null, 2));
    });
};
