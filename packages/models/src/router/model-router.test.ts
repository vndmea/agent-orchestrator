import { describe, expect, it } from "vitest";

import { ModelRouter } from "@agent-orchestrator/models";

describe("model router", () => {
  it("routes leader and worker roles to the expected configs", () => {
    const router = new ModelRouter(
      {
        provider: "mock",
        model: "leader-model"
      },
      {
        provider: "mock",
        model: "worker-model"
      }
    );

    expect(router.route("leader").config.model).toBe("leader-model");
    expect(router.route("worker").config.model).toBe("worker-model");
    expect(router.listModels()).toHaveLength(2);
  });
});
