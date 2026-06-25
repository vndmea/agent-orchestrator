import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

import type { ModelConfig } from "@agent-orchestrator/core";

import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProvider
} from "../types/model-provider.js";

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

    const result = await generateText({
      model: client.chat(config.model),
      system: request.systemPrompt,
      prompt: request.prompt,
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens
    });

    return {
      provider: config.provider,
      model: config.model,
      text: result.text,
      raw: result.response,
      usage: {
        ...(result.usage?.inputTokens !== undefined
          ? { inputTokens: result.usage.inputTokens }
          : {}),
        ...(result.usage?.outputTokens !== undefined
          ? { outputTokens: result.usage.outputTokens }
          : {})
      }
    };
  }
}
