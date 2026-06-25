import type { Command } from "commander";

import { createExecutionContextFromEnv, runDoctor } from "@agent-orchestrator/core";
import { createWorkerProfileDoctorChecks } from "@agent-orchestrator/models";

import type { CliIo } from "../index.js";

export const registerDoctorCommand = (program: Command, io: CliIo): void => {
  program
    .command("doctor")
    .description("Inspect resolved configuration and local workflow prerequisites.")
    .action(async () => {
      const context = createExecutionContextFromEnv();
      const report = await runDoctor(context, {
        additionalChecks: await createWorkerProfileDoctorChecks(context)
      });

      io.write(JSON.stringify(report, null, 2));
    });
};
