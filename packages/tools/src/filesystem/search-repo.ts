import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "dist",
  "coverage",
  "node_modules"
]);

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

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

export const searchRepository = async (
  rootDir: string,
  pattern: string | RegExp
): Promise<SearchMatch[]> => {
  const matches: SearchMatch[] = [];
  const matcher =
    typeof pattern === "string"
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")
      : pattern;

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) {
            await walk(fullPath);
          }
          return;
        }

        if (!TEXT_EXTENSIONS.has(extname(entry.name))) {
          return;
        }

        const fileStats = await stat(fullPath);
        if (fileStats.size > 1024 * 1024) {
          return;
        }

        const contents = await readFile(fullPath, "utf8");
        contents.split(/\r?\n/u).forEach((line, index) => {
          if (matcher.test(line)) {
            matches.push({
              file: fullPath,
              line: index + 1,
              text: line
            });
          }
        });
      })
    );
  };

  await walk(rootDir);
  return matches;
};
