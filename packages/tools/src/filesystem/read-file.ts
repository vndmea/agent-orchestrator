import { readFile } from "node:fs/promises";

export const readRepositoryFile = async (path: string): Promise<string> =>
  readFile(path, "utf8");
