#!/usr/bin/env node
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const distEntrypoint = resolve(binDir, "..", "dist", "main.js");

try {
  await access(distEntrypoint);
} catch {
  process.stderr.write(
    "cw requires packages/cli/dist/main.js. Run `pnpm build` before invoking the workspace shim.\n"
  );
  process.exit(1);
}

await import(pathToFileURL(distEntrypoint).href);
