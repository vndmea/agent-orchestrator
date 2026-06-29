import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const distCliPath = join(process.cwd(), "packages", "cli", "dist", "main.js");

const withTempCwd = async (
  callback: (rootDir: string) => Promise<void>
): Promise<void> => {
  const rootDir = await mkdtemp(join(tmpdir(), "cw-smoke-dist-"));
  await callback(rootDir);
};

const withTempHome = async (
  callback: (homeDir: string) => Promise<void>
): Promise<void> => {
  const homeDir = await mkdtemp(join(tmpdir(), "cw-smoke-home-"));
  await callback(homeDir);
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

const writeCodexConfig = async (
  homeDir: string,
  config: {
    args: string[];
    command: string;
    env?: Record<string, string>;
  }
): Promise<void> => {
  const codexDir = join(homeDir, ".codex");
  const codexConfigPath = join(codexDir, "config.toml");
  const envEntries = Object.entries(config.env ?? {});
  const envBlock =
    envEntries.length > 0
      ? [
          "",
          `[mcp_servers."mcp-code-worker".env]`,
          ...envEntries.map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
        ].join("\n")
      : "";
  const contents = [
    `[mcp_servers."mcp-code-worker"]`,
    `command = ${JSON.stringify(config.command)}`,
    `args = ${JSON.stringify(config.args)}`,
    envBlock
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  await mkdir(codexDir, { recursive: true });
  await writeFile(codexConfigPath, contents, "utf8");
};

describe("cli dist smoke", () => {
  it("runs the built cli entrypoint without network access", async () => {
    await withTempCwd(async (rootDir) => {
      const help = await execFile("node", [distCliPath, "--help"], {
        cwd: rootDir
      });
      expect(help.stdout).toContain("MCP Code Worker CLI");

      const doctor = await execFile("node", [distCliPath, "doctor"], {
        cwd: rootDir
      });
      expect(JSON.parse(doctor.stdout) as { checks: unknown[] }).toHaveProperty("checks");

      const tools = await execFile("node", [distCliPath, "mcp", "list-tools"], {
        cwd: rootDir
      });
      const toolNames = listToolNames(tools.stdout);
      expect(toolNames).toContain("cw_start_task");

      const config = await execFile("node", [distCliPath, "mcp", "config"], {
        cwd: rootDir
      });
      expect(
        (JSON.parse(config.stdout) as { mcpServers: Record<string, unknown> }).mcpServers[
          "mcp-code-worker"
        ]
      ).toBeTruthy();
    });
  }, 15_000);

  it("tests live MCP launch and tool discovery through doctor --mcp", async () => {
    await withTempCwd(async (rootDir) => {
      await withTempHome(async (homeDir) => {
        await writeCodexConfig(homeDir, {
          command: process.execPath,
          args: [distCliPath, "mcp", "serve"]
        });

        const env = {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
          HOMEDRIVE: undefined,
          HOMEPATH: undefined
        };
        const doctor = await execFile(
          "node",
          [distCliPath, "doctor", "--mcp", "--host", "codex"],
          {
            cwd: rootDir,
            env
          }
        );
        const result = JSON.parse(doctor.stdout) as {
          checks?: Array<{ name: string; status: string }>;
        };

        expect(
          result.checks?.some(
            (check) =>
              check.name === "mcp-server-launchable" && check.status === "pass"
          )
        ).toBe(true);
        expect(
          result.checks?.some(
            (check) => check.name === "mcp-connection" && check.status === "pass"
          )
        ).toBe(true);
        expect(
          result.checks?.some(
            (check) =>
              check.name === "mcp-tool-catalog-match" && check.status === "pass"
          )
        ).toBe(true);
      });
    });
  }, 20_000);
});
