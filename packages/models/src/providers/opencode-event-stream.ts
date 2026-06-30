export interface OpencodeEventStreamUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

export interface ParsedOpencodeEventStream {
  error?: string;
  events: unknown[];
  finishReason?: string;
  text: string;
  usage?: OpencodeEventStreamUsage;
}

interface OpencodeEventRecord {
  error?: {
    data?: {
      message?: string;
    };
    name?: string;
  };
  part?: {
    reason?: string;
    text?: string;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
    };
    type?: string;
  };
  type?: string;
}

const formatUnknownError = (value: unknown): string =>
  value instanceof Error ? value.message : String(value);

export const parseOpencodeEventStream = (
  stdout: string
): ParsedOpencodeEventStream => {
  const events: unknown[] = [];
  const textParts: string[] = [];
  let finishReason: string | undefined;
  let usage: OpencodeEventStreamUsage | undefined;
  let error: string | undefined;

  for (const rawLine of stdout.split(/\r?\n/gu)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    let parsed: OpencodeEventRecord;
    try {
      parsed = JSON.parse(line) as OpencodeEventRecord;
    } catch (parseError) {
      throw new Error(
        `Failed to parse opencode event stream line as JSON: ${formatUnknownError(parseError)}`
      );
    }

    events.push(parsed);

    if (parsed.type === "text" && typeof parsed.part?.text === "string") {
      textParts.push(parsed.part.text);
      continue;
    }

    if (parsed.type === "step_finish") {
      finishReason = parsed.part?.reason;
      if (parsed.part?.tokens) {
        usage = {
          ...(parsed.part.tokens.input !== undefined
            ? { inputTokens: parsed.part.tokens.input }
            : {}),
          ...(parsed.part.tokens.output !== undefined
            ? { outputTokens: parsed.part.tokens.output }
            : {}),
          ...(parsed.part.tokens.reasoning !== undefined
            ? { reasoningTokens: parsed.part.tokens.reasoning }
            : {})
        };
      }
      continue;
    }

    if (parsed.type === "error") {
      error =
        parsed.error?.data?.message ??
        parsed.error?.name ??
        "Opencode returned an error event.";
    }
  }

  return {
    text: textParts.join(""),
    events,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
    ...(error ? { error } : {})
  };
};
