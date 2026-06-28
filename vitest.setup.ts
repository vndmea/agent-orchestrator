import { webcrypto } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true
  });
}

if (!process.env.CW_STORAGE_DIR) {
  process.env.CW_STORAGE_DIR = join(tmpdir(), `cw-vitest-home-${process.pid}`);
}
