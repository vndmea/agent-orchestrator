import { describe, expect, it } from "vitest";

import type { ValidationReport } from "../schemas/validation.schema.js";
import { summarizeValidationReport } from "./workflow-output.js";

describe("summarizeValidationReport", () => {
  it("returns check-specific validation summaries for worker-friendly output", () => {
    const report: ValidationReport = {
      ok: false,
      warnings: [],
      checks: [
        {
          name: "build",
          command: "pnpm run build",
          status: "failure",
          diagnosticSummary: {
            affectedPaths: ["packages/core/src/index.ts"],
            previewLines: ["build failed"]
          }
        },
        {
          name: "typecheck",
          command: "pnpm run typecheck",
          status: "failure",
          stdout:
            "packages/cli/src/commands/validate.ts(22,43): error TS2339: Property 'skippedChecks' does not exist.\npackages/core/src/presentation/workflow-output.ts(40,21): error TS7006: Parameter 'x' implicitly has an 'any' type.",
          diagnosticSummary: {
            affectedPaths: [
              "packages/cli/src/commands/validate.ts",
              "packages/core/src/presentation/workflow-output.ts"
            ],
            previewLines: []
          }
        },
        {
          name: "lint",
          command: "pnpm run lint",
          status: "failure",
          stdout:
            "E:/repo/packages/cli/src/commands/validate.ts\n22:9  error  Unsafe assignment of an error typed value  @typescript-eslint/no-unsafe-assignment",
          diagnosticSummary: {
            affectedPaths: ["packages/cli/src/commands/validate.ts"],
            previewLines: []
          }
        },
        {
          name: "test",
          command: "pnpm run test",
          status: "failure",
          stdout:
            "FAIL packages/cli/src/index.test.ts > cli parsing > renders validation in compact human mode\n❯ formatValidationText packages/cli/src/commands/validate.ts:40:21",
          diagnosticSummary: {
            affectedPaths: [
              "packages/cli/src/index.test.ts",
              "packages/cli/src/commands/validate.ts"
            ],
            previewLines: []
          }
        }
      ]
    };

    const summary = summarizeValidationReport(report);

    expect(summary.checks[0]).toMatchObject({
      name: "build",
      firstErrorFile: "packages/core/src/index.ts",
      buildErrorFiles: ["packages/core/src/index.ts"]
    });
    expect(summary.checks[1]).toMatchObject({
      name: "typecheck",
      typecheckErrors: [
        expect.stringContaining("error TS2339"),
        expect.stringContaining("error TS7006")
      ]
    });
    expect(summary.checks[2]).toMatchObject({
      name: "lint",
      lintFile: "packages/cli/src/commands/validate.ts",
      lintRule: "@typescript-eslint/no-unsafe-assignment"
    });
    expect(summary.checks[2]).toMatchObject({
      lintFindings: [
        expect.objectContaining({
          file: "packages/cli/src/commands/validate.ts",
          rule: "@typescript-eslint/no-unsafe-assignment"
        })
      ]
    });
    expect(summary.checks[3]).toMatchObject({
      name: "test",
      failedTest: "cli parsing > renders validation in compact human mode",
      firstStackLine: "❯ formatValidationText packages/cli/src/commands/validate.ts:40:21"
    });
    expect(summary.checks[3]).toMatchObject({
      failedTests: [
        expect.objectContaining({
          file: "packages/cli/src/index.test.ts",
          name: "cli parsing > renders validation in compact human mode"
        })
      ]
    });
  });
});
