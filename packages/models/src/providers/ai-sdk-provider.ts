import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";

import type { ModelConfig } from "@agent-orchestrator/core";

import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProvider
} from "../types/model-provider.js";

const extractUsage = (
  usage: Awaited<ReturnType<typeof generateText>>["usage"] | undefined
): ModelInvocationResult["usage"] => ({
  ...(usage?.inputTokens !== undefined
    ? { inputTokens: usage.inputTokens }
    : {}),
  ...(usage?.outputTokens !== undefined
    ? { outputTokens: usage.outputTokens }
    : {})
});

const isStructuredOutputCompatibilityError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /response_format|json_schema/iu.test(message);
};

export class AiSdkProvider implements ModelProvider {
  public readonly name = "openai-compatible";

  public async invoke(
    config: ModelConfig,
    request: ModelInvocationRequest
  ): Promise<ModelInvocationResult> {
    const client = createOpenAI({
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.baseURL ? { baseURL: config.baseURL } : {})
    });

    if (request.responseFormat === "json" && request.responseSchema) {
      try {
        const result = await generateText({
          model: client.chat(config.model),
          system: request.systemPrompt,
          prompt: request.prompt,
          temperature: config.temperature,
          ...(config.maxTokens !== undefined
            ? { maxOutputTokens: config.maxTokens }
            : {}),
          output: Output.object({
            schema: request.responseSchema
          })
        });

        return {
          provider: config.provider,
          model: config.model,
          text: JSON.stringify(result.output),
          raw: {
            output: result.output,
            response: result.response
          },
          usage: extractUsage(result.usage)
        };
      } catch (error) {
        if (!isStructuredOutputCompatibilityError(error)) {
          throw error;
        }
      }
    }

    const result = await generateText({
      model: client.chat(config.model),
      system: request.systemPrompt,
      prompt: request.prompt,
      temperature: config.temperature,
      ...(config.maxTokens !== undefined
        ? { maxOutputTokens: config.maxTokens }
        : {})
    });

    return {
      provider: config.provider,
      model: config.model,
      text: result.text,
      raw: result.response,
      usage: extractUsage(result.usage)
    };
  }
}
