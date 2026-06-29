import { z } from "zod";

import {
  resolveExecutionContext,
  writeAuditEvent
} from "@mcp-code-worker/core";
import {
  buildDoctorReport
} from "@mcp-code-worker/models";

import type { CwToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  probe: z.boolean().optional(),
  workerId: z.string().min(1).optional()
});

export const cwDoctorTool: CwToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof buildDoctorReport>>
> = {
  name: "cw_doctor",
  description: "Inspect resolved configuration and local workflow prerequisites.",
  inputSchema,
  execute: async (args) => {
    const context = await resolveExecutionContext();
    const report = await buildDoctorReport({
      context,
      probe: args.probe,
      workerId: args.workerId
    });
    await writeAuditEvent(context, {
      actor: "mcp",
      action: "tool-call",
      mode: context.dryRun ? "dry-run" : "execute",
      tool: "cw_doctor",
      inputSummary: `cw_doctor${args.workerId ? ` worker=${args.workerId}` : ""}${args.probe ? " probe=true" : ""}`,
      outputSummary: `Doctor completed with ok=${String(report.ok)}.`,
      warnings: report.checks
        .filter((check) => check.status === "warning")
        .map((check) => check.message),
      errors: report.checks
        .filter((check) => check.status === "fail")
        .map((check) => check.message)
    });
    return report;
  }
};
