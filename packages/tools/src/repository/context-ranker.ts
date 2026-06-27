import type { RepositoryFileContent, SelectionReason } from "@mcp-code-worker/core";

import { buildLocalDependencyGraph } from "./dependency-graph.js";
import { locateErrorLogPaths } from "./error-log-locator.js";

const normalize = (value: string): string => value.replaceAll("\\", "/");

const basenameWithoutKnownSuffix = (path: string): string =>
  normalize(path)
    .split("/")
    .at(-1)
    ?.replace(/\.(test|spec)\.[^.]+$/u, "")
    .replace(/\.[^.]+$/u, "") ?? "";

const buildTestAssociations = (
  files: RepositoryFileContent[]
): Map<string, Set<string>> => {
  const associations = new Map<string, Set<string>>();
  const byBaseName = new Map<string, string[]>();

  for (const file of files) {
    const baseName = basenameWithoutKnownSuffix(file.path);
    const paths = byBaseName.get(baseName) ?? [];
    paths.push(normalize(file.path));
    byBaseName.set(baseName, paths);
  }

  for (const paths of byBaseName.values()) {
    for (const path of paths) {
      associations.set(path, new Set(paths.filter((candidate) => candidate !== path)));
    }
  }

  return associations;
};

export const rankRepositoryContextFiles = (input: {
  errorLog?: string;
  files: RepositoryFileContent[];
  scope?: string;
}): {
  rankedFiles: RepositoryFileContent[];
  selectionReasons: SelectionReason[];
} => {
  const dependencyGraph = buildLocalDependencyGraph(input.files);
  const testAssociations = buildTestAssociations(input.files);
  const candidatePaths = input.files.map((file) => normalize(file.path));
  const mentionedByErrorLog = new Set(
    locateErrorLogPaths(input.errorLog, candidatePaths)
  );
  const reverseDependencyGraph = new Map<string, Set<string>>();

  for (const [fromPath, targets] of dependencyGraph.entries()) {
    for (const target of targets) {
      const importers = reverseDependencyGraph.get(target) ?? new Set<string>();
      importers.add(fromPath);
      reverseDependencyGraph.set(target, importers);
    }
  }

  const scored = input.files.map((file) => {
    const path = normalize(file.path);
    let score = 1;
    const reasons: string[] = ["Readable repository file"];

    if (
      input.scope &&
      (path === input.scope || path.startsWith(`${input.scope.replaceAll("\\", "/")}/`))
    ) {
      score += 0.5;
      reasons.push(`Inside requested scope ${input.scope}`);
    }

    if (mentionedByErrorLog.has(path)) {
      score += 10;
      reasons.push("Mentioned directly in the error log");
    }

    const dependencyNeighbors = dependencyGraph.get(path) ?? new Set<string>();
    const importerNeighbors = reverseDependencyGraph.get(path) ?? new Set<string>();
    if (
      [...dependencyNeighbors, ...importerNeighbors].some((neighbor) =>
        mentionedByErrorLog.has(neighbor)
      )
    ) {
      score += 4;
      reasons.push("Dependency-adjacent to an error-log match");
    }

    const associatedTests = testAssociations.get(path) ?? new Set<string>();
    if ([...associatedTests].some((neighbor) => mentionedByErrorLog.has(neighbor))) {
      score += 3;
      reasons.push("Associated with a matched test or source file");
    }

    if (/package\.json$|tsconfig\.json$/u.test(path)) {
      score += 1.5;
      reasons.push("Important project configuration file");
    }

    return {
      file,
      path,
      score,
      reason: reasons.join("; ")
    };
  });

  const rankedFiles = scored
    .slice()
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((entry) => entry.file);
  const selectionReasons = scored
    .filter((entry) => rankedFiles.some((file) => normalize(file.path) === entry.path))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((entry) => ({
      path: entry.path,
      reason: entry.reason,
      score: Number(entry.score.toFixed(2))
    }));

  return {
    rankedFiles,
    selectionReasons
  };
};
