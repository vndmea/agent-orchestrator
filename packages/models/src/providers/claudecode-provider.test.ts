import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ModelConfig } from "@mcp-code-worker/core";

interface MockChildProcess extends EventEmitter {
  stderr: PassThrough;
  stdout: PassThrough;
}

const { inspectConfiguredClaudeCodeCommandMock, spawnMock } = vi.hoisted(() => ({
  inspectConfiguredClaudeCodeCommandMock: vi.fn(),
  spawnMock: vi.fn()
}));

const createMockChildProcess = (): MockChildProcess => {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return child;
};

const waitForSpawn = async (): Promise<void> => {
  await Promise.resolve();
};

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

vi.mock("./claudecode-command.js", () => ({
  inspectConfiguredClaudeCodeCommand: inspectConfiguredClaudeCodeCommandMock
}));

import { ClaudeCodeProvider } from "./claudecode-provider.js";

const config: ModelConfig = {
  provider: "claudecode",
  model: "sonnet"
};

describe("ClaudeCodeProvider", () => {
  beforeEach(() => {
    inspectConfiguredClaudeCodeCommandMock.mockReset();
    spawnMock.mockReset();
    inspectConfiguredClaudeCodeCommandMock.mockResolvedValue({
      command: "claude",
      compatibility: {
        checked: false,
        message: "Command resolution passed.",
        status: "pass"
      },
      configuredCommand: null,
      isPathLike: false,
      resolvedPath: "resolved-claude",
      source: "default",
      status: "pass"
    });
  });

  it("returns text results from Claude Code json output", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const provider = new ClaudeCodeProvider();
    const pending = provider.invoke(config, {
      prompt: "Reply with exactly hello"
    });
    await waitForSpawn();

    expect(spawnMock).toHaveBeenCalledWith(
      "resolved-claude",
      [
        "--print",
        "--output-format",
        "json",
        "--permission-mode",
        "dontAsk",
        "--model",
        "sonnet",
        "Reply with exactly hello"
      ],
      {
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    child.stdout.end(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "hello",
        usage: {
          input_tokens: 12,
          output_tokens: 2
        }
      })
    );
    child.stderr.end();
    child.emit("close", 0);

    const result = await pending;

    expect(result.text).toBe("hello");
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 2
    });
  });

  it("returns structured output when a json schema is requested", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const provider = new ClaudeCodeProvider();
    const pending = provider.invoke(config, {
      prompt: "Return JSON",
      systemPrompt: "Only return valid JSON.",
      responseFormat: "json",
      responseSchema: z.object({
        ok: z.boolean(),
        message: z.string()
      })
    });
    await waitForSpawn();

    const args = spawnMock.mock.calls[0]?.[1] as string[];
    expect(args).toContain("--system-prompt");
    expect(args).toContain("Only return valid JSON.");
    expect(args).toContain("--json-schema");
    expect(args.at(-2)).toContain("\"type\":\"object\"");

    child.stdout.end(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "{\"ok\":true,\"message\":\"hello\"}",
        structured_output: {
          ok: true,
          message: "hello"
        }
      })
    );
    child.stderr.end();
    child.emit("close", 0);

    const result = await pending;

    expect(result.text).toBe("{\"ok\":true,\"message\":\"hello\"}");
  });

  it("throws when the Claude Code worker exits with a failure code", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const provider = new ClaudeCodeProvider();
    const pending = provider.invoke(config, {
      prompt: "Reply with exactly hello"
    });
    await waitForSpawn();

    child.stdout.end();
    child.stderr.end("authentication failed");
    child.emit("close", 1);

    await expect(pending).rejects.toThrow(
      "Claude Code worker exited with code 1: authentication failed"
    );
  });
});
