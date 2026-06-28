import type { TaskSession } from "../schemas/task-session.schema.js";
import type {
  ValidationCheck,
  ValidationReport
} from "../schemas/validation.schema.js";
import { summarizeValidationOutcome } from "../validation/validation-report.js";

export type OutputDetailLevel = "summary" | "full";

export interface ArtifactRef {
  name: string;
  path: string;
}

const TRUNCATION_SUFFIX = "\n...[truncated]";
const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;

const unique = (values: string[]): string[] => Array.from(new Set(values));

const stripAnsi = (value: string): string => value.replace(ANSI_PATTERN, "");

const readValidationOutputLines = (check: ValidationCheck): string[] =>
  [check.stderr, check.stdout]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .split(/\r?\n/u)
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.length > 0);

const isNoiseLine = (line: string): boolean =>
  line.startsWith("$ ") ||
  line.startsWith("[ELIFECYCLE]") ||
  line.startsWith("[WARN]") ||
  line.startsWith("npm error") ||
  line.startsWith("ERR_PNPM_");

const looksLikeErrorFile = (value: string): boolean =>
  /[\\/]/u.test(value) ||
  /\.(?:[cm]?[jt]sx?|json|ya?ml|mjs|cjs)$/iu.test(value);

const firstErrorFile = (check: ValidationCheck): string | undefined =>
  unique(check.diagnosticSummary?.affectedPaths ?? []).find((value) =>
    /[\\/]/u.test(value)
  ) ??
  unique(check.diagnosticSummary?.affectedPaths ?? []).find(looksLikeErrorFile);

const summarizeBuildCheck = (check: ValidationCheck) => ({
  ...(check.status === "failure" && firstErrorFile(check)
    ? { firstErrorFile: firstErrorFile(check) }
    : {}),
  ...(check.status === "failure"
    ? {
        buildErrorFiles: unique(check.diagnosticSummary?.affectedPaths ?? []).filter((value) =>
          /[\\/]/u.test(value)
        ),
        buildErrors: readValidationOutputLines(check)
          .filter(
            (line) =>
              !isNoiseLine(line) &&
              (looksLikeErrorFile(line) ||
                /(error TS\d+:|^Error:|^SyntaxError:| failed\b|Cannot find|could not|did not|unexpected)/iu.test(
                  line
                ))
          )
      }
    : {})
});

const summarizeTypecheckCheck = (check: ValidationCheck, maxBytes: number) => {
  const errors = readValidationOutputLines(check)
    .filter((line) => /error TS\d+:/u.test(line))
    .map((line) => truncateText(line, maxBytes));

  return {
    ...(errors.length > 0 ? { typecheckErrors: errors } : {})
  };
};

const summarizeLintCheck = (check: ValidationCheck, maxBytes: number) => {
  const lines = readValidationOutputLines(check);
  let currentFile = firstErrorFile(check) ?? lines.find(looksLikeErrorFile);
  const lintFindings: Array<{
    column?: number;
    file?: string;
    line?: number;
    message: string;
    rule?: string;
  }> = [];

  for (const line of lines) {
    const lintFindingMatch = line.match(
      /^(\d+):(\d+)\s+error\s+(.+?)\s{2,}([@/\w.-]+)$/u
    );

    if (lintFindingMatch) {
      const [, lineText = "", columnText = "", messageText = "", ruleText = ""] =
        lintFindingMatch;

      lintFindings.push({
        file: currentFile,
        line: Number.parseInt(lineText, 10),
        column: Number.parseInt(columnText, 10),
        message: truncateText(messageText.trim(), maxBytes),
        rule: ruleText
      });
      continue;
    }

    if (looksLikeErrorFile(line)) {
      currentFile = line;
    }
  }

  const firstFinding = lintFindings[0];

  return {
    ...(firstFinding?.file ? { lintFile: firstFinding.file } : {}),
    ...(firstFinding?.rule ? { lintRule: firstFinding.rule } : {}),
    ...(firstFinding?.message ? { lintError: firstFinding.message } : {}),
    ...(lintFindings.length > 0 ? { lintFindings } : {})
  };
};

const summarizeTestCheck = (check: ValidationCheck, maxBytes: number) => {
  const lines = readValidationOutputLines(check);
  const failedTests: Array<{
    file?: string;
    firstStackLine?: string;
    message?: string;
    name: string;
  }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const failedTestMatch = lines[index]?.match(/FAIL\s+(.+?)\s+>\s+(.+)/u);

    if (!failedTestMatch) {
      continue;
    }

    const [, failedFile = "", failedName = ""] = failedTestMatch;

    let message: string | undefined;
    let stackLine: string | undefined;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];

      if (line === undefined || line.length === 0 || line.startsWith("FAIL ")) {
        break;
      }

      if (
        !message &&
        /(?:AssertionError|TypeError|ReferenceError|SyntaxError|RangeError|Error):/u.test(
          line
        )
      ) {
        message = truncateText(line, maxBytes);
      }

      if (
        !stackLine &&
        (/^[>❯]/u.test(line) || /:\d+:\d+\)?$/u.test(line)) &&
        !line.includes("FAIL ")
      ) {
        stackLine = truncateText(line, maxBytes);
      }
    }

    failedTests.push({
      file: failedFile,
      name: truncateText(failedName, maxBytes),
      ...(message ? { message } : {}),
      ...(stackLine ? { firstStackLine: stackLine } : {})
    });
  }

  const firstFailedTest = failedTests[0];

  return {
    ...(firstFailedTest?.name ? { failedTest: firstFailedTest.name } : {}),
    ...(firstFailedTest?.firstStackLine
      ? { firstStackLine: firstFailedTest.firstStackLine }
      : {}),
    ...(failedTests.length > 0 ? { failedTests } : {})
  };
};

const summarizeValidationCheck = (
  check: ValidationCheck,
  maxBytes: number
) => ({
  name: check.name,
  command: check.command,
  status: check.status,
  scriptName: check.scriptName,
  resolutionSource: check.resolutionSource,
  exitCode: check.exitCode,
  timedOut: check.timedOut ?? false,
  affectedPaths: unique(check.diagnosticSummary?.affectedPaths ?? []),
  previewLines: previewValidationLines(check, maxBytes),
  stdoutTruncated: check.stdoutTruncated ?? false,
  stderrTruncated: check.stderrTruncated ?? false,
  ...(check.name === "build"
    ? summarizeBuildCheck(check)
    : check.name === "typecheck"
      ? summarizeTypecheckCheck(check, maxBytes)
      : check.name === "lint"
        ? summarizeLintCheck(check, maxBytes)
        : check.name === "test"
          ? summarizeTestCheck(check, maxBytes)
          : {})
});

const previewValidationLines = (
  check: ValidationCheck,
  maxBytes: number
): string[] => {
  const preferred = check.diagnosticSummary?.previewLines ?? [];

  if (preferred.length > 0) {
    return preferred.map((line) => truncateText(line, maxBytes));
  }

  const raw = [check.stderr, check.stdout]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 5)
    .map((line) => truncateText(line, maxBytes));
};

export const truncateText = (value: string, maxBytes = 4_000): string => {
  if (maxBytes <= 0 || Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }

  const budget = Math.max(0, maxBytes - Buffer.byteLength(TRUNCATION_SUFFIX, "utf8"));
  let end = value.length;

  while (end > 0) {
    const candidate = value.slice(0, end);

    if (Buffer.byteLength(candidate, "utf8") <= budget) {
      return `${candidate}${TRUNCATION_SUFFIX}`;
    }

    end -= 1;
  }

  return TRUNCATION_SUFFIX.trimStart();
};

export const buildArtifactRefs = (
  artifacts: Record<string, string>
): ArtifactRef[] =>
  Object.entries(artifacts).map(([name, path]) => ({
    name,
    path
  }));

export const createTaskSessionSummary = (
  session: TaskSession,
  includeArtifactRefs = true
) => ({
  taskId: session.taskId,
  goal: session.goal,
  scope: session.scope,
  workerId: session.workerId,
  status: session.status,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  warningCount: session.warnings.length,
  errorCount: session.errors.length,
  steps: session.steps.map((step) => ({
    id: step.id,
    name: step.name,
    status: step.status,
    artifactPath: step.artifactPath
  })),
  ...(includeArtifactRefs
    ? {
        artifactRefs: buildArtifactRefs(session.artifacts)
      }
    : {})
});

export const createTaskSessionReportSummary = (
  session: TaskSession,
  report: string,
  maxBytes = 4_000,
  includeArtifactRefs = true
) => ({
  ...createTaskSessionSummary(session, includeArtifactRefs),
  reportPath: session.artifacts["report.md"],
  reportPreview: truncateText(report, maxBytes)
});

export const summarizeValidationReport = (
  report: ValidationReport,
  maxBytes = 2_000
) => {
  const outcome = summarizeValidationOutcome(report);

  return {
    ok: report.ok,
    confidence: outcome.confidence,
    summary: outcome.summary,
    warnings: report.warnings,
    failedChecks: outcome.failedChecks,
    notConfiguredChecks: outcome.notConfiguredChecks,
    dryRunChecks: outcome.dryRunChecks,
    skippedChecks: outcome.skippedChecks,
    checks: report.checks.map((check) => summarizeValidationCheck(check, maxBytes))
  };
};
