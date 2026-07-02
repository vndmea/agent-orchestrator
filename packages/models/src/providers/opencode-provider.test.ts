import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelConfig } from "@mcp-code-worker/core";

// These tests protect the experimental local OpenCode compatibility layer.
// Passing them does not make the adapter part of the release-supported path.
interface MockChildProcess extends EventEmitter {
  stderr: PassThrough;
  stdout: PassThrough;
}

const { inspectConfiguredOpencodeCommandMock, spawnMock } = vi.hoisted(() => ({
  inspectConfiguredOpencodeCommandMock: vi.fn(),
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

vi.mock("./opencode-command.js", () => ({
  inspectConfiguredOpencodeCommand: inspectConfiguredOpencodeCommandMock
}));

import { OpencodeProvider } from "./opencode-provider.js";

const config: ModelConfig = {
  provider: "opencode",
  model: "deepseek/deepseek-v4-flash"
};

describe("OpencodeProvider", () => {
  beforeEach(() => {
    inspectConfiguredOpencodeCommandMock.mockReset();
    spawnMock.mockReset();
    inspectConfiguredOpencodeCommandMock.mockResolvedValue({
      command: "opencode",
      compatibility: {
        checked: false,
        message: "Command resolution passed.",
        status: "pass"
      },
      configuredCommand: null,
      isPathLike: false,
      resolvedPath: "resolved-opencode",
      source: "default",
      status: "pass"
    });
  });

  it("returns text results from opencode event streams", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const provider = new OpencodeProvider();
    const pending = provider.invoke(config, {
      prompt: "Reply with exactly hello"
    });
    await waitForSpawn();

    expect(spawnMock).toHaveBeenCalledWith(
      "resolved-opencode",
      [
        "run",
        "--format",
        "json",
        "--dangerously-skip-permissions",
        "--model",
        "deepseek/deepseek-v4-flash",
        "Reply with exactly hello"
      ],
      {
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    child.stdout.end(
      [
        JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
        JSON.stringify({ type: "text", part: { text: "hello" } }),
        JSON.stringify({
          type: "step_finish",
          part: {
            reason: "stop",
            tokens: {
              input: 12,
              output: 2
            }
          }
        })
      ].join("\n")
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

  it("throws when opencode emits an error event", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const provider = new OpencodeProvider();
    const pending = provider.invoke(config, {
      prompt: "Reply with exactly hello"
    });
    await waitForSpawn();

    child.stdout.end(
      JSON.stringify({
        type: "error",
        error: {
          data: {
            message: "Invalid token"
          }
        }
      })
    );
    child.stderr.end();
    child.emit("close", 0);

    await expect(pending).rejects.toThrow(
      "Opencode worker returned an error event: Invalid token"
    );
  });
});
