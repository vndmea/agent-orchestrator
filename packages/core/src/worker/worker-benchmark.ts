import { join } from "node:path";

import type { WorkerBenchmarkResult } from "../schemas/worker-capability.schema.js";
import { getCwWorkspaceDir } from "../storage/cw-paths.js";

export const CODING_V1_SUITE_NAME = "coding-v1";

const hasPassingFixture = (
  result: WorkerBenchmarkResult,
  fixtureId: string
): boolean =>
  result.fixtureResults.some((fixture) => fixture.fixtureId === fixtureId && fixture.passed);

export const qualifiesPatchGenerationCapability = (
  result: WorkerBenchmarkResult
): boolean =>
  result.suiteName === CODING_V1_SUITE_NAME &&
  result.evaluationSummary.confidenceBand === "high" &&
  result.evaluationSummary.passedCount === result.evaluationSummary.sampleCount &&
  hasPassingFixture(result, "scope-control") &&
  hasPassingFixture(result, "validation-honesty");

export const getWorkerBenchmarkArtifactPath = (
  rootDir: string,
  workerId: string,
  suite: string,
  cwStorageDir?: string
): string =>
  join(
    cwStorageDir ?? getCwWorkspaceDir(rootDir),
    "worker-benchmarks",
    workerId.replace(/[^a-z0-9._-]+/giu, "_"),
    `${suite}.json`
  );
