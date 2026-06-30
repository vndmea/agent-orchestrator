import { describe, expect, it } from "vitest";

import { parseOpencodeEventStream } from "./opencode-event-stream.js";

describe("parseOpencodeEventStream", () => {
  it("collects text events and finish token usage", () => {
    const result = parseOpencodeEventStream(
      [
        JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
        JSON.stringify({ type: "text", part: { text: "cw-" } }),
        JSON.stringify({ type: "text", part: { text: "probe-ok" } }),
        JSON.stringify({
          type: "step_finish",
          part: {
            reason: "stop",
            tokens: {
              input: 11,
              output: 2,
              reasoning: 3
            }
          }
        })
      ].join("\n")
    );

    expect(result.text).toBe("cw-probe-ok");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({
      inputTokens: 11,
      outputTokens: 2,
      reasoningTokens: 3
    });
    expect(result.events).toHaveLength(4);
  });

  it("surfaces error events", () => {
    const result = parseOpencodeEventStream(
      JSON.stringify({
        type: "error",
        error: {
          name: "APIError",
          data: {
            message: "Invalid token"
          }
        }
      })
    );

    expect(result.error).toBe("Invalid token");
  });
});
