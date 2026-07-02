const SQLITE_EXPERIMENTAL_WARNING = "SQLite is an experimental feature";
const WARNING_FILTER_INSTALLED = Symbol.for(
  "mcp-code-worker.cli-warning-filter-installed"
);

type EmitWarningArgs = Parameters<NodeJS.Process["emitWarning"]>;
type EmitWarningRestArgs = EmitWarningArgs extends [unknown, ...infer Rest]
  ? Rest
  : never;

export const installCliWarningFilter = (): void => {
  const processWithFlag = process as NodeJS.Process & {
    [WARNING_FILTER_INSTALLED]?: boolean;
  };

  if (processWithFlag[WARNING_FILTER_INSTALLED]) {
    return;
  }

  processWithFlag[WARNING_FILTER_INSTALLED] = true;
  const originalEmitWarning: (
    warning: EmitWarningArgs[0],
    ...args: EmitWarningRestArgs
  ) => void = process.emitWarning.bind(process);

  process.emitWarning = ((
    warning: EmitWarningArgs[0],
    ...args: EmitWarningRestArgs
  ) => {
    const message = typeof warning === "string" ? warning : warning.message;
    const warningName = typeof args[0] === "string"
      ? args[0]
      : typeof warning === "object"
        ? warning.name
        : undefined;

    if (warningName === "ExperimentalWarning" && message.includes(SQLITE_EXPERIMENTAL_WARNING)) {
      return;
    }

    return originalEmitWarning(warning, ...args);
  }) as typeof process.emitWarning;
};
