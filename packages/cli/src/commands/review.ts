import type { Command } from "commander";

import { resolveExecutionContext } from "@agent-orchestrator/core";
import { runReviewWorkflow } from "@agent-orchestrator/graph";

import type { CliIo } from "../index.js";

export const registerReviewCommand = (program: Command, io: CliIo): void => {
  const review = program.command("review").description("Review repository context, diffs, or files.");

  review
    .command("repo")
    .option("--scope <scope>", "Optional scope")
    .option("--max-file-bytes <bytes>", "Maximum bytes per selected file", Number)
    .option("--max-total-bytes <bytes>", "Maximum total bytes for repository context", Number)
    .option("--typecheck", "Run typecheck", false)
    .option("--lint", "Run lint", false)
    .option("--test", "Run tests", false)
    .action(async (options: {
      lint: boolean;
      maxFileBytes?: number;
      maxTotalBytes?: number;
      scope?: string;
      test: boolean;
      typecheck: boolean;
    }) => {
      const context = await resolveExecutionContext();
      const result = await runReviewWorkflow({
        context,
        maxFileBytes: options.maxFileBytes,
        maxTotalBytes: options.maxTotalBytes,
        scope: options.scope,
        validate: {
          typecheck: options.typecheck,
          lint: options.lint,
          test: options.test
        }
      });

      io.write(JSON.stringify(result, null, 2));
    });

  review
    .command("diff")
    .option("--base <base>", "Diff base ref")
    .option("--head <head>", "Diff head ref")
    .option("--scope <scope>", "Optional scope")
    .option("--max-file-bytes <bytes>", "Maximum bytes per selected file", Number)
    .option("--max-total-bytes <bytes>", "Maximum total bytes for repository context", Number)
    .option("--typecheck", "Run typecheck", false)
    .option("--lint", "Run lint", false)
    .option("--test", "Run tests", false)
    .action(
      async (options: {
        base?: string;
        head?: string;
        lint: boolean;
        maxFileBytes?: number;
        maxTotalBytes?: number;
        scope?: string;
        test: boolean;
        typecheck: boolean;
      }) => {
        const context = await resolveExecutionContext();
        const result = await runReviewWorkflow({
          context,
          includeDiff: true,
          diffBase: options.base,
          diffHead: options.head,
          maxFileBytes: options.maxFileBytes,
          maxTotalBytes: options.maxTotalBytes,
          scope: options.scope,
          validate: {
            typecheck: options.typecheck,
            lint: options.lint,
            test: options.test
          }
        });

        io.write(JSON.stringify(result, null, 2));
      }
    );

  review
    .command("files")
    .requiredOption("--file <path...>", "Files to include")
    .option("--scope <scope>", "Optional scope")
    .option("--max-file-bytes <bytes>", "Maximum bytes per selected file", Number)
    .option("--max-total-bytes <bytes>", "Maximum total bytes for repository context", Number)
    .option("--typecheck", "Run typecheck", false)
    .option("--lint", "Run lint", false)
    .option("--test", "Run tests", false)
    .action(
      async (options: {
        file: string[];
        lint: boolean;
        maxFileBytes?: number;
        maxTotalBytes?: number;
        scope?: string;
        test: boolean;
        typecheck: boolean;
      }) => {
        const context = await resolveExecutionContext();
        const result = await runReviewWorkflow({
          context,
          files: options.file,
          maxFileBytes: options.maxFileBytes,
          maxTotalBytes: options.maxTotalBytes,
          scope: options.scope,
          validate: {
            typecheck: options.typecheck,
            lint: options.lint,
            test: options.test
          }
        });

        io.write(JSON.stringify(result, null, 2));
      }
    );
};
