import type { Command } from "commander";

import {
  resolveExecutionContext,
  writeAuditEvent
} from "@agent-orchestrator/core";
import {
  runFixErrorWorkflow,
  type FixErrorWorkflowOutput,
  type LeaderWorkerWorkflowOutput,
  type PlanningWorkflowOutput,
  type ReviewWorkflowOutput,
  runLeaderWorkerWorkflow,
  runPlanningWorkflow,
  runReviewWorkflow,
  type WorkerInterviewWorkflowOutput,
  runWorkerInterviewWorkflow
} from "@agent-orchestrator/graph";

import type { CliIo } from "../index.js";
import { writeOutput } from "../output.js";

const formatRunResult = (workflow: string, result: unknown): string[] => {
  switch (workflow) {
    case "planning-workflow": {
      const planning = result as PlanningWorkflowOutput;
      const lines: string[] = [
        "workflow complete: planning-workflow",
        `goal: ${planning.task.goal}`,
        `steps: ${planning.plan.steps.length}`
      ];

      if (planning.riskList.length > 0) {
        lines.push(`risks: ${planning.riskList.join(" | ")}`);
      }

      return lines;
    }
    case "leader-worker-workflow": {
      const leaderWorker = result as LeaderWorkerWorkflowOutput;
      const lines: string[] = [
        "workflow complete: leader-worker-workflow",
        `status: ${leaderWorker.finalResult?.status ?? "unknown"}`
      ];

      if (typeof leaderWorker.finalResult?.output === "string") {
        lines.push(`summary: ${leaderWorker.finalResult.output}`);
      }

      if (leaderWorker.state.workerCapabilityProfile?.workerId) {
        lines.push(`worker: ${leaderWorker.state.workerCapabilityProfile.workerId}`);
      }

      if (leaderWorker.state.warnings.length > 0) {
        lines.push(`warnings: ${leaderWorker.state.warnings.join(" | ")}`);
      }

      return lines;
    }
    case "review-workflow": {
      const review = result as ReviewWorkflowOutput;
      return [
        "workflow complete: review-workflow",
        `summary: ${review.leaderReview.summary}`,
        `files: ${review.repositoryContext.selectedFiles.length}`,
        `validation ok: ${review.validationReport.ok ? "yes" : "no"}`
      ];
    }
    case "fix-error-workflow": {
      const fix = result as FixErrorWorkflowOutput;
      return [
        "workflow complete: fix-error-workflow",
        `root cause: ${fix.rootCauseAnalysis}`,
        `validation ok: ${fix.validationReport.ok ? "yes" : "no"}`
      ];
    }
    case "worker-interview-workflow": {
      const interview = result as WorkerInterviewWorkflowOutput;
      const lines: string[] = [
        "workflow complete: worker-interview-workflow",
        `worker: ${interview.profile.workerId}`,
        `status: ${interview.profile.status}`
      ];

      if (interview.warnings.length > 0) {
        lines.push(`warnings: ${interview.warnings.join(" | ")}`);
      }

      return lines;
    }
    default:
      return [`workflow complete: ${workflow}`];
  }
};

const workflowAliases: Record<string, string> = {
  "leader-worker-basic": "leader-worker-workflow"
};

export const registerRunCommand = (program: Command, io: CliIo): void => {
  program
    .command("run")
    .description("Run a low-level built-in workflow by name.")
    .argument("<workflow>", "Low-level workflow name")
    .option("--goal <goal>", "Goal for planning or low-level leader-worker workflows")
    .option("--scope <scope>", "Optional repository or package scope")
    .option("--diff <diff>", "Diff text or revision range for review workflow")
    .option("--file <path...>", "Optional file list for review workflow")
    .option("--error-log <text>", "Error log text for fix-error workflow")
    .option("--worker <workerId>", "Worker profile id for low-level leader-worker workflows")
    .option("--require-profile", "Fail if no usable worker profile is available", false)
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
          requireProfile: boolean;
          scope?: string;
          worker?: string;
        }
      ) => {
        const resolvedWorkflow = workflowAliases[workflow] ?? workflow;
        const context = await resolveExecutionContext({
          cliOverrides: {
            allowWrite: options.allowWrite,
            dryRun: !options.allowWrite
          }
        });
        const supportsWorkerProfiles =
          resolvedWorkflow === "leader-worker-workflow";

        if (!supportsWorkerProfiles && options.worker) {
          throw new Error(`--worker is only supported for leader-worker-workflow.`);
        }

        if (!supportsWorkerProfiles && options.requireProfile) {
          throw new Error(
            `--require-profile is only supported for leader-worker-workflow.`
          );
        }

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
              requireProfile: options.requireProfile,
              scope: options.scope,
              workerId: options.worker
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
          case "worker-interview-workflow":
            result = await runWorkerInterviewWorkflow({
              context,
              workerId: options.scope,
              modelConfig: context.workerModel
            });
            break;
          default:
            throw new Error(`Unknown workflow: ${workflow}`);
        }

        if (resolvedWorkflow === "leader-worker-workflow") {
          await writeAuditEvent(context, {
            actor: "cli",
            action: "run-workflow",
            mode: context.dryRun ? "dry-run" : "execute",
            workflow: resolvedWorkflow,
            inputSummary: `ao run ${resolvedWorkflow}`,
            outputSummary: "Leader-worker workflow CLI invocation completed.",
            warnings: [],
            errors: [],
            metadata: {
              requireProfile: options.requireProfile,
              scope: options.scope,
              workerId: options.worker
            }
          });
        }

        writeOutput(io, result, formatRunResult(resolvedWorkflow, result));
      }
    );
};
