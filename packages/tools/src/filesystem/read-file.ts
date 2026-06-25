import { readScopedRepositoryFile } from "../repository/file-selection.js";

export const readRepositoryFile = async (
  path: string,
  rootDir = process.cwd(),
  maxFileBytes = 20_000
): Promise<string> =>
  (
    await readScopedRepositoryFile(rootDir, path, maxFileBytes)
  ).content;
