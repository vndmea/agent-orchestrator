import { mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "./execution-context.js";
import { getCwWorkspaceId } from "../storage/cw-paths.js";

describe("createExecutionContextFromEnv", () => {
  it("does not set a worker maxTokens limit by default", () => {
    const context = createExecutionContextFromEnv();

    expect(context.workerModel.maxTokens).toBeUndefined();
    expect(context.workerModel.provider).toBe("mock");
    expect(context.workerModel.model).toBe("gpt-5.4-mini");
  });

  it("ignores CW_STORAGE_DIR and always uses the default user home storage root", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "cw-execution-context-"));
    const context = createExecutionContextFromEnv(
      {
        ...process.env,
        CW_STORAGE_DIR: join(tmpdir(), "cw-ignored-storage-root")
      },
      { rootDir }
    );

    expect(context.cwStorageDir).toBe(
      join(homedir(), ".code-worker", getCwWorkspaceId(rootDir))
    );
    expect(context.cwStorageDir).not.toContain("cw-ignored-storage-root");
  });
});
