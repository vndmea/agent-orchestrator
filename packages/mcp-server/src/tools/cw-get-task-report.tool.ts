import { z } from "zod";

import { resolveExecutionContext } from "@mcp-code-worker/core";
import {
  formatTaskSessionReportOutput,
  getTaskSessionReport
} from "@mcp-code-worker/graph";

import type { CwToolDefinition } from "./tool-types.js";
import {
  resolveWorkflowOutputOptions,
  workflowOutputOptionShape
} from "./output-options.js";

const inputSchema = z.object({
  taskId: z.string().min(1),
  ...workflowOutputOptionShape
});

export const cwGetTaskReportTool: CwToolDefinition<
  typeof inputSchema.shape,
  ReturnType<typeof formatTaskSessionReportOutput>
> = {
  name: "cw_get_task_report",
  description: "Render a readable markdown report for one local task session.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveExecutionContext();
    const report = await getTaskSessionReport(
      context.rootDir,
      args.taskId,
      context.cwStorageDir
    );
    return formatTaskSessionReportOutput(report, resolveWorkflowOutputOptions(args));
  }
};
