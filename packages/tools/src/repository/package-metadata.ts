import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { PackageMetadata } from "@agent-orchestrator/core";

import { resolveRepositoryScope } from "./file-selection.js";

export const readPackageMetadata = async (
  rootDir: string,
  scope?: string
): Promise<PackageMetadata | undefined> => {
  const scopedRoot = resolveRepositoryScope(rootDir, scope);
  const packageJsonPath = join(scopedRoot, "package.json");

  try {
    const contents = await readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(contents) as {
      packageManager?: string;
      scripts?: Record<string, string>;
      workspaces?: string[] | { packages?: string[] };
    };

    return {
      packageManager: parsed.packageManager,
      packageJsonPath: relative(rootDir, packageJsonPath).replaceAll("\\", "/"),
      scripts: parsed.scripts ?? {},
      workspaces: Array.isArray(parsed.workspaces)
        ? parsed.workspaces
        : parsed.workspaces?.packages ?? []
    };
  } catch {
    return undefined;
  }
};
