import type { RepositoryFileContent } from "@agent-orchestrator/core";

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/gu;

const TEXT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

const hasKnownExtension = (path: string): boolean =>
  TEXT_EXTENSIONS.some((extension) => path.endsWith(extension));

const normalize = (value: string): string => value.replaceAll("\\", "/");

const dirname = (path: string): string => {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
};

const joinPath = (base: string, child: string): string => {
  const segments = [...base.split("/"), ...child.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
};

const resolveLocalImport = (
  fromPath: string,
  specifier: string,
  candidates: Set<string>
): string | undefined => {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const basePath = joinPath(dirname(fromPath), specifier);
  const possibilities = hasKnownExtension(basePath)
    ? [basePath]
    : [
        ...TEXT_EXTENSIONS.map((extension) => `${basePath}${extension}`),
        ...TEXT_EXTENSIONS.map((extension) => `${basePath}/index${extension}`)
      ];

  return possibilities.find((path) => candidates.has(path));
};

export const buildLocalDependencyGraph = (
  files: RepositoryFileContent[]
): Map<string, Set<string>> => {
  const candidates = new Set(files.map((file) => normalize(file.path)));
  const graph = new Map<string, Set<string>>();

  for (const file of files) {
    const normalizedPath = normalize(file.path);
    const imports = new Set<string>();
    for (const match of file.content.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) {
        continue;
      }

      const resolved = resolveLocalImport(normalizedPath, specifier, candidates);
      if (resolved) {
        imports.add(resolved);
      }
    }

    graph.set(normalizedPath, imports);
  }

  return graph;
};
