import type { Command } from "commander";

import {
  resolveExecutionContext,
  summarizeValidationReport
} from "@agent-orchestrator/core";
import { runRepositoryValidation } from "@agent-orchestrator/tools";

import type { CliIo } from "../index.js";
import { isHumanOutput, writeJson, writeText } from "../output.js";

const formatValidationText = (
  summary: ReturnType<typeof summarizeValidationReport>
): string[] => {
  const validationStatusLine: string = summary.ok
    ? "validation passed"
    : "validation did not pass";
  const validationSummary: string = summary.summary;
  const failedChecks: string[] = summary.failedChecks;
  const notConfiguredChecks: string[] = summary.notConfiguredChecks;
  const dryRunChecks: string[] = summary.dryRunChecks;
  const lines: string[] = [
    validationStatusLine,
    validationSummary
  ];

  if (failedChecks.length > 0) {
    lines.push(`failed: ${failedChecks.join(", ")}`);
  }

  if (notConfiguredChecks.length > 0) {
    lines.push(`not configured: ${notConfiguredChecks.join(", ")}`);
  }

  if (dryRunChecks.length > 0) {
    lines.push(`dry-run only: ${dryRunChecks.join(", ")}`);
  }

  return lines;
};

export const registerValidateCommand = (program: Command, io: CliIo): void => {
  program
    .command("validate")
    .description("Run deterministic repository validation checks.")
    .option("--typecheck", "Run typecheck", false)
    .option("--lint", "Run lint", false)
    .option("--test", "Run tests", false)
    .option("--execute", "Execute validation instead of dry-run", false)
    .option("--summary", "Print a summary instead of the full validation report", false)
    .option("--max-bytes <bytes>", "Limit preview fields in summary output", Number)
    .action(
      async (options: {
        execute: boolean;
        lint: boolean;
        maxBytes?: number;
        summary: boolean;
        test: boolean;
        typecheck: boolean;
      }) => {
        const context = await resolveExecutionContext({
          cliOverrides: {
            ...(options.execute ? { dryRun: false } : {})
          }
        });
        const result = await runRepositoryValidation(context, {
          typecheck: options.typecheck,
          lint: options.lint,
          test: options.test
        });

        const summary = summarizeValidationReport(result, options.maxBytes);

        if (isHumanOutput(io) && !options.summary) {
          writeText(io, formatValidationText(summary));
          return;
        }

        writeJson(io, options.summary ? summary : result);
      }
    );
};
