import { z } from "zod";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import { runWorkerInterviewWorkflow } from "@agent-orchestrator/graph";
import { saveWorkerProfile } from "@agent-orchestrator/models";

import type { AoToolDefinition } from "./tool-types.js";

const inputSchema = z.object({
  workerId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  baseURL: z.string().optional(),
  persistProfile: z.boolean().optional()
});

export const aoInterviewWorkerTool: AoToolDefinition<
  typeof inputSchema.shape,
  Awaited<ReturnType<typeof runWorkerInterviewWorkflow>> & {
    persistence?: { mode: "execute" | "dry-run"; path: string };
  }
> = {
  name: "ao_interview_worker",
  description:
    "Evaluate a worker model, generate a capability profile, and optionally persist it.",
  inputSchema,
  execute: async (args) => {
    const context = createExecutionContextFromEnv();
    const modelConfig = {
      ...context.workerModel,
      ...(args.provider ? { provider: args.provider } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.baseURL ? { baseURL: args.baseURL } : {})
    };
    const result = await runWorkerInterviewWorkflow({
      context,
      workerId: args.workerId,
      modelConfig
    });
    const persistence = args.persistProfile
      ? await saveWorkerProfile(context, result.profile, true)
      : undefined;

    return {
      ...result,
      ...(persistence ? { persistence } : {})
    };
  }
};
