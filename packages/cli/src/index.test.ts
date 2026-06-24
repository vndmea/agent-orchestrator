import { describe, expect, it } from "vitest";

import { buildCli } from "@agent-orchestrator/cli";

const createIo = () => {
  const output: string[] = [];
  const errors: string[] = [];

  return {
    output,
    errors,
    io: {
      write: (message: string) => {
        output.push(message);
      },
      error: (message: string) => {
        errors.push(message);
      }
    }
  };
};

describe("cli parsing", () => {
  it("runs models list", async () => {
    const { io, output } = createIo();
    const cli = buildCli(io);

    await cli.parseAsync(["node", "ao", "models", "list"]);

    expect(output.join("\n")).toContain("\"role\": \"leader\"");
    expect(output.join("\n")).toContain("\"role\": \"worker\"");
  });

  it("lists mcp tools", async () => {
    const { io, output } = createIo();
    const cli = buildCli(io);

    await cli.parseAsync(["node", "ao", "mcp", "list-tools"]);

    expect(output.join("\n")).toContain("ao_plan");
    expect(output.join("\n")).toContain("ao_list_tools");
  });

  it("runs worker list", async () => {
    const { io, output } = createIo();
    const cli = buildCli(io);

    await cli.parseAsync(["node", "ao", "worker", "list"]);

    expect(output.join("\n")).toContain("[");
  });
});
