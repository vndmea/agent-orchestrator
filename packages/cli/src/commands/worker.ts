import type { Command } from "commander";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import { runWorkerInterviewWorkflow } from "@agent-orchestrator/graph";
import {
  ModelRouter,
  getWorkerProfile,
  listWorkerProfiles,
  saveWorkerProfile
} from "@agent-orchestrator/models";

import type { CliIo } from "../index.js";

export const registerWorkerCommand = (program: Command, io: CliIo): void => {
  const worker = program.command("worker").description("Manage worker onboarding and profiles.");

  worker
    .command("interview")
    .description("Evaluate a worker model before assigning production tasks.")
    .option("--worker <workerId>", "Optional worker profile id")
    .option("--provider <provider>", "Override worker provider")
    .option("--model <model>", "Override worker model")
    .option("--base-url <url>", "Override worker base URL")
    .option("--save", "Persist the resulting worker profile", false)
    .action(
      async (options: {
        baseUrl?: string;
        model?: string;
        provider?: string;
        save: boolean;
        worker?: string;
      }) => {
        const context = createExecutionContextFromEnv();
        const modelConfig = {
          ...context.workerModel,
          ...(options.provider ? { provider: options.provider } : {}),
          ...(options.model ? { model: options.model } : {}),
          ...(options.baseUrl ? { baseURL: options.baseUrl } : {})
        };
        const result = await runWorkerInterviewWorkflow({
          context,
          workerId: options.worker,
          modelConfig
        });

        const saveResult = options.save
          ? await saveWorkerProfile(context, result.profile, true)
          : null;

        io.write(
          JSON.stringify(
            {
              ...result,
              persistence: saveResult
            },
            null,
            2
          )
        );
      }
    );

  worker
    .command("list")
    .description("List known worker capability profiles.")
    .action(async () => {
      const context = createExecutionContextFromEnv();
      io.write(JSON.stringify(await listWorkerProfiles(context.rootDir), null, 2));
    });

  worker
    .command("profile")
    .description("Get a worker capability profile by id.")
    .argument("[workerId]", "Worker profile id")
    .action(async (workerId?: string) => {
      const context = createExecutionContextFromEnv();
      const resolvedWorkerId =
        workerId ?? ModelRouter.deriveWorkerId(context.workerModel);
      const profile = await getWorkerProfile(context.rootDir, resolvedWorkerId);

      if (!profile) {
        throw new Error(`No worker profile found for ${resolvedWorkerId}`);
      }

      io.write(JSON.stringify(profile, null, 2));
    });
};
