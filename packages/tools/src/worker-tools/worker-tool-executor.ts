import { readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import type {
  ExecutionContext,
  PatchProposal,
  WorkerToolPermissionDecision,
  WorkerToolRequest,
  WorkerToolResult
} from "@mcp-code-worker/core";

import { inspectPatch } from "../patch/patch-inspector.js";
import { readGitDiff } from "../repository/git-diff.js";
import {
  readScopedRepositoryFile,
  resolveRepositoryScope
} from "../repository/file-selection.js";
import { runRepositoryValidation } from "../repository/validation.js";

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules"
]);

export interface ExecuteWorkerToolRequestOptions {
  patchProposal?: PatchProposal;
}

const toRelativePath = (rootDir: string, path: string): string =>
  relative(rootDir, path).replaceAll("\\", "/");

const wildcardToRegExp = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join(".*")}$`,
    "iu"
  );

const truncate = (
  text: string,
  maxBytes: number | undefined
): { text: string; truncated: boolean } => {
  if (!maxBytes || Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(0, maxBytes),
    truncated: true
  };
};

const ensureExecutable = (
  decision: WorkerToolPermissionDecision
): void => {
  if (!decision.allowed) {
    throw new Error(`Worker tool request is not allowed: ${decision.reason}`);
  }
};

const walkTextFiles = async (
  rootDir: string,
  scope?: string
): Promise<string[]> => {
  const scopeRoot = resolveRepositoryScope(rootDir, scope);
  const files: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(fullPath);
        }
        continue;
      }

      if (!TEXT_EXTENSIONS.has(extname(entry.name))) {
        continue;
      }

      const fileStat = await stat(fullPath);
      if (fileStat.size <= 1024 * 1024) {
        files.push(toRelativePath(rootDir, fullPath));
      }
    }
  };

  await walk(scopeRoot);
  return files;
};

const executeSearchFiles = async (
  context: ExecutionContext,
  request: Extract<WorkerToolRequest, { action: "search_files" }>
): Promise<WorkerToolResult> => {
  const matcher = wildcardToRegExp(request.glob);
  const maxResults = request.limits.maxResults ?? 20;
  const files = await walkTextFiles(context.rootDir, request.scope);
  const matches = files
    .filter((file) => matcher.test(file))
    .slice(0, maxResults);

  return {
    requestId: request.id,
    action: request.action,
    ok: true,
    summary: `Found ${matches.length} file match(es).`,
    evidence: matches.map((path) => ({ path })),
    truncated: matches.length < files.filter((file) => matcher.test(file)).length,
    warnings: []
  };
};

const executeSearchText = async (
  context: ExecutionContext,
  request: Extract<WorkerToolRequest, { action: "search_text" }>
): Promise<WorkerToolResult> => {
  const maxResults = request.limits.maxResults ?? 20;
  const candidateFiles = request.paths?.length
    ? request.paths
    : await walkTextFiles(context.rootDir, request.scope);
  const evidence: WorkerToolResult["evidence"] = [];

  for (const path of candidateFiles) {
    if (evidence.length >= maxResults) {
      break;
    }

    const file = await readScopedRepositoryFile(context.rootDir, path);
    const lines = file.content.split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (evidence.length < maxResults && line.includes(request.query)) {
        evidence.push({
          path: file.path,
          lineStart: index + 1,
          lineEnd: index + 1,
          snippet: line
        });
      }
    });
  }

  return {
    requestId: request.id,
    action: request.action,
    ok: true,
    summary: `Found ${evidence.length} text match(es).`,
    evidence,
    truncated: evidence.length >= maxResults,
    warnings: []
  };
};

const executeReadFileSnippet = async (
  context: ExecutionContext,
  request: Extract<WorkerToolRequest, { action: "read_file_snippet" }>
): Promise<WorkerToolResult> => {
  const file = await readScopedRepositoryFile(context.rootDir, request.path);
  const lines = file.content.split(/\r?\n/u);
  let startLine = 1;
  let endLine = Math.min(lines.length, 40);

  const selector = request.selector;

  if (selector.kind === "line-range") {
    startLine = Math.max(1, selector.startLine);
    endLine = Math.min(lines.length, selector.endLine);
  } else {
    const matchIndex = lines.findIndex((line) =>
      line.includes(selector.query)
    );
    const contextLines = selector.contextLines ?? 3;
    if (matchIndex >= 0) {
      startLine = Math.max(1, matchIndex + 1 - contextLines);
      endLine = Math.min(lines.length, matchIndex + 1 + contextLines);
    }
  }

  const snippet = lines.slice(startLine - 1, endLine).join("\n");
  const truncated = truncate(snippet, request.limits.maxBytes);

  return {
    requestId: request.id,
    action: request.action,
    ok: true,
    summary: `Read ${endLine - startLine + 1} line(s) from ${file.path}.`,
    evidence: [
      {
        path: file.path,
        lineStart: startLine,
        lineEnd: endLine,
        snippet: truncated.text
      }
    ],
    truncated: truncated.truncated,
    warnings: []
  };
};

const executeReadGitDiff = async (
  context: ExecutionContext,
  request: Extract<WorkerToolRequest, { action: "read_git_diff" }>
): Promise<WorkerToolResult> => {
  const diff = await readGitDiff(context, {
    base: request.base,
    head: request.head
  });
  const truncated = truncate(diff.diffText, request.limits.maxBytes ?? 8000);

  return {
    requestId: request.id,
    action: request.action,
    ok: true,
    summary: `Read git diff with ${diff.changedFiles.length} changed file(s).`,
    evidence: [
      {
        snippet: truncated.text,
        metadata: {
          changedFiles: diff.changedFiles,
          base: diff.base,
          head: diff.head
        }
      }
    ],
    truncated: diff.truncated || truncated.truncated,
    warnings: []
  };
};

const executeInspectPatch = async (
  context: ExecutionContext,
  request: Extract<WorkerToolRequest, { action: "inspect_patch" }>,
  options: ExecuteWorkerToolRequestOptions
): Promise<WorkerToolResult> => {
  if (!options.patchProposal) {
    return {
      requestId: request.id,
      action: request.action,
      ok: false,
      summary: "No patch proposal was supplied for inspection.",
      evidence: [],
      truncated: false,
      warnings: ["Missing patch proposal."]
    };
  }

  const inspection = await inspectPatch(context, options.patchProposal, {
    scope: request.scope
  });

  return {
    requestId: request.id,
    action: request.action,
    ok: inspection.ok,
    summary: inspection.ok
      ? "Patch inspection passed."
      : `Patch inspection blocked the proposal: ${inspection.blockedReasons.join(" | ")}.`,
    evidence: inspection.files.map((file) => ({
      path: file.path,
      metadata: file
    })),
    truncated: false,
    warnings: inspection.warnings
  };
};

const validationCommandOptions = (
  commandId: string
): Parameters<typeof runRepositoryValidation>[1] => {
  switch (commandId) {
    case "build":
      return { build: true };
    case "lint":
      return { lint: true };
    case "test":
      return { test: true };
    case "typecheck":
      return { typecheck: true };
    case "all":
      return { all: true };
    default:
      throw new Error(`Unknown validation command id: ${commandId}`);
  }
};

const executeRunValidationCommand = async (
  context: ExecutionContext,
  request: Extract<WorkerToolRequest, { action: "run_validation_command" }>
): Promise<WorkerToolResult> => {
  const report = await runRepositoryValidation(context, {
    ...validationCommandOptions(request.commandId),
    scope: request.scope
  });

  return {
    requestId: request.id,
    action: request.action,
    ok: report.ok,
    summary: report.ok
      ? `Validation command ${request.commandId} completed successfully.`
      : `Validation command ${request.commandId} did not pass.`,
    evidence: report.checks.map((check) => ({
      metadata: {
        name: check.name,
        command: check.command,
        status: check.status,
        exitCode: check.exitCode,
        diagnosticSummary: check.diagnosticSummary
      },
      snippet: [check.stderr, check.stdout].filter(Boolean).join("\n").slice(0, 4000)
    })),
    truncated: report.checks.some(
      (check) => check.stdoutTruncated || check.stderrTruncated
    ),
    warnings: report.warnings
  };
};

export const executeWorkerToolRequest = async (
  context: ExecutionContext,
  request: WorkerToolRequest,
  decision: WorkerToolPermissionDecision,
  options: ExecuteWorkerToolRequestOptions = {}
): Promise<WorkerToolResult> => {
  ensureExecutable(decision);

  switch (request.action) {
    case "search_files":
      return executeSearchFiles(context, request);
    case "search_text":
      return executeSearchText(context, request);
    case "read_file_snippet":
      return executeReadFileSnippet(context, request);
    case "read_git_diff":
      return executeReadGitDiff(context, request);
    case "inspect_patch":
      return executeInspectPatch(context, request, options);
    case "run_validation_command":
      return executeRunValidationCommand(context, request);
  }
};
