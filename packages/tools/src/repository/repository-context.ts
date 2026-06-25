import type {
  ExecutionContext,
  RepositoryContextPack
} from "@agent-orchestrator/core";

import { readGitDiff, type ReadGitDiffOptions } from "./git-diff.js";
import { readPackageMetadata } from "./package-metadata.js";
import { selectRepositoryFiles } from "./file-selection.js";

export interface BuildRepositoryContextOptions {
  diffBase?: string;
  diffHead?: string;
  files?: string[];
  includeDiff?: boolean;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  rootDir: string;
  scope?: string;
}

export const buildRepositoryContextPack = async (
  context: ExecutionContext,
  options: BuildRepositoryContextOptions
): Promise<RepositoryContextPack> => {
  const fileSelection = await selectRepositoryFiles({
    rootDir: options.rootDir,
    scope: options.scope,
    files: options.files,
    maxFileBytes: options.maxFileBytes ?? 20_000,
    maxTotalBytes: options.maxTotalBytes ?? 120_000
  });
  const packageMetadata = await readPackageMetadata(
    options.rootDir,
    options.scope
  );
  const gitDiff = options.includeDiff
    ? await readGitDiff(context, {
        base: options.diffBase,
        head: options.diffHead,
        maxBytes: options.maxTotalBytes ?? 120_000
      } satisfies ReadGitDiffOptions)
    : undefined;

  return {
    rootDir: options.rootDir,
    scope: options.scope,
    files: fileSelection.files,
    selectedFiles: fileSelection.selectedFiles,
    packageMetadata,
    gitDiff,
    warnings: fileSelection.warnings,
    generatedAt: new Date().toISOString()
  };
};
