import type { ModelConfig } from "@mcp-code-worker/core";

import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProvider
} from "../types/model-provider.js";

const summarizePrompt = (prompt: string) =>
  prompt.replaceAll(/\s+/gu, " ").trim().slice(0, 160);

export class MockModelProvider implements ModelProvider {
  public readonly name = "mock";

  public invoke(
    config: ModelConfig,
    request: ModelInvocationRequest
  ): Promise<ModelInvocationResult> {
    const body =
      request.mockResponse ??
      (request.responseFormat === "json"
        ? {
            message: "mock-json-response",
            summary: summarizePrompt(request.prompt)
          }
        : `MOCK:${summarizePrompt(request.prompt)}`);

    return Promise.resolve({
      provider: this.name,
      model: config.model,
      text: typeof body === "string" ? body : JSON.stringify(body, null, 2),
      raw: body,
      usage: {
        inputTokens: request.prompt.length,
        outputTokens:
          typeof body === "string"
            ? body.length
            : JSON.stringify(body).length
      }
    });
  }
}
