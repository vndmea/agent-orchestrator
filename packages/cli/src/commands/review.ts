import type { Command } from "commander";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import { runReviewWorkflow } from "@agent-orchestrator/graph";
import { readGitDiff } from "@agent-orchestrator/tools";

import type { CliIo } from "../index.js";

export const registerReviewCommand = (program: Command, io: CliIo): void => {
  program
    .command("review")
    .description("Review a git diff or file list.")
    .option("--diff <range>", "Git diff range, such as main...HEAD")
    .option("--file <path...>", "Optional file list")
    .action(async (options: { diff?: string; file?: string[] }) => {
      const context = createExecutionContextFromEnv();
      const diff =
        options.diff && !options.diff.includes("\n")
          ? await readGitDiff(options.diff)
          : options.diff;
      const result = await runReviewWorkflow({
        context,
        diff,
        files: options.file
      });

      io.write(JSON.stringify(result, null, 2));
    });
};
