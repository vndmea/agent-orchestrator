import type { ModelConfig } from "@agent-orchestrator/core";

export interface ModelInvocationRequest {
  prompt: string;
  systemPrompt?: string;
  responseFormat?: "text" | "json";
  mockResponse?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ModelInvocationResult {
  provider: string;
  model: string;
  text: string;
  raw?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ModelProvider {
  readonly name: string;
  invoke(
    config: ModelConfig,
    request: ModelInvocationRequest
  ): Promise<ModelInvocationResult>;
}
