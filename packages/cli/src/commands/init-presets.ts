import type { ModelConfig } from "@mcp-code-worker/core";

export type InitPresetId = "mock" | "deepseek" | "opencode";

export interface InitPresetDefinition {
  id: InitPresetId;
  label: string;
  workerBaseUrl?: string;
  workerClientCommand?: string;
  workerModel: string;
  workerProvider: string;
}

export const INIT_PRESETS: InitPresetDefinition[] = [
  {
    id: "mock",
    label: "Mock",
    workerModel: "gpt-5.4-mini",
    workerProvider: "mock"
  },
  {
    id: "deepseek",
    label: "DeepSeek API",
    workerBaseUrl: "https://api.deepseek.com",
    workerModel: "deepseek-v4-flash",
    workerProvider: "openai-compatible"
  },
  {
    id: "opencode",
    label: "Local OpenCode",
    workerModel: "qwen3-coder",
    workerProvider: "client"
  }
];

export const getInitPreset = (
  presetId: string | undefined
): InitPresetDefinition | undefined =>
  presetId
    ? INIT_PRESETS.find((preset) => preset.id === presetId)
    : undefined;

export const detectInitPreset = (
  workerModel: ModelConfig
): InitPresetId | undefined => {
  if (
    workerModel.provider === "mock" &&
    workerModel.model === "gpt-5.4-mini"
  ) {
    return "mock";
  }

  if (
    workerModel.provider === "openai-compatible" &&
    workerModel.model === "deepseek-v4-flash" &&
    workerModel.baseURL === "https://api.deepseek.com"
  ) {
    return "deepseek";
  }

  if (
    workerModel.provider === "client" &&
    workerModel.model === "qwen3-coder" &&
    (!workerModel.clientCommand ||
      workerModel.clientCommand === "opencode")
  ) {
    return "opencode";
  }

  return undefined;
};
