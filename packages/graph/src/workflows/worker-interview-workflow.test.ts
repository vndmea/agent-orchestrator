import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "@agent-orchestrator/core";
import {
  runLeaderWorkerWorkflow,
  runWorkerInterviewWorkflow
} from "@agent-orchestrator/graph";

const createContext = () =>
  createExecutionContextFromEnv(undefined, {
    dryRun: true,
    allowWrite: false
  });

describe("worker interview workflow", () => {
  it("generates an active capability profile for the default mock worker", async () => {
    const result = await runWorkerInterviewWorkflow({
      context: createContext()
    });

    expect(result.status).toBe("active");
    expect(result.profile.supportedTaskTypes).toContain("codegen");
    expect(result.profile.routingPolicy.allowCodegen).toBe(true);
    expect(result.taskResults).toHaveLength(6);
  });

  it("blocks workers that fail structured output handling", async () => {
    const result = await runWorkerInterviewWorkflow({
      context: createContext(),
      simulatedResponses: {
        "structured-output": "this is not valid json"
      }
    });

    expect(result.status).toBe("blocked");
    expect(result.profile.score.structuredOutput).toBeLessThan(0.45);
    expect(result.warnings.join("\n")).toContain("structured-output");
  });

  it("limits routing when code generation quality is too low", async () => {
    const interview = await runWorkerInterviewWorkflow({
      context: createContext(),
      simulatedResponses: {
        codegen: {
          code: "export const bad: any = 1;",
          confidence: 0.95
        }
      }
    });
    const workflow = await runLeaderWorkerWorkflow({
      context: createContext(),
      goal: "Generate implementation drafts",
      workerCapabilityProfile: interview.profile
    });

    expect(interview.status).toBe("limited");
    expect(interview.profile.routingPolicy.allowCodegen).toBe(false);
    expect(
      workflow.state.workerResults.some((result) => result.agentId === "worker.codegen")
    ).toBe(false);
    expect(workflow.state.workerResults.length).toBe(2);
    expect(workflow.state.warnings.join("\n")).toContain("not qualified for codegen");
  });

  it("prevents blocked workers from receiving production tasks", async () => {
    const interview = await runWorkerInterviewWorkflow({
      context: createContext(),
      simulatedResponses: {
        "structured-output": "bad",
        summarization: "bad"
      }
    });
    const workflow = await runLeaderWorkerWorkflow({
      context: createContext(),
      goal: "Draft tests for workflow routing",
      workerCapabilityProfile: interview.profile
    });

    expect(interview.status).toBe("blocked");
    expect(workflow.state.workerResults).toHaveLength(0);
    expect(workflow.state.warnings.join("\n")).toContain("blocked");
    expect(workflow.finalResult?.status).toBe("needs_review");
  });
});
