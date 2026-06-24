import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const readGitDiff = async (range?: string): Promise<string> => {
  const args = ["diff", "--no-ext-diff"];
  if (range) {
    args.push(range);
  }

  const { stdout } = await execFileAsync("git", args, {
    maxBuffer: 1024 * 1024
  });

  return stdout;
};
