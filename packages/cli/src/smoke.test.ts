import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const withTempCwd = async (
  callback: (rootDir: string) => Promise<void>
): Promise<void> => {
  const originalCwd = process.cwd();
  const rootDir = await mkdtemp(join(tmpdir(), "ao-smoke-"));

  try {
    process.chdir(rootDir);
    await callback(rootDir);
  } finally {
    process.chdir(originalCwd);
  }
};

const parseLastJson = <T>(output: string[]): T =>
  JSON.parse(output.at(-1) ?? "{}") as T;

describe("cli smoke", () => {
  it("renders help and basic local commands without network access", async () => {
    await withTempCwd(async () => {
      const { io, output } = createIo();
      const cli = buildCli(io);

      output.push(cli.helpInformation());
      expect(output[0]).toContain("Agent Orchestrator CLI");

      await cli.parseAsync(["node", "ao", "doctor"]);
      expect(parseLastJson<{ checks: unknown[] }>(output).checks.length).toBeGreaterThan(0);

      await cli.parseAsync(["node", "ao", "models", "list"]);
      expect(parseLastJson<Array<{ role: string }>>(output).some((item) => item.role === "leader")).toBe(true);

      await cli.parseAsync(["node", "ao", "mcp", "list-tools"]);
      expect(parseLastJson<Array<{ name: string }>>(output).some((item) => item.name === "ao_start_task")).toBe(true);

      await cli.parseAsync(["node", "ao", "mcp", "config"]);
      expect(parseLastJson<{ mcpServers: Record<string, unknown> }>(output).mcpServers["agent-orchestrator"]).toBeTruthy();

      await cli.parseAsync(["node", "ao", "audit", "list"]);
      expect(Array.isArray(parseLastJson<unknown[]>(output))).toBe(true);

      await cli.parseAsync(["node", "ao", "worker", "registry", "list"]);
      expect(Array.isArray(parseLastJson<unknown[]>(output))).toBe(true);
    });
  });
});
