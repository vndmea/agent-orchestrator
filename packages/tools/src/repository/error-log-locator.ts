const normalize = (value: string): string => value.replaceAll("\\", "/");

export const locateErrorLogPaths = (
  errorLog: string | undefined,
  candidatePaths: string[]
): string[] => {
  if (!errorLog?.trim()) {
    return [];
  }

  const normalizedCandidates = candidatePaths.map((path) => normalize(path));
  const matched = new Set<string>();

  for (const candidate of normalizedCandidates) {
    if (errorLog.includes(candidate)) {
      matched.add(candidate);
      continue;
    }

    const basename = candidate.split("/").at(-1);
    if (basename && errorLog.includes(basename)) {
      matched.add(candidate);
    }
  }

  return Array.from(matched);
};
