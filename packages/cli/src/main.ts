#!/usr/bin/env node
import { buildCli } from "./index.js";

const program = buildCli();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
