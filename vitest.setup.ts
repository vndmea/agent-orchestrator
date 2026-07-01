import { webcrypto } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true
  });
}

const testHomeDir = join(tmpdir(), `cw-vitest-home-${process.pid}`);

if (!process.env.HOME) {
  process.env.HOME = testHomeDir;
}

if (!process.env.USERPROFILE) {
  process.env.USERPROFILE = testHomeDir;
}

const cleanupStorageDir = () => {
  const storageDir = process.env.USERPROFILE ?? process.env.HOME;

  if (!storageDir) {
    return;
  }

  try {
    rmSync(storageDir, {
      force: true,
      recursive: true,
      maxRetries: process.platform === "win32" ? 10 : 0,
      retryDelay: 200
    });
  } catch {
    // Best-effort cleanup for test-only storage.
  }
};

process.once("exit", cleanupStorageDir);
process.once("SIGINT", () => {
  cleanupStorageDir();
  process.exit(130);
});
process.once("SIGTERM", () => {
  cleanupStorageDir();
  process.exit(143);
});
