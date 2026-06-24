import type { Command } from "commander";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import { runFixErrorWorkflow } from "@agent-orchestrator/graph";
import { readRepositoryFile } from "@agent-orchestrator/tools";

import type { CliIo } from "../index.js";

export const registerFixCommand = (program: Command, io: CliIo): void => {
  program
    .command("fix")
    .description("Analyze an error log and return a candidate fix plan.")
    .requiredOption("--error <path>", "Path to an error log file")
    .option("--scope <scope>", "Optional package or directory scope")
    .action(async (options: { error: string; scope?: string }) => {
      const context = createExecutionContextFromEnv();
      const errorLog = await readRepositoryFile(options.error);
      const result = await runFixErrorWorkflow({
        context,
        errorLog,
        scope: options.scope
      });

      io.write(JSON.stringify(result, null, 2));
    });
};
