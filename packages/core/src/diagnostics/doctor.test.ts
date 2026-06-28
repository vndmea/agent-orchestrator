import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createExecutionContextFromEnv,
  getCwConfigPath,
  getCwWorkspaceAuditDir,
  getCwWorkspaceRunsDir,
  runDoctor
} from "@mcp-code-worker/core";

const createWorkspace = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "cw-doctor-"));

const findCheck = (
  report: Awaited<ReturnType<typeof runDoctor>>,
  name: string
) => report.checks.find((check) => check.name === name);

describe("doctor", () => {
  it("works before init and warns about missing config and runs dir", async () => {
    const rootDir = await createWorkspace();
    const report = await runDoctor(
      createExecutionContextFromEnv(undefined, {
        rootDir
      })
    );

    expect(report.checks.find((check) => check.name === "cw-config")?.status).toBe("warning");
    expect(report.checks.find((check) => check.name === "runs-dir")?.status).toBe("warning");
    const runtimeBootstrapMetadata = findCheck(report, "runtime-bootstrap")?.metadata;

    expect(runtimeBootstrapMetadata?.["configPath"]).toBe(getCwConfigPath(rootDir));
    expect(runtimeBootstrapMetadata?.["cwStorageDir"]).toEqual(
      expect.stringContaining("workspaces")
    );
    expect(runtimeBootstrapMetadata?.["rootDir"]).toBe(rootDir);
  });

  it("fails on invalid config and warns about invalid task sessions", async () => {
    const rootDir = await createWorkspace();
    const runsDir = getCwWorkspaceRunsDir(rootDir);
    await mkdir(join(runsDir, "broken"), { recursive: true });
    await writeFile(
      getCwConfigPath(rootDir),
      JSON.stringify({
        version: 1,
        workerModel: {
          provider: "litellm",
          model: "qwen3-coder",
          baseURL: "not-a-url"
        }
      }),
      "utf8"
    );
    await writeFile(
      join(runsDir, "broken", "session.json"),
      "{\"taskId\":42}",
      "utf8"
    );

    const report = await runDoctor(
      createExecutionContextFromEnv(undefined, {
        rootDir,
        workerModel: {
          provider: "litellm",
          model: "qwen3-coder"
        }
      })
    );

    expect(report.checks.find((check) => check.name === "cw-config")?.status).toBe("fail");
    expect(report.checks.find((check) => check.name === "task-sessions")?.status).toBe("warning");
    expect(report.checks.find((check) => check.name === "worker-api-key")?.status).toBe("warning");
  });

  it("passes after init-like setup with retained directories", async () => {
    const rootDir = await createWorkspace();
    await mkdir(getCwWorkspaceRunsDir(rootDir), { recursive: true });
    await mkdir(getCwWorkspaceAuditDir(rootDir), { recursive: true });
    await writeFile(
      getCwConfigPath(rootDir),
      JSON.stringify(
        {
          version: 1,
          workerModel: {
            provider: "mock",
            model: "gpt-5.4-mini"
          }
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify(
        {
          scripts: {
            build: "node -e \"process.exit(0)\"",
            typecheck: "node -e \"process.exit(0)\"",
            lint: "node -e \"process.exit(0)\"",
            test: "node -e \"process.exit(0)\""
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const report = await runDoctor(
      createExecutionContextFromEnv(undefined, {
        rootDir
      })
    );

    expect(report.checks.find((check) => check.name === "cw-config")?.status).toBe("pass");
    expect(report.checks.find((check) => check.name === "runs-dir")?.status).toBe("pass");
    expect(report.checks.find((check) => check.name === "validation-scripts")?.status).toBe("pass");
    expect(report.status).toBe("ready");
    expect(report.summary).toContain("ready:");
    expect(report.recommendedEntrypoints.map((entry) => entry.toolName)).toContain("cw_start_task");
  });

  it("checks the local client command when client providers are configured", async () => {
    const rootDir = await createWorkspace();
    const originalCommand = process.env.CW_WORKER_CLIENT_COMMAND;
    process.env.CW_WORKER_CLIENT_COMMAND = "node";

    try {
      const report = await runDoctor(
        createExecutionContextFromEnv(undefined, {
          rootDir,
          workerModel: {
            provider: "client",
            model: "qwen3-coder"
          }
        })
      );

      expect(
        report.checks.find((check) => check.name === "local-client-command")?.status
      ).toBe("pass");
      expect(
        report.checks.find((check) => check.name === "worker-api-key")?.status
      ).toBe("pass");
    } finally {
      if (originalCommand === undefined) {
        delete process.env.CW_WORKER_CLIENT_COMMAND;
      } else {
        process.env.CW_WORKER_CLIENT_COMMAND = originalCommand;
      }
    }
  });

  it("records bootstrap source details when CW_ROOT_DIR and CW_HOME_DIR are set", async () => {
    const rootDir = await createWorkspace();
    const cwHomeDir = join(rootDir, ".cw-home");
    const originalRootDir = process.env.CW_ROOT_DIR;
    const originalHomeDir = process.env.CW_HOME_DIR;

    process.env.CW_ROOT_DIR = rootDir;
    process.env.CW_HOME_DIR = cwHomeDir;

    try {
      const report = await runDoctor(
        createExecutionContextFromEnv(undefined, {
          rootDir
        })
      );

      const rootMetadata = findCheck(report, "root-dir")?.metadata;
      const runtimeBootstrapMetadata = findCheck(report, "runtime-bootstrap")?.metadata;
      const runtimeEnv = runtimeBootstrapMetadata?.["env"];

      expect(rootMetadata?.["cwRootDir"]).toBe(rootDir);
      expect(rootMetadata?.["rootSource"]).toBe("cw-root-dir");
      expect(runtimeBootstrapMetadata?.["cwHomeDir"]).toBe(cwHomeDir);
      expect(runtimeEnv).toMatchObject({
        CW_HOME_DIR: cwHomeDir,
        CW_ROOT_DIR: rootDir
      });
      expect(typeof runtimeBootstrapMetadata?.["workspaceId"]).toBe("string");
    } finally {
      if (originalRootDir === undefined) {
        delete process.env.CW_ROOT_DIR;
      } else {
        process.env.CW_ROOT_DIR = originalRootDir;
      }

      if (originalHomeDir === undefined) {
        delete process.env.CW_HOME_DIR;
      } else {
        process.env.CW_HOME_DIR = originalHomeDir;
      }
    }
  });
});
