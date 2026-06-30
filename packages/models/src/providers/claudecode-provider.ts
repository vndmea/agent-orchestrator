import { spawn } from "node:child_process";

import type { ModelConfig } from "@mcp-code-worker/core";
import { toJSONSchema } from "zod";

import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProvider
} from "../types/model-provider.js";
import {
  inspectConfiguredClaudeCodeCommand,
  type ClaudeCodeCommandInspection
} from "./claudecode-command.js";

interface ClaudeCodeModelUsageRecord {
  inputTokens?: number;
  outputTokens?: number;
}

interface ClaudeCodePayload {
  is_error?: boolean;
  modelUsage?: Record<string, ClaudeCodeModelUsageRecord>;
  result?: string;
  structured_output?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

const summarizePrompt = (prompt: string): string =>
  prompt.replaceAll(/\s+/gu, " ").trim().slice(0, 160);

const buildMockResult = (
  config: ModelConfig,
  request: ModelInvocationRequest
): ModelInvocationResult => {
  const body =
    request.mockResponse ??
    (request.responseFormat === "json"
      ? {
          message: "mock-json-response",
          summary: summarizePrompt(request.prompt)
        }
      : `MOCK:${summarizePrompt(request.prompt)}`);

  return {
    provider: config.provider,
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
  };
};

const buildClaudeCodeArgs = (
  config: ModelConfig,
  request: ModelInvocationRequest
): string[] => {
  const args = [
    "--print",
    "--output-format",
    "json",
    "--permission-mode",
    "dontAsk",
    "--model",
    config.model
  ];

  if (request.systemPrompt) {
    args.push("--system-prompt", request.systemPrompt);
  }

  if (request.responseFormat === "json" && request.responseSchema) {
    args.push(
      "--json-schema",
      JSON.stringify(toJSONSchema(request.responseSchema))
    );
  }

  args.push(request.prompt);

  return args;
};

const parseClaudeCodePayload = (stdout: string): ClaudeCodePayload => {
  const lastNonEmptyLine = stdout
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);

  if (!lastNonEmptyLine) {
    throw new Error("Claude Code worker produced no output.");
  }

  return JSON.parse(lastNonEmptyLine) as ClaudeCodePayload;
};

const tryParseClaudeCodePayload = (stdout: string): ClaudeCodePayload | null => {
  try {
    return parseClaudeCodePayload(stdout);
  } catch {
    return null;
  }
};

const summarizeClaudeCodeError = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim().slice(0, 300);

const buildResolutionSummary = (
  inspection: ClaudeCodeCommandInspection
): string =>
  `configured=${inspection.configuredCommand ?? "(default)"} resolved=${inspection.resolvedPath ?? "(not found)"} source=${inspection.source}`;

const buildResolutionError = (
  inspection: ClaudeCodeCommandInspection
): Error =>
  new Error(
    `Claude Code command resolution failed: ${inspection.compatibility.message} (${buildResolutionSummary(inspection)})`
  );

const buildSpawnError = (
  error: Error,
  inspection: ClaudeCodeCommandInspection
): Error =>
  new Error(
    `Claude Code worker failed to start: ${error.message} (${buildResolutionSummary(inspection)})`
  );

const buildExitError = (
  exitCode: number,
  stderr: string,
  stdout: string
): Error => {
  const payload = tryParseClaudeCodePayload(stdout);
  const message =
    (payload?.is_error && typeof payload.result === "string"
      ? payload.result
      : undefined) ??
    (stderr.trim().length > 0 ? stderr.trim() : undefined) ??
    (stdout.trim().length > 0 ? summarizeClaudeCodeError(stdout) : undefined);

  return new Error(
    `Claude Code worker exited with code ${exitCode}${message ? `: ${message}` : ""}`
  );
};

const extractUsage = (
  payload: ClaudeCodePayload
): ModelInvocationResult["usage"] => {
  const usage = payload.usage ?? {};
  const modelUsage = Object.values(payload.modelUsage ?? {}).at(0);

  return {
    ...(usage.input_tokens !== undefined
      ? { inputTokens: usage.input_tokens }
      : modelUsage?.inputTokens !== undefined
        ? { inputTokens: modelUsage.inputTokens }
        : {}),
    ...(usage.output_tokens !== undefined
      ? { outputTokens: usage.output_tokens }
      : modelUsage?.outputTokens !== undefined
        ? { outputTokens: modelUsage.outputTokens }
        : {})
  };
};

const runClaudeCode = async (
  inspection: ClaudeCodeCommandInspection,
  args: string[]
): Promise<{ exitCode: number; stderr: string; stdout: string }> =>
  await new Promise((resolve, reject) => {
    const child = spawn(inspection.resolvedPath ?? inspection.command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(
        buildSpawnError(
          error instanceof Error ? error : new Error(String(error)),
          inspection
        )
      );
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });

export class ClaudeCodeProvider implements ModelProvider {
  public readonly name = "claudecode";

  public async invoke(
    config: ModelConfig,
    request: ModelInvocationRequest
  ): Promise<ModelInvocationResult> {
    if (request.mockResponse !== undefined) {
      return buildMockResult(config, request);
    }

    const commandInspection = await inspectConfiguredClaudeCodeCommand(config, {
      checkCompatibility: false
    });

    if (!commandInspection.resolvedPath) {
      throw buildResolutionError(commandInspection);
    }

    const { exitCode, stderr, stdout } = await runClaudeCode(
      commandInspection,
      buildClaudeCodeArgs(config, request)
    );

    if (exitCode !== 0) {
      throw buildExitError(exitCode, stderr, stdout);
    }

    const payload = parseClaudeCodePayload(stdout);

    if (payload.is_error) {
      throw new Error(
        `Claude Code worker returned an error result${payload.result ? `: ${payload.result}` : ""}`
      );
    }

    const text =
      request.responseFormat === "json" && payload.structured_output !== undefined
        ? JSON.stringify(payload.structured_output)
        : payload.result ?? "";

    return {
      provider: config.provider,
      model: config.model,
      text,
      raw: payload,
      usage: extractUsage(payload)
    };
  }
}
