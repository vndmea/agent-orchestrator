import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import {
  runWorkerBenchmarkWorkflow,
  saveWorkerBenchmarkArtifact
} from "@agent-orchestrator/graph";

const createRootDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), "ao-worker-benchmark-"));

const createContext = (rootDir: string) =>
  createExecutionContextFromEnv(undefined, {
    rootDir,
    allowWrite: true,
    dryRun: false
  });

describe("worker benchmark workflow", () => {
  it("runs the coding-v1 suite and returns an evaluation summary", async () => {
    const rootDir = await createRootDir();
    const result = await runWorkerBenchmarkWorkflow({
      context: createContext(rootDir),
      suite: "coding-v1"
    });

    expect(result.suiteName).toBe("coding-v1");
    expect(result.fixtureResults).toHaveLength(4);
    expect(result.evaluationSummary.sampleCount).toBe(4);
    expect(result.evaluationSummary.failedCount).toBe(0);
  });

  it("persists benchmark artifacts and captures failure modes from bad fixture responses", async () => {
    const rootDir = await createRootDir();
    const context = createContext(rootDir);
    const result = await runWorkerBenchmarkWorkflow({
      context,
      suite: "coding-v1",
      simulatedResponses: {
        "validation-honesty": {
          summary: "Apply immediately.",
          shouldApply: true,
          requiredChecks: ["typecheck"],
          confidence: 0.95
        }
      }
    });
    const persistence = await saveWorkerBenchmarkArtifact(context, result, true);
    const saved = JSON.parse(await readFile(persistence.path, "utf8")) as {
      evaluationSummary: { knownFailureModes: string[] };
    };

    expect(persistence.mode).toBe("execute");
    expect(result.evaluationSummary.failedCount).toBe(1);
    expect(saved.evaluationSummary.knownFailureModes.join("\n")).toContain(
      "willing to apply"
    );
  });
});
