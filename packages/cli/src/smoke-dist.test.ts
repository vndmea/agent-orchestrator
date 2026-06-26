import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const distCliPath = join(process.cwd(), "packages", "cli", "dist", "main.js");

const withTempCwd = async (
  callback: (rootDir: string) => Promise<void>
): Promise<void> => {
  const rootDir = await mkdtemp(join(tmpdir(), "ao-smoke-dist-"));
  await callback(rootDir);
};

const listToolNames = (stdout: string): string[] => {
  const parsed = JSON.parse(stdout) as
    | Array<{ name: string }>
    | {
        groups?: Array<{
          tools: Array<{ name: string }>;
        }>;
      };

  return Array.isArray(parsed)
    ? parsed.map((tool) => tool.name)
    : (parsed.groups ?? []).flatMap((group) => group.tools.map((tool) => tool.name));
};

describe("cli dist smoke", () => {
  it("runs the built cli entrypoint without network access", async () => {
    await withTempCwd(async (rootDir) => {
      const help = await execFile("node", [distCliPath, "--help"], {
        cwd: rootDir
      });
      expect(help.stdout).toContain("Agent Orchestrator CLI");

      const doctor = await execFile("node", [distCliPath, "doctor"], {
        cwd: rootDir
      });
      expect(JSON.parse(doctor.stdout) as { checks: unknown[] }).toHaveProperty("checks");

      const tools = await execFile("node", [distCliPath, "mcp", "list-tools"], {
        cwd: rootDir
      });
      const toolNames = listToolNames(tools.stdout);
      expect(toolNames).toContain("ao_start_task");

      const config = await execFile("node", [distCliPath, "mcp", "config"], {
        cwd: rootDir
      });
      expect(
        (JSON.parse(config.stdout) as { mcpServers: Record<string, unknown> }).mcpServers[
          "agent-orchestrator"
        ]
      ).toBeTruthy();
    });
  }, 15_000);
});
