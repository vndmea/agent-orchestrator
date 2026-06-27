import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelConfig } from "@mcp-code-worker/core";

const { chatMock, createOpenAIMock, generateTextMock } = vi.hoisted(() => ({
  chatMock: vi.fn((model: string) => ({ model })),
  createOpenAIMock: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ model }))
  })),
  generateTextMock: vi.fn()
}));

createOpenAIMock.mockImplementation(() => ({
  chat: chatMock
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock
}));

vi.mock("ai", () => ({
  Output: {
    object: vi.fn((options: unknown) => options)
  },
  generateText: generateTextMock
}));

import { LiteLlmProvider } from "@mcp-code-worker/models";

const config: ModelConfig = {
  provider: "litellm",
  model: "deepseek-v4-pro",
  baseURL: "https://api.deepseek.com"
};

describe("LiteLlmProvider", () => {
  beforeEach(() => {
    chatMock.mockClear();
    createOpenAIMock.mockClear();
    generateTextMock.mockReset();
  });

  it("does not pass maxOutputTokens when maxTokens is unset", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "ok",
      response: {
        id: "plain"
      },
      usage: {
        inputTokens: 5,
        outputTokens: 1
      }
    });

    const provider = new LiteLlmProvider();
    await provider.invoke(config, {
      prompt: "Say ok"
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "maxOutputTokens"
    );
  });
});
