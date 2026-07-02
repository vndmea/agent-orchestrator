import { spawn } from "node:child_process";

import type { ModelConfig } from "@mcp-code-worker/core";

import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProvider
} from "../types/model-provider.js";
import { resolveStructuredOutputMode } from "../types/model-provider.js";
import { parseOpencodeEventStream } from "./opencode-event-stream.js";
import {
  inspectConfiguredOpencodeCommand,
  type OpencodeCommandInspection
} from "./opencode-command.js";

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
    structuredOutputMode: resolveStructuredOutputMode(
      request,
      "prompt-only-json"
    ),
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

const buildOpencodePrompt = (request: ModelInvocationRequest): string =>
  request.systemPrompt
    ? [
        "System instructions:",
        request.systemPrompt,
        "",
        "User request:",
        request.prompt
      ].join("\n")
    : request.prompt;

const buildOpencodeArgs = (
  config: ModelConfig,
  request: ModelInvocationRequest
): string[] => {
  const args = [
    "run",
    "--format",
    "json",
    "--dangerously-skip-permissions",
    "--model",
    config.model,
    buildOpencodePrompt(request)
  ];

  return args;
};

const buildResolutionSummary = (
  inspection: OpencodeCommandInspection
): string =>
  `configured=${inspection.configuredCommand ?? "(default)"} resolved=${inspection.resolvedPath ?? "(not found)"} source=${inspection.source}`;

const buildResolutionError = (
  inspection: OpencodeCommandInspection
): Error =>
  new Error(
    `Opencode command resolution failed: ${inspection.compatibility.message} (${buildResolutionSummary(inspection)})`
  );

const buildSpawnError = (
  error: Error,
  inspection: OpencodeCommandInspection
): Error =>
  new Error(
    `Opencode worker failed to start: ${error.message} (${buildResolutionSummary(inspection)})`
  );

const summarizeOpencodeError = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim().slice(0, 300);

const runOpencode = async (
  inspection: OpencodeCommandInspection,
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

const buildExitError = (
  exitCode: number,
  stderr: string,
  stdout: string
): Error => {
  try {
    const parsed = parseOpencodeEventStream(stdout);
    const message =
      parsed.error ??
      (stderr.trim().length > 0 ? stderr.trim() : undefined) ??
      (stdout.trim().length > 0 ? summarizeOpencodeError(stdout) : undefined);
    return new Error(
      `Opencode worker exited with code ${exitCode}${message ? `: ${message}` : ""}`
    );
  } catch {
    const message =
      stderr.trim().length > 0 ? stderr.trim() : summarizeOpencodeError(stdout);
    return new Error(
      `Opencode worker exited with code ${exitCode}${message ? `: ${message}` : ""}`
    );
  }
};

export class OpencodeProvider implements ModelProvider {
  // Experimental compatibility provider retained for future local OpenCode use.
  // Current release-grade worker support is API-model first.
  public readonly name = "opencode";

  public async invoke(
    config: ModelConfig,
    request: ModelInvocationRequest
  ): Promise<ModelInvocationResult> {
    if (request.mockResponse !== undefined) {
      return buildMockResult(config, request);
    }

    const commandInspection = await inspectConfiguredOpencodeCommand(config, {
      checkCompatibility: false
    });

    if (!commandInspection.resolvedPath) {
      throw buildResolutionError(commandInspection);
    }

    const { exitCode, stderr, stdout } = await runOpencode(
      commandInspection,
      buildOpencodeArgs(config, request)
    );

    if (exitCode !== 0) {
      throw buildExitError(exitCode, stderr, stdout);
    }

    const parsed = parseOpencodeEventStream(stdout);

    if (parsed.error) {
      throw new Error(`Opencode worker returned an error event: ${parsed.error}`);
    }

    return {
      provider: config.provider,
      model: config.model,
      structuredOutputMode: resolveStructuredOutputMode(
        request,
        "prompt-only-json"
      ),
      text: parsed.text,
      raw: parsed.events,
      usage: {
        ...(parsed.usage?.inputTokens !== undefined
          ? { inputTokens: parsed.usage.inputTokens }
          : {}),
        ...(parsed.usage?.outputTokens !== undefined
          ? { outputTokens: parsed.usage.outputTokens }
          : {})
      }
    };
  }
}
