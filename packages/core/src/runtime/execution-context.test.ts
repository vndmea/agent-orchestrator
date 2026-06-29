import { describe, expect, it } from "vitest";

import { createExecutionContextFromEnv } from "./execution-context.js";

describe("createExecutionContextFromEnv", () => {
  it("does not set a worker maxTokens limit by default", () => {
    const context = createExecutionContextFromEnv();

    expect(context.workerModel.maxTokens).toBeUndefined();
    expect(context.workerModel.provider).toBe("mock");
    expect(context.workerModel.model).toBe("gpt-5.4-mini");
  });
});
