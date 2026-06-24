import { Command } from "commander";

import { registerFixCommand } from "./commands/fix.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerReviewCommand } from "./commands/review.js";
import { registerRunCommand } from "./commands/run.js";

export interface CliIo {
  error: (message: string) => void;
  write: (message: string) => void;
}

const defaultIo: CliIo = {
  write: (message) => {
    process.stdout.write(`${message}\n`);
  },
  error: (message) => {
    process.stderr.write(`${message}\n`);
  }
};

export const buildCli = (io: CliIo = defaultIo): Command => {
  const program = new Command();

  program
    .name("ao")
    .description("Agent Orchestrator CLI for leader-worker engineering workflows.")
    .showHelpAfterError()
    .configureOutput({
      writeErr: io.error,
      writeOut: io.write
    });

  registerPlanCommand(program, io);
  registerRunCommand(program, io);
  registerReviewCommand(program, io);
  registerFixCommand(program, io);
  registerModelsCommand(program, io);
  registerMcpCommand(program, io);

  return program;
};
