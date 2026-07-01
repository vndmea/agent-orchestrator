import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import { z } from "zod";

import {
  PatchProposalSchema,
  RepositoryContextPackSchema,
  ValidationReportSchema,
  WorkerCapabilityProfileSchema,
  type ExecutionContext,
  type PatchProposal,
  type RepositoryContextPack,
  type ValidationReport,
  type WorkerCapability,
  type WorkerCapabilityProfile
} from "@mcp-code-worker/core";
import { ModelRouter, invokeStructured } from "@mcp-code-worker/models";

const PatchGenerationInputSchema = z.object({
  errorLog: z.string().optional(),
  fixResult: z.unknown().optional(),
  goal: z.string().min(1),
  repositoryContext: RepositoryContextPackSchema,
  reviewResult: z.unknown().optional(),
  scope: z.string().optional(),
  validationReport: ValidationReportSchema.optional(),
  workerId: z.string().min(1),
  workerProfile: WorkerCapabilityProfileSchema.nullable().optional()
});

const capability: WorkerCapability = {
  name: "patch-generation-worker",
  description: "Generates structured patch proposals for later inspection and gated apply.",
  inputSchema: PatchGenerationInputSchema,
  outputSchema: PatchProposalSchema,
  supportedTaskTypes: ["patch-generation"],
  preferredModel: "worker",
  costTier: "medium"
};

export interface PatchGenerationInput {
  errorLog?: string;
  fixResult?: unknown;
  goal: string;
  repositoryContext: RepositoryContextPack;
  reviewResult?: unknown;
  scope?: string;
  validationReport?: ValidationReport;
  workerId: string;
  workerProfile?: WorkerCapabilityProfile | null;
}

export interface PatchGenerationResult {
  errors: string[];
  proposal: PatchProposal;
  structuredOutputOk: boolean;
}

const summarizeUnknown = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2).slice(0, 2_000);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value.toString();
  }

  return "";
};

const toUnifiedDiffText = (lines: string[]): string => `${lines.join("\n")}\n`;

const MAX_FULL_CONTENT_FILES = 4;

const PATCH_CONTEXT_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "only",
  "real",
  "safe",
  "minimal",
  "patch",
  "propose",
  "proposal",
  "review",
  "behavior",
  "issue",
  "current",
  "repository",
  "scope",
  "worker"
]);

const extractPatchContextTerms = (input: PatchGenerationInput): string[] => {
  const combined = [
    input.goal,
    input.scope,
    input.errorLog,
    summarizeUnknown(input.reviewResult),
    summarizeUnknown(input.fixResult)
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  return [...new Set(
    combined
      .split(/[^a-z0-9_.-]+/u)
      .map((term) => term.trim())
      .filter(
        (term) =>
          term.length >= 3 &&
          !PATCH_CONTEXT_STOP_WORDS.has(term)
      )
  )];
};

const pickPatchContextFiles = (
  repositoryContext: RepositoryContextPack,
  input: PatchGenerationInput
): RepositoryContextPack["selectedFiles"] => {
  const fileByPath = new Map(
    repositoryContext.selectedFiles.map((file) => [file.path, file] as const)
  );
  const baseScores = new Map(
    repositoryContext.selectionReasons.map((entry) => [entry.path, entry.score] as const)
  );
  const terms = extractPatchContextTerms(input);
  const prioritizedPaths = repositoryContext.selectedFiles
    .map((file) => {
      const haystack = `${file.path}\n${file.content}`.toLowerCase();
      const termScore = terms.reduce((score, term) => {
        if (!haystack.includes(term)) {
          return score;
        }

        return score + (file.path.toLowerCase().includes(term) ? 12 : 4);
      }, 0);

      return {
        path: file.path,
        score: (baseScores.get(file.path) ?? 0) + termScore
      };
    })
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((entry) => entry.path);
  const orderedPaths = [
    ...new Set([
      ...prioritizedPaths,
      ...repositoryContext.selectedFiles.map((file) => file.path)
    ])
  ];

  return orderedPaths
    .map((path) => fileByPath.get(path))
    .filter((file): file is NonNullable<typeof file> => Boolean(file))
    .slice(0, MAX_FULL_CONTENT_FILES);
};

const formatPatchRepositoryContext = (
  repositoryContext: RepositoryContextPack,
  input: PatchGenerationInput
): string => {
  const target = pickPatchTarget(repositoryContext);
  const selectedPaths = repositoryContext.selectedFiles.map((file) => file.path);
  const contextFiles = pickPatchContextFiles(repositoryContext, input);
  const lines = [
    `Root dir: ${repositoryContext.rootDir}`,
    repositoryContext.scope
      ? `Scope: ${repositoryContext.scope}`
      : "Scope: repository-wide",
    `Host-selected relevant files (${selectedPaths.length}):`,
    ...selectedPaths.map((path) => `- ${path}`),
    "Allowed patch files:",
    ...selectedPaths.map((path) => `- ${path}`),
    repositoryContext.warnings.length > 0
      ? `Warnings: ${repositoryContext.warnings.join(" | ")}`
      : "Warnings: none",
    repositoryContext.selectionReasons.length > 0
      ? "Host relevance ranking:"
      : "Host relevance ranking: none",
    ...repositoryContext.selectionReasons.map(
      (entry) => `- ${entry.path} (score=${entry.score}): ${entry.reason}`
    ),
    target
      ? `Primary patch target: ${target.path}`
      : "Primary patch target: none",
    target
      ? `Primary patch target full content:\n<<<FILE:${target.path}>>>\n${target.content}\n<<<END FILE>>>`
      : "Primary patch target full content: not available",
    `Full-content patch context files (${contextFiles.length}):`,
    ...contextFiles.flatMap((file) => [
      `<<<FILE:${file.path}>>>`,
      file.content,
      "<<<END FILE>>>"
    ])
  ];

  return lines.join("\n");
};

const PATCH_TARGET_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
  ".java",
  ".kt",
  ".kts",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs",
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".h",
  ".hpp",
  ".swift",
  ".scala",
  ".vue",
  ".svelte"
]);

const PATCH_TARGET_CONFIG_EXTENSIONS = new Set([
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg"
]);

const PATCH_TARGET_DOC_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".rst"
]);

const pickPatchTargetByExtensionGroup = (
  repositoryContext: RepositoryContextPack,
  extensions: Set<string>
) =>
  repositoryContext.selectedFiles.find((file) =>
    extensions.has(extname(file.path).toLowerCase())
  );

const pickPatchTarget = (
  repositoryContext: RepositoryContextPack
) => {
  return pickPatchTargetByExtensionGroup(
    repositoryContext,
    PATCH_TARGET_SOURCE_EXTENSIONS
  ) ??
    pickPatchTargetByExtensionGroup(
      repositoryContext,
      PATCH_TARGET_CONFIG_EXTENSIONS
    ) ??
    pickPatchTargetByExtensionGroup(
      repositoryContext,
      PATCH_TARGET_DOC_EXTENSIONS
    ) ??
    repositoryContext.selectedFiles[0];
};

const buildExampleUnifiedDiff = (
  repositoryContext: RepositoryContextPack
): { diffText: string; path: string } => {
  const target = pickPatchTarget(repositoryContext);

  if (!target) {
    return {
      path: "README.md",
      diffText: toUnifiedDiffText([
        "diff --git a/README.md b/README.md",
        "--- a/README.md",
        "+++ b/README.md",
        "@@ -1,1 +1,1 @@",
        "-Placeholder line",
        "+Updated placeholder line"
      ])
    };
  }

  const targetLines = target.content.replace(/\r\n/g, "\n").split("\n");
  if (targetLines[targetLines.length - 1] === "") {
    targetLines.pop();
  }
  const firstLine = targetLines[0] ?? "";

  if (!firstLine) {
    return {
      path: target.path,
      diffText: toUnifiedDiffText([
        `diff --git a/${target.path} b/${target.path}`,
        `--- a/${target.path}`,
        `+++ b/${target.path}`,
        "@@ -0,0 +1 @@",
        "+sample patch line"
      ])
    };
  }

  const contextLines = targetLines.slice(1, Math.min(targetLines.length, 4));
  const hunkLineCount = 1 + contextLines.length;
  return {
    path: target.path,
    diffText: toUnifiedDiffText([
        `diff --git a/${target.path} b/${target.path}`,
        `--- a/${target.path}`,
        `+++ b/${target.path}`,
        `@@ -1,${hunkLineCount} +1,${hunkLineCount} @@`,
        `-${firstLine}`,
        `+${firstLine} // sample patch`,
        ...contextLines.map((line) => ` ${line}`)
      ])
  };
};

const buildFallbackUnifiedDiff = (
  repositoryContext: RepositoryContextPack
): { diffText: string; path: string } => {
  const target = pickPatchTarget(repositoryContext);

  if (!target) {
    return {
      path: "README.md",
      diffText: toUnifiedDiffText([
        "diff --git a/README.md b/README.md",
        "--- a/README.md",
        "+++ b/README.md",
        "@@ -0,0 +1 @@",
        "+Patch proposal requires manual repository context review."
      ])
    };
  }

  const firstLine = target.content.split(/\r?\n/u)[0] ?? "";
  if (!firstLine) {
    return {
      path: target.path,
      diffText: toUnifiedDiffText([
        `diff --git a/${target.path} b/${target.path}`,
        `--- a/${target.path}`,
        `+++ b/${target.path}`,
        "@@ -0,0 +1 @@",
        "+// Candidate patch generated for manual review."
      ])
    };
  }

  return {
    path: target.path,
    diffText: toUnifiedDiffText([
      `diff --git a/${target.path} b/${target.path}`,
      `--- a/${target.path}`,
      `+++ b/${target.path}`,
      "@@ -1,1 +1,2 @@",
      "+// Candidate patch generated for manual review.",
      ` ${firstLine}`
    ])
  };
};

export const buildFallbackPatchProposal = (
  input: {
    goal?: string;
    scope?: string;
  },
  repositoryContext: RepositoryContextPack,
  workerId?: string
): PatchProposal => {
  const patchTarget = buildFallbackUnifiedDiff(repositoryContext);
  const goal =
    input.goal ??
    "Generate a safe candidate patch proposal for manual review.";

  return PatchProposalSchema.parse({
    id: randomUUID(),
    title: `[PLACEHOLDER] ${goal}`,
    summary:
      "This is not an actionable fix. Structured patch generation failed, so the proposal is a blocked placeholder for manual review only.",
    rationale: [
      "Structured model output failed, so no trustworthy patch could be generated automatically.",
      "A human should inspect repository context, validation results, and fix guidance before drafting a real patch."
    ],
    unifiedDiff: patchTarget.diffText,
    files: [
      {
        path: patchTarget.path,
        changeType: "modify",
        summary: "Placeholder diff only; do not apply.",
        riskLevel: "medium"
      }
    ],
    risks: [
      "Placeholder proposal generated because structured model output failed.",
      "Patch is not actionable and requires manual review before any application attempt."
    ],
    validationPlan: [
      "Do not apply this placeholder patch.",
      "Regenerate or author a real patch before running deterministic validation."
    ],
    generatedAt: new Date().toISOString(),
    source: {
      workflow: "patch-generation-worker",
      workerId,
      scope: input.scope
    }
  });
};

const buildCandidatePatchProposal = (
  input: PatchGenerationInput
): PatchProposal => {
  const patchTarget = buildExampleUnifiedDiff(input.repositoryContext);

  return PatchProposalSchema.parse({
    id: randomUUID(),
    title: `Candidate patch for ${input.goal}`,
    summary: "Structured candidate patch proposal used as a schema example for model output.",
    rationale: [
      "This candidate illustrates the required PatchProposal JSON shape.",
      "A real provider response should replace this example with repository-grounded edits."
    ],
    unifiedDiff: patchTarget.diffText,
    files: [
      {
        path: patchTarget.path,
        changeType: "modify",
        summary: "Illustrative patch entry for schema guidance only.",
        riskLevel: "low"
      }
    ],
    risks: [
      "Example patch content is not evidence of a validated fix.",
      "Any real patch still requires inspection and deterministic validation."
    ],
    validationPlan: [
      "Replace this example with a repository-grounded patch proposal before apply.",
      "Run deterministic validation before and after any write-enabled apply."
    ],
    generatedAt: new Date().toISOString(),
    source: {
      workflow: "patch-generation-worker",
      workerId: input.workerId,
      scope: input.scope
    }
  });
};

export class PatchGenerationWorker {
  private readonly capability = capability;
  private readonly router: ModelRouter;

  public constructor(private readonly context: ExecutionContext) {
    this.router = new ModelRouter(context.workerModel);
  }

  public async generateProposal(
    input: PatchGenerationInput
  ): Promise<PatchGenerationResult> {
    const candidateProposal = buildCandidatePatchProposal(input);
    const fallbackProposal = buildFallbackPatchProposal(
      {
        goal: input.goal,
        scope: input.scope
      },
      input.repositoryContext,
      input.workerId
    );
    const routed = input.workerProfile
      ? this.router.routeWorkerTask(
          this.capability.supportedTaskTypes[0] ?? "patch-generation",
          input.workerProfile
        )
      : this.router.route("worker");
    const invocation = await invokeStructured({
      provider: routed.provider,
      config: routed.config,
      schema: PatchProposalSchema,
      prompt: [
        "Return only valid JSON matching the PatchProposal schema.",
        "Do not include markdown, explanations, reasoning text, or code fences.",
        "Use only the provided repository context.",
        "Treat the host-selected relevant files as the only allowed patch scope for this proposal.",
        "Only modify files listed under 'Allowed patch files'. Do not introduce edits for any file outside that list.",
        "If the real fix requires changes outside the allowed patch files, do not expand scope yourself.",
        "Instead, return a non-actionable placeholder proposal whose title starts with '[PLACEHOLDER]' and whose summary and rationale explicitly explain which additional files or scope would be required.",
        "Do not invent file contents, imports, functions, or surrounding lines that are not present in the provided file content.",
        "If you modify the primary patch target, ground unified diff hunk context in the exact file content provided below.",
        "The unifiedDiff string must end with a trailing newline.",
        "When modifying an existing multi-line file, include unchanged context lines in each hunk so git apply can locate the edit reliably.",
        "Do not emit a single-line @@ -1,1 +1,1 @@ hunk for a multi-line source file unless the real file truly has exactly one line.",
        "Use exact unified diff headers, exact file paths, and exact pre-change lines copied from the provided file content.",
        "Preserve blank lines exactly when writing unified diff hunks.",
        "If a removed line is truly blank, emit '-' with nothing after it. If an unchanged context line is truly blank, emit ' ' with nothing after it.",
        "Do not add spaces or tabs to otherwise blank diff lines unless those whitespace characters already exist in the source file.",
        "Use exactly these top-level keys:",
        "- id: string",
        "- title: string",
        "- summary: string",
        "- rationale: string[]",
        "- unifiedDiff: string",
        "- files: Array<{ path: string; changeType: \"add\" | \"modify\" | \"delete\"; summary: string; riskLevel: \"low\" | \"medium\" | \"high\"; beforeHash?: string; afterHash?: string }>",
        "- risks: string[]",
        "- validationPlan: string[]",
        "- generatedAt: ISO-8601 datetime string",
        "- source: { workflow: string; workerId?: string; scope?: string; taskId?: string }",
        "Do not omit any required field.",
        "Do not claim the patch has already been applied.",
        "The unifiedDiff field must contain a valid unified diff string starting with 'diff --git'.",
        "The files field must be a JSON array, not a sentence or object.",
        "The rationale, risks, and validationPlan fields must all be JSON arrays of strings.",
        `Example valid JSON shape:\n${JSON.stringify(candidateProposal, null, 2)}`,
        `Goal: ${input.goal}`,
        input.scope ? `Scope: ${input.scope}` : "Scope: repository-wide",
        input.errorLog ? `Error log:\n${input.errorLog}` : "Error log: not provided",
        input.validationReport
          ? `Validation report:\n${JSON.stringify(input.validationReport, null, 2).slice(0, 2_000)}`
          : "Validation report: not provided",
        `Review result:\n${summarizeUnknown(input.reviewResult)}`,
        `Fix result:\n${summarizeUnknown(input.fixResult)}`,
        `Repository context:\n${formatPatchRepositoryContext(input.repositoryContext, input)}`
      ].join("\n\n"),
      mockResponse: candidateProposal,
      metadata: {
        scope: input.scope,
        workerId: input.workerId,
        capability: this.capability.name
      },
      maxAttempts: 2
    });

    return {
      proposal: invocation.ok ? invocation.data : fallbackProposal,
      structuredOutputOk: invocation.ok,
      errors: invocation.ok ? [] : invocation.errors
    };
  }
}
