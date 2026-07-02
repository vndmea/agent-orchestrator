import type { Command } from "commander";

import { resolveExecutionContext } from "@mcp-code-worker/core";
import { ModelRouter } from "@mcp-code-worker/models";

import type { CliIo } from "../index.js";
import { writeOutput } from "../output.js";

export const registerModelsCommand = (program: Command, io: CliIo): void => {
  const models = program.command("models").description("Inspect configured worker models.");

  models.action(async () => {
    const context = await resolveExecutionContext();
    const router = new ModelRouter(context.workerModel);
    const configuredModels = router.listModels();
    writeOutput(
      io,
      configuredModels,
      [
        "configured models",
        ...configuredModels.map(
          (model) => `${model.role}: ${model.provider}/${model.model}`
        )
      ]
    );
  });

  models
    .command("list")
    .description("List configured worker models.")
    .action(async () => {
      const context = await resolveExecutionContext();
      const router = new ModelRouter(context.workerModel);
      const configuredModels = router.listModels();
      writeOutput(
        io,
        configuredModels,
        [
          "configured models",
          ...configuredModels.map(
            (model) => `${model.role}: ${model.provider}/${model.model}`
          )
        ]
      );
    });
};
