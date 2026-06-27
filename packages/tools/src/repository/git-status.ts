import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  type DirtyWorktree,
  DirtyWorktreeSchema,
  type ExecutionContext
} from "@mcp-code-worker/core";

import { runSafeCommand } from "../shell/safe-command.js";

const IGNORED_LOCAL_PREFIXES = ["tmp/"] as const;

const normalizeGitPath = (path: string): string =>
  path.replaceAll("\\", "/").replace(/^\.\/+/u, "");

const shouldIgnorePath = (path: string): boolean => {
  const normalized = normalizeGitPath(path);
  return IGNORED_LOCAL_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)
  );
};

const extractPath = (rawLine: string): string => {
  const pathPart = rawLine.slice(3).trim();
  if (pathPart.includes(" -> ")) {
    return pathPart.split(" -> ").at(-1)?.trim() ?? pathPart;
  }

  return pathPart;
};

export const parseDirtyWorktree = (stdout: string): DirtyWorktree => {
  const summary: DirtyWorktree = {
    ignoredFiles: [],
    stagedFiles: [],
    modifiedFiles: [],
    untrackedFiles: [],
    rawStatus: []
  };

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    summary.rawStatus.push(line);
    const x = line[0] ?? " ";
    const y = line[1] ?? " ";
    const path = normalizeGitPath(extractPath(line));

    if (shouldIgnorePath(path)) {
      summary.ignoredFiles.push(path);
      continue;
    }

    if (x === "?" && y === "?") {
      summary.untrackedFiles.push(path);
      continue;
    }

    if (x !== " ") {
      summary.stagedFiles.push(path);
    }

    if (y !== " ") {
      summary.modifiedFiles.push(path);
    }
  }

  return DirtyWorktreeSchema.parse({
    ignoredFiles: Array.from(new Set(summary.ignoredFiles)),
    stagedFiles: Array.from(new Set(summary.stagedFiles)),
    modifiedFiles: Array.from(new Set(summary.modifiedFiles)),
    untrackedFiles: Array.from(new Set(summary.untrackedFiles)),
    rawStatus: summary.rawStatus
  });
};

export const hasBlockingDirtyWorktree = (summary: DirtyWorktree): boolean =>
  summary.stagedFiles.length > 0 ||
  summary.modifiedFiles.length > 0 ||
  summary.untrackedFiles.length > 0;

const collectIgnoredLocalArtifacts = async (
  rootDir: string
): Promise<string[]> => {
  const ignoredFiles = new Set<string>();

  const walk = async (directory: string): Promise<void> => {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        ignoredFiles.add(relative(rootDir, fullPath).replaceAll("\\", "/"));
      }
    } catch {
      return;
    }
  };

  for (const prefix of IGNORED_LOCAL_PREFIXES) {
    await walk(join(rootDir, prefix.slice(0, -1)));
  }

  return Array.from(ignoredFiles).sort();
};

export const readDirtyWorktree = async (
  context: ExecutionContext
): Promise<DirtyWorktree> => {
  const result = await runSafeCommand("git status --short", context, {
    commandKind: "read-only",
    maxOutputBytes: 120_000,
    timeoutMs: 120_000
  });

  if (result.code !== 0) {
    if (/not a git repository/iu.test(result.stderr)) {
      return DirtyWorktreeSchema.parse({
        ignoredFiles: [],
        stagedFiles: [],
        modifiedFiles: [],
        untrackedFiles: [],
        rawStatus: []
      });
    }

    throw new Error(
      result.stderr || `git status failed in ${resolve(context.rootDir)}.`
    );
  }

  const summary = parseDirtyWorktree(result.stdout);
  const ignoredFiles = await collectIgnoredLocalArtifacts(context.rootDir);

  return DirtyWorktreeSchema.parse({
    ...summary,
    ignoredFiles: Array.from(
      new Set([...summary.ignoredFiles, ...ignoredFiles])
    ).sort()
  });
};
