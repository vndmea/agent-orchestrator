import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createExecutionContextFromEnv,
  getCwWorkspaceRunsDir,
  createTaskSession,
  getTaskArtifactPath,
  getTaskSessionPath,
  listTaskSessions,
  readTaskArtifact,
  readTaskSession,
  scanTaskSessions,
  updateTaskSession,
  writeTaskArtifact
} from "@mcp-code-worker/core";

const createWorkspace = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "cw-task-session-"));

const createContext = (
  rootDir: string,
  options: { allowWrite?: boolean; dryRun?: boolean } = {}
) =>
  createExecutionContextFromEnv(undefined, {
    rootDir,
    allowWrite: options.allowWrite ?? false,
    dryRun: options.dryRun ?? true
  });

describe("task session store", () => {
  it("creates dry-run sessions without writing files", async () => {
    const rootDir = await createWorkspace();
    const context = createContext(rootDir);
    const result = await createTaskSession(
      context,
      {
        goal: "Review packages/core"
      },
      false
    );

    expect(result.mode).toBe("dry-run");
    expect(await readTaskSession(rootDir, result.session.taskId)).toBeNull();
  });

  it("creates, updates, and reads persisted sessions and artifacts", async () => {
    const rootDir = await createWorkspace();
    const context = createContext(rootDir, {
      allowWrite: true,
      dryRun: false
    });
    const created = await createTaskSession(
      context,
      {
        goal: "Fix validation",
        scope: "packages/core"
      },
      true
    );

    created.session.status = "completed";
    created.session.steps.push({
      id: "review",
      name: "Repository review",
      status: "success",
      warnings: [],
      errors: []
    });
    const updated = await updateTaskSession(context, created.session, true);
    const artifact = await writeTaskArtifact(
      context,
      created.session.taskId,
      "review-result.json",
      {
        ok: true
      },
      true
    );
    const session = await readTaskSession(rootDir, created.session.taskId);
    const storedArtifact = await readTaskArtifact<{ ok: boolean }>(
      rootDir,
      created.session.taskId,
      "review-result.json"
    );

    expect(created.mode).toBe("execute");
    expect(updated.mode).toBe("execute");
    expect(artifact.mode).toBe("execute");
    expect(session?.status).toBe("completed");
    expect(session?.steps).toHaveLength(1);
    expect(storedArtifact.exists).toBe(true);
    expect(storedArtifact.value).toEqual({ ok: true });
    expect(updated.path).toBe(getTaskSessionPath(rootDir, created.session.taskId));
    expect(artifact.path).toBe(
      getTaskArtifactPath(rootDir, created.session.taskId, "review-result.json")
    );
  });

  it("lists sessions and reports invalid files", async () => {
    const rootDir = await createWorkspace();
    const context = createContext(rootDir, {
      allowWrite: true,
      dryRun: false
    });
    const older = await createTaskSession(
      context,
      {
        goal: "Older session"
      },
      true
    );
    const newer = await createTaskSession(
      context,
      {
        goal: "Newer session"
      },
      true
    );
    const runsDir = getCwWorkspaceRunsDir(rootDir);
    await mkdir(join(runsDir, "broken"), { recursive: true });
    await writeFile(
      join(runsDir, "broken", "session.json"),
      "{\"taskId\":42}",
      "utf8"
    );

    older.session.updatedAt = "2026-06-25T10:00:00.000Z";
    newer.session.updatedAt = "2026-06-25T11:00:00.000Z";
    await writeFile(
      getTaskSessionPath(rootDir, older.session.taskId),
      JSON.stringify(older.session, null, 2),
      "utf8"
    );
    await writeFile(
      getTaskSessionPath(rootDir, newer.session.taskId),
      JSON.stringify(newer.session, null, 2),
      "utf8"
    );

    const listed = await listTaskSessions(rootDir);
    const scanned = await scanTaskSessions(rootDir);

    expect(listed[0]?.taskId).toBe(newer.session.taskId);
    expect(scanned.invalidSessions).toHaveLength(1);
  });

  it("rejects unsafe task ids", async () => {
    const rootDir = await createWorkspace();
    const context = createContext(rootDir, {
      allowWrite: true,
      dryRun: false
    });

    await expect(
      writeTaskArtifact(context, "../bad", "review.json", {}, true)
    ).rejects.toThrow("Unsafe task id");
  });

  it("automatically prunes same-kind sessions beyond the latest five", async () => {
    const rootDir = await createWorkspace();
    const context = createContext(rootDir, {
      allowWrite: true,
      dryRun: false
    });
    const now = Date.now();

    for (let index = 0; index < 12; index += 1) {
      const taskId = `task-old-${index}`;
      const path = getTaskSessionPath(rootDir, taskId);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        JSON.stringify(
          {
            taskId,
            goal: "Repeatable review",
            scope: "packages/core",
            workerId: "mock:worker",
            requireProfile: false,
            status: "completed",
            createdAt: new Date(now - (index + 10) * 86_400_000).toISOString(),
            updatedAt: new Date(now - (index + 10) * 86_400_000).toISOString(),
            steps: [],
            artifacts: {},
            warnings: [],
            errors: [],
            metadata: {
              requestedWorkerId: "mock:worker",
              runFix: false,
              proposePatch: false,
              inspectPatch: false,
              validate: {
                typecheck: false,
                lint: false,
                test: false
              }
            }
          },
          null,
          2
        ),
        "utf8"
      );
    }

    const otherTaskPath = getTaskSessionPath(rootDir, "task-other");
    await mkdir(dirname(otherTaskPath), { recursive: true });
    await writeFile(
      otherTaskPath,
      JSON.stringify(
        {
          taskId: "task-other",
          goal: "Different task kind",
          scope: "packages/core",
          workerId: "mock:worker",
          requireProfile: false,
          status: "completed",
          createdAt: new Date(now - 20 * 86_400_000).toISOString(),
          updatedAt: new Date(now - 20 * 86_400_000).toISOString(),
          steps: [],
          artifacts: {},
          warnings: [],
          errors: [],
          metadata: {
            requestedWorkerId: "mock:worker",
            runFix: false,
            proposePatch: false,
            inspectPatch: false,
            validate: {
              typecheck: false,
              lint: false,
              test: false
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const current = await createTaskSession(
      context,
      {
        goal: "Repeatable review",
        scope: "packages/core",
        workerId: "mock:worker"
      },
      true
    );

    const listed = await listTaskSessions(rootDir, 30);
    const sameKind = listed.filter((session) => session.goal === "Repeatable review");

    expect(sameKind).toHaveLength(5);
    expect(sameKind.some((session) => session.taskId === current.session.taskId)).toBe(true);
    expect(listed.some((session) => session.taskId === "task-old-6")).toBe(false);
    expect(listed.some((session) => session.taskId === "task-other")).toBe(true);
  });
});
