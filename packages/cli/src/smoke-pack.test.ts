import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const repoRoot = process.cwd();
const cliPackageDir = join(repoRoot, "packages", "cli");
const publishDir = join(cliPackageDir, ".publish");
const installedCwPath = (prefixDir: string): string =>
  join(prefixDir, "node_modules", ".bin", process.platform === "win32" ? "cw.cmd" : "cw");

const tempPaths: string[] = [];

const trackTempDir = async (prefix: string): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), prefix));
  tempPaths.push(path);
  return path;
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

const stripAnsi = (value: string): string =>
  value.replaceAll(/\u001b\[[0-9;]*m/g, "");

const parsePackEntries = (stdout: string): Array<{ filename: string }> => {
  const normalized = stripAnsi(stdout).trim();
  const match = normalized.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/);

  if (!match) {
    throw new Error(`Unable to parse npm pack output: ${normalized}`);
  }

  return JSON.parse(match[1] ?? "[]") as Array<{ filename: string }>;
};

const runCommand = async (
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> =>
  process.platform === "win32"
    ? execFile("cmd.exe", ["/d", "/s", "/c", command, ...args], { cwd })
    : execFile(command, args, { cwd });

describe("cli packed tarball smoke", () => {
  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0, tempPaths.length).map((path) =>
        rm(path, {
          force: true,
          recursive: true
        })
      )
    );
  });

  it("installs from npm pack output and runs the cw bin shim", async () => {
    const installPrefix = await trackTempDir("cw-pack-prefix-");
    const workspaceRoot = await trackTempDir("cw-pack-workspace-");

    await runCommand("pnpm", ["run", "prepare:publish"], cliPackageDir);

    const pack = await runCommand("npm", ["pack", "--json"], publishDir);
    const packEntries = parsePackEntries(pack.stdout);
    const filename = packEntries[0]?.filename;
    expect(filename).toBeTruthy();
    if (!filename) {
      throw new Error("npm pack did not return a tarball filename");
    }
    const tarballPath = join(publishDir, filename);

    try {
      await runCommand(
        "npm",
        ["install", "--prefix", installPrefix, "--no-audit", "--no-fund", tarballPath],
        repoRoot
      );

      const cwPath = installedCwPath(installPrefix);

      const help = await runCommand(cwPath, ["--help"], workspaceRoot);
      expect(help.stdout).toContain("MCP Code Worker CLI");

      const doctor = await runCommand(cwPath, ["doctor"], workspaceRoot);
      expect(JSON.parse(doctor.stdout) as { checks: unknown[] }).toHaveProperty("checks");

      const tools = await runCommand(cwPath, ["mcp", "list-tools"], workspaceRoot);
      expect(listToolNames(tools.stdout)).toContain("cw_start_task");
    } finally {
      await rm(tarballPath, { force: true });
    }
  }, 120_000);
});
