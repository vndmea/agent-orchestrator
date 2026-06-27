import { describe, expect, it } from "vitest";

import { MockModelProvider } from "@mcp-code-worker/models";

describe("mock model provider", () => {
  it("returns deterministic structured output without API keys", async () => {
    const provider = new MockModelProvider();
    const result = await provider.invoke(
      {
        provider: "mock",
        model: "mock-model"
      },
      {
        prompt: "Summarize this task",
        responseFormat: "json",
        mockResponse: {
          ok: true
        }
      }
    );

    expect(result.provider).toBe("mock");
    expect(result.model).toBe("mock-model");
    expect(result.text).toContain("\"ok\": true");
  });
});
