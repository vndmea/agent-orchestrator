import type { Command } from "commander";

import { resolveExecutionContext } from "@agent-orchestrator/core";
import {
  runPlanningWorkflow,
  type PlanningWorkflowOutput
} from "@agent-orchestrator/graph";

import type { CliIo } from "../index.js";
import { writeOutput } from "../output.js";

const formatPlanningResult = (result: PlanningWorkflowOutput): string[] => {
  const lines: string[] = [
    "plan created",
    `goal: ${result.task.goal}`,
    `steps: ${result.plan.steps.length}`
  ];

  if (result.riskList.length > 0) {
    lines.push(`risks: ${result.riskList.join(" | ")}`);
  }

  if (result.validationStrategy.length > 0) {
    lines.push(`validation: ${result.validationStrategy.join(" | ")}`);
  }

  if (result.workerAssignmentProposal.length > 0) {
    lines.push(`workers: ${result.workerAssignmentProposal.join(" | ")}`);
  }

  return lines;
};

export const registerPlanCommand = (program: Command, io: CliIo): void => {
  program
    .command("plan")
    .description("Create a structured task plan.")
    .requiredOption("--goal <goal>", "Goal to plan for")
    .option("--context-file <path...>", "Optional context files")
    .action(async (options: { contextFile?: string[]; goal: string }) => {
      const context = await resolveExecutionContext();
      const result = await runPlanningWorkflow({
        context,
        goal: options.goal,
        contextFiles: options.contextFile
      });

      writeOutput(io, result, formatPlanningResult(result));
    });
};
