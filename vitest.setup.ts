import { webcrypto } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";

import { afterAll } from "vitest";

import { getCwWorkspaceTempDir } from "./packages/core/src/storage/cw-paths.js";

type MutableOsModule = {
  tmpdir: () => string;
};

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true
  });
}

const require = createRequire(import.meta.url);
const nodeOs = require("node:os") as MutableOsModule;
const formatTimestampForPath = (date: Date): string =>
  [
    `${date.getUTCMonth() + 1}`.padStart(2, "0"),
    `${date.getUTCDate()}`.padStart(2, "0"),
    `${date.getUTCHours()}`.padStart(2, "0"),
    `${date.getUTCMinutes()}`.padStart(2, "0"),
    `${date.getUTCSeconds()}`.padStart(2, "0")
  ].join("");

const sanitizePathSegment = (value: string): string => {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);

  return sanitized.length > 0 ? sanitized : "test-run";
};

const testTaskType = sanitizePathSegment(
  process.env.CW_TEST_TASK_TYPE ?? "unit-test-run"
);
const testTempRootDir = getCwWorkspaceTempDir(process.cwd());
const testSessionDir = join(
  testTempRootDir,
  `${testTaskType}-${formatTimestampForPath(new Date())}-p${process.pid}`
);
const testHomeDir = join(testSessionDir, "home");
const testSystemTempDir = join(testSessionDir, "tmp");

mkdirSync(testHomeDir, { recursive: true });
mkdirSync(testSystemTempDir, { recursive: true });

process.env.HOME = testHomeDir;
process.env.USERPROFILE = testHomeDir;
process.env.TMPDIR = testSystemTempDir;
process.env.TEMP = testSystemTempDir;
process.env.TMP = testSystemTempDir;
delete process.env.HOMEDRIVE;
delete process.env.HOMEPATH;

nodeOs.tmpdir = () => testSystemTempDir;
syncBuiltinESMExports();

const cleanupStorageDir = () => {
  try {
    rmSync(testSessionDir, {
      force: true,
      recursive: true,
      maxRetries: process.platform === "win32" ? 10 : 0,
      retryDelay: 200
    });
  } catch {
    // Best-effort cleanup for test-only storage.
  }

  try {
    if (readdirSync(testTempRootDir).length === 0) {
      rmdirSync(testTempRootDir);
    }
  } catch {
    // Best-effort cleanup for the shared temp root.
  }
};

afterAll(cleanupStorageDir);

process.once("exit", cleanupStorageDir);
process.once("SIGINT", () => {
  cleanupStorageDir();
  process.exit(130);
});
process.once("SIGTERM", () => {
  cleanupStorageDir();
  process.exit(143);
});
