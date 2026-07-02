import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "../runtime/execution-context.js";
import type {
  WorkerResultEnvelope,
  WorkerTaskEnvelope
} from "../schemas/worker-task-envelope.schema.js";
import type { WorkerTrustProfile } from "../types/agent.js";
import {
  listWorkerTaskExecutionRecords,
  recordWorkerTaskExecution
} from "./worker-execution-store.js";
import { openSqliteWorkspaceStore } from "./sqlite.js";

const createTaskEnvelope = (
  input: {
    id?: string;
    taskType?: WorkerTaskEnvelope["taskType"];
  } = {}
): WorkerTaskEnvelope => ({
  id: input.id ?? "task-envelope-1",
  taskType: input.taskType ?? "review-lite",
  objective: "Review selected files",
  host: "codex",
  model: {
    provider: "mock",
    model: "worker-model"
  },
  constraints: ["Use selected context only."],
  context: {
    scope: "packages/core"
  },
  outputContract: {
    contractId: "review-worker",
    schemaVersion: "1.0.0"
  },
  trace: {
    createdAt: new Date().toISOString(),
    sourceWorkflow: "host-worker-workflow"
  }
});

const createTrustProfile = (
  workerId = "mock:worker-model"
): WorkerTrustProfile => ({
  workerId,
  trustLevel: "benchmarked",
  onboardingStatus: "passed",
  interviewStatus: "passed",
  benchmarkStatus: "passed",
  recommendedMode: "dry-run",
  warnings: []
});

const createResultEnvelope = (
  input: {
    taskEnvelopeId?: string;
    taskType?: WorkerResultEnvelope["taskType"];
  } = {}
): WorkerResultEnvelope => ({
  taskEnvelopeId: input.taskEnvelopeId ?? "task-envelope-1",
  taskType: input.taskType ?? "review-lite",
  status: "ok",
  output: {
    answer: "ok"
  },
  diagnostics: {
    modelBehaviorProfile: "mock-default",
    structuredOutputAttempts: 1,
    structuredOutputMode: "native-json-schema"
  }
});

describe("worker execution store", () => {
  it("keeps execution records dry-run until storage writes are allowed", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "cw-worker-exec-dry-"));
    const context = createExecutionContextFromEnv(undefined, {
      allowWrite: false,
      dryRun: true,
      rootDir
    });

    const result = await recordWorkerTaskExecution(context, {
      artifactRefs: ["worker-debug.json"],
      id: "worker-exec-dry-run",
      resultEnvelope: createResultEnvelope(),
      taskEnvelope: createTaskEnvelope(),
      workerId: "mock:worker-model",
      workerTrustProfile: createTrustProfile()
    });
    const records = await listWorkerTaskExecutionRecords(
      rootDir,
      10,
      context.cwStorageDir
    );

    expect(result.mode).toBe("dry-run");
    expect(result.written).toBe(false);
    expect(records).toEqual([]);
  });

  it("persists execution records and artifact references in sqlite", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "cw-worker-exec-write-"));
    const context = createExecutionContextFromEnv(undefined, {
      allowWrite: true,
      dryRun: false,
      rootDir
    });

    const result = await recordWorkerTaskExecution(context, {
      artifactRefs: ["worker-debug.json"],
      diagnostics: {
        qualityGate: "ok"
      },
      id: "worker-exec-write",
      resultEnvelope: createResultEnvelope(),
      taskEnvelope: createTaskEnvelope(),
      workerId: "mock:worker-model",
      workerTrustProfile: createTrustProfile()
    });
    const records = await listWorkerTaskExecutionRecords(
      rootDir,
      10,
      context.cwStorageDir
    );
    const db = await openSqliteWorkspaceStore(context.cwStorageDir);

    try {
      const artifactRow = db
        .prepare("SELECT artifact_name FROM artifact_records WHERE execution_id = ?")
        .get("worker-exec-write") as { artifact_name: string } | undefined;

      expect(result.mode).toBe("execute");
      expect(result.written).toBe(true);
      expect(records).toHaveLength(1);
      expect(records[0]?.id).toBe("worker-exec-write");
      expect(records[0]?.workerTrustProfile.trustLevel).toBe("benchmarked");
      expect(records[0]?.resultEnvelope?.diagnostics.structuredOutputMode).toBe(
        "native-json-schema"
      );
      expect(artifactRow?.artifact_name).toBe("worker-debug.json");
    } finally {
      db.close();
    }
  });

  it("retains only the latest three records per task and worker", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "cw-worker-exec-retain-"));
    const context = createExecutionContextFromEnv(undefined, {
      allowWrite: true,
      dryRun: false,
      rootDir
    });

    for (let index = 0; index < 4; index += 1) {
      const taskEnvelope = createTaskEnvelope({
        id: `task-envelope-retain-${index}`,
        taskType: "review-lite"
      });
      await recordWorkerTaskExecution(context, {
        artifactRefs: [`worker-debug-${index}.json`],
        createdAt: `2026-01-01T00:00:0${index}.000Z`,
        id: `worker-exec-retain-${index}`,
        resultEnvelope: createResultEnvelope({
          taskEnvelopeId: taskEnvelope.id,
          taskType: taskEnvelope.taskType
        }),
        taskEnvelope,
        workerId: "mock:worker-model",
        workerTrustProfile: createTrustProfile("mock:worker-model")
      });
    }

    const otherWorkerTaskEnvelope = createTaskEnvelope({
      id: "task-envelope-other-worker",
      taskType: "review-lite"
    });
    await recordWorkerTaskExecution(context, {
      artifactRefs: ["worker-debug-other-worker.json"],
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "worker-exec-other-worker",
      resultEnvelope: createResultEnvelope({
        taskEnvelopeId: otherWorkerTaskEnvelope.id,
        taskType: otherWorkerTaskEnvelope.taskType
      }),
      taskEnvelope: otherWorkerTaskEnvelope,
      workerId: "mock:other-worker-model",
      workerTrustProfile: createTrustProfile("mock:other-worker-model")
    });

    const records = await listWorkerTaskExecutionRecords(
      rootDir,
      10,
      context.cwStorageDir
    );
    const retainedIds = records.map((record) => record.id);
    const retainedPrimaryGroup = records.filter(
      (record) =>
        record.taskEnvelope.taskType === "review-lite" &&
        record.workerId === "mock:worker-model"
    );
    const db = await openSqliteWorkspaceStore(context.cwStorageDir);

    try {
      const staleArtifactRow = db
        .prepare("SELECT artifact_name FROM artifact_records WHERE execution_id = ?")
        .get("worker-exec-retain-0") as { artifact_name: string } | undefined;
      const otherWorkerArtifactRow = db
        .prepare("SELECT artifact_name FROM artifact_records WHERE execution_id = ?")
        .get("worker-exec-other-worker") as { artifact_name: string } | undefined;

      expect(retainedPrimaryGroup.map((record) => record.id)).toEqual([
        "worker-exec-retain-3",
        "worker-exec-retain-2",
        "worker-exec-retain-1"
      ]);
      expect(retainedPrimaryGroup).toHaveLength(3);
      expect(retainedIds).toContain("worker-exec-other-worker");
      expect(retainedIds).not.toContain("worker-exec-retain-0");
      expect(staleArtifactRow).toBeUndefined();
      expect(otherWorkerArtifactRow?.artifact_name).toBe(
        "worker-debug-other-worker.json"
      );
    } finally {
      db.close();
    }
  });
});
