import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import {
  createWorkerProfileDoctorChecks,
  getWorkerRegistryPath
} from "@agent-orchestrator/models";

const createRootDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "ao-worker-doctor-"));

const writeRegistry = async (rootDir: string, value: unknown): Promise<void> => {
  await mkdir(join(rootDir, ".ao"), { recursive: true });
  await writeFile(
    getWorkerRegistryPath(rootDir),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
    "utf8"
  );
};

const createRegistration = (overrides: Record<string, unknown> = {}) => {
  const now = new Date().toISOString();

  return {
    workerId: "mock:registered-worker",
    provider: "mock",
    model: "registered-worker",
    enabled: true,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
};

describe("worker profile doctor checks", () => {
  it("warns when the worker registry is missing", async () => {
    const rootDir = await createRootDir();
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const checks = await createWorkerProfileDoctorChecks(context);

    expect(
      checks.some(
        (check) => check.name === "worker-registry" && check.status === "warning"
      )
    ).toBe(true);
  });

  it("reports registry count and missing registered profiles", async () => {
    const rootDir = await createRootDir();
    await writeRegistry(rootDir, {
      version: 1,
      workers: [createRegistration()]
    });
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const checks = await createWorkerProfileDoctorChecks(context);

    expect(
      checks.some(
        (check) =>
          check.name === "worker-registry" &&
          check.status === "pass" &&
          check.metadata?.workerCount === 1
      )
    ).toBe(true);
    expect(
      checks.some(
        (check) =>
          check.name === "registered-worker-profile" &&
          check.status === "warning"
      )
    ).toBe(true);
  });

  it("fails for invalid worker registry schema", async () => {
    const rootDir = await createRootDir();
    await writeRegistry(rootDir, {
      version: 2,
      workers: []
    });
    const context = createExecutionContextFromEnv(undefined, { rootDir });
    const checks = await createWorkerProfileDoctorChecks(context);

    expect(
      checks.some(
        (check) => check.name === "worker-registry" && check.status === "fail"
      )
    ).toBe(true);
  });
});
