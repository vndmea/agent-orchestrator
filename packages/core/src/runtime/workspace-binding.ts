import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export interface WorkspaceBindingSummary {
  callerWorkingDirectory: string;
  matchesCallerWorkingDirectory: boolean;
  rootDir: string;
  switchedFrom?: string;
  warning?: string;
}

const canonicalizePath = (value: string): string => {
  const resolvedValue = resolve(value);

  try {
    return realpathSync.native(resolvedValue);
  } catch {
    return resolvedValue;
  }
};

export const buildWorkspaceBindingSummary = (
  rootDir: string,
  callerWorkingDirectory = process.cwd()
): WorkspaceBindingSummary => {
  const normalizedRootDir = canonicalizePath(rootDir);
  const normalizedCallerWorkingDirectory =
    canonicalizePath(callerWorkingDirectory);
  const matchesCallerWorkingDirectory =
    normalizedRootDir === normalizedCallerWorkingDirectory;

  return {
    rootDir: normalizedRootDir,
    callerWorkingDirectory: normalizedCallerWorkingDirectory,
    matchesCallerWorkingDirectory,
    ...(matchesCallerWorkingDirectory
      ? {}
      : {
          switchedFrom: normalizedCallerWorkingDirectory,
          warning:
            `cw is currently bound to ${normalizedRootDir} instead of the caller working directory ${normalizedCallerWorkingDirectory}.`
        })
  };
};
