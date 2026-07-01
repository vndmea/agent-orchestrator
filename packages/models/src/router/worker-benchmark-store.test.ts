import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bootstrapSqliteWorkspaceStore,
  createExecutionContextFromEnv,
  openSqliteWorkspaceStore,
  WorkerBenchmarkResultSchema
} from "@mcp-code-worker/core";

import {
  getLatestWorkerBenchmark,
  listWorkerBenchmarks,
  saveWorkerBenchmark
} from "./worker-benchmark-store.js";

const createRootDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "cw-worker-benchmark-store-"));

const createBenchmarkResult = (overrides: {
  passedCount?: number;
  suiteName?: string;
  workerId?: string;
} = {}) =>
  WorkerBenchmarkResultSchema.parse({
    workerId: overrides.workerId ?? "mock:worker-model",
    suiteName: overrides.suiteName ?? "coding-v1",
    suiteVersion: "2",
    fixtureResults: [
      {
        fixtureId: "type-error-fix",
        title: "Type Error Fix",
        passed: true,
        score: 0.9,
        findings: [],
        rawOutput: {}
      }
    ],
    evaluationSummary: {
      suiteName: overrides.suiteName ?? "coding-v1",
      suiteVersion: "2",
      sampleCount: 1,
      passedCount: overrides.passedCount ?? 1,
      failedCount: 0,
      confidenceBand: "high",
      knownFailureModes: []
    }
  });

describe("worker benchmark store", () => {
  it("keeps only the latest benchmark per worker and suite", async () => {
    const rootDir = await createRootDir();
    const context = createExecutionContextFromEnv(undefined, {
      rootDir,
      dryRun: false,
      allowWrite: true,
      workerModel: {
        provider: "mock",
        model: "worker-model"
      }
    });
    await bootstrapSqliteWorkspaceStore(context.cwStorageDir);

    await saveWorkerBenchmark(context, createBenchmarkResult({ passedCount: 1 }), true);
    await saveWorkerBenchmark(context, createBenchmarkResult({ passedCount: 2 }), true);
    await saveWorkerBenchmark(
      context,
      createBenchmarkResult({ suiteName: "review-v1", passedCount: 3 }),
      true
    );

    const latestCoding = await getLatestWorkerBenchmark({
      rootDir,
      workerId: "mock:worker-model",
      suiteName: "coding-v1",
      cwStorageDir: context.cwStorageDir
    });
    const stored = await listWorkerBenchmarks(
      rootDir,
      "mock:worker-model",
      context.cwStorageDir
    );

    expect(latestCoding?.benchmark.evaluationSummary.passedCount).toBe(2);
    expect(stored).toHaveLength(2);
    expect(stored.map((record) => record.suiteName).sort()).toEqual([
      "coding-v1",
      "review-v1"
    ]);

    const db = await openSqliteWorkspaceStore(context.cwStorageDir);
    try {
      const codingRow = db.prepare(
        `SELECT COUNT(*) AS count
         FROM worker_benchmarks
         WHERE worker_id = ? AND suite_name = ?`
      ).get("mock:worker-model", "coding-v1") as { count: number };
      const reviewRow = db.prepare(
        `SELECT COUNT(*) AS count
         FROM worker_benchmarks
         WHERE worker_id = ? AND suite_name = ?`
      ).get("mock:worker-model", "review-v1") as { count: number };

      expect(codingRow.count).toBe(1);
      expect(reviewRow.count).toBe(1);
    } finally {
      db.close();
    }
  });
});
